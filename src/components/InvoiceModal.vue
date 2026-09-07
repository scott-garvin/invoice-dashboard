<script setup lang="ts">
import { ref } from 'vue';
import { state, addInvoice, type Status } from '../store';

const emit = defineEmits<{ (e: 'close'): void }>();

const clientId = ref(state.clients[0]?.id ?? '');
const amount = ref('');
const status = ref<Status>('draft');
const due = ref('');
const error = ref('');

function save() {
  if (!clientId.value) {
    error.value = 'Please pick a client.';
    return;
  }
  const cents = Math.round(Number(amount.value) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    error.value = 'Enter a valid amount greater than zero.';
    return;
  }
  const defaultDue = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  addInvoice({
    clientId: clientId.value,
    amountCents: cents,
    status: status.value,
    due: due.value || defaultDue,
  });
  emit('close');
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="modal card" role="dialog" aria-modal="true" aria-label="New invoice">
      <div class="mhead">
        <h3>New invoice</h3>
        <button class="x" aria-label="Close" @click="emit('close')">✕</button>
      </div>
      <div class="body">
        <div class="field">
          <label>Client</label>
          <select v-model="clientId">
            <option v-for="c in state.clients" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="two">
          <div class="field">
            <label>Amount (USD)</label>
            <input v-model="amount" inputmode="decimal" placeholder="0.00" />
          </div>
          <div class="field">
            <label>Due date</label>
            <input v-model="due" type="date" />
          </div>
        </div>
        <div class="field">
          <label>Status</label>
          <select v-model="status">
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <p v-if="error" class="err">{{ error }}</p>
      </div>
      <div class="mfoot">
        <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" @click="save">Create invoice</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 28, 44, 0.4);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 50;
}
.modal {
  width: 440px;
  max-width: 100%;
  box-shadow: var(--shadow);
}
.mhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}
.mhead h3 {
  font-size: 16px;
  font-weight: 700;
}
.x {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 14px;
  width: 30px;
  height: 30px;
  border-radius: 7px;
}
.x:hover {
  background: var(--grey-soft);
  color: var(--ink);
}
.body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.err {
  color: var(--red);
  font-size: 13px;
  font-weight: 600;
}
.mfoot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 0 0 var(--radius) var(--radius);
}
</style>
