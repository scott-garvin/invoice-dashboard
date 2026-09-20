<script setup lang="ts">
import { computed, ref } from "vue";
import { Download, Pencil, Send, CircleCheck } from "@lucide/vue";
import DialogShell from "./DialogShell.vue";
import { workspace, run, execute } from "../workspace";
import {
  totals,
  status,
  money,
  today,
  parseMoney,
  type Invoice,
} from "../../shared/domain";
const props = defineProps<{ invoice: Invoice }>();
const emit = defineEmits<{ close: []; edit: [Invoice] }>();
const total = computed(() => totals(props.invoice));
const client = computed(() =>
  workspace.data.clients.find((c) => c.id === props.invoice.clientId),
);
const payment = ref(false),
  amount = ref(""),
  date = ref(today()),
  reference = ref(""),
  voiding = ref(false),
  reason = ref("");
let paymentId = crypto.randomUUID();
async function pay() {
  await run(async () => {
    await execute({
      type: "payment",
      id: props.invoice.id,
      paymentId,
      amountCents: parseMoney(amount.value),
      date: date.value,
      reference: reference.value,
    });
    payment.value = false;
    paymentId = crypto.randomUUID();
  });
}
function download() {
  const i = props.invoice;
  const content = [
    "LEDGERLY · FICTIONAL DEMO INVOICE",
    i.number,
    i.title,
    `Bill to: ${client.value?.company}`,
    `Due: ${i.due}`,
    "",
    ...i.items.map(
      (l) =>
        `${l.description} | ${l.quantity} x ${money(l.unitCents)} | ${money(l.quantity * l.unitCents)}`,
    ),
    "",
    `Subtotal: ${money(total.value.subtotal)}`,
    `Tax: ${money(total.value.tax)}`,
    `Total: ${money(total.value.total)}`,
    `Paid (simulated): ${money(total.value.paid)}`,
    `Balance: ${money(total.value.balance)}`,
    "",
    i.notes,
    "",
    "Portfolio demonstration only. No payment request or email was sent.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${i.number}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <DialogShell :title="invoice.number" wide @close="emit('close')"
    ><div class="dialog-body">
      <div class="invoice-hero">
        <div>
          <span class="pill" :data-status="status(invoice)">{{
            status(invoice)
          }}</span>
          <h2>{{ invoice.title }}</h2>
          <p>{{ client?.company }} · {{ client?.email }}</p>
        </div>
        <div class="invoice-amount">
          <span>Balance due</span
          ><strong>{{
            invoice.state === "void" ? money(0) : money(total.balance)
          }}</strong
          ><small>Due {{ invoice.due }}</small>
        </div>
      </div>
      <div class="document-lines">
        <div v-for="(l, n) in invoice.items" :key="n">
          <span
            >{{ l.description
            }}<small>{{ l.quantity }} × {{ money(l.unitCents) }}</small></span
          ><strong>{{ money(l.quantity * l.unitCents) }}</strong>
        </div>
        <div>
          <span>Tax ({{ invoice.taxBps / 100 }}%)</span
          ><strong>{{ money(total.tax) }}</strong>
        </div>
        <div class="grand">
          <span>Invoice total</span><strong>{{ money(total.total) }}</strong>
        </div>
      </div>
      <p v-if="invoice.notes" class="invoice-note">{{ invoice.notes }}</p>
      <div class="detail-actions">
        <button class="button secondary" @click="download">
          <Download :size="16" />Download invoice</button
        ><template v-if="invoice.state === 'draft'"
          ><button class="button secondary" @click="emit('edit', invoice)">
            <Pencil :size="16" />Edit draft</button
          ><button
            class="button primary"
            :disabled="workspace.busy"
            @click="
              run(async () => {
                await execute({ type: 'issue', id: invoice.id });
              })
            "
          >
            <Send :size="16" />Issue (demo)
          </button></template
        ><button
          v-if="invoice.state === 'issued' && total.balance > 0"
          class="button primary"
          @click="
            payment = true;
            amount = (total.balance / 100).toFixed(2);
          "
        >
          <CircleCheck :size="16" />Record payment
        </button>
      </div>
      <p class="small muted">
        All delivery and payments are simulated. Issued invoices are locked to
        preserve their history.
      </p>
      <form v-if="payment" class="inset" @submit.prevent="pay">
        <h3>Record a simulated payment</h3>
        <div class="form-grid">
          <label
            >Amount (USD)<input
              v-model="amount"
              inputmode="decimal"
              required /></label
          ><label
            >Payment date<input
              v-model="date"
              type="date"
              :max="today()"
              :min="invoice.issued || undefined"
              required
          /></label>
        </div>
        <label
          >Reference<input
            v-model="reference"
            maxlength="180"
            required
            placeholder="e.g. Demo bank transfer 1042"
        /></label>
        <div class="detail-actions">
          <button class="button primary" :disabled="workspace.busy">
            Save payment</button
          ><button
            type="button"
            class="button secondary"
            @click="payment = false"
          >
            Cancel payment
          </button>
        </div>
      </form>
      <div v-if="invoice.payments.length" class="inset">
        <h3>Payment history</h3>
        <div v-for="p in invoice.payments" :key="p.id" class="total-row">
          <span>{{ p.date }} · {{ p.reference }}</span
          ><strong>{{ money(p.amountCents) }}</strong>
        </div>
      </div>
      <div class="activity">
        <h3>Activity</h3>
        <div v-for="(event, n) in [...invoice.history].reverse()" :key="n">
          <span class="activity-dot" />
          <p>
            {{ event.text
            }}<small>{{ new Date(event.at).toLocaleString() }}</small>
          </p>
        </div>
      </div>
      <button
        v-if="invoice.state !== 'void' && !invoice.payments.length && !voiding"
        class="text-button danger"
        @click="voiding = true"
      >
        Void this invoice
      </button>
      <form
        v-if="voiding"
        class="inset"
        @submit.prevent="
          run(async () => {
            await execute({ type: 'void', id: invoice.id, reason });
            voiding = false;
          })
        "
      >
        <label
          >Reason for voiding<input v-model="reason" required maxlength="180"
        /></label>
        <p class="small muted">
          The invoice remains in the audit history. Voiding cannot be reversed.
        </p>
        <div class="detail-actions">
          <button class="button secondary" :disabled="workspace.busy">
            Confirm void</button
          ><button type="button" class="text-button" @click="voiding = false">
            Keep invoice
          </button>
        </div>
      </form>
      <p v-if="workspace.error" class="error" role="alert">
        {{ workspace.error }}
      </p>
    </div></DialogShell
  >
</template>
