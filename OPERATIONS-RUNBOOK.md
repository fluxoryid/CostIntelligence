# HPS Intelligence — Operations Runbook

## Runtime topology

`6 authorized users (owner + 5 team members) → Cloudflare Worker/Static Assets → Supabase Auth/PostgreSQL/Storage`

Cloudflare remains stateless. Supabase is the shared system of record. No Nginx/Apache/VPS is required.

## Routine health check

1. Open `/api/health` and confirm `status=healthy`.
2. Open `/api/version` and confirm build ID matches `HPS_CONFIG.EXPECTED_WORKER_BUILD`.
3. Sign in and run the in-app Production Readiness Monitor.
4. Confirm Supabase status is AUTHENTICATED.
5. Check required category-specific providers before approving an HPS.

Provider failure does **not** permit synthetic substitution. The source becomes CACHED/STALE/UNAVAILABLE and the evidence gate determines whether approval remains possible.

## Authentication baseline

- Minimum password length: 12 characters.
- Required character classes: lowercase, uppercase, digits and symbols.
- Current password is required when changing a password.
- Browser self-sign-up is disabled.
- Leaked-password protection is unavailable on the current Supabase Free plan; treat this as an accepted residual until the project is upgraded to Pro or above.
- Do not share credentials between team members. Every person uses an individual Supabase Auth account.

## Incident severity

- **SEV-1**: authentication unavailable, tenant data exposure, RLS failure, approved record mutation, evidence-storage exposure.
- **SEV-2**: HPS calculation unavailable, workflow blocked globally, multiple official-source adapters unavailable.
- **SEV-3**: one optional provider unavailable, document text extraction unavailable, non-critical UI degradation.

For SEV-1, stop approval activity until containment/verification is complete.

## Rollback

Application rollback:
1. Identify last known-good GitHub commit/build ID.
2. Re-deploy that commit through Cloudflare.
3. Verify `/api/version` and smoke tests.
4. Do not roll back or delete Supabase audit/version records.

Database rollback:
- Prefer forward corrective migrations.
- Never delete approved request versions or audit rows to "undo" a release.
- For destructive schema incidents, restore from the provider-supported database backup/PITR mechanism available on the selected Supabase plan, then reconcile post-backup audit activity before reopening approval access.

## Backup and recovery — current Free plan

Supabase documents automatic daily backup history for Pro, Team and Enterprise projects. The current project is on the Free plan, so HPS Intelligence must maintain its own off-site backup procedure until the project is upgraded.

Required operating controls:
1. Run a logical database export using `supabase db dump` or `pg_dump` after every production schema release and on a recurring schedule agreed by the owner.
2. Store exports outside the Supabase project, in an access-controlled corporate location.
3. Back up Supabase Storage evidence objects separately. A database dump/backup preserves Storage metadata, not the binary evidence objects themselves.
4. Retain the GitHub migration/schema history as infrastructure recovery evidence, but do not treat GitHub as a database backup.
5. Periodically test restore into an isolated/non-production environment.
6. Verify restored request-version hashes, audit-log row counts, tenant memberships and evidence-object references.

If corporate policy requires automatic daily backups, downloadable backup history, non-pausing availability, leaked-password protection or PITR, upgrade the Supabase project before relying on it for production-critical procurement records.

## User administration

- Current approved roster: 6 accounts = owner + 5 team members.
- User accounts are created/invited through Supabase Auth administration.
- Tenant access is granted through `hps_tenant_members`.
- Disable a user by setting membership `active=false`; do not delete audit history.
- Role changes must be deliberate and auditable. Do not infer workflow role from job title or headcount.
- Submission requires a `Procurement User` or `Procurement Head/Admin`; review/approval/lock permissions remain enforced server-side by the workflow RPC.

Role capabilities:
- `Procurement User`: create/save own draft and submit for review.
- `Analyst/Senior`: review, return/rework and evidence review; cannot approve.
- `Manager`: review, approve/reject when evidence gate permits; cannot lock.
- `Procurement Head/Admin`: administrative workflow role including submit/review/approve/lock.
- `Auditor`: read-only.

## Release procedure

1. Merge/push tested code.
2. CI must pass.
3. Cloudflare deployment must succeed.
4. Verify final build ID.
5. Run UAT smoke set.
6. Check Supabase Security Advisor and Performance Advisor.
7. Record release/version in change log.
8. Verify database and Storage backup controls or formally accept the Free-plan residuals.
9. Enable team use only after role/RLS checks pass.

## Observability

- Cloudflare Worker observability remains enabled in `wrangler.jsonc`.
- `/api/health` provides runtime liveness.
- `/api/version` provides deployment identity.
- Supabase audit tables provide user/business activity traceability.
- Browser Production Readiness Monitor validates current dependencies without silently changing HPS calculations.
