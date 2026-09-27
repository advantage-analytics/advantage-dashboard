# Run log — claude/onboarding-college-claim-flow-8e73c4

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add an authenticated search over existing custom orgs — done

**gate:** mechanical GATE PASS (lint 0 errors, typecheck clean, full suite); completion `VERDICT: pass`.
**changed:** New migration `20260927230000_search_custom_programs.sql` (SECURITY DEFINER `search_custom_programs`, prefix-then-substring tiering, `org_type <> 'college'`, projects program_id/school_name/org_type/owner_display, EXECUTE authenticated only) — **file only, NOT applied live; the user applies it**. `searchCustomPrograms` + `CustomOrgType` helpers in `programs-server.ts`; new `GET /api/programs/custom-search` (cookie-client auth, 401 / two-char floor / `private, no-store`); offline spec (7 tests) and live RLS spec (4 tests, registered in `LIVE_DB_SPECS`, skips against prod).
**follow-ups:** 1. `owner_display` is "First L." rather than a bare initial; if the product wants the full name, it is one expression in the migration plus the live spec's expected value. 2. Once the migration is applied, run `custom-program-search-rls` once by hand against a non-prod target to prove the grants before the UI ships. 3. T2's client should debounce (already in its criteria) since this route is `no-store` and cannot lean on the CDN.
