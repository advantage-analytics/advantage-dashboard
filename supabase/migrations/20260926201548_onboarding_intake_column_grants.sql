-- Grant UPDATE on the three onboarding intake columns to `authenticated`.
--
-- `20260914100000_users_block_admin_self_update.sql` replaced the table-wide
-- UPDATE grant on public.users with a column-scoped one, so that `is_admin`
-- and `plan` could be kept out of client reach. Every column added since has
-- to be named in that grant or clients cannot write it — RLS never gets a
-- say, because the privilege check runs first.
--
-- `20260926182506_onboarding_intake_answers.sql` added `recording_source`,
-- `acquisition_source` and `acquisition_source_detail` without the grant, so
-- the first-run onboarding's final submit — which writes all three in the
-- same update as `onboarded_at` — failed for every player with
-- `permission denied for table users` (seen in the dev log on 2026-09-26,
-- caught within hours; the intake screens had not yet shipped to users).
-- SELECT was unaffected: that grant is table-wide.
--
-- The coach path writes nulls to the same three columns from the same update,
-- so it was broken too. Nothing else changes: the own-row RLS policy still
-- scopes the write, and the check constraints still bound the values.
--
-- Applied to the live database via the Supabase MCP as
-- `onboarding_intake_column_grants` (version 20260926201548).

grant update (recording_source, acquisition_source, acquisition_source_detail)
  on public.users to authenticated;
