<script setup lang="ts">
import { computed, ref } from "vue";
import {
  LayoutDashboard,
  Files,
  Users,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  RefreshCw,
  KeyRound,
  X,
  CircleDollarSign,
  Clock3,
  Wallet,
  Menu,
  Download,
  ShieldCheck,
} from "@lucide/vue";
import {
  workspace,
  execute,
  run,
  connect,
  disconnect,
  refresh,
} from "./workspace";
import {
  money,
  totals,
  status,
  metrics,
  today,
  type Invoice,
  type Draft,
} from "../shared/domain";
import InvoiceEditor from "./components/InvoiceEditor.vue";
import InvoiceDetail from "./components/InvoiceDetail.vue";
import Intake from "./components/Intake.vue";
import DialogShell from "./components/DialogShell.vue";
const liveDemoUrl = import.meta.env.VITE_LIVE_DEMO_URL as string | undefined;
const tab = ref("overview"),
  search = ref(""),
  filter = ref("all"),
  navOpen = ref(false);
const selected = ref<string | null>(null),
  editor = ref(false),
  editing = ref<Invoice>(),
  proposed = ref<Partial<Draft>>();
const access = ref(false),
  invite = ref(""),
  resetting = ref(false),
  clientForm = ref(false);
const name = ref(""),
  company = ref(""),
  email = ref("");
const kpi = computed(() => metrics(workspace.data));
const invoice = computed(() =>
  workspace.data.invoices.find((i) => i.id === selected.value),
);
const client = (id: string) => workspace.data.clients.find((c) => c.id === id);
const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "invoices", label: "Invoices", icon: Files },
  { id: "clients", label: "Clients", icon: Users },
  { id: "intake", label: "AI intake", icon: Sparkles },
];
const rows = computed(() =>
  workspace.data.invoices
    .filter(
      (i) =>
        (filter.value === "all" || status(i) === filter.value) &&
        `${i.number} ${i.title} ${client(i.clientId)?.company}`
          .toLowerCase()
          .includes(search.value.toLowerCase()),
    )
    .sort((a, b) => b.number.localeCompare(a.number)),
);
const attention = computed(() =>
  workspace.data.invoices
    .filter((i) => status(i) === "overdue")
    .sort((a, b) => a.due.localeCompare(b.due)),
);
const chart = computed(() =>
  Array.from({ length: 6 }, (_, n) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 5 + n);
    const month = d.toISOString().slice(0, 7);
    return {
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      value: workspace.data.invoices
        .flatMap((i) => i.payments)
        .filter((p) => p.date.startsWith(month))
        .reduce((s, p) => s + p.amountCents, 0),
    };
  }),
);
const maxChart = computed(() =>
  Math.max(1, ...chart.value.map((v) => v.value)),
);
function navigate(id: string) {
  tab.value = id;
  navOpen.value = false;
  search.value = "";
  filter.value = "all";
}
function newInvoice() {
  editing.value = undefined;
  proposed.value = undefined;
  editor.value = true;
}
function edit(i: Invoice) {
  editing.value = i;
  selected.value = null;
  editor.value = true;
}
function intakeDraft(d: Partial<Draft>) {
  editing.value = undefined;
  proposed.value = d;
  editor.value = true;
}
function saved() {
  editor.value = false;
  tab.value = "invoices";
  workspace.notice = "Draft saved. Open it to review and issue when ready.";
}
function exportCsv() {
  const csv = [
    [
      "Invoice",
      "Client",
      "Title",
      "Status",
      "Due",
      "Total USD",
      "Paid USD",
      "Balance USD",
    ],
    ...rows.value.map((i) => [
      i.number,
      client(i.clientId)?.company || "",
      i.title,
      status(i),
      i.due,
      (totals(i).total / 100).toFixed(2),
      (totals(i).paid / 100).toFixed(2),
      (totals(i).balance / 100).toFixed(2),
    ]),
  ]
    .map((row) =>
      row
        .map(
          (value) =>
            '"' +
            String(value)
              .replace(/^[=+@\-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ledgerly-invoices.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <a href="#content" class="skip">Skip to content</a>
  <div class="app-shell">
    <button
      v-if="navOpen"
      class="nav-scrim"
      aria-label="Close navigation"
      @click="navOpen = false"
    />
    <aside class="sidebar" :class="{ open: navOpen }">
      <a class="brand" href="#" @click.prevent="navigate('overview')"
        ><span class="brand-mark">l<span>↗</span></span
        >ledgerly<span class="brand-dot">.</span></a
      >
      <div class="workspace-switch">
        <span class="studio-avatar">S</span>
        <div>
          <strong>Studio workspace</strong
          ><small>Freelance & small business</small>
        </div>
        <ChevronRight :size="15" />
      </div>
      <p class="nav-label">Workspace</p>
      <nav aria-label="Main navigation">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          @click="navigate(item.id)"
        >
          <component :is="item.icon" :size="19" /><span>{{ item.label }}</span
          ><small v-if="item.id === 'intake'" class="new-badge">NEW</small
          ><span v-if="item.id === 'invoices'" class="nav-count">{{
            workspace.data.invoices.length
          }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-note">
          <ShieldCheck :size="22" /><strong>Your own space to explore.</strong>
          <p>Fictional invoices. Simulated payments. A complete workflow.</p>
          <button @click="resetting = true" :disabled="workspace.busy">
            Reset demo <RefreshCw :size="13" />
          </button>
        </div>
        <a
          class="portfolio-link"
          href="https://scott-garvin.github.io/"
          target="_blank"
          rel="noopener"
          >Scott Garvin · Portfolio<ArrowUpRight :size="16"
        /></a>
        <div class="operator">
          <span>SG</span>
          <div>
            <strong>Demo operator</strong
            ><small>{{
              workspace.mode === "sample"
                ? "Sample workspace"
                : "Private live session"
            }}</small>
          </div>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <button
            class="icon-button mobile-toggle"
            aria-label="Open navigation"
            @click="navOpen = true"
          >
            <Menu :size="21" /></button
          ><span>Workspace</span><ChevronRight :size="14" /><strong>{{
            tabs.find((t) => t.id === tab)?.label
          }}</strong>
        </div>
        <div class="topbar-actions">
          <span class="mode-indicator"
            ><i :class="workspace.mode" />{{
              workspace.mode === "sample" ? "Sample mode" : "Live workspace"
            }}</span
          ><button
            class="button secondary compact"
            @click="access = true"
            :disabled="workspace.busy"
          >
            <KeyRound :size="15" />Demo access
          </button>
        </div>
      </header>
      <main id="content">
        <div v-if="workspace.error" class="banner error" role="alert">
          <span>{{ workspace.error }}</span
          ><button class="text-button" @click="run(refresh)">
            Refresh workspace</button
          ><button
            class="icon-button"
            aria-label="Dismiss error"
            @click="workspace.error = ''"
          >
            <X :size="16" />
          </button>
        </div>
        <div v-if="workspace.notice" class="banner success" role="status">
          {{ workspace.notice
          }}<button
            class="icon-button"
            aria-label="Dismiss notice"
            @click="workspace.notice = ''"
          >
            <X :size="16" />
          </button>
        </div>
        <template v-if="tab === 'overview'"
          ><div class="page-heading">
            <div>
              <p class="eyebrow">A little less admin</p>
              <h1>Your work. Paid forward.</h1>
              <p>
                A clear view of what’s coming in, what’s due, and what’s next.
              </p>
            </div>
            <button class="button primary" @click="newInvoice">
              <Plus :size="17" />New invoice
            </button>
          </div>
          <section class="metrics" aria-label="Workspace totals">
            <article class="metric feature">
              <div><span>Outstanding balance</span><Wallet :size="19" /></div>
              <strong>{{ money(kpi.outstanding) }}</strong>
              <p>
                Across
                {{
                  workspace.data.invoices.filter(
                    (i) => i.state === "issued" && totals(i).balance > 0,
                  ).length
                }}
                open invoices <ArrowUpRight :size="15" />
              </p>
            </article>
            <article class="metric">
              <div>
                <span>Collected this month</span><CircleDollarSign :size="19" />
              </div>
              <strong>{{ money(kpi.collected) }}</strong>
              <p>
                <span class="tiny-dot green" />Based on recorded payment dates
              </p>
            </article>
            <article class="metric">
              <div><span>Overdue</span><Clock3 :size="19" /></div>
              <strong>{{ money(kpi.overdue) }}</strong>
              <p>
                <span class="tiny-dot coral" />{{ kpi.overdueCount }} invoices
                need a follow-up
              </p>
            </article>
          </section>
          <div class="overview-grid">
            <section class="panel cash-panel">
              <div class="panel-heading">
                <div>
                  <p class="eyebrow">Cash movement</p>
                  <h2>Good work adds up.</h2>
                </div>
                <span class="subtle-tag">Last 6 months</span>
              </div>
              <div
                class="chart"
                role="img"
                :aria-label="
                  chart.map((v) => `${v.label}: ${money(v.value)}`).join(', ')
                "
              >
                <div
                  v-for="(bar, n) in chart"
                  :key="bar.label"
                  class="chart-column"
                >
                  <span class="chart-value">{{ money(bar.value) }}</span>
                  <div class="chart-track">
                    <div
                      class="chart-bar"
                      :class="{ current: n === 5 }"
                      :style="{
                        height: `${Math.max(3, (bar.value / maxChart) * 100)}%`,
                      }"
                    />
                  </div>
                  <span>{{ bar.label }}</span>
                </div>
              </div>
              <div class="chart-caption">
                <span class="tiny-dot green" />Payments collected · USD
                <span>Simulated ledger</span>
              </div>
            </section>
            <section class="intake-promo">
              <div class="sparkle-tile"><Sparkles :size="24" /></div>
              <span class="eyebrow">Meet your new first draft</span>
              <h2>From a work order<br />to an invoice.</h2>
              <p>
                Bring the details. Let AI organize them. You check every field
                before it becomes a draft.
              </p>
              <div class="mini-document">
                <div><span /><i /></div>
                <div><span /><i /></div>
                <div><span /><i /></div>
                <strong
                  ><ShieldCheck :size="14" />Always reviewed by you</strong
                >
              </div>
              <button class="button dark" @click="navigate('intake')">
                Explore AI intake<ArrowRight :size="17" />
              </button>
            </section>
          </div>
          <section class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Keep things moving</p>
                <h2>Needs your attention</h2>
              </div>
              <button
                class="text-button"
                @click="
                  navigate('invoices');
                  filter = 'overdue';
                "
              >
                View overdue invoices<ArrowRight :size="15" />
              </button>
            </div>
            <div v-if="!attention.length" class="empty-state">
              <CircleDollarSign :size="25" />
              <h3>All caught up.</h3>
              <p>No overdue invoices in this workspace.</p>
            </div>
            <button
              v-for="i in attention"
              :key="i.id"
              class="attention-row"
              @click="selected = i.id"
            >
              <span class="client-avatar">{{
                client(i.clientId)?.company.slice(0, 2).toUpperCase()
              }}</span
              ><span class="row-name"
                ><strong>{{ client(i.clientId)?.company }}</strong
                ><small>{{ i.number }} · {{ i.title }}</small></span
              ><span class="overdue-days"
                >{{
                  Math.floor(
                    (Date.parse(today()) - Date.parse(i.due)) / 86400000,
                  )
                }}
                days overdue</span
              ><strong class="money">{{ money(totals(i).balance) }}</strong
              ><ArrowUpRight :size="17" />
            </button></section
        ></template>
        <template v-if="tab === 'invoices'"
          ><div class="page-heading">
            <div>
              <p class="eyebrow">Your accounts receivable</p>
              <h1>Invoices, in order.</h1>
              <p>
                From first draft to final payment. Every step accounted for.
              </p>
            </div>
            <button class="button primary" @click="newInvoice">
              <Plus :size="17" />New invoice
            </button>
          </div>
          <section class="panel invoice-panel">
            <div class="list-toolbar">
              <div class="filters" aria-label="Invoice status">
                <button
                  v-for="f in [
                    'all',
                    'draft',
                    'sent',
                    'partial',
                    'overdue',
                    'paid',
                    'void',
                  ]"
                  :key="f"
                  :class="{ selected: filter === f }"
                  @click="filter = f"
                >
                  {{ f === "all" ? "All invoices" : f }}
                </button>
              </div>
              <div class="list-tools">
                <label class="search"
                  ><Search :size="17" /><input
                    v-model="search"
                    placeholder="Search invoices…"
                    aria-label="Search invoices" /></label
                ><button
                  class="icon-button"
                  aria-label="Export invoices CSV"
                  @click="exportCsv"
                >
                  <Download :size="18" /></button
                ><button
                  class="icon-button"
                  aria-label="Refresh invoices"
                  :disabled="workspace.busy"
                  @click="run(refresh)"
                >
                  <RefreshCw :size="17" />
                </button>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice / project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th class="align-right">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="i in rows" :key="i.id">
                    <td>
                      <button class="invoice-link" @click="selected = i.id">
                        {{ i.number }}</button
                      ><small>{{ i.title }}</small>
                    </td>
                    <td>{{ client(i.clientId)?.company }}</td>
                    <td>
                      <span class="pill" :data-status="status(i)">{{
                        status(i)
                      }}</span>
                    </td>
                    <td :class="{ late: status(i) === 'overdue' }">
                      {{
                        new Date(i.due + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )
                      }}
                    </td>
                    <td class="align-right money">
                      {{ money(i.state === "void" ? 0 : totals(i).balance) }}
                    </td>
                    <td>
                      <button
                        class="icon-button"
                        :aria-label="`Open ${i.number}`"
                        @click="selected = i.id"
                      >
                        <ArrowUpRight :size="17" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!rows.length" class="empty-state">
              <Files :size="28" />
              <h3>No invoices here yet.</h3>
              <p>Try another search or create a new draft.</p>
            </div>
            <footer class="table-footer">
              {{ rows.length }} invoices<span
                >USD · all activity is simulated</span
              >
            </footer>
          </section></template
        >
        <template v-if="tab === 'clients'"
          ><div class="page-heading">
            <div>
              <p class="eyebrow">Good work starts with people</p>
              <h1>Your client circle.</h1>
              <p>Billing details and balances, without the spreadsheet hunt.</p>
            </div>
            <button class="button primary" @click="clientForm = true">
              <Plus :size="17" />Add client
            </button>
          </div>
          <div class="client-grid">
            <article
              v-for="c in workspace.data.clients"
              :key="c.id"
              class="panel client-card"
            >
              <span class="client-avatar large">{{
                c.company.slice(0, 2).toUpperCase()
              }}</span>
              <h2>{{ c.company }}</h2>
              <p>{{ c.name }}</p>
              <small>{{ c.email }}</small>
              <div class="client-stats">
                <div>
                  <span>Open balance</span
                  ><strong>{{
                    money(
                      workspace.data.invoices
                        .filter(
                          (i) => i.clientId === c.id && i.state === "issued",
                        )
                        .reduce((s, i) => s + totals(i).balance, 0),
                    )
                  }}</strong>
                </div>
                <div>
                  <span>Invoices</span
                  ><strong>{{
                    workspace.data.invoices.filter((i) => i.clientId === c.id)
                      .length
                  }}</strong>
                </div>
              </div>
              <button
                class="text-button"
                @click="
                  navigate('invoices');
                  search = c.company;
                "
              >
                View invoices<ArrowRight :size="16" />
              </button>
            </article></div
        ></template>
        <Intake
          v-if="tab === 'intake'"
          :key="workspace.mode"
          @propose="intakeDraft"
        />
        <footer class="page-footer">
          <span>LEDGERLY / MORE SPACE FOR THE WORK</span
          ><span>{{
            workspace.mode === "sample"
              ? "Saved in this tab. No backend or AI calls."
              : "Private database session. Expires after 24 hours."
          }}</span>
        </footer>
      </main>
    </div>
    <InvoiceEditor
      v-if="editor"
      :invoice="editing"
      :proposed="proposed"
      @close="editor = false"
      @saved="saved"
    />
    <InvoiceDetail
      v-if="invoice && !editor"
      :invoice="invoice"
      @close="selected = null"
      @edit="edit"
    />
    <DialogShell
      v-if="access"
      title="Choose your demo experience"
      @close="!workspace.busy && (access = false)"
      ><div class="dialog-body">
        <p class="muted">
          Sample mode is free and works in this tab. Live access connects a
          private database workspace and enables real AI extraction when
          configured.
        </p>
        <a v-if="liveDemoUrl" :href="liveDemoUrl" class="button primary full"
          >Open live demo</a
        >
        <form
          v-else-if="workspace.mode === 'sample'"
          @submit.prevent="
            run(async () => {
              await connect(invite);
              invite = '';
              access = false;
              selected = null;
            })
          "
        >
          <label
            >Ledgerly demo access key<input
              v-model="invite"
              type="password"
              autocomplete="off"
              placeholder="Invitation key from Scott"
          /></label>
          <p class="small muted">
            This is not an OpenAI API key. Keys stay in page memory and are
            cleared on reload.
          </p>
          <button class="button primary full" :disabled="workspace.busy">
            Connect live workspace
          </button>
        </form>
        <button
          v-else
          class="button secondary full"
          @click="
            disconnect();
            access = false;
            selected = null;
          "
        >
          Return to sample mode
        </button>
        <p v-if="workspace.error" role="alert" class="error">
          {{ workspace.error }}
        </p>
      </div></DialogShell
    >
    <DialogShell
      v-if="resetting"
      title="Start fresh?"
      @close="resetting = false"
      ><div class="dialog-body">
        <p>
          This restores the fictional invoices and clients in your current
          {{ workspace.mode }} workspace. Drafts and simulated payments will be
          cleared. AI allowance is not reset.
        </p>
        <div class="dialog-footer">
          <button class="button secondary" @click="resetting = false">
            Keep my work</button
          ><button
            class="button primary"
            :disabled="workspace.busy"
            @click="
              run(async () => {
                await execute({ type: 'reset' });
                resetting = false;
                selected = null;
                tab = 'overview';
                workspace.notice =
                  'Demo reset. Your AI allowance is unchanged.';
              })
            "
          >
            Reset workspace
          </button>
        </div>
      </div></DialogShell
    >
    <DialogShell
      v-if="clientForm"
      title="Add a client"
      @close="clientForm = false"
      ><form
        class="dialog-body"
        @submit.prevent="
          run(async () => {
            await execute({ type: 'client', client: { name, company, email } });
            clientForm = false;
            name = '';
            company = '';
            email = '';
          })
        "
      >
        <label
          >Company<input v-model="company" required maxlength="180" /></label
        ><label
          >Contact name<input v-model="name" required maxlength="180" /></label
        ><label
          >Email<input v-model="email" type="email" required maxlength="180"
        /></label>
        <p class="small muted">Use fictional details. No email will be sent.</p>
        <p v-if="workspace.error" class="error" role="alert">
          {{ workspace.error }}
        </p>
        <footer class="dialog-footer">
          <button class="button primary" :disabled="workspace.busy">
            Save client
          </button>
        </footer>
      </form></DialogShell
    >
  </div>
</template>
