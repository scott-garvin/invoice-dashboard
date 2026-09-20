<script setup lang="ts">
import { ref, onMounted } from "vue";
import InvoiceEditor from "./InvoiceEditor.vue";
import type { IntakeView } from "../../shared/intake";
import { Sparkles, ArrowRight, FileText } from "@lucide/vue";
import {
  exampleSource,
  exampleExtraction,
  type Extraction,
} from "../../shared/extraction";
import { type Draft, parseMoney, shifted } from "../../shared/domain";
import { workspace, run, request, refresh } from "../workspace";
const emit = defineEmits<{ propose: [Partial<Draft>] }>();
const source = ref(exampleSource),
  result = ref<Extraction | null>(null),
  reviewed = ref(false),
  real = ref(false),
  tokenInfo = ref("");
const savedRuns = ref<IntakeView[]>([]),
  active = ref<IntakeView | null>(null),
  edit = ref(false);
async function loadRuns() {
  if (workspace.mode === "live") savedRuns.value = await request("intakes");
}
onMounted(() => {
  if (workspace.mode === "live") void run(loadRuns);
});
function selectRun(value: IntakeView) {
  active.value = value;
  source.value = value.source;
  result.value = value.extraction?.result || null;
  reviewed.value = false;
  real.value = true;
  tokenInfo.value = value.extraction
    ? `${value.extraction.model} · ${value.extraction.inputTokens} input / ${value.extraction.outputTokens} output tokens`
    : "";
}
async function submitWorkflow(draft: Draft) {
  const current = active.value!;
  const updated: IntakeView = await request(`intakes/${current.id}/resume`, {
    action: current.stage === "clarify" ? "clarify" : "approve",
    checkpoint: current.checkpoint,
    draft,
  });
  selectRun(updated);
  edit.value = false;
  await refresh();
  await loadRuns();
  workspace.notice =
    updated.stage === "complete"
      ? "Reviewed draft saved. Open Invoices to issue it when ready."
      : "Clarifications saved. Review the completed invoice before approval.";
}
async function retry() {
  await run(async () => {
    const current = active.value!;
    selectRun(
      await request(`intakes/${current.id}/resume`, {
        action: "retry",
        checkpoint: current.checkpoint,
      }),
    );
    await loadRuns();
  });
}
async function extract() {
  result.value = null;
  reviewed.value = false;
  await run(async () => {
    if (workspace.mode === "sample") {
      if (source.value !== exampleSource)
        throw new Error(
          "The guided example works with the supplied work order only. Connect live access to extract your own fictional text.",
        );
      result.value = exampleExtraction();
      real.value = false;
      tokenInfo.value = "Guided example · no model call";
    } else {
      active.value = null;
      try {
        selectRun(await request("intakes", { source: source.value }));
      } finally {
        await loadRuns();
      }
    }
  });
}
function propose() {
  void run(async () => {
    if (!result.value || !reviewed.value) return;
    if (active.value) {
      edit.value = true;
      return;
    }
    if (result.value.currency.value !== "USD")
      throw new Error(
        "Only explicitly stated USD work orders can be imported. Create other invoices manually.",
      );
    const r = result.value;
    const items = r.items.map((l) => {
      const quantity = Number(l.quantity.value);
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        !l.description.value ||
        !l.unitPrice.value
      )
        throw new Error(
          "A line item is incomplete. Review the source and create this invoice manually.",
        );
      return {
        description: l.description.value,
        quantity,
        unitCents: parseMoney(l.unitPrice.value),
      };
    });
    if (!items.length) throw new Error("No complete line items were found.");
    const matches = workspace.data.clients.filter(
      (c) => c.company.toLowerCase() === r.client.value?.toLowerCase(),
    );
    const days = /^Net\s+(\d{1,3})$/i.exec(r.terms.value || "");
    emit("propose", {
      clientId: matches.length === 1 ? matches[0].id : "",
      title: r.title.value || "",
      items,
      due: days ? shifted(Number(days[1])) : "",
      notes: "Prepared from a work order. Verify payment terms and tax.",
    });
  });
}
async function loadFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 8000 || !/\.(txt|md)$/i.test(file.name)) {
    workspace.error = "Choose a UTF-8 .txt or .md file under 8 KB.";
    return;
  }
  source.value = await file.text();
  result.value = null;
  active.value = null;
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">From work order to draft</p>
      <h1>Less retyping. More reviewing.</h1>
      <p>
        Extract billable work, inspect the evidence, then build your invoice.
      </p>
    </div>
    <span class="pill" data-status="draft"
      ><Sparkles :size="14" />AI intake</span
    >
  </div>
  <section v-if="workspace.mode === 'live'" class="panel workflow-panel">
    <div class="panel-heading">
      <h2>Saved intake progress</h2>
      <button
        class="text-button"
        :disabled="workspace.busy"
        @click="run(loadRuns)"
      >
        Refresh progress
      </button>
    </div>
    <p class="small muted">
      LangGraph saves each step in Postgres. Reconnect with your demo key in
      this browser to resume within 24 hours. Resetting the workspace cancels
      its intake runs.
    </p>
    <div class="workflow-runs">
      <button
        v-for="item in savedRuns"
        :key="item.id"
        class="button secondary"
        :disabled="workspace.busy"
        @click="selectRun(item)"
      >
        {{ item.draft?.title || "Work order" }} /
        {{
          item.stage === "clarify"
            ? "Needs details"
            : item.stage === "review"
              ? "Awaiting approval"
              : item.stage === "complete"
                ? "Draft saved"
                : "Interrupted"
        }}
      </button>
    </div>
    <p v-if="!savedRuns.length" class="small muted">
      Your live work orders will appear here.
    </p>
    <template v-if="active"
      ><ol class="workflow-steps" aria-label="Intake progress">
        <li>Extract</li>
        <li>Validate &amp; match</li>
        <li :class="{ current: active.stage === 'clarify' }">Clarify</li>
        <li :class="{ current: active.stage === 'review' }">Review</li>
        <li :class="{ current: active.stage === 'complete' }">Save draft</li>
      </ol>
      <p v-for="issue in active.issues" :key="issue" class="callout">
        {{ issue }}
      </p>
      <p v-if="active.stage === 'complete'" role="status" class="callout">
        This intake's draft is saved. Reopening this run does not create another
        invoice.
      </p>
      <div v-if="active.stage === 'retry'" class="callout">
        <p>
          Processing was interrupted. Retry resumes the saved step. If
          extraction did not finish, retry makes another metered AI request.
        </p>
        <button
          class="button secondary"
          :disabled="workspace.busy"
          @click="retry"
        >
          Retry saved step
        </button>
      </div>
    </template>
  </section>
  <div class="intake-grid">
    <section class="panel">
      <div class="panel-heading">
        <h2><FileText :size="18" />Source document</h2>
        <button
          class="text-button"
          @click="
            source = exampleSource;
            result = null;
            active = null;
          "
        >
          Use example
        </button>
      </div>
      <label
        >Fictional work order<textarea
          v-model="source"
          rows="15"
          maxlength="8000"
          @input="
            result = null;
            reviewed = false;
            active = null;
          "
        />
      </label>
      <div class="upload">
        <label
          >Or open a text file<input
            type="file"
            accept=".txt,.md"
            @change="loadFile"
        /></label>
      </div>
      <p class="small muted">
        Text and Markdown only, up to 8,000 characters. In live mode, this text
        is sent to OpenAI for extraction. Use fictional data.
      </p>
      <button
        class="button primary full"
        :disabled="workspace.busy"
        @click="extract"
      >
        <Sparkles :size="16" />{{
          workspace.busy
            ? "Extracting…"
            : workspace.mode === "sample"
              ? "Explore guided extraction"
              : "Extract with AI"
        }}
      </button>
    </section>
    <section class="panel intake-result">
      <template v-if="!result"
        ><div class="empty-evidence">
          <Sparkles :size="30" />
          <h2>Every field has a source.</h2>
          <p>
            Proposed values and their original quotes appear here. Missing
            details stay missing.
          </p>
          <div class="steps">
            <span>01 · Extract</span><span>02 · Verify</span
            ><span>03 · Draft</span>
          </div>
        </div></template
      ><template v-else
        ><div class="panel-heading">
          <h2>Review proposed fields</h2>
          <span
            class="pill"
            :data-status="active?.stage === 'complete' ? 'paid' : 'partial'"
            >{{
              active?.stage === "complete" ? "Draft saved" : "Needs review"
            }}</span
          >
        </div>
        <p class="small muted">{{ tokenInfo }}</p>
        <div
          v-for="(f, name) in {
            Client: result.client,
            Project: result.title,
            Currency: result.currency,
            Terms: result.terms,
          }"
          :key="name"
          class="extracted-field"
        >
          <span>{{ name }}</span
          ><strong>{{ f.value || "Not found" }}</strong>
          <blockquote v-if="f.quote">“{{ f.quote }}”</blockquote>
        </div>
        <div v-for="(line, n) in result.items" :key="n" class="inset">
          <h3>Item {{ n + 1 }}</h3>
          <div v-for="(f, name) in line" :key="name" class="extracted-field">
            <span>{{ name }}</span
            ><strong>{{ f.value || "Not found" }}</strong>
            <blockquote v-if="f.quote">“{{ f.quote }}”</blockquote>
          </div>
        </div>
        <p v-for="warning in result.warnings" :key="warning" class="callout">
          {{ warning }}
        </p>
        <p class="small muted">
          {{
            real
              ? "Quotes were checked against the source. That does not prove the interpretation is correct."
              : "This is a prepared example, not a live AI result."
          }}
        </p>
        <label
          v-if="
            !active || active.stage === 'clarify' || active.stage === 'review'
          "
          class="check-label"
          ><input v-model="reviewed" type="checkbox" />I checked the proposed
          values against the source.</label
        ><button
          v-if="
            !active || active.stage === 'clarify' || active.stage === 'review'
          "
          class="button primary full"
          :disabled="!reviewed || workspace.busy"
          @click="propose"
        >
          {{
            active?.stage === "clarify"
              ? "Complete missing details"
              : "Review invoice draft"
          }}<ArrowRight :size="16" /></button
      ></template>
    </section>
  </div>
  <InvoiceEditor
    v-if="edit && active"
    :key="active.checkpoint"
    :proposed="active.draft"
    :submit-draft="submitWorkflow"
    :submit-label="
      active.stage === 'clarify'
        ? 'Continue to approval'
        : 'Approve and save draft'
    "
    @close="edit = false"
  />
</template>
