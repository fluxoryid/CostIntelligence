---
name: costintelligence-production-operator
description: Operate, debug, secure, deploy, validate, and continuously improve the HPS Intelligence / CostIntelligence production application across GitHub, Cloudflare Workers, Supabase Auth/Postgres/Storage, UAT, and procurement-intelligence governance.
version: 1.0.0
---

# CostIntelligence Production Operator

## Mission

Use this skill for all work on the CostIntelligence / HPS Intelligence application.

The objective is not merely to make the UI appear to work. The objective is to maintain a production-grade procurement-intelligence system with deterministic HPS calculation, traceable evidence, controlled authorization, auditable workflow, safe deployment, and reproducible recovery.

Always optimize for:

1. correctness before convenience;
2. evidence before assumption;
3. server-side authorization before browser-side controls;
4. reversible changes before destructive changes;
5. testable fixes before cosmetic workarounds;
6. source provenance before apparent completeness;
7. production observability before declaring success.

Never expose secrets, service-role keys, passwords, reset tokens, deployment keys, or privileged credentials in chat, source files, commits, logs, screenshots, or browser code.

---

# 1. Current Architecture

Treat the following architecture as the default unless the live repository proves otherwise:

- Source control and CI/CD: GitHub repository `fluxoryid/CostIntelligence`
- Primary production runtime: Cloudflare Worker with static assets
- Production application URL: `https://costintelligence-pages.procurement-e61.workers.dev`
- Backend: Supabase
- Supabase project reference: `bobrilytsufxtqqqgaym`
- Multi-tenant production tenant: `t1`
- Authentication: Supabase Auth, email/password
- Data authorization: PostgreSQL Row Level Security plus controlled RPCs
- Storage: private Supabase Storage bucket for evidence
- Calculation mode: `HYBRID_STRICT`
- Self signup: disabled
- LKPP product-price intelligence: deferred unless explicitly reactivated
- INAPROC transaction adapter: staged, disabled until authorized credentials and governance are validated

Do not assume any of these values are still current. Before material production work, verify the repository, `/api/version`, `/api/health`, Supabase project state, and the active branch.

---

# 2. Production Verification First

Before making a production claim:

1. Fetch the current `main` commit.
2. Read the runtime build ID from `config.js`, `worker.js`, or `VERSION.json`.
3. Verify the deployed Cloudflare runtime using `/api/version`.
4. Verify `/api/health`.
5. Confirm active official-source routes.
6. Check the latest GitHub deployment workflow result.
7. If the change affects database behavior, inspect Supabase migrations and relevant policies/functions.

Do not equate:
- successful git push,
- successful PR merge,
- successful Worker upload,
- or HTTP 200

with completed deployment.

A deployment is complete only when the expected build ID is active and post-deployment probes pass.

## Deployment propagation rule

Cloudflare may briefly serve the previous build after deployment.

The deployment workflow must retry until:

`CURRENT_BUILD == EXPECTED_BUILD`

Do not stop retrying just because `/api/version` returns HTTP 200.

---

# 3. Change Management

Use a controlled branch/PR workflow for production changes.

Recommended sequence:

1. inspect current source;
2. identify the root cause;
3. create a dedicated branch;
4. implement the smallest complete fix;
5. add a regression test;
6. update runtime build ID when behavior changes materially;
7. update release notes/checklist/roadmap when appropriate;
8. run CI;
9. merge only after CI succeeds;
10. verify production deployment;
11. inspect live runtime evidence;
12. ask the user to retest only after production verification.

Prefer squash merges for focused production hotfixes.

Do not patch production by guessing source markers. Read the real file first.

---

# 4. Browser and Runtime Regression Discipline

The application is plain browser JavaScript with multiple independently loaded modules. Syntax and interface regressions can break the app even if the Worker remains healthy.

CI must syntax-check browser modules, not only `worker.js`.

Critical modules include, when present:

- `calc-core.js`
- `app.js`
- `auth-sync.js`
- `cloud-sync.js`
- `source-engine.js`
- `providers.js`
- `governance-extensions.js`
- `procurement-ux.js`
- `category-cost-ux.js`
- `evidence-component-ux.js`
- `document-hub.js`
- `advanced-intelligence.js`
- `workflow-rbac.js`
- `learning-negotiation.js`
- `production-health.js`
- `uat-console.js`
- `password-recovery.js`
- `password-reset-page.js`
- `bahasa-id.js`
- `inaproc-intelligence.js`

## Lesson learned: literal escape corruption

A previous audit-hardening change accidentally introduced literal `\n` text into executable JavaScript.

Rule:
- after programmatic source replacement, inspect the modified lines;
- run browser syntax validation;
- never assume a text replacement generated valid JavaScript.

---

# 5. Stable Technical IDs Must Never Be Localized

Localization may change visible labels, but must never modify:

- DOM IDs
- form field names used by JavaScript
- API route names
- database field names
- role names used by authorization
- storage path structure
- function names
- configuration keys
- build identifiers

## Production incident learned

The Bahasa localization process changed:

- `gatePassword` -> `gateKata sandi`
- `authPassword` -> `authKata sandi`

while `app.js` still queried the original IDs.

Result:
- the user typed a valid password;
- Supabase credentials were valid;
- the application read the password field as empty;
- login appeared broken.

Permanent rule:
add regression tests asserting that technical DOM IDs remain stable.

---

# 6. Browser Export Contract

A module used by browser code must explicitly expose its browser API.

## Production incident learned

`calc-core.js` exported its API using `module.exports` for Node tests but did not expose the calculation engine in the browser.

The application later called:

`window.CalcCore.generateClassification(...)`

which caused a runtime exception after successful authentication.

The error was initially misreported as a session failure because authentication and application startup shared one catch block.

Permanent pattern:

```js
const API = { ... };

if (typeof window !== 'undefined') {
  window.CalcCore = API;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
```

Use one shared API object so Node tests and browser runtime cannot drift.

---

# 7. Authentication Troubleshooting Procedure

When a user reports login failure, do not immediately reset the password.

Follow this order.

## Step A — Verify Auth user

Check:
- user exists in `auth.users`;
- email is confirmed;
- account is not banned;
- account is not deleted;
- provider identity exists;
- latest `last_sign_in_at`;
- recent `updated_at`.

A recent successful `last_sign_in_at` after a password reset strongly indicates the new password is valid.

## Step B — Verify tenant authorization

Check:
- `hps_user_profiles.active = true`;
- `hps_tenant_members.active = true`;
- correct tenant ID;
- correct role;
- RLS allows the user to read their own membership.

For a realistic validation, simulate the authenticated JWT context and test the same membership query under the `authenticated` role.

Do not conclude there is an authorization problem only because a browser shows an error.

## Step C — Separate authentication from application startup

Authentication logic and application-startup logic must not share a broad catch handler.

Bad pattern:

```js
getSession()
  .then(loadUserAndStartWholeApp)
  .catch(() => showSessionFailed());
```

This causes any downstream UI exception to look like a bad session.

Preferred pattern:

1. validate session;
2. validate membership;
3. unlock access;
4. start application inside its own try/catch;
5. report startup errors separately.

Example user-facing distinction:

- authentication failure: `Validasi sesi gagal.`
- authorization failure: `Akun tidak memiliki keanggotaan tenant aktif.`
- runtime failure: `Sesi valid, tetapi aplikasi gagal dimulai: <actual error>`

---

# 8. Password Recovery Process

Use Supabase's supported recovery flow.

## Supabase URL configuration

Production Auth configuration must include:

Site URL:
`https://costintelligence-pages.procurement-e61.workers.dev`

Redirect URL:
`https://costintelligence-pages.procurement-e61.workers.dev/password-reset`

Do not use localhost in production.

## Recovery workflow

1. user selects `Lupa Kata Sandi`;
2. application calls `resetPasswordForEmail()`;
3. `redirectTo` points to canonical production route `/password-reset`;
4. user opens the newest reset email;
5. Supabase establishes a recovery session;
6. application handles `PASSWORD_RECOVERY`;
7. user enters and confirms a new password;
8. application calls `updateUser({ password })`;
9. user returns to the production app;
10. verify actual sign-in and active membership.

Never reuse an expired or consumed recovery email.

## Lesson learned: mobile dialog behavior

A JavaScript-only `<dialog>` click flow was unreliable on mobile/PWA browsers.

Prefer normal native navigation for critical authentication flows.

Use:

`href="/password-reset"`

rather than relying exclusively on a click handler to open a dialog.

## Lesson learned: legacy event interception

If a former click handler contains `preventDefault()`, converting the element to an anchor is not enough. The old handler can still cancel navigation.

When converting button behavior to native links:
- remove old interception; or
- explicitly ignore anchor elements.

## Lesson learned: Cloudflare clean URLs

Cloudflare static assets may canonicalize:

`/password-reset.html` -> `/password-reset`

with a redirect.

Authentication fragments and callback state should not depend on avoidable redirects.

Use the canonical clean route directly in:
- UI links;
- Supabase `redirectTo`;
- allowed redirect URLs;
- deployment smoke tests.

---

# 9. Supabase Security Model

Treat Supabase as the authorization boundary.

Browser visibility controls are defense-in-depth only.

Production controls include:

- RLS on all HPS tables;
- tenant-scoped reads;
- role-scoped writes;
- RPC-controlled workflow transitions;
- maker-checker separation;
- immutable approved/request versions where required;
- server-managed audit;
- private storage;
- append-only UAT evidence.

## Roles

Canonical roles:

- Procurement User
- Analyst/Senior
- Manager
- Procurement Head/Admin
- Auditor

Do not rename these role values in localization.

## Workflow authorization

Examples:

- Procurement User: request/maker actions; cannot self-approve.
- Analyst/Senior: review/rework support.
- Manager: approval when gate is ready; cannot perform Procurement Head-only final lock.
- Procurement Head/Admin: final lock and governed admin actions.
- Auditor: read-only.

Always verify actual RPC implementation before stating a role can perform an action.

---

# 10. Audit Integrity

Audit data must be server-managed.

Do not allow browser clients to insert authoritative audit events directly.

Previous hardening:

- direct browser audit write removed;
- compatibility audit method converted to no-op/server-managed response;
- authenticated direct INSERT revoked;
- audit identity sequence usage revoked;
- workflow RPCs write audit events server-side.

Rule:
If an event has governance, authorization, approval, sign-off, or compliance meaning, record it inside a trusted server-side operation or database trigger.

---

# 11. UAT Console Operating Model

Production UAT is a governed record, not a checklist in chat.

The application supports UAT-01 through UAT-24.

Core design:

- build-scoped UAT run;
- server-side system of record;
- PASS / FAIL / BLOCKED / NOT RUN;
- evidence required;
- defect reference required for FAIL;
- append-only attempts;
- retest creates a new attempt;
- latest result drives status;
- prior attempts remain immutable;
- final sign-off available only when all 24 latest results are PASS;
- only Procurement Head/Admin can sign off;
- sign-off generates authoritative audit evidence.

Do not mark browser UAT PASS without execution.

## Known role-coverage dependency

If the production roster lacks:
- Procurement User;
- Auditor;

then tests that specifically require those roles cannot legitimately be marked PASS.

Create dedicated test-role coverage or controlled temporary assignment only with explicit approval.

Never silently repurpose production user roles.

---

# 12. Procurement Intelligence Source Governance

Credibility and price relevance are different dimensions.

Preferred evidence hierarchy:

1. comparable executed internal PO / signed contract / paid invoice;
2. official Principal/OEM quotation;
3. authorized distributor quotation;
4. governed official transaction evidence;
5. official macro/industry data supporting cost drivers;
6. secondary market/context sources;
7. unverified/manual sources: context only or rejected.

Never replace unavailable official evidence with synthetic values.

## Active production source families

Examples:
- Bank Indonesia JISDOR
- BI Rate
- Kementerian Keuangan Kurs Pajak
- BPS
- ESDM
- World Bank
- EIA where relevant

LKPP is deferred from active price intelligence unless explicitly reactivated.

## Category-specific use

Do not use general CPI as a universal escalator.

Examples:

IT Hardware:
- FX;
- Principal/OEM;
- semiconductor/components;
- freight/import.

Software/SaaS:
- principal/subscription pricing;
- contract currency;
- vendor uplift.

Manpower/BPO:
- UMP/UMK/UMSK;
- statutory benefits;
- role salary evidence.

Data Center:
- electricity;
- FX;
- imported equipment;
- labor;
- avoid double-counting inflation.

Logistics:
- fuel;
- route;
- toll;
- labor;
- freight.

Construction:
- construction/material indices;
- local labor.

---

# 13. HPS Calculation Governance

The engine must remain deterministic and auditable.

Baseline logic:

## Reorder / Renewal

Use normalized historical contract evidence plus justified movements such as:

- foreign exchange;
- labor/UMP;
- relevant category-specific cost drivers.

## New Procurement

Typical components:

- Principal/OEM price;
- Principal discount;
- implementation;
- FX;
- labor/UMP;
- import taxes/duties where applicable;
- vendor margin;
- other directly evidenced cost components.

Do not let AI invent missing price evidence.

Every material component should show:
- source;
- value date;
- relevance;
- confidence/governance;
- whether it directly influences HPS or is only contextual.

---

# 14. Source Availability States

Use explicit states such as:

- LIVE
- CACHED
- STALE
- UNAVAILABLE

A cached official snapshot may be acceptable when:
- provenance is preserved;
- retrieval/reference dates are shown;
- staleness rules are explicit;
- the system does not call it LIVE.

Never fabricate a replacement because an upstream provider is unreachable.

---

# 15. Cloudflare Deployment Verification

A production deployment workflow should verify:

1. dependencies install;
2. production tests pass;
3. Worker syntax passes;
4. browser-module syntax passes;
5. Worker/static assets deploy;
6. deployed build ID matches expected build;
7. health endpoint returns healthy;
8. auth/reset critical static route returns successfully;
9. active official-source API probes pass.

For critical static pages, test the canonical production route.

Do not use legacy/deferred providers as production health dependencies.

---

# 16. Known Failure Modes and Their Diagnostic Meaning

## `http://localhost:3000/#error=access_denied&error_code=otp_expired`

Likely combination:
- Supabase Site URL still set to localhost;
- reset link expired or already consumed.

Fix:
- correct Site URL and Redirect URL;
- request a new email;
- use only the latest email.

## `Lupa Kata Sandi` does nothing

Check:
- element type;
- legacy `preventDefault()` handlers;
- dialog support on mobile;
- whether dedicated reset route exists.

Prefer native navigation to `/password-reset`.

## Valid password but login reports missing/invalid input

Check technical DOM IDs first.

Localization may have changed IDs while JavaScript still queries originals.

## `Validasi sesi gagal` immediately on page load

Do not assume bad credentials.

Check:
- stored Supabase session;
- membership query;
- application startup exception;
- browser global/module export;
- missing DOM elements;
- stale browser assets.

## Worker healthy but browser broken

Check:
- browser module syntax;
- script load order;
- required globals;
- stale static assets;
- DOM IDs;
- runtime interfaces between modules.

## Deployment shows old build after successful upload

Treat as propagation delay until proven otherwise.

Retry build verification.

---

# 17. Mobile/PWA Validation

At minimum validate:

- Android Chrome stable;
- desktop Chrome/Edge;
- 360–430 px width;
- portrait/landscape;
- slow network;
- expired session;
- refreshed session;
- password reset;
- PWA/browser cache refresh;
- login;
- logout;
- UAT console;
- critical procurement calculation flow.

A successful API test does not replace real-browser UAT.

---

# 18. Cache and Stale-Asset Troubleshooting

When production source is fixed but a mobile browser still shows old behavior:

1. confirm deployed build ID;
2. open with a cache-busting query parameter, e.g. `?v=<build>`;
3. close old tabs/PWA instance;
4. reopen production URL;
5. if necessary clear site data for the production domain.

Do not use cache-clearing as a substitute for root-cause analysis.

---

# 19. Supabase Migration Procedure

For production DDL:

1. read the current schema;
2. write migration;
3. validate in a transaction where practical;
4. apply migration through the Supabase migration mechanism;
5. verify tables/policies/functions/grants/indexes;
6. run Security Advisor;
7. run Performance Advisor;
8. validate relevant behavior under realistic authenticated role claims;
9. roll back validation data where appropriate;
10. never claim completion from DDL text alone.

Use least privilege.

For SECURITY DEFINER functions:
- fixed `search_path`;
- validate `auth.uid()`;
- validate tenant membership;
- validate role;
- revoke unnecessary EXECUTE from public/anon/authenticated when function is trigger-only.

---

# 20. Backup and Recovery

Supabase Free plan should not be treated as a complete enterprise backup strategy.

Required external process:

- recurring logical database export;
- secure off-site storage;
- separate backup of Storage objects;
- restore test into isolated environment;
- verify version hashes;
- verify tenant membership;
- verify audit counts;
- verify object references.

Do not claim the system is fully production-resilient until backup and restore have been tested.

---

# 21. Debugging Workflow

Use this order:

1. reproduce symptom precisely;
2. identify whether failure is:
   - browser/UI;
   - authentication;
   - authorization/RLS;
   - API;
   - data;
   - calculation engine;
   - deployment;
   - source-provider;
3. verify server-side truth before trusting UI error text;
4. inspect the exact production source;
5. test the narrowest backend operation independently;
6. simulate user role where necessary;
7. find the first failing boundary;
8. fix the root cause;
9. add regression test;
10. deploy through normal pipeline;
11. verify live build;
12. request user retest.

Do not repeatedly reset credentials when authentication is already proven successful.

---

# 22. Error-Message Design

Error text must identify the failing layer.

Examples:

Authentication:
- `Kredensial tidak valid atau login ditolak.`

Authorization:
- `Kredensial valid, tetapi akun tidak memiliki akses tenant HPS yang aktif.`

Session:
- `Validasi sesi gagal.`

Application startup:
- `Sesi valid, tetapi aplikasi gagal dimulai: <root exception>`

Provider:
- `Sumber resmi tidak tersedia; data sintetis tidak digunakan.`

Governance:
- `Evidence belum memenuhi approval gate.`

Avoid a generic catch-all message for unrelated failures.

---

# 23. Definition of Done

A change is DONE only when all applicable items are true:

- root cause understood;
- source fix committed;
- regression test added;
- CI successful;
- PR merged;
- expected build deployed;
- runtime build verified;
- health verified;
- critical route/API probes pass;
- database security verified when relevant;
- no secret exposure;
- user-impact behavior retested or clearly awaiting real-browser UAT;
- documentation updated where material.

Do not declare browser behavior fixed solely from code inspection.

---

# 24. Operating Style for Future AI Agents

When working on this repository:

- continue from the latest verified state;
- do not reopen deferred LKPP scope unless explicitly requested;
- do not invent unavailable evidence;
- do not weaken RLS to solve a UI problem;
- do not put service-role credentials in browser code;
- do not modify production access roles without explicit authorization;
- do not overwrite UAT history;
- do not bypass maker-checker controls;
- do not conflate Auth with application startup;
- do not change stable identifiers during localization;
- do not declare deployment complete before build verification.

Prefer evidence-backed statements such as:

- `Supabase authentication succeeded; the remaining failure is post-auth application startup.`
- `The backend membership query succeeds under the authenticated user's JWT context.`
- `The expected build is active and provider probes passed.`

This skill should evolve when a new production incident produces a reusable lesson.
