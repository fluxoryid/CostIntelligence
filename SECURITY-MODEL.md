# HPS Intelligence — Production Security Model

## Trust boundaries

1. **Browser/PWA** is untrusted. It may hold only the Supabase publishable key and user session. It never contains service-role credentials.
2. **Cloudflare Worker** is stateless. It serves static assets and official-source adapters. It does not persist procurement records.
3. **Supabase Auth + PostgreSQL + Storage** is the system of record. Authorization is enforced with Row Level Security and SECURITY DEFINER workflow RPC functions.
4. **Official external sources** are evidence providers, not trusted application state. Every response retains source/provenance and may be LIVE/CACHED/STALE/UNAVAILABLE.

## Roles

| Role | Primary rights |
|---|---|
| Procurement User | Create/edit own Draft/Rework, attach evidence, submit |
| Analyst/Senior | Review, validate evidence, return for rework, edit draft/rework where authorized |
| Manager | Review, approve/reject, approve learning outcomes |
| Procurement Head/Admin | Full workflow authority, final lock, tenant administration/bootstrap |
| Auditor | Read-only tenant records, versions, reviews and audit trail |

Production approval requires `APPROVAL READY` evidence coverage and Manager/Head authorization. Final lock requires Procurement Head/Admin.

## Immutability

- `hps_request_versions` is append-only and protected by a mutation-rejection trigger.
- Direct workflow status changes are rejected; workflow transitions must use `hps_transition_request()`.
- Approved/locked request content cannot be edited directly.
- Audit log is append-only by policy.
- Evidence documents are private; the Storage bucket is not public.

## Evidence file controls

- SHA-256 is computed before upload.
- Tenant-level duplicate content is rejected by unique hash constraint.
- File size limit: 20 MB.
- MIME allowlist is enforced by the Storage bucket.
- Document reference versioning is retained.
- Validity/expiry dates are tracked.
- PDF/Office extraction is informational; original file remains authoritative.
- Scanned images are not OCRed automatically; human review is required.

## Secrets

Allowed in browser:
- Supabase project URL
- Supabase publishable key

Never allowed in repository/browser:
- Supabase service-role key
- Database password
- Cloudflare API token
- third-party private API keys unless stored as Cloudflare secrets/environment variables

## Release controls

Before production release:
- run `npm test`;
- run Supabase Security and Performance Advisors after applying schema;
- verify RLS with users from each role;
- verify Worker `/api/version` build ID;
- complete UAT and rollback checklist;
- confirm repository access and environment-variable exposure.
