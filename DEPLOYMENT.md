# Deployment — GitHub → Cloudflare Pages → Supabase

## 1. GitHub

Create a private repository and upload the **contents of this folder at repository root**. `index.html` and `functions/` must be siblings.

## 2. Cloudflare Pages

Use Git integration (not dashboard drag-and-drop) because this package uses Pages Functions.

Recommended settings:

- Framework preset: None
- Production branch: main
- Root directory: repository root
- Build command: `exit 0`
- Output directory: `.`

Cloudflare will expose:

- `/api/fx-usd-idr`
- `/api/bi-rate`
- `/api/kurs-pajak`
- `/api/wb-indicator`
- `/api/lkpp-status`
- `/api/esdm-electricity`
- `/api/eia-brent` (optional; requires `EIA_API_KEY`)

Add `EIA_API_KEY` under Cloudflare Pages environment variables if you want the EIA Brent source enabled.

## 3. Verify providers

Open every `/api/...` URL directly. A valid adapter returns JSON and a real source/timestamp. An unavailable source must remain unavailable; do not hard-code a replacement value.

## 4. Optional Supabase

The application works local-only without Supabase.

For shared persistence:

1. Create a Supabase project.
2. Run `SUPABASE-SETUP.sql`.
3. Create/confirm a user in Supabase Auth.
4. Insert the tenant and tenant membership as shown at the bottom of the SQL file.
5. Copy the project URL and **publishable key** into `config.js`.
6. Keep service-role/secret keys out of browser code.
7. Re-deploy and test RLS with two different users before production.

## 5. Production acceptance

Do not declare production ready until:

- live provider endpoints have been tested;
- Supabase RLS has been tested if cloud mode is enabled;
- a strict request with weak evidence is BLOCKED or uses only valid owner cost build-up, never synthetic values;
- at least three comparable prices are present before Model B is used;
- historical escalation is used only when verified cost-driver coverage is sufficient;
- audit dossier export records sources, model values, confidence and runtime mode.
