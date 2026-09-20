import { describe, it, expect } from "vitest";
import {
  seed,
  applyCommand,
  totals,
  parseMoney,
  metrics,
  status,
  type Draft,
} from "../shared/domain";
import {
  exampleExtraction,
  exampleSource,
  verifyExtraction,
} from "../shared/extraction";
const draft: Draft = {
  clientId: "northstar",
  title: "Design work",
  due: "2026-10-20",
  items: [{ description: "Workshop", quantity: 3, unitCents: 101 }],
  taxBps: 825,
  notes: "",
};
describe("invoice ledger", () => {
  it("parses cents exactly and rejects rounding or exponent input", () => {
    expect(parseMoney("0.10") + parseMoney("0.20")).toBe(30);
    for (const v of ["0.001", "1e3", "-1", "NaN", ""])
      expect(() => parseMoney(v)).toThrow();
  });
  it("rounds invoice tax half up once", () => {
    expect(totals({ ...draft, payments: [] })).toMatchObject({
      subtotal: 303,
      tax: 25,
      total: 328,
      balance: 328,
    });
  });
  it("issues, accepts partial payments, prevents overpayment and duplicate retry", () => {
    let w = applyCommand(
      seed("2026-09-20"),
      { type: "save", draft },
      "2026-09-20",
    );
    const id = w.invoices[0].id;
    expect(() =>
      applyCommand(
        w,
        {
          type: "payment",
          id,
          paymentId: crypto.randomUUID(),
          amountCents: 100,
          date: "2026-09-20",
          reference: "test",
        },
        "2026-09-20",
      ),
    ).toThrow("Issue");
    w = applyCommand(w, { type: "issue", id }, "2026-09-20");
    const payment = {
      type: "payment" as const,
      id,
      paymentId: crypto.randomUUID(),
      amountCents: 100,
      date: "2026-09-20",
      reference: "demo",
    };
    w = applyCommand(w, payment, "2026-09-20");
    expect(status(w.invoices[0], "2026-09-20")).toBe("partial");
    expect(totals(w.invoices[0]).balance).toBe(228);
    expect(applyCommand(w, payment, "2026-09-20")).toEqual(w);
    expect(() =>
      applyCommand(
        w,
        { ...payment, paymentId: crypto.randomUUID(), amountCents: 229 },
        "2026-09-20",
      ),
    ).toThrow("exceeds");
    expect(() =>
      applyCommand(w, { type: "save", id, draft }, "2026-09-20"),
    ).toThrow("Only draft");
    expect(() =>
      applyCommand(w, { type: "void", id, reason: "test" }, "2026-09-20"),
    ).toThrow("Paid");
    w = applyCommand(
      w,
      { ...payment, paymentId: crypto.randomUUID(), amountCents: 228 },
      "2026-09-20",
    );
    expect(status(w.invoices[0], "2026-10-22")).toBe("paid");
  });
  it("uses payment dates for monthly collections and balance for overdue", () => {
    const w = seed("2026-09-20");
    w.invoices = w.invoices.slice(0, 1);
    w.invoices[0].payments[0].date = "2026-09-01";
    expect(metrics(w, "2026-09-20")).toMatchObject({
      collected: 200000,
      overdue: 280000,
    });
  });
  it("rejects invalid dates, tenant/client forgery and amount bounds", () => {
    for (const d of [
      { ...draft, due: "2026-02-30" },
      { ...draft, clientId: "another-workspace" },
      {
        ...draft,
        items: [{ description: "x", quantity: 10000, unitCents: 100000000 }],
      },
    ])
      expect(() => applyCommand(seed(), { type: "save", draft: d })).toThrow();
  });
  it("keeps void history and excludes void balances", () => {
    let w = applyCommand(seed(), { type: "save", draft });
    w = applyCommand(w, {
      type: "void",
      id: w.invoices[0].id,
      reason: "Duplicate",
    });
    expect(w.invoices[0].history.at(-1)?.text).toContain("Duplicate");
    expect(status(w.invoices[0])).toBe("void");
  });
  it("validates source provenance, missing fields and structured output", () => {
    expect(
      verifyExtraction(exampleExtraction(), exampleSource).items,
    ).toHaveLength(2);
    const x = exampleExtraction();
    x.items[0].unitPrice.quote = "Not in the document";
    expect(() => verifyExtraction(x, exampleSource)).toThrow("unverifiable");
    expect(() => verifyExtraction({ invented: true }, exampleSource)).toThrow();
  });
});
