-- First-run onboarding tours: when a user finished (or dismissed) the sample-match
-- tour and the first-report tour. Null means "not yet shown through to the end",
-- so a user who stops halfway sees it again next visit. Two columns rather than a
-- jsonb bag because each tour is a distinct product moment and both are read by
-- the same dashboard layout query that already selects from `users`.
--
-- No backfill: existing users have not seen either tour. No index, no function,
-- no grant, no policy change — the existing ALL policy on `auth.uid() = id`
-- already covers own-row reads and writes.
--
-- Applied with apply_migration version 20261007024333 (name: users_onboarding_tours).
--
-- Rollback:
--   alter table public.users drop column if exists sample_tour_done_at;
--   alter table public.users drop column if exists first_report_tour_done_at;

alter table public.users add column if not exists sample_tour_done_at timestamptz;

alter table public.users add column if not exists first_report_tour_done_at timestamptz;
