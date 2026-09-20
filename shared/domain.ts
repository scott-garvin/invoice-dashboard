import { z } from "zod";

const text = z.string().trim().min(1).max(180);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date.",
  );
export const cents = z.number().int().min(0).max(100_000_000);
export const lineSchema = z
  .object({
    description: text,
    quantity: z.number().int().min(1).max(10000),
    unitCents: cents,
  })
  .strict();
export const clientSchema = z
  .object({
    id: z.string(),
    name: text,
    email: z.email().max(180),
    company: text,
  })
  .strict();
export const draftSchema = z
  .object({
    clientId: text,
    title: text,
    due: day,
    items: z.array(lineSchema).min(1).max(30),
    taxBps: z.number().int().min(0).max(2500),
    notes: z.string().max(1000),
  })
  .strict();
const paymentSchema = z.object({
  id: z.string(),
  amountCents: cents,
  date: day,
  reference: text,
});
const eventSchema = z.object({ at: z.string(), text: z.string() });
export const invoiceSchema = draftSchema.extend({
  id: z.string(),
  number: z.string(),
  issued: day.nullable(),
  created: day,
  state: z.enum(["draft", "issued", "void"]),
  payments: z.array(paymentSchema).max(100),
  history: z.array(eventSchema).max(300),
});
export const workspaceSchema = z.object({
  version: z.number().int().min(0),
  clients: z.array(clientSchema).max(100),
  invoices: z.array(invoiceSchema).max(200),
});
export type Client = z.infer<typeof clientSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Draft = z.infer<typeof draftSchema>;
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("save"),
      id: z.string().optional(),
      draft: draftSchema,
    })
    .strict(),
  z.object({ type: z.literal("issue"), id: text }).strict(),
  z.object({ type: z.literal("void"), id: text, reason: text }).strict(),
  z
    .object({
      type: z.literal("payment"),
      id: text,
      paymentId: z.uuid(),
      amountCents: cents.refine((v) => v > 0),
      date: day,
      reference: text,
    })
    .strict(),
  z
    .object({
      type: z.literal("client"),
      client: clientSchema.omit({ id: true }),
    })
    .strict(),
  z.object({ type: z.literal("reset") }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const today = () => new Date().toISOString().slice(0, 10);
export function shifted(days: number, base = today()) {
  const d = new Date(base + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function totals(i: Pick<Invoice, "items" | "taxBps" | "payments">) {
  const subtotal = i.items.reduce((s, l) => s + l.quantity * l.unitCents, 0);
  // Integer arithmetic with an explicit half-up rounding policy, once per invoice.
  const tax = Number((BigInt(subtotal) * BigInt(i.taxBps) + 5000n) / 10000n);
  const total = subtotal + tax;
  const paid = i.payments.reduce((s, p) => s + p.amountCents, 0);
  return { subtotal, tax, total, paid, balance: total - paid };
}
export function status(i: Invoice, date = today()) {
  if (i.state !== "issued") return i.state;
  if (totals(i).balance === 0) return "paid";
  if (i.due < date) return "overdue";
  return i.payments.length ? "partial" : "sent";
}
export function money(value: number) {
  return (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a USD amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  return cents.parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function applyCommand(
  current: Workspace,
  raw: unknown,
  now = today(),
): Workspace {
  const c = commandSchema.parse(raw);
  if (c.type === "reset") return { ...seed(now), version: current.version + 1 };
  const w = structuredClone(current);
  const log = (i: Invoice, message: string) =>
    i.history.push({ at: new Date().toISOString(), text: message });
  if (c.type === "client") {
    if (
      w.clients.some(
        (x) => x.email.toLowerCase() === c.client.email.toLowerCase(),
      )
    )
      throw new Error("A client with this email already exists.");
    w.clients.push({ ...c.client, id: crypto.randomUUID() });
  } else if (c.type === "save") {
    if (!w.clients.some((x) => x.id === c.draft.clientId))
      throw new Error("Choose an existing client.");
    if (
      totals({ ...c.draft, payments: [] }).total <= 0 ||
      totals({ ...c.draft, payments: [] }).total > 100_000_000
    )
      throw new Error("Invoice total must be between $0.01 and $1,000,000.");
    if (c.id) {
      const i = w.invoices.find((x) => x.id === c.id);
      if (!i || i.state !== "draft")
        throw new Error("Only draft invoices can be edited.");
      Object.assign(i, c.draft);
      log(i, "Draft updated");
    } else {
      const sequence =
        Math.max(
          1041,
          ...w.invoices.map((x) => Number(x.number.replace("INV-", ""))),
        ) + 1;
      const i: Invoice = {
        ...c.draft,
        id: crypto.randomUUID(),
        number: `INV-${sequence}`,
        issued: null,
        created: now,
        state: "draft",
        payments: [],
        history: [],
      };
      log(i, "Draft created");
      w.invoices.unshift(i);
    }
  } else {
    const i = w.invoices.find((x) => x.id === c.id);
    if (!i) throw new Error("Invoice not found.");
    if (c.type === "issue") {
      if (i.state !== "draft") throw new Error("Only drafts can be issued.");
      if (i.due < now)
        throw new Error("Choose a due date today or later before issuing.");
      i.state = "issued";
      i.issued = now;
      log(i, "Invoice issued. Email delivery simulated.");
    } else if (c.type === "void") {
      if (i.state === "void" || i.payments.length)
        throw new Error("Paid or already voided invoices cannot be voided.");
      i.state = "void";
      log(i, `Voided: ${c.reason}`);
    } else {
      if (i.payments.some((p) => p.id === c.paymentId)) return current;
      if (i.state !== "issued")
        throw new Error("Issue the invoice before recording a payment.");
      if (c.date > now || c.date < i.issued!)
        throw new Error("Payment date must fall between issue date and today.");
      if (c.amountCents > totals(i).balance)
        throw new Error("Payment exceeds the remaining balance.");
      i.payments.push({
        id: c.paymentId,
        amountCents: c.amountCents,
        date: c.date,
        reference: c.reference,
      });
      log(
        i,
        `Simulated payment recorded: ${money(c.amountCents)}. Reference: ${c.reference}`,
      );
    }
  }
  w.version++;
  return workspaceSchema.parse(w);
}
export function seed(now = today()): Workspace {
  const clients: Client[] = [
    {
      id: "northstar",
      name: "Jamie Chen",
      company: "Northstar Studio",
      email: "jamie@northstar.example",
    },
    {
      id: "fieldwork",
      name: "Alex Rivera",
      company: "Fieldwork Co.",
      email: "alex@fieldwork.example",
    },
    {
      id: "morrow",
      name: "Sam Ellis",
      company: "Morrow Architecture",
      email: "sam@morrow.example",
    },
    {
      id: "olive",
      name: "Casey Brooks",
      company: "Olive & Oak",
      email: "casey@olive.example",
    },
  ];
  const rows: Array<[string, string, number, number, number, number]> = [
    ["northstar", "Brand strategy & identity", 480000, -40, -10, 200000],
    ["fieldwork", "Website design retainer", 325000, -18, 12, 0],
    ["morrow", "Editorial photography", 180000, -50, -20, 0],
    ["olive", "Launch campaign", 620000, -9, 21, 0],
    ["northstar", "September studio retainer", 240000, -5, 25, 0],
    ["fieldwork", "Discovery workshop", 150000, -30, 0, 150000],
    ["morrow", "Print production", 89000, -65, -35, 89000],
    ["olive", "Social content package", 175000, -100, -70, 175000],
    ["northstar", "Product photography", 320000, -130, -100, 320000],
    ["fieldwork", "Design system handoff", 460000, -160, -130, 460000],
  ];
  const invoices: Invoice[] = rows.map(
    ([clientId, title, amount, issued, due, paid], n) => ({
      id: `demo-${n}`,
      number: `INV-${1042 + n}`,
      clientId,
      title,
      created: shifted(issued, now),
      issued: n === 4 ? null : shifted(issued, now),
      due: shifted(due, now),
      state: n === 4 ? "draft" : "issued",
      items: [{ description: title, quantity: 1, unitCents: amount }],
      taxBps: 0,
      notes: "Thank you for working with our studio.",
      payments: paid
        ? [
            {
              id: `payment-${n}`,
              amountCents: paid,
              date: shifted(Math.min(-1, issued + 20), now),
              reference: "Demo bank transfer",
            },
          ]
        : [],
      history: [
        {
          at: shifted(issued, now) + "T12:00:00Z",
          text: "Fictional demo invoice created",
        },
      ],
    }),
  );
  return { version: 0, clients, invoices };
}
export function metrics(w: Workspace, now = today()) {
  const issued = w.invoices.filter((i) => i.state === "issued");
  const overdue = issued.filter((i) => status(i, now) === "overdue");
  return {
    outstanding: issued.reduce((s, i) => s + totals(i).balance, 0),
    overdue: overdue.reduce((s, i) => s + totals(i).balance, 0),
    overdueCount: overdue.length,
    collected: issued
      .flatMap((i) => i.payments)
      .filter((p) => p.date.slice(0, 7) === now.slice(0, 7))
      .reduce((s, p) => s + p.amountCents, 0),
  };
}
