-- First-run onboarding hints: when a user dismissed the workspace-switcher hint
-- and the activity-tray hint. Null means "not yet shown through to Done/Skip",
-- so a user who leaves it open sees it again next visit. Two columns rather
-- than a jsonb bag, for the reason the tour columns
-- (`20261007024333_users_onboarding_tours.sql`) are: each hint is a distinct
-- product moment, and both are read by the dashboard layout's existing
-- `users` select (`getWorkspaceContext`). Written by `markTourDone` through
-- `TOUR_COLUMN` (`src/lib/onboarding/tours.ts`).
--
-- The column grant is in THIS file. `20260914100000_users_block_admin_self_update.sql`
-- replaced the table-wide UPDATE grant on public.users with a column list, so
-- a column added without being named in a grant is readable (SELECT stays
-- table-wide) but every client write to it fails with `permission denied for
-- table users` — RLS never gets a say, because the privilege check runs first.
-- The tour columns shipped without theirs and needed
-- `20261007061209_users_onboarding_tours_column_grants.sql` to follow; the
-- ALTERs and the grant travel together here so that cannot happen again.
--
-- No backfill: existing users have not seen either hint. No index, no
-- function, no trigger, no policy change, and nothing for `anon` or `public`.
-- The own-row ALL policy on `(select auth.uid()) = id` still scopes the write
-- to the signed-in user's own row.
--
-- Applied with apply_migration version 20261012224442 (name: users_onboarding_hints).
--
-- Rollback:
--   revoke update (workspace_hint_done_at, activity_hint_done_at)
--     on public.users from authenticated;
--   alter table public.users drop column if exists workspace_hint_done_at;
--   alter table public.users drop column if exists activity_hint_done_at;

alter table public.users add column if not exists workspace_hint_done_at timestamptz;

alter table public.users add column if not exists activity_hint_done_at timestamptz;

grant update (workspace_hint_done_at, activity_hint_done_at) on public.users to authenticated;
