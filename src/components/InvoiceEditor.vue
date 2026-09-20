<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { z } from "zod";
import { Plus, Trash2 } from "@lucide/vue";
import DialogShell from "./DialogShell.vue";
import { workspace, run, execute } from "../workspace";
import {
  shifted,
  parseMoney,
  totals,
  money,
  type Draft,
  type Invoice,
} from "../../shared/domain";
const props = defineProps<{
  invoice?: Invoice;
  proposed?: Partial<Draft>;
  submitDraft?: (draft: Draft) => Promise<void>;
  submitLabel?: string;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const source = props.invoice || props.proposed;
const form = reactive({
  clientId: source?.clientId || "",
  title: source?.title || "",
  due: source?.due ?? shifted(30),
  notes: source?.notes || "",
  tax: String((source?.taxBps || 0) / 100),
  items: source?.items?.map((i) => ({
    description: i.description,
    quantity: String(i.quantity),
    rate: (i.unitCents / 100).toFixed(2),
  })) || [{ description: "", quantity: "1", rate: "" }],
});
const localError = ref("");
function draft(): Draft {
  return {
    clientId: form.clientId,
    title: form.title,
    due: form.due,
    notes: form.notes,
    taxBps: parseMoney(form.tax),
    items: form.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitCents: parseMoney(i.rate),
    })),
  };
}
const summary = computed(() => {
  try {
    return totals({ ...draft(), payments: [] });
  } catch {
    return null;
  }
});
async function save() {
  localError.value = "";
  await run(async () => {
    try {
      if (props.submitDraft) await props.submitDraft(draft());
      else
        await execute({ type: "save", id: props.invoice?.id, draft: draft() });
      emit("saved");
    } catch (e) {
      localError.value =
        e instanceof z.ZodError
          ? e.issues[0]?.message || "Check the invoice fields."
          : e instanceof Error
            ? e.message
            : "Check the invoice fields.";
    }
  });
}
</script>
<template>
  <DialogShell
    :title="invoice ? `Edit ${invoice.number}` : 'Create an invoice'"
    wide
    @close="!workspace.busy && emit('close')"
    ><form class="dialog-body" @submit.prevent="save">
      <p v-if="proposed" class="callout">
        Proposed fields from intake. Verify the client, quantities, rates, due
        date, and tax before saving. Nothing is sent. Clarifications lead to a
        separate approval step; approving creates a draft only.
      </p>
      <div class="form-grid">
        <label
          >Bill to<select v-model="form.clientId" required>
            <option value="" disabled>Select a client</option>
            <option
              v-for="c in workspace.data.clients"
              :key="c.id"
              :value="c.id"
            >
              {{ c.company }}
            </option>
          </select></label
        ><label
          >Due date<input v-model="form.due" type="date" required
        /></label>
      </div>
      <label
        >Project or invoice title<input
          v-model="form.title"
          maxlength="180"
          required
          placeholder="e.g. Brand identity, phase two"
      /></label>
      <div class="line-heading">
        <h3>Line items</h3>
        <span>USD · whole quantities</span>
      </div>
      <div v-for="(line, n) in form.items" :key="n" class="line-editor">
        <label class="description"
          >Description<input
            v-model="line.description"
            :aria-label="`Item ${n + 1} description`"
            required
            maxlength="180"
            placeholder="Service or deliverable" /></label
        ><label
          >Qty<input
            v-model="line.quantity"
            :aria-label="`Item ${n + 1} quantity`"
            type="number"
            min="1"
            max="10000"
            step="1"
            required /></label
        ><label
          >Rate (USD)<input
            v-model="line.rate"
            :aria-label="`Item ${n + 1} rate`"
            inputmode="decimal"
            required
            placeholder="0.00" /></label
        ><button
          type="button"
          class="icon-button"
          :disabled="form.items.length === 1"
          :aria-label="`Remove item ${n + 1}`"
          @click="form.items.splice(n, 1)"
        >
          <Trash2 :size="16" />
        </button>
      </div>
      <button
        type="button"
        class="text-button"
        :disabled="form.items.length >= 30"
        @click="form.items.push({ description: '', quantity: '1', rate: '' })"
      >
        <Plus :size="16" />Add line item
      </button>
      <div class="form-grid end">
        <label
          >Note to client<textarea
            v-model="form.notes"
            rows="3"
            maxlength="1000"
            placeholder="A short note, payment instructions, or reference."
          />
        </label>
        <div>
          <label
            >Tax rate (%)<input v-model="form.tax" inputmode="decimal" required
          /></label>
          <div class="total-row">
            <span>Subtotal</span
            ><strong>{{ summary ? money(summary.subtotal) : "—" }}</strong>
          </div>
          <div class="total-row">
            <span>Tax</span
            ><strong>{{ summary ? money(summary.tax) : "—" }}</strong>
          </div>
          <div class="total-row grand">
            <span>Total</span
            ><strong>{{ summary ? money(summary.total) : "—" }}</strong>
          </div>
        </div>
      </div>
      <p v-if="localError" role="alert" class="error">{{ localError }}</p>
      <footer class="dialog-footer">
        <span>Nothing is sent to the client.</span
        ><button
          type="button"
          class="button secondary"
          @click="emit('close')"
          :disabled="workspace.busy"
        >
          Cancel</button
        ><button class="button primary" :disabled="workspace.busy">
          {{ workspace.busy ? "Saving…" : submitLabel || "Save draft" }}
        </button>
      </footer>
    </form></DialogShell
  >
</template>
