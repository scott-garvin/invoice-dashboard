<script setup lang="ts">
import { ref, computed } from 'vue';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import Dashboard from './components/Dashboard.vue';
import Invoices from './components/Invoices.vue';
import Clients from './components/Clients.vue';
import InvoiceModal from './components/InvoiceModal.vue';

const tab = ref('dashboard');
const showModal = ref(false);
const title = computed(() => tab.value.charAt(0).toUpperCase() + tab.value.slice(1));
</script>

<template>
  <div class="shell">
    <Sidebar :active="tab" @nav="tab = $event" />
    <main>
      <TopBar :title="title" />
      <div class="content">
        <Dashboard v-if="tab === 'dashboard'" />
        <Invoices v-else-if="tab === 'invoices'" @new="showModal = true" />
        <Clients v-else-if="tab === 'clients'" />
      </div>
    </main>
    <InvoiceModal v-if="showModal" @close="showModal = false" />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  min-height: 100vh;
}
main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.content {
  padding: 28px;
  overflow-y: auto;
  flex: 1;
}
@media (max-width: 720px) {
  .content {
    padding: 18px;
  }
}
</style>
