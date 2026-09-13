-- Make "no policies and no grants" actually true.
-- Applied live 2026-08-18 as version 20260818041110.
--
-- `program_contacts`, `program_requests` and `pending_claims` each say in their
-- own migration that they carry no grant, because writes go through server
-- actions with the service role and nothing in a browser has any business
-- reading them. That was only half true: Supabase's default privileges grant
-- `anon` and `authenticated` ALL on every new table in `public`, so the grants
-- were there the whole time.
--
-- Nothing was exposed. All three have RLS enabled with zero policies, which
-- denies both roles outright — the privilege was unreachable behind the policy
-- check. But that is a single layer, and it is the layer a future `alter table
-- ... disable row level security` removes. `program_contacts` alone holds 3,117
-- real people's work email addresses; that deserves the check in front as well
-- as behind.
--
-- Safe to revoke, verified against every caller:
--
--   * program_contacts is read only by SECURITY DEFINER functions
--     (`complete_program_claim`), which execute as the owner and do not consult
--     the caller's privileges.
--   * program_requests is written by server actions and read by /admin/claims,
--     both through `createAdminClient()`.
--   * pending_claims is written and read only by the claim server actions,
--     likewise through the service role.
--
-- The service role bypasses both RLS and these grants, so no caller changes.

revoke all on public.pending_claims   from anon, authenticated;
revoke all on public.program_contacts from anon, authenticated;
revoke all on public.program_requests from anon, authenticated;
