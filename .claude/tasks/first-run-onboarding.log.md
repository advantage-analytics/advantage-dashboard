# Run log — first-run-onboarding

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add sample_tour_done_at and first_report_tour_done_at to users — done

**gate:** mechanical — lint pass (0 errors), typecheck pass, tests 4319 passed / 379 skipped / failures confined to browser specs (trim-step-navigation, viz-_-browser, film-playback-refresh, event-table, add-player-_) that fail identically with T1 stashed: `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1200/…` — the container's Playwright browser build does not match. Environmental, not this task (SQL-only diff). completion — VERDICT: pass.
**changed:** `supabase/migrations/20261007024333_users_onboarding_tours.sql` adds nullable `sample_tour_done_at` and `first_report_tour_done_at` (timestamptz) to `public.users`; applied live via MCP `apply_migration`, recorded version 20261007024333 (filename matches). No function, grant or policy.
**follow-ups:**

1. **Blocks T9 as written:** `authenticated` has SELECT but **no UPDATE** on the two new columns (verified live in `information_schema.column_privileges`; `20260914100000_users_block_admin_self_update` replaced the table-wide UPDATE grant with a column list). T9's `markTourDone` updates via the cookie client and will fail with `permission denied` before RLS. Needs either a migration `grant update (sample_tour_done_at, first_report_tour_done_at) on public.users to authenticated;` (pattern: `20260926201548_onboarding_intake_column_grants.sql`) or a server-stamped write via the admin client. The migration header's "covers own-row reads and writes" line is inaccurate for writes for the same reason.
2. Live DB has migration `20261005072656_label_marks_and_site_removals` with no file on this branch — check before merging to `splitstep-integration`.
3. Test environment: Playwright expects chromium headless shell 1200; until fixed, every task's gate will show the same browser-spec failures.

## T19 · Grant UPDATE on the two onboarding-tour columns to authenticated — done

**gate:** mechanical — lint pass, typecheck pass, tests 4319 passed / 379 skipped; failures are the same browser-spec set as T1 (trim-step-navigation, viz-*-browser, film-playback-refresh, …) caused by the missing Playwright Chromium headless shell 1200 — treated as environmental per the author's ruling (SQL-only diff). completion — VERDICT: pass.
**changed:** `supabase/migrations/20261007061209_users_onboarding_tours_column_grants.sql` — `grant update (sample_tour_done_at, first_report_tour_done_at) on public.users to authenticated;` with a header explaining the column-list UPDATE grant from `20260914100000` and correcting T1's "covers writes" line. Applied live via MCP (version 20261007061209, filename matches); verified `authenticated` has SELECT+UPDATE on both columns, `anon` nothing. rls-boundary checklist (by hand): pass.
**follow-ups:**

1. Every new `public.users` column needs an explicit `grant update (...)` — second time this has bitten (after `20260926201548`). Worth a line in AGENTS.md's Conventions next to the function-grant rule.
