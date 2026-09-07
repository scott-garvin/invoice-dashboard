<script setup lang="ts">
import { computed } from 'vue';
import { state, formatMoney } from '../store';

const rows = computed(() =>
  state.clients.map((c) => {
    const inv = state.invoices.filter((i) => i.clientId === c.id);
    const outstanding = inv
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + i.amountCents, 0);
    const initials = c.name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return { ...c, count: inv.length, outstanding, initials };
  }),
);
</script>

<template>
  <div class="grid">
    <div v-for="c in rows" :key="c.id" class="card client">
      <div class="top">
        <div class="avatar">{{ c.initials }}</div>
        <div>
          <div class="name">{{ c.name }}</div>
          <div class="email">{{ c.email }}</div>
        </div>
      </div>
      <div class="meta">
        <div class="cell">
          <span class="k">Invoices</span>
          <span class="v mono">{{ c.count }}</span>
        </div>
        <div class="cell">
          <span class="k">Outstanding</span>
          <span class="v mono">{{ formatMoney(c.outstanding) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.client {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.top {
  display: flex;
  gap: 13px;
  align-items: center;
}
.avatar {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 15px;
}
.name {
  font-weight: 700;
  font-size: 15px;
}
.email {
  font-size: 12.5px;
  color: var(--muted);
}
.meta {
  display: flex;
  gap: 12px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.k {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.v {
  font-weight: 700;
  font-size: 15px;
}
</style>
