<script setup lang="ts">
import type { Status } from '../store';
defineProps<{ status: Status }>();
</script>

<template>
  <span class="pill" :class="`pill-${status}`">{{ status }}</span>
</template>
