# Deployment — GitHub → Cloudflare Worker + Static Assets → Supabase

## Runtime architecture

Production topology:

`Browser → Cloudflare Worker + Static Assets → Supabase Auth/PostgreSQL/Storage`

No Nginx, Apache, IIS or VPS is required. Cloudflare is the stateless web/API layer; Supabase is the shared multi-user system of record.

Current Cloudflare Worker configuration is defined in `wrangler.jsonc`:

- Worker name: `costintelligence-pages` (legacy project name retained)
- Entry point: `worker.js`
- Static assets directory: repository root (`.`)
- API routes execute Worker-first for `/api/*`
- SPA fallback enabled
- Worker observability enabled
- Expected production build: `production-complete-20260916-v14`

Known production Worker URL:

`https://costintelligence-pages.procurement-e61.workers.dev`

## 1. GitHub

Repository: `fluxoryid/CostIntelligence`

`main` is the release branch. GitHub CI must pass before production deployment. The repository is public, therefore:

- never commit Supabase service-role keys;
- never commit Cloudflare API tokens;
- only Supabase publishable browser credentials may appear in `config.js`;
- provider secrets such as `EIA_API_KEY` must be configured as Cloudflare Worker secrets/environment variables.

## 2. Deploy to Cloudflare Workers

From a trusted workstation or CI environment with Wrangler authenticated for the correct Cloudflare account:

```bash
npm install
npx wrangler deploy
```

Wrangler deploys both `worker.js` and the static asset bundle using `wrangler.jsonc`.

If `EIA_API_KEY` is used, configure it as a Cloudflare secret rather than writing it into source code:

```bash
npx wrangler secret put EIA_API_KEY
```

Do not deploy from an unreviewed branch.

## 3. Verify the deployed runtime

After every production deployment, verify the live Worker directly:

1. `GET /api/version`
   - must return build ID `production-complete-20260916-v14`;
2. `GET /api/health`
   - must return healthy runtime state;
3. load `/config.js`
   - must point to `https://bobrilytsufxtqqqgaym.supabase.co`;
   - must contain only a Supabase publishable key, never a service-role credential;
4. load the application and sign in using a production Supabase user;
5. run the in-app Production Readiness Monitor.

A successful GitHub CI or GitHub Pages build is **not** proof that the Cloudflare Worker is current. The Worker runtime itself must be checked after deployment.

## 4. Verify official-source adapters

Open the relevant `/api/...` endpoints and confirm they return auditable source metadata when available:

- `/api/fx-usd-idr`
- `/api/bi-kurs`
- `/api/bi-rate`
- `/api/kurs-pajak`
- `/api/bps-inflation`
- `/api/bps-inflation-history`
- `/api/wb-indicator`
- `/api/lkpp-status`
- `/api/esdm-electricity`
- `/api/eia-brent` (optional; requires `EIA_API_KEY`)

An unavailable official source must remain unavailable. Never hard-code, randomize or substitute synthetic production evidence.

## 5. Supabase production backend

Production Supabase project:

- Project: `HPS_Intelligence`
- Project ref: `bobrilytsufxtqqqgaym`
- URL: `https://bobrilytsufxtqqqgaym.supabase.co`
- Tenant: `t1`

The backend is already migrated to the canonical HPS schema with RLS, maker/checker RPC workflow, immutable versions, private evidence Storage and governed learning controls.

Browser configuration uses only the publishable Supabase key. Authorization remains enforced by PostgreSQL RLS/RPC, not by the browser role display.

## 6. Production acceptance

Do not promote Production 2.0 RC to Production 2.0 until all of the following are complete:

- GitHub CI passes on the release commit;
- live Cloudflare `/api/version` matches the expected build;
- live `/config.js` points to the production Supabase project;
- production sign-in succeeds;
- role/RLS browser UAT passes;
- private evidence upload/access and duplicate controls pass;
- shared-state and five-team-user concurrency UAT passes;
- strict evidence gates behave correctly;
- Free-plan backup/availability residuals are formally accepted or eliminated by upgrading Supabase;
- business/security owner release approval is recorded.
