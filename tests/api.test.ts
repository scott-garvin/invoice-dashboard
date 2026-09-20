import { it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../server/app";
import { PostgresStore } from "../server/store";
import { exampleExtraction, exampleSource } from "../shared/extraction";
import { IntakeService } from "../server/intake";
import { type Draft } from "../shared/domain";
const database = process.env.TEST_DATABASE_URL;
// This suite requires a disposable database; it never uses DATABASE_URL.
const suite = database ? it : it.skip;
const pool = new Pool({ connectionString: database });
const store = new PostgresStore(pool);
const key = "test-only-ledgerly-demo-key";
let calls = 0;
const quotaExtractor = {
  async extract() {
    calls++;
    return {
      result: exampleExtraction(),
      model: "test-double",
      inputTokens: 0,
      outputTokens: 0,
    };
  },
};
const quotaIntake = new IntakeService(store, quotaExtractor, 2, 2);
const app = createApp(store, {
  key,
  extractor: quotaExtractor,
  intake: quotaIntake,
});
beforeAll(async () => {
  if (database) {
    await store.migrate();
    await quotaIntake.setup();
    await pool.query("truncate ledgerly_sessions, ledgerly_ai_usage cascade");
  }
});
afterAll(async () => {
  await pool.end();
});
suite(
  "requires the invite key and session; bounds request bodies",
  async () => {
    expect((await request(app).get("/api/workspace")).status).toBe(401);
    expect(
      (await request(app).get("/api/workspace").auth(key, { type: "bearer" }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/session")
          .auth(key, { type: "bearer" })
          .send({ x: "x".repeat(40000) })
      ).status,
    ).toBe(413);
  },
);
suite(
  "isolates browser sessions, persists writes, and rejects stale versions",
  async () => {
    const a = request.agent(app),
      b = request.agent(app);
    const original = (
      await a.post("/api/session").auth(key, { type: "bearer" }).send({})
    ).body;
    await b.post("/api/session").auth(key, { type: "bearer" }).send({});
    const command = {
      type: "client",
      client: {
        name: "A",
        company: "Only session A",
        email: "a@fictional.example",
      },
    };
    const changed = await a
      .post("/api/commands")
      .auth(key, { type: "bearer" })
      .send({ version: original.version, command });
    expect(changed.status).toBe(200);
    const other = await b.get("/api/workspace").auth(key, { type: "bearer" });
    expect(
      other.body.clients.some(
        (c: { company: string }) => c.company === "Only session A",
      ),
    ).toBe(false);
    expect(
      (
        await a
          .post("/api/commands")
          .auth(key, { type: "bearer" })
          .send({ version: original.version, command })
      ).status,
    ).toBe(409);
    expect(
      (await a.get("/api/workspace").auth(key, { type: "bearer" })).body
        .clients,
    ).toHaveLength(5);
  },
);
suite(
  "serializes concurrent payments so only one can consume the balance",
  async () => {
    const a = request.agent(app);
    const w = (
      await a.post("/api/session").auth(key, { type: "bearer" }).send({})
    ).body;
    const body = {
      version: w.version,
      command: {
        type: "payment",
        id: "demo-1",
        paymentId: crypto.randomUUID(),
        amountCents: 325000,
        date: new Date().toISOString().slice(0, 10),
        reference: "test",
      },
    };
    const results = await Promise.all([
      a.post("/api/commands").auth(key, { type: "bearer" }).send(body),
      a
        .post("/api/commands")
        .auth(key, { type: "bearer" })
        .send({
          ...body,
          command: { ...body.command, paymentId: crypto.randomUUID() },
        }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  },
);
suite(
  "enforces shared AI quota across sessions, including after reset",
  async () => {
    const a = request.agent(app);
    let w = (
      await a.post("/api/session").auth(key, { type: "bearer" }).send({})
    ).body;
    const source = exampleSource;
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        a.post("/api/intakes").auth(key, { type: "bearer" }).send({ source }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 429]);
    expect(calls).toBe(2);
    w = (
      await a
        .post("/api/commands")
        .auth(key, { type: "bearer" })
        .send({ version: w.version, command: { type: "reset" } })
    ).body;
    expect(w.version).toBe(1);
    expect(
      (
        await a
          .post("/api/intakes")
          .auth(key, { type: "bearer" })
          .send({ source })
      ).status,
    ).toBe(429);
  },
);

suite(
  "persists a graph interrupt across service restart, scopes ownership, and saves one approved draft",
  async () => {
    let extractions = 0;
    const extractor = {
      async extract() {
        extractions++;
        return {
          result: exampleExtraction(),
          model: "test-double",
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    };
    const first = new IntakeService(store, extractor, 100, 100);
    await first.setup();
    await store.create("graph-a");
    await store.create("graph-b");
    const initial = await first.start("graph-a", exampleSource);
    expect(initial.stage).toBe("review");
    expect((await store.read("graph-a"))!.invoices).toHaveLength(10);
    const restarted = new IntakeService(store, extractor, 100, 100);
    const restored = await restarted.view("graph-a", initial.id);
    expect(restored.checkpoint).toBe(initial.checkpoint);
    await expect(
      restarted.resume(
        "graph-b",
        initial.id,
        initial.checkpoint,
        "approve",
        initial.draft as Draft,
      ),
    ).rejects.toThrow("not found");
    await expect(
      restarted.resume(
        "graph-a",
        initial.id,
        "stale",
        "approve",
        initial.draft as Draft,
      ),
    ).rejects.toThrow("changed");
    const approved = await restarted.resume(
      "graph-a",
      initial.id,
      initial.checkpoint,
      "approve",
      initial.draft as Draft,
    );
    expect(approved.stage).toBe("complete");
    const duplicate = await restarted.resume(
      "graph-a",
      initial.id,
      initial.checkpoint,
      "approve",
      initial.draft as Draft,
    );
    expect(duplicate.invoiceId).toBe(approved.invoiceId);
    // Simulate re-entering the save node after committing the invoice but before checkpointing.
    expect(
      await restarted.saveOnce("graph-a", initial.id, initial.draft as Draft),
    ).toBe(approved.invoiceId);
    expect((await store.read("graph-a"))!.invoices).toHaveLength(11);
    expect(extractions).toBe(1);
  },
);

suite(
  "branches to clarification, requires a separate approval, and invalidates runs on reset",
  async () => {
    const extractor = {
      async extract() {
        const result = exampleExtraction();
        result.terms = { value: null, quote: null };
        return {
          result,
          model: "test-double",
          inputTokens: 0,
          outputTokens: 0,
        };
      },
    };
    const service = new IntakeService(store, extractor, 100, 100);
    await service.setup();
    await store.create("graph-c");
    const initial = await service.start("graph-c", exampleSource);
    expect(initial.stage).toBe("clarify");
    expect(initial.issues.join(" ")).toContain("due date");
    const draft = { ...initial.draft, due: "2026-12-01" } as Draft;
    await expect(
      service.resume(
        "graph-c",
        initial.id,
        initial.checkpoint,
        "approve",
        draft,
      ),
    ).rejects.toThrow("current intake step");
    const review = await service.resume(
      "graph-c",
      initial.id,
      initial.checkpoint,
      "clarify",
      draft,
    );
    expect(review.stage).toBe("review");
    expect((await store.read("graph-c"))!.invoices).toHaveLength(10);
    await expect(
      service.resume(
        "graph-c",
        initial.id,
        initial.checkpoint,
        "approve",
        draft,
      ),
    ).rejects.toThrow("changed");
    await store.command("graph-c", 0, { type: "reset" });
    await expect(
      service.resume(
        "graph-c",
        initial.id,
        review.checkpoint,
        "approve",
        draft,
      ),
    ).rejects.toThrow("not found");
  },
);

suite(
  "retains failed extraction progress, retries only explicitly, and rejects simultaneous resumes",
  async () => {
    let calls = 0;
    const service = new IntakeService(
      store,
      {
        async extract() {
          if (++calls === 1) throw new Error("test failure");
          return {
            result: exampleExtraction(),
            model: "test-double",
            inputTokens: 0,
            outputTokens: 0,
          };
        },
      },
      100,
      100,
    );
    await service.setup();
    await store.create("graph-d");
    await expect(service.start("graph-d", exampleSource)).rejects.toThrow(
      "could not be verified",
    );
    const [failed] = await service.list("graph-d");
    expect(failed.stage).toBe("retry");
    expect(calls).toBe(1);
    const review = await service.resume(
      "graph-d",
      failed.id,
      failed.checkpoint,
      "retry",
    );
    expect(review.stage).toBe("review");
    const results = await Promise.allSettled([
      service.resume(
        "graph-d",
        review.id,
        review.checkpoint,
        "approve",
        review.draft as Draft,
      ),
      service.resume(
        "graph-d",
        review.id,
        review.checkpoint,
        "approve",
        review.draft as Draft,
      ),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect((await store.read("graph-d"))!.invoices).toHaveLength(11);
    expect(calls).toBe(2);
  },
);
