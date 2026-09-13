# HPS Intelligence — Autonomous Procurement Intelligence & HPS Engine

A mobile-first Progressive Web App prototype for generating an explainable,
auditable Harga Perkiraan Sendiri (HPS), built exactly as a self-contained,
no-build-step HTML/CSS/JS app (consistent with the existing stack pattern of
single-file tools deployed via Cloudflare Workers/Pages).

## 1. Architecture

Three plain-JS files, no bundler, no framework:

- **`calc-core.js`** — pure functions and reference data only (no DOM). This
  is the entire "brain": category cost-driver tables, classification
  templates, and every calculation (classification confidence, knowledge
  coverage, source generation, cost drivers, Models A–D, triangulation,
  confidence scoring, negotiation intelligence, outcome learning, category
  maturity). Because it's pure and DOM-free, it runs identically in the
  browser and under Node — it ships with `test-calc.js`, a 30+ assertion
  sanity suite you can re-run any time with `node test-calc.js`.
- **`app.js`** — application state (persisted to `localStorage`), a
  hash-based router, one render function per screen, and a single delegated
  click/input handler that dispatches to named actions. No build step; open
  `index.html` directly or serve it statically.
- **`style.css`** — design tokens (CSS variables) and the mobile app-shell
  layout: fixed header + bottom nav, main content area with `overflow:
  hidden`, and per-screen internal scroll regions so the outer page never
  scrolls.
- **`index.html`** — the shell: loads the manifest, the three scripts in
  order, and registers the service worker.
- **`manifest.json` / `sw.js` / `icon-*.png`** — PWA installability and a
  minimal offline app-shell cache.

There is intentionally **no backend** in this delivery. All "autonomous
research," "sources," and "market benchmarks" are generated client-side
with an explicit, visible status tag. See §6 for how to wire up real data.

A headless end-to-end test (`test-dom.js`, using `jsdom`) drives the entire
user journey — login → new HPS → classification → coverage → research →
sources → drivers → result → why/scenario/negotiation → approval across
four different roles → outcome capture → learning event → AI Brain →
governance (admin-gated) → settings → persisted reload — and asserts on the
real rendered DOM at each step. Run it with `node test-dom.js` (requires
`npm install jsdom` once).

## 2. Directory structure

```
hps-intelligence/
├── index.html         # app shell
├── style.css           # design tokens + layout
├── calc-core.js         # pure calculation engine + category data
├── app.js               # state, router, screens, actions
├── manifest.json         # PWA manifest
├── sw.js                 # offline app-shell cache
├── icon-192.png
├── icon-512.png
├── test-calc.js           # Node unit tests for calc-core.js
├── test-dom.js            # Node/jsdom end-to-end UI test
└── README.md               # this file
```

## 3. Data model (prototype, in-memory / localStorage)

Everything lives inside one JSON blob under the key
`hps_intelligence_state_v1`, namespaced by `tenantId` on every request:

```
State
├── tenants[]                 { id, name, short }
├── currentTenantId
├── currentUser                { name, role }
├── providers[]                 { id, name, status, note }
├── modelGovernance              { production:{A,B,C,D}, candidate, history[] }
├── auditLog[]                    { ts, user, role, tenantId, action, detail }
└── requests[]                     ProcurementRequest
     ├── id, tenantId, version, status, createdBy, createdAt
     ├── input                        (Product/Category/Spec/Commercial fields — Step 1-3)
     ├── classification                (Category, Commodity, ProductFamily, exposures, confidence, corrected)
     ├── coverage                       (6 sub-scores + overall + label)
     ├── researched (bool), sources[]    (Source/SourceObservation — name, status, trust, freshness, dates)
     ├── costDrivers[]                    (CostDriver + CostDriverWeight — name, weight, delta, status)
     ├── scenario                          (Scenario — fx, index, commodity, freight, labor, margin, volumeDiscount)
     ├── hps                                 (HPSCalculation + HPSModelResult A-D, weightsUsed, confidence)
     ├── negotiation                          (NegotiationRound-style summary + levers)
     ├── approval { stage, history[] }          (Approval)
     ├── outcome                                 (ContractOutcome)
     └── learningEvents[]                          (LearningEvent — incl. classification corrections & outcomes)
```

This covers the spec's data-model list (Tenant, User, ProcurementRequest,
Category, Source/SourceObservation, CostDriver/Weight, MarketBenchmark
[inside Model B], HistoricalPurchase [input fields], Supplier/Quotation
[input fields], HPSCalculation/HPSModelResult, Scenario, Approval,
NegotiationRound, ContractOutcome, LearningEvent, AuditEvent,
ModelVersion [`modelGovernance`]) as a flat, denormalized prototype
structure rather than separate normalized tables — appropriate for a
client-only demo, and a straightforward mapping to real Postgres/Supabase
tables later (§6).

`KnowledgeNode`/`KnowledgeRelationship` (the knowledge graph) are
represented implicitly for this prototype: the AI Brain dashboard derives
graph-like aggregates (products/categories/vendors learned, category
maturity) directly from `requests[]` and `learningEvents[]` rather than a
separate graph store — see §8 Known Limitations.

## 4. Screens implemented (22, matching the spec's list)

Splash/Login · Home Dashboard · New HPS (3 steps + advanced-fields sheet) ·
AI Classification (+ correction) · Knowledge Coverage · Research Mission ·
Intelligence Sources · Cost Driver Analysis · HPS Result · HPS Model Detail
· Why This HPS · Scenario Simulation (live sliders) · Negotiation
Intelligence · Approval / HPS Lock · Procurement Outcome · Learning Event ·
AI Brain Dashboard · Knowledge Detail (per category) · Admin Model
Governance · Settings/Data Providers · plus an "Intelligence" hub and
Audit Log reached from bottom nav / More.

## 5. Provider adapter interface & data integrity

`calc-core.js#generateSources()` is the adapter seam. Every source object
carries `{ name, status, publishedDate, retrievedAt, trustScore,
freshness, note }`. Statuses used today are `DEMO`, `UNAVAILABLE`,
`INTERNAL` (when a historical price is supplied), and `USER PROVIDED`
(when a quotation is supplied) — **the app never emits `LIVE` or `CACHED`
because no live connection exists in this delivery.** `Settings → Data
Providers` lists the 12 provider categories from the spec (BPS, BI, LKPP,
Kemnaker wage, ESDM, Kemenkeu, principal price lists, distributors,
internal historical data, supplier quotations, contracts/PO/invoices,
market benchmark sources) each with an honest status and a disabled
"Connect" button.

## 6. Replacing DEMO providers with live data

Because this is a static client-side app, direct browser calls to BPS/BI
will fail on CORS. The intended path (matching the established stack
pattern):

1. Stand up a small **Cloudflare Worker** per provider (or one worker with
   routes) that holds API keys/credentials server-side and proxies
   requests, e.g. `GET /api/bi/jisdor` → fetches BI's rate and returns
   `{ value, publishedDate, retrievedAt }`.
2. In `calc-core.js`, replace the synthetic block inside
   `generateSources()`/cost-driver delta generation with a `fetch()` to
   that Worker, and set `status: 'LIVE'` only when the fetch succeeds with
   a fresh timestamp; fall back to `CACHED` (last successful response,
   stored in `localStorage`) or `UNAVAILABLE` on failure — never silently
   reuse a DEMO number as if it were live.
3. Persist real historical purchase/PO/invoice data via **Supabase
   (Postgres)** instead of `localStorage`; the `requests[]` shape above
   maps directly onto normalized tables (`procurement_requests`,
   `sources`, `cost_drivers`, `hps_calculations`, `learning_events`, etc.)
   with `tenant_id` on every row and Postgres RLS for tenant isolation.
4. Swap `Store.save()`/`Store.load()` for Supabase reads/writes (or a thin
   sync layer that still keeps `localStorage` as an offline cache).

## 7. Calculation formulas used

- **Model A — Historical Indexation**: `HPS_A = P0 × (1 + Σ weight_i ×
  (delta_i + scenario_i))`, where `P0` is the user-provided historical
  price. Unavailable without `P0`.
- **Model B — Market Benchmark**: generates 7 synthetic comparable points
  around a category/quantity-scaled base price, removes outliers via the
  1.5×IQR rule, and returns the median of the remaining points plus
  `[min, max]` as the range. Marked `INSUFFICIENT` if fewer than 3 points
  survive outlier removal.
- **Model C — Should Cost**: `base price × category-specific split`
  (material/freight/insurance/customs/logistics/implementation/labor/
  warranty/overhead/margin/tax), with each category's split summing to
  100% (verified in `test-calc.js`).
- **Model D — Predictive/Economic**: only activates once ≥3 prior
  `learningEvents` exist for the category; adjusts the historical price by
  the average observed bias. Explicitly labeled correlation, not
  causation, and `UNAVAILABLE` otherwise.
- **Triangulation**: weighted average of available models using
  `modelGovernance.production` weights (default 30/30/30/10),
  renormalized over whichever models actually produced a value; range =
  `[min, max]` across those models.
- **Confidence (0–100)**: weighted blend of average source trust,
  freshness ratio, spec-description length as a similarity proxy,
  benchmark count, historical-data presence, model agreement (1 − CV
  across model values), and overall knowledge coverage. Automatically
  capped at 64 ("Moderate" or below) whenever any DEMO/UNAVAILABLE source
  was used — confidence can never read High/Very High on unverified data.
- **Outcome learning**: absolute error, percent error (feeds category
  MAPE), signed bias, and saving vs. initial bid — feeding both the
  category's Model D and the AI Brain maturity heuristic.

## 8. Known limitations (read before treating this as production)

- **No backend.** Everything — including "research," "sources," and
  "market benchmarks" — runs synthetically in the browser with a seeded
  PRNG (deterministic per request) and is always labeled `DEMO`/
  `UNAVAILABLE`/`INTERNAL`/`USER PROVIDED`. Nothing here is real BPS/BI/
  LKPP data. See §6 for the path to real data.
- **Single-user, single-device state.** `localStorage` does not sync
  across devices/browsers; there is no real authentication. "Roles" and
  "tenants" are switched via a form in *More* for demo purposes only —
  there is no server-side access control, so this must not be treated as
  a security boundary.
- **Knowledge graph is implicit**, not a real graph store — aggregates are
  computed on the fly from `requests[]`/`learningEvents[]`. Fine for a
  prototype; a real Postgres graph extension or Neo4j would be needed for
  genuine relationship queries at scale.
- **No skeleton-loading states** for the (synthetic, instant) research
  mission — it resolves immediately since there is no real network call to
  await yet.
- **Editing cost-driver weights per request** is not exposed in the UI
  (only the global triangulation weights are, via Model Governance,
  gated to Admin/Procurement Head with an explicit confirmation dialog).
  The spec's "material change after lock creates a new version" logic is
  therefore not yet exercised end-to-end — versioning fields exist on the
  request object but nothing currently increments `version` after a lock.
- **"No-scroll main screens"** is implemented as: the outer app shell
  never scrolls, but individual content cards use an internal scrollable
  region on screens with more content than fits a small phone (e.g. Cost
  Driver Analysis with 8 drivers, Scenario Simulation with 7 sliders).
  This matches the spirit of the requirement (no page-level scroll,
  bottom nav and header always reachable) more than a literal
  zero-scroll-anywhere reading.
- **Multi-tenant isolation** is enforced only by filtering
  `requests[]`/`auditLog[]` by `tenantId` in the client; there is no real
  per-tenant encryption or server boundary since there is no server.

## 9. Deployment steps

**GitHub**
```
git init && git add . && git commit -m "HPS Intelligence prototype"
git remote add origin <your-repo-url>
git push -u origin main
```

**Cloudflare Pages** (static hosting, zero build step)
1. Connect the repo in the Cloudflare dashboard, or run
   `npx wrangler pages deploy .` from this folder.
2. Build command: none. Output directory: `/` (repo root).
3. Once live over HTTPS, the manifest + service worker become installable
   on Android/desktop Chrome automatically.

**Supabase/PostgreSQL backend** (for real persistence + live providers)
1. Create tables mirroring §3 (`tenants`, `procurement_requests`,
   `sources`, `cost_drivers`, `hps_calculations`, `approvals`, `outcomes`,
   `learning_events`, `audit_log`, `model_governance`), each with
   `tenant_id` + Postgres Row-Level Security scoped to the signed-in
   tenant.
2. Add a small Cloudflare Worker (or Supabase Edge Function) per external
   provider (BI, BPS, etc.) to proxy credentials server-side (§6).
3. Replace `Store.load()`/`Store.save()` in `app.js` with Supabase client
   calls; keep `localStorage` as an optional offline cache.

**Android packaging via Capacitor**
```
npm install @capacitor/core @capacitor/android
npx cap init "HPS Intelligence" "id.co.mti.hpsintelligence" --web-dir=.
npx cap add android
npx cap copy
npx cap open android   # build/sign the APK/AAB in Android Studio
```
No UI changes are required first — the layout was built mobile-first with
touch targets ≥44px and no page-level scroll specifically so it wraps into
Capacitor cleanly.

## 10. Running the tests

```
node test-calc.js   # pure calculation engine — 30+ assertions
npm install jsdom    # once
node test-dom.js      # full UI flow in a simulated DOM
```
