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
