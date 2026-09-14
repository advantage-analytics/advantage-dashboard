# Run log — claude/admin-claims-redesign-c793cc

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Security migration: block `users.is_admin` self-promotion — done

- **gate:** mechanical — GATE PASS (lint, typecheck, tests). completion — VERDICT: pass, every `done when:` line confirmed independently against the live database (own MCP queries, not just the implementer's report).
- **changed:** Added `supabase/migrations/20260914100000_users_block_admin_self_update.sql` and applied it to the LIVE database via the Supabase MCP. New trigger `users_block_admin_self_update` (mirrors `users_block_plan_self_update`) blocks any `authenticated`/`anon` session from changing `is_admin`, raising `42501`. Table-level `ALL` grants to `anon`/`authenticated` on `public.users` (which predated this task and covered every column, `is_admin` and `plan` included) were revoked and replaced with `authenticated`: SELECT on the table, UPDATE on all columns except `is_admin` and `plan`; `anon` now has no grants on `public.users` at all. No INSERT grant added for `authenticated` — sign-up still runs through `handle_new_user()` (SECURITY DEFINER, owned by `postgres`), which is unaffected. Added partial index `users_admins_idx on users (id) where is_admin` for the upcoming admin-notification fan-out. The existing admin user is unchanged and `is_admin()` still resolves true for them; a regular authenticated profile update still succeeds.
- **follow-ups:**
  1. The migration landed on the live DB timestamped `20260914231500` rather than the repo filename's `20260914100000` (the repo migrations folder is already ~100 behind live). Harmless — every statement in the file is idempotent (`create or replace`, `drop trigger if exists`, `create index if not exists`, and re-running the revoke/grant is a no-op) — but worth a decision at `/pr-check` about whether to rename the repo file to match the live timestamp for future-reader clarity.

## T2 · Test: a signed-in user cannot self-promote to admin — done

- **gate:** mechanical — GATE PASS (lint, typecheck, tests). completion — VERDICT: pass; the reviewer independently re-ran `npx playwright test admin-self-promotion` live (3 passed) and again with the Supabase env vars blanked (3 skipped, stated reason), rather than trusting the implementer's report.
- **changed:** Added `tests/admin-self-promotion.spec.ts`, following `tests/teams-management.spec.ts`'s structure and the shared `tests/fixtures/live-db.ts` fixtures. Proves T1's fix end to end against the live DB: a session client's self-promotion `update` fails with `42501` and leaves `is_admin` false; `rpc('is_admin')` still returns false afterward; a service-role client can still set it (proving the guard is role-scoped, not absolute). Cleans up unconditionally in `afterAll` (resets `is_admin`, deletes the test users) — confirmed zero stray rows for the run-marker prefix in both `auth.users` and `public.users` after the run.
