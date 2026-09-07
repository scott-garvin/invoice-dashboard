# invoice-dashboard — Ledgerly

A small, working invoicing dashboard. **[Live demo →](https://scott-garvin.github.io/invoice-dashboard/)**

Vue 3 + TypeScript + Vite. A dashboard with KPIs and a revenue chart, an invoices table you can filter, search, and add to, and a clients view. Data is seeded and persists in your browser (localStorage) — there's no backend and nothing leaves your machine. Use **Reset demo data** to restore the sample set.

Built to show what a professional front-end looks like end to end: considered layout and type, real component structure, sensible state management, empty/hover/focus states — not a template.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Stack

Vue 3 (`<script setup lang="ts">`), TypeScript (strict), Vite. No UI framework and no charting library — the chart and components are hand-built. Deployed to GitHub Pages via GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Related

This is the *front end*. For the same invoicing domain built as a hardened, multi-tenant **API** — Postgres row-level security, exact money, a test suite proving each fix — see **[invoice-api-hardening](https://github.com/scott-garvin/invoice-api-hardening)**.

Portfolio: [scott-garvin.github.io](https://scott-garvin.github.io)

## License

MIT — see [LICENSE](LICENSE).
