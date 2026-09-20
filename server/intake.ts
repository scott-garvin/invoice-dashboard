import { randomUUID } from "node:crypto";
import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt,
  Command,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  applyCommand,
  draftSchema,
  parseMoney,
  shifted,
  type Draft,
} from "../shared/domain.js";
import { verifyExtraction } from "../shared/extraction.js";
import type { IntakeView } from "../shared/intake.js";
import { Conflict, PostgresStore } from "./store.js";
import type { Extractor } from "./provider.js";

export class IntakeUnavailable extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
const State = Annotation.Root({
  id: Annotation<string>(),
  owner: Annotation<string>(),
  source: Annotation<string>(),
  extraction: Annotation<Awaited<ReturnType<Extractor["extract"]>>>(),
  draft: Annotation<Partial<Draft>>(),
  issues: Annotation<string[]>(),
  invoiceId: Annotation<string>(),
});

export class IntakeService {
  readonly saver: PostgresSaver;
  readonly graph;
  constructor(
    readonly store: PostgresStore,
    extractor: Extractor | undefined,
    daily = 20,
    monthly = 200,
  ) {
    // Private schema: checkpoints contain source text and must never be exposed by a Data API.
    this.saver = new PostgresSaver(store.pool, undefined, {
      schema: "ledgerly_graph",
    });
    this.graph = new StateGraph(State)
      .addNode("extract", async (state) => {
        if (!extractor)
          throw new IntakeUnavailable(
            "AI intake is not configured. Use the guided example or manual invoicing.",
          );
        if (!(await store.reserve(daily, monthly)))
          throw new IntakeUnavailable(
            "Live AI allowance reached. Manual invoicing is still available.",
            429,
          );
        try {
          const extraction = await extractor.extract(state.source);
          verifyExtraction(extraction.result, state.source);
          return { extraction };
        } catch {
          throw new IntakeUnavailable(
            "Extraction could not be verified. Retry explicitly or enter an invoice manually. No draft was created.",
            502,
          );
        }
      })
      .addNode("validate", async (state) => {
        const workspace = await store.read(state.owner);
        if (!workspace) throw new Conflict("Session expired.");
        const r = state.extraction.result;
        const issues: string[] = [];
        const matches = workspace.clients.filter(
          (c) => c.company.toLowerCase() === r.client.value?.toLowerCase(),
        );
        if (matches.length !== 1)
          issues.push("Choose the client. No unique company match was found.");
        if (r.currency.value !== "USD")
          issues.push(
            "This demo supports USD only. Verify and enter USD prices; no currency conversion is performed.",
          );
        const days = /^Net\s+(\d{1,3})$/i.exec(r.terms.value || "");
        if (!days)
          issues.push(
            "Set a due date. Payment terms were missing or unsupported.",
          );
        if (!r.title.value) issues.push("Enter the project title.");
        const items = r.items.map((item) => {
          let unitCents = 0;
          try {
            unitCents = parseMoney(item.unitPrice.value || "");
          } catch {
            issues.push("Confirm the missing or invalid unit price.");
          }
          const quantity = Number(item.quantity.value);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
            issues.push("Confirm a whole quantity between 1 and 10,000.");
          if (!item.description.value)
            issues.push("Complete the item description.");
          return {
            description: item.description.value || "",
            quantity:
              Number.isInteger(quantity) && quantity >= 1 && quantity <= 10000
                ? quantity
                : 1,
            unitCents,
          };
        });
        if (!items.length) issues.push("Add at least one billable item.");
        return {
          issues: [...new Set(issues)],
          draft: {
            clientId: matches.length === 1 ? matches[0].id : "",
            title: r.title.value || "",
            due: days ? shifted(Number(days[1])) : "",
            items,
            taxBps: 0,
            notes: "Prepared from a work order. Verify payment terms and tax.",
          },
        };
      })
      .addNode("clarify", (state) => {
        const draft = draftSchema.parse(
          interrupt({ kind: "clarify", issues: state.issues }),
        );
        return { draft, issues: [] };
      })
      .addNode("review", () => {
        // No side effects before interrupt: LangGraph re-enters this node on resume.
        const draft = draftSchema.parse(interrupt({ kind: "review" }));
        return { draft };
      })
      .addNode("save", async (state) => ({
        invoiceId: await this.saveOnce(
          state.owner,
          state.id,
          draftSchema.parse(state.draft),
        ),
      }))
      .addEdge(START, "extract")
      .addEdge("extract", "validate")
      .addConditionalEdges(
        "validate",
        (s) => (s.issues.length ? "clarify" : "review"),
        ["clarify", "review"],
      )
      .addEdge("clarify", "review")
      .addEdge("review", "save")
      .addEdge("save", END)
      .compile({ checkpointer: this.saver });
  }
  async setup() {
    await this.store.pool.query(
      "create schema if not exists ledgerly_graph; revoke all on schema ledgerly_graph from public",
    );
    await this.saver.setup();
  }
  config(id: string) {
    return { configurable: { thread_id: id }, recursionLimit: 12 };
  }
  async owned(owner: string, id: string) {
    const row = await this.store.scoped(
      owner,
      async (c) =>
        (
          await c.query(
            "select i.* from ledgerly_intakes i join ledgerly_sessions s on s.id=i.session_id where i.id=$1 and i.session_id=$2 and i.generation=s.generation and s.expires_at>now()",
            [id, owner],
          )
        ).rows[0],
    );
    if (!row)
      throw new Conflict(
        "Intake not found in this workspace. It may have been reset or expired.",
      );
    return row;
  }
  async locked<T>(owner: string, id: string, action: () => Promise<T>) {
    await this.owned(owner, id);
    const client = await this.store.pool.connect();
    let locked = false;
    try {
      // A nonblocking session lock avoids exhausting the pool with queued resumes.
      locked = (
        await client.query(
          "select pg_try_advisory_lock(hashtextextended($1, 0)) as locked",
          [id],
        )
      ).rows[0].locked;
      if (!locked)
        throw new Conflict(
          "This intake is processing. Refresh its progress before continuing.",
        );
      await this.owned(owner, id);
      return await action();
    } finally {
      if (locked)
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1, 0))",
          [id],
        );
      client.release();
    }
  }
  async start(owner: string, source: string) {
    const id = randomUUID();
    await this.store.scoped(owner, async (c) => {
      await c.query("select id from ledgerly_sessions where id=$1 for update", [
        owner,
      ]);
      const count = (
        await c.query(
          "select count(*)::int as n from ledgerly_intakes where session_id=$1",
          [owner],
        )
      ).rows[0].n;
      if (count >= 20)
        throw new IntakeUnavailable(
          "This session has reached its 20 intake limit. Manual invoices are still available.",
          429,
        );
      await c.query(
        "insert into ledgerly_intakes(id,session_id,generation,source) select $1,id,generation,$3 from ledgerly_sessions where id=$2 and expires_at>now()",
        [id, owner, source],
      );
    });
    return this.locked(owner, id, async () => {
      await this.graph.invoke(
        { id, owner, source, issues: [] },
        this.config(id),
      );
      return this.view(owner, id);
    });
  }
  async view(owner: string, id: string): Promise<IntakeView> {
    const row = await this.owned(owner, id);
    const snapshot = await this.graph.getState(this.config(id));
    const state = snapshot.values as typeof State.State;
    const stage =
      row.invoice_id || state.invoiceId
        ? "complete"
        : snapshot.next.includes("clarify")
          ? "clarify"
          : snapshot.next.includes("review")
            ? "review"
            : "retry";
    return {
      id,
      checkpoint: snapshot.config?.configurable?.checkpoint_id || "",
      stage,
      source: state.source || row.source,
      extraction: state.extraction,
      draft: state.draft,
      issues: state.issues || [],
      invoiceId: row.invoice_id || state.invoiceId,
    };
  }
  async list(owner: string) {
    const rows = await this.store.scoped(
      owner,
      async (c) =>
        (
          await c.query(
            "select i.id from ledgerly_intakes i join ledgerly_sessions s on s.id=i.session_id where i.session_id=$1 and i.generation=s.generation order by i.created_at desc limit 20",
            [owner],
          )
        ).rows,
    );
    return Promise.all(rows.map((r) => this.view(owner, r.id)));
  }
  async resume(
    owner: string,
    id: string,
    checkpoint: string,
    action: "clarify" | "approve" | "retry",
    draft?: Draft,
  ) {
    return this.locked(owner, id, async () => {
      const view = await this.view(owner, id);
      if (view.stage === "complete") return view;
      if (view.checkpoint !== checkpoint)
        throw new Conflict(
          "Intake changed in another tab. Reload its progress before continuing.",
        );
      if (action === "retry") {
        if (view.stage !== "retry")
          throw new Conflict("This intake is waiting for your review.");
        await this.graph.invoke(
          view.checkpoint
            ? null
            : { id, owner, source: view.source, issues: [] },
          this.config(id),
        );
      } else {
        if (view.stage !== (action === "approve" ? "review" : "clarify"))
          throw new Conflict(
            "Complete the current intake step before approval.",
          );
        const current = await this.store.read(owner);
        if (!current) throw new Conflict("Session expired.");
        // Validate all business rules before consuming the interrupt's resume value.
        applyCommand(current, {
          type: "save",
          draft: draftSchema.parse(draft),
        });
        await this.graph.invoke(
          new Command({ resume: draft }),
          this.config(id),
        );
      }
      return this.view(owner, id);
    });
  }
  async saveOnce(owner: string, id: string, draft: Draft): Promise<string> {
    return this.store.scoped(owner, async (c) => {
      const session = (
        await c.query(
          "select data,generation from ledgerly_sessions where id=$1 and expires_at>now() for update",
          [owner],
        )
      ).rows[0];
      const run = (
        await c.query(
          "select * from ledgerly_intakes where id=$1 and session_id=$2",
          [id, owner],
        )
      ).rows[0];
      if (!session || !run || run.generation !== session.generation)
        throw new Conflict("This workspace was reset or expired.");
      if (run.invoice_id) return run.invoice_id;
      const next = applyCommand(session.data, { type: "save", draft });
      const invoiceId = next.invoices[0].id;
      next.invoices[0].history.push({
        at: new Date().toISOString(),
        text: "AI intake reviewed and approved by demo user",
      });
      await c.query("update ledgerly_sessions set data=$2 where id=$1", [
        owner,
        next,
      ]);
      await c.query(
        "update ledgerly_intakes set invoice_id=$2 where id=$1 and session_id=$3",
        [id, invoiceId, owner],
      );
      return invoiceId;
    });
  }
}
