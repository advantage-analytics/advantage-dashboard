-- Grant UPDATE on the two onboarding tour columns to `authenticated`.
--
-- `20260914100000_users_block_admin_self_update.sql` replaced the table-wide
-- UPDATE grant on public.users with a column list, so that `is_admin` and
-- `plan` could be kept out of client reach. Every column added since has to
-- be named in that grant or clients cannot write it — RLS never gets a say,
-- because the privilege check runs first.
--
-- `20261007024333_users_onboarding_tours.sql` added `sample_tour_done_at` and
-- `first_report_tour_done_at` without naming them in a grant. SELECT is
-- unaffected (that grant is table-wide), so both columns are readable by
-- `authenticated`, but any client write to them fails with
-- `permission denied for table users`. That migration's header says the
-- existing ALL policy "already covers own-row reads and writes" — accurate for
-- reads, inaccurate for writes, since a policy cannot stand in for a missing
-- column privilege. Applied migrations are immutable, so the correction lives
-- here rather than in that file.
--
-- Nothing else changes: no column, function, trigger or policy, and nothing
-- for `anon` or `public`. The own-row ALL policy on `(select auth.uid()) = id`
-- still scopes the write to the signed-in user's own row.
--
-- Applied to the live database via the Supabase MCP as
-- `users_onboarding_tours_column_grants` (version 20261007061209).

grant update (sample_tour_done_at, first_report_tour_done_at)
  on public.users to authenticated;
