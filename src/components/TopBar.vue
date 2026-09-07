<script setup lang="ts">
import { resetDemo } from '../store';
defineProps<{ title: string }>();
</script>

<template>
  <header class="top">
    <h1>{{ title }}</h1>
    <button class="btn btn-ghost btn-sm" @click="resetDemo">Reset demo data</button>
  </header>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
h1 {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
</style>
