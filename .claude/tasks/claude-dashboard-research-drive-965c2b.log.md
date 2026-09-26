# Run log — claude/dashboard-research-drive-965c2b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add `source` column to program_contacts and stamp admin rows — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New migration `20260926173824_program_contacts_source.sql` (applied live, version matches) adds `source text` with a `scrape|admin` check, admin-then-scrape backfill, `not null`, no default, and a column comment limiting the seed's prune to scrape rows. Live counts at apply: 3,117 rows; admin predicate 0, `created_at::date <> '2026-08-17'` 0, `email_domain is null` 0 (the 88 null-`source_url` rows are all seed rows from the 2026-08-17 window). After backfill: scrape 3,117, admin 0. `inviteToClaim` now writes `source: "admin"`. get_advisors: nothing new. create-migration check.sh passes on the new file; its one FAIL is pre-existing (`20260913230000_notification_prefs_team.sql`, d9e87b05).
**follow-ups:**

1. `scripts/seed-programs.ts` does not set `source`, so re-running the seed fails the new NOT NULL until T2 lands.
2. Three live migrations from 2026-09-26 are not in this worktree's `supabase/migrations/` (`20260926075216_admin_program_pilot`, `20260926082507_admin_update_program_details`, `20260926084422_admin_member_and_roster_writes`); confirm they land from their own branch.
3. `20260913230000_notification_prefs_team.sql` fails create-migration check.sh for everyone (RLS, no policy, no server-only marker); fix on its own branch.

## T2 · Seed script prunes departed scrape contacts, with a tested pure diff — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New pure `scripts/lib/contact-prune.ts` (`staleScrapeContacts`, `normalizeEmail`) with a 5-case offline spec `tests/seed-contact-prune.spec.ts`. `scripts/seed-programs.ts` now stamps `source: "scrape"` on every contact, and after the contacts upsert runs a scrape-only prune (chunked `.in("id", …)` plus an `.eq("source","scrape")` guard) behind `APPLY`. Dry run now connects and reads (all writes behind `APPLY`), reports programs missing from the DB instead of aborting, and prints the would-delete count; header comment rewritten. Runner dry run against the current dataset: existing contacts 3,117 (all scrape), prune would delete 0.
**follow-ups:**

1. The contacts upsert on `(program_id, email)` would overwrite an `admin` row whose email is also in the scrape CSV, flipping it to `scrape` (and a later scrape that drops it would prune it). Skip or merge scrape rows whose `(program_id, email)` already exists as `admin`.
2. The unique index is on `(program_id, lower(email))` but the upsert's `onConflict` names raw `email`; a mixed-case admin row could collide on the index without the upsert matching it. Check alongside follow-up 1.

## T3 · Pilot terms acceptances table + RPC enforcement — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Author decision: split the live apply. `20260926181544_pilot_terms_acceptances.sql` is APPLIED LIVE (table, RLS insert/select own, authenticated column-level insert on `user_id`/`terms_version` only, anon revoked, `current_pilot_terms_version()` = `2026-fall-pilot-1`). `20260926181600_pilot_terms_enforcement.sql` is NOT APPLIED (boxed header says so): re-creates `create_custom_program`, `complete_program_claim`, `complete_program_claim_with_token` from their live bodies with an acceptance gate raising `TA001` and a `program_id` stamp; `admin_create_program` untouched. New `pilot-terms.ts` (`PILOT_TERMS_VERSION`, `TERMS_NOT_ACCEPTED_SQLSTATE`); `"terms-not-accepted"` mapped in `createCustomProgram`, `completeClaim`, `completeClaimWithToken`, with placeholder copy in `claim/verify/failed/page.tsx` and `team-setup-form.tsx` (exhaustive maps). New live-db spec `tests/pilot-terms-rls.spec.ts` (registered in `live-db-specs.ts`; skips against prod; enforcement assertions skip until enforcement is live). get_advisors: nothing new.
**follow-ups:**

1. At deploy, together with T4: apply `20260926181600_pilot_terms_enforcement.sql`, rename it to the live version, run the spec against a non-prod target first.
2. T4: replace the placeholder `"terms-not-accepted"` copy in `claim/verify/failed/page.tsx` and `team-setup-form.tsx` and route to the terms screen instead of `restart`.
3. T4: the screen inserts only `{ user_id, terms_version }`; `program_id` is blocked by the column grant by design.
4. Add a `Db*` row type for `pilot_terms_acceptances` when app code first reads it.
