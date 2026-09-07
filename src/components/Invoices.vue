<script setup lang="ts">
import { ref, computed } from 'vue';
import { state, formatMoney, formatDate, clientName, setStatus, removeInvoice, type Status } from '../store';
import StatusPill from './StatusPill.vue';

const emit = defineEmits<{ (e: 'new'): void }>();

const q = ref('');
const filter = ref<'all' | Status>('all');
const filters: Array<'all' | Status> = ['all', 'draft', 'sent', 'paid', 'overdue'];

const rows = computed(() =>
  state.invoices.filter((i) => {
    const term = q.value.trim().toLowerCase();
    const matchQ =
      !term ||
      clientName(i.clientId).toLowerCase().includes(term) ||
      i.number.toLowerCase().includes(term);
    const matchF = filter.value === 'all' || i.status === filter.value;
    return matchQ && matchF;
  }),
);

function onStatus(id: string, e: Event) {
  setStatus(id, (e.target as HTMLSelectElement).value as Status);
}
</script>

<template>
  <div class="inv">
    <div class="toolbar">
      <div class="filters">
        <button v-for="f in filters" :key="f" class="chip" :class="{ active: filter === f }" @click="filter = f">
          {{ f }}
        </button>
      </div>
      <div class="right">
        <input class="search" v-model="q" placeholder="Search client or number…" />
        <button class="btn btn-primary btn-sm" @click="emit('new')">+ New invoice</button>
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Client</th>
            <th>Issued</th>
            <th>Due</th>
            <th class="ar">Amount</th>
            <th>Status</th>
            <th class="ar">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in rows" :key="i.id">
            <td class="mono num">{{ i.number }}</td>
            <td class="cl">{{ clientName(i.clientId) }}</td>
            <td class="muted">{{ formatDate(i.issued) }}</td>
            <td class="muted">{{ formatDate(i.due) }}</td>
            <td class="ar mono amt">{{ formatMoney(i.amountCents) }}</td>
            <td><StatusPill :status="i.status" /></td>
            <td class="ar actions">
              <select :value="i.status" aria-label="Change status" @change="onStatus(i.id, $event)">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
              <button class="del" title="Delete invoice" @click="removeInvoice(i.id)">✕</button>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="7" class="empty">No invoices match your filter.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.inv {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.filters {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
}
.chip {
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  font-size: 12.5px;
  text-transform: capitalize;
  color: var(--muted);
  padding: 6px 13px;
  border-radius: 999px;
}
.chip:hover {
  color: var(--ink);
}
.chip.active {
  background: var(--ink);
  color: #fff;
}
.right {
  display: flex;
  gap: 10px;
  align-items: center;
}
.search {
  font: inherit;
  font-size: 13.5px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  width: 240px;
  max-width: 46vw;
}
.search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th {
  text-align: left;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--faint);
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
td {
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 13.5px;
}
tbody tr:last-child td {
  border-bottom: none;
}
tbody tr:hover {
  background: var(--surface-2);
}
.ar {
  text-align: right;
}
.num {
  color: var(--muted);
  font-size: 12.5px;
}
.cl {
  font-weight: 600;
}
.amt {
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}
.actions select {
  font: inherit;
  font-size: 12.5px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-2);
}
.del {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--muted);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 12px;
}
.del:hover {
  border-color: var(--red);
  color: var(--red);
  background: var(--red-soft);
}
.empty {
  text-align: center;
  color: var(--faint);
  padding: 40px;
}
</style>
