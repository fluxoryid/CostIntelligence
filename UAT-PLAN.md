# HPS Intelligence — UAT Plan

## Acceptance rule

Production is accepted only when critical cases pass with **no synthetic production evidence**, correct RBAC enforcement, private evidence storage and immutable approved versions.

## Critical UAT cases

| ID | Scenario | Expected result |
|---|---|---|
| UAT-01 | Procurement User creates HPS with unsupported primary component | Evidence gate = BLOCKED; submission unavailable |
| UAT-02 | Primary component has one verified source score ≥80 | Component supported subject to validity/material-use decision |
| UAT-03 | Primary component has two independent acceptable price sources ≥70 | Component supported |
| UAT-04 | Evidence validity date has passed | Evidence is not usable for material support |
| UAT-05 | Procurement User attempts approval | Denied client-side and server-side |
| UAT-06 | Analyst starts review and returns with reason | State SUBMITTED → UNDER_REVIEW → REWORK; history/audit appended |
| UAT-07 | Manager approves with gate below APPROVAL READY | Server RPC rejects approval |
| UAT-08 | Manager approves with APPROVAL READY | Approved immutable version created |
| UAT-09 | Manager attempts final lock | Denied |
| UAT-10 | Procurement Head/Admin locks approved request | State = LOCKED; later content mutation rejected |
| UAT-11 | Auditor attempts insert/update | RLS denies write |
| UAT-12 | User from another tenant queries request/document | RLS returns no access |
| UAT-13 | Upload same file twice | SHA-256 duplicate is detected; duplicate row/storage copy not created |
| UAT-14 | Upload valid PDF/DOCX/XLSX/PPTX | Original stored privately; text extraction status recorded; original remains authoritative |
| UAT-15 | Upload scanned image | Metadata stored; no synthetic OCR/extraction claimed |
| UAT-16 | USD historical normalization | Current JISDOR and date-aligned historical JISDOR displayed with provenance |
| UAT-17 | Supported non-USD normalization | Official BI non-USD reference displayed; no third-party substitution |
| UAT-18 | Customs scenario | Kemenkeu Kurs Pajak used; duty/tax percentages remain explicit user inputs |
| UAT-19 | Fewer than 3 approved learning outcomes | Negotiation learning target remains unavailable |
| UAT-20 | ≥3 approved same-category outcomes | Historical discount distribution and evidence-derived target range displayed |
| UAT-21 | New negotiation outcome recorded | Saved as pending learning; Model D cannot consume until Manager/Head approval |
| UAT-22 | An active official provider (for example BI/BPS/ESDM) is unavailable | Status becomes unavailable/degraded; no synthetic price inserted |
| UAT-23 | Five users operate simultaneously | Shared Supabase records/versions remain consistent; no browser-local data collision |
| UAT-24 | Worker deployment | `/api/version` matches expected final build ID and `/api/health` = healthy |

## Mobile/PWA checks

Test at minimum:
- Android Chrome current stable;
- desktop Chrome/Edge;
- 360–430 px mobile widths;
- portrait and landscape;
- slow network throttling;
- expired/renewed auth session;
- PWA launch after deployment refresh.

## Performance acceptance

For a five-user deployment, acceptance is functional rather than load-capacity constrained. Confirm:
- initial application shell remains responsive;
- category/evidence recalculation completes interactively without visible UI lock;
- file extraction caps text at 200,000 characters and Office ZIP processing at bounded file sets;
- provider failures time out/fail visibly rather than blocking all local calculations indefinitely.

## Sign-off record

Record tester, role, date, browser/device, build ID, test IDs, pass/fail, defects and retest evidence. Production release requires all SEV-1/SEV-2 defects closed or formally accepted by the authorized business owner/security owner.
