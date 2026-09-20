<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { X } from "@lucide/vue";
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: Element | null;
onMounted(() => {
  previous = document.activeElement;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (previous instanceof HTMLElement) previous.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    :class="{ wide }"
    aria-labelledby="dialog-title"
    @cancel.prevent="emit('close')"
  >
    <header class="dialog-header">
      <div>
        <p class="eyebrow">Ledgerly workspace</p>
        <h2 id="dialog-title">{{ title }}</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close dialog"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
