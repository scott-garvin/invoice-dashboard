import { reactive, computed, watch } from 'vue';

export type Status = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Client {
  id: string;
  name: string;
  email: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  amountCents: number;
  status: Status;
  issued: string; // YYYY-MM-DD
  due: string; // YYYY-MM-DD
}

interface Persisted {
  clients: Client[];
  invoices: Invoice[];
}

const KEY = 'ledgerly.v1';

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const seedClients: Client[] = [
  { id: 'c1', name: 'Northwind Traders', email: 'ap@northwind.example' },
  { id: 'c2', name: 'Acme Robotics', email: 'billing@acme.example' },
  { id: 'c3', name: 'Globex Health', email: 'finance@globex.example' },
  { id: 'c4', name: 'Umbra Studio', email: 'hello@umbra.example' },
  { id: 'c5', name: 'Riverbend Cafe', email: 'owner@riverbend.example' },
  { id: 'c6', name: 'Vertex Legal', email: 'accounts@vertex.example' },
];

function seedInvoices(): Invoice[] {
  // clientId, dollars, status, issuedDaysAgo, dueOffsetDays
  const rows: Array<[string, number, Status, number, number]> = [
    ['c1', 4200, 'paid', 158, 30],
    ['c2', 1875.5, 'paid', 150, 30],
    ['c3', 9600, 'paid', 132, 30],
    ['c4', 640, 'paid', 128, 15],
    ['c1', 3200, 'paid', 118, 30],
    ['c5', 480.25, 'paid', 96, 15],
    ['c2', 5400, 'paid', 92, 30],
    ['c6', 12250, 'paid', 74, 45],
    ['c3', 8100, 'paid', 63, 30],
    ['c4', 1520, 'paid', 41, 15],
    ['c1', 3600, 'sent', 20, 30],
    ['c2', 2750, 'sent', 14, 30],
    ['c6', 15400, 'sent', 9, 45],
    ['c3', 7200, 'overdue', 52, 30],
    ['c5', 910.75, 'overdue', 60, 15],
    ['c4', 2100, 'draft', 3, 30],
    ['c2', 4990, 'draft', 1, 30],
  ];
  return rows.map(([clientId, dollars, status, issuedAgo, dueOff], i) => {
    const issued = daysAgo(issuedAgo);
    const due = new Date(issued);
    due.setDate(due.getDate() + dueOff);
    return {
      id: uid('inv'),
      number: `INV-${1042 + i}`,
      clientId,
      amountCents: Math.round(dollars * 100),
      status,
      issued: iso(issued),
      due: iso(due),
    };
  });
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* fall through to seed */
  }
  return { clients: seedClients, invoices: seedInvoices() };
}

export const state = reactive<Persisted>(load());

watch(
  state,
  (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  },
  { deep: true },
);

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
export function formatDate(isoStr: string): string {
  return new Date(`${isoStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function clientName(id: string): string {
  return state.clients.find((c) => c.id === id)?.name ?? 'Unknown';
}

export const kpis = computed(() => {
  const now = new Date();
  const paid = state.invoices.filter((i) => i.status === 'paid');
  const overdue = state.invoices.filter((i) => i.status === 'overdue');
  const outstanding = state.invoices
    .filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + i.amountCents, 0);
  const paidThisMonth = paid
    .filter((i) => {
      const d = new Date(`${i.issued}T00:00:00`);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, i) => s + i.amountCents, 0);
  return {
    outstandingCents: outstanding,
    overdueCount: overdue.length,
    overdueCents: overdue.reduce((s, i) => s + i.amountCents, 0),
    paidThisMonthCents: paidThisMonth,
    collectedCents: paid.reduce((s, i) => s + i.amountCents, 0),
    clientCount: state.clients.length,
  };
});

export const revenueByMonth = computed(() => {
  const base = new Date();
  const months: Array<{ label: string; cents: number }> = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
    const cents = state.invoices
      .filter((i) => {
        if (i.status !== 'paid') return false;
        const id = new Date(`${i.issued}T00:00:00`);
        return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear();
      })
      .reduce((s, i) => s + i.amountCents, 0);
    months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), cents });
  }
  return months;
});

export function addInvoice(input: { clientId: string; amountCents: number; status: Status; due: string }): void {
  const maxNum = state.invoices.reduce((m, i) => Math.max(m, Number(i.number.replace('INV-', '')) || 0), 1042);
  state.invoices.unshift({
    id: uid('inv'),
    number: `INV-${maxNum + 1}`,
    clientId: input.clientId,
    amountCents: input.amountCents,
    status: input.status,
    issued: iso(new Date()),
    due: input.due,
  });
}
export function setStatus(id: string, status: Status): void {
  const inv = state.invoices.find((i) => i.id === id);
  if (inv) inv.status = status;
}
export function removeInvoice(id: string): void {
  const idx = state.invoices.findIndex((i) => i.id === id);
  if (idx >= 0) state.invoices.splice(idx, 1);
}
export function resetDemo(): void {
  state.clients = seedClients.map((c) => ({ ...c }));
  state.invoices = seedInvoices();
}
