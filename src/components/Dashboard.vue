<script setup lang="ts">
import { computed } from 'vue';
import { state, kpis, revenueByMonth, formatMoney, clientName } from '../store';
import StatCard from './StatCard.vue';
import StatusPill from './StatusPill.vue';
import BarChart from './BarChart.vue';

const recent = computed(() => state.invoices.slice(0, 6));
</script>

<template>
  <div class="dash">
    <div class="stats">
      <StatCard label="Outstanding" :value="formatMoney(kpis.outstandingCents)" sub="Sent + overdue" />
      <StatCard label="Collected this month" :value="formatMoney(kpis.paidThisMonthCents)" tone="accent" />
      <StatCard
        label="Overdue"
        :value="formatMoney(kpis.overdueCents)"
        :sub="`${kpis.overdueCount} invoice${kpis.overdueCount === 1 ? '' : 's'}`"
        tone="red"
      />
      <StatCard label="Active clients" :value="String(kpis.clientCount)" />
    </div>

    <div class="row">
      <div class="card chart-card">
        <div class="card-head">
          <h3>Revenue collected</h3>
          <span class="muted">last 6 months</span>
        </div>
        <div class="chart-fill">
          <BarChart :data="revenueByMonth" />
        </div>
      </div>

      <div class="card recent">
        <div class="card-head"><h3>Recent invoices</h3></div>
        <ul>
          <li v-for="i in recent" :key="i.id">
            <div class="l">
              <span class="mono num">{{ i.number }}</span>
              <span class="cl">{{ clientName(i.clientId) }}</span>
            </div>
            <div class="r">
              <span class="mono amt">{{ formatMoney(i.amountCents) }}</span>
              <StatusPill :status="i.status" />
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.row {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}
.chart-card,
.recent {
  padding: 20px;
}
.chart-card {
  display: flex;
  flex-direction: column;
}
.chart-fill {
  flex: 1;
  min-height: 180px;
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.card-head h3 {
  font-size: 15px;
  font-weight: 700;
}
.muted {
  color: var(--faint);
  font-size: 12.5px;
}
.recent ul {
  list-style: none;
  display: flex;
  flex-direction: column;
}
.recent li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10.5px 0;
  border-bottom: 1px solid var(--border);
}
.recent li:last-child {
  border-bottom: none;
}
.recent .l {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.recent .num {
  font-size: 12px;
  color: var(--muted);
}
.recent .cl {
  font-weight: 600;
  font-size: 13.5px;
}
.recent .r {
  display: flex;
  align-items: center;
  gap: 12px;
}
.recent .amt {
  font-weight: 600;
  font-size: 13.5px;
}
@media (max-width: 980px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .stats {
    grid-template-columns: 1fr;
  }
}
</style>
