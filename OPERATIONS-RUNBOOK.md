# HPS Intelligence — Operations Runbook

## Runtime topology

`5+ team browsers → Cloudflare Worker/Static Assets → Supabase Auth/PostgreSQL/Storage`

Cloudflare remains stateless. Supabase is the shared system of record. No Nginx/Apache/VPS is required.

## Routine health check

1. Open `/api/health` and confirm `status=healthy`.
2. Open `/api/version` and confirm build ID matches `HPS_CONFIG.EXPECTED_WORKER_BUILD`.
3. Sign in and run the in-app Production Readiness Monitor.
4. Confirm Supabase status is AUTHENTICATED.
5. Check required category-specific providers before approving an HPS.

Provider failure does **not** permit synthetic substitution. The source becomes CACHED/STALE/UNAVAILABLE and the evidence gate determines whether approval remains possible.

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

## Backup and recovery verification

Monthly or after major schema changes:
- confirm Supabase backup/PITR availability for the subscribed plan;
- export a non-production schema snapshot/migration;
- test recovery into an isolated environment when available;
- verify private Storage evidence references remain consistent with database metadata;
- verify approved version hashes and audit-log row counts.

## User administration

- User accounts are created/invited through Supabase Auth administration.
- Tenant access is granted through `hps_tenant_members`.
- Self-sign-up is disabled in browser configuration.
- Disable a user by setting membership `active=false`; do not delete audit history.

Recommended five-person operating model:
- 2 × Procurement User
- 1 × Analyst/Senior
- 1 × Manager
- 1 × Procurement Head/Admin

## Release procedure

1. Merge/push tested code.
2. CI must pass.
3. Cloudflare deployment must succeed.
4. Verify final build ID.
5. Run UAT smoke set.
6. Check Supabase Security Advisor and Performance Advisor.
7. Record release/version in change log.
8. Enable team use only after role/RLS checks pass.

## Observability

- Cloudflare Worker observability remains enabled in `wrangler.jsonc`.
- `/api/health` provides runtime liveness.
- `/api/version` provides deployment identity.
- Supabase audit tables provide user/business activity traceability.
- Browser Production Readiness Monitor validates current dependencies without silently changing HPS calculations.
