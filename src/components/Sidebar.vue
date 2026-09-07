<script setup lang="ts">
defineProps<{ active: string }>();
const emit = defineEmits<{ (e: 'nav', v: string): void }>();
const items = [
  { k: 'dashboard', label: 'Dashboard' },
  { k: 'invoices', label: 'Invoices' },
  { k: 'clients', label: 'Clients' },
];
</script>

<template>
  <aside class="side">
    <div class="brand">
      <span class="logo">🧾</span>
      <span class="bname">Ledgerly</span>
    </div>
    <nav>
      <button
        v-for="it in items"
        :key="it.k"
        class="nav"
        :class="{ active: active === it.k }"
        @click="emit('nav', it.k)"
      >
        {{ it.label }}
      </button>
    </nav>
    <div class="foot">Demo · data stays in your browser</div>
  </aside>
</template>

<style scoped>
.side {
  width: 232px;
  flex: none;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 22px;
}
.logo {
  font-size: 20px;
}
.bname {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.02em;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.nav {
  text-align: left;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  color: var(--ink-2);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
}
.nav:hover {
  background: var(--grey-soft);
}
.nav.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.foot {
  margin-top: auto;
  font-size: 11.5px;
  color: var(--faint);
  padding: 10px;
  line-height: 1.4;
}
@media (max-width: 720px) {
  .side {
    width: 68px;
  }
  .bname,
  .foot {
    display: none;
  }
  .nav {
    text-align: center;
    padding: 10px 6px;
    font-size: 11px;
  }
}
</style>
