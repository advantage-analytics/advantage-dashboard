-- Supabase security advisor 0028 (anon_security_definer_function_executable),
-- part 2 of 2.
--
-- Seven SECURITY DEFINER helpers were executable by `anon` because twelve
-- SELECT policies that call them were written `TO public` on tables where
-- `anon` holds SELECT. A policy expression is permission-checked as the
-- querying role, so revoking EXECUTE alone would turn every signed-out read of
-- those tables from "zero rows" into "permission denied for function".
--
-- So the policies move first. `TO authenticated` means a signed-out query has
-- no applicable policy on these tables, gets zero rows by default-deny, and
-- never initialises the helper. Every helper already answered empty / false /
-- null with `auth.uid()` null (measured as `anon` on 2026-10-01), so what a
-- signed-out visitor can read does not change — with one exception that is
-- kept on purpose:
--
--   `programs` is readable signed out for `org_type = 'college'` (1,948 rows;
--   the claim flow's directory). That arm of the old policy is restated as its
--   own `TO anon` policy with no function call in it.
--
-- `ALTER POLICY ... TO` keeps USING / WITH CHECK as they are; only the role
-- list changes. Signed-in behaviour is untouched. No other non-bypass role
-- holds SELECT on any of the twelve tables (checked 2026-10-01), so `public`
-- meant `anon` + `authenticated` and nothing else.
--
-- Statement order is safe at every prefix: the anon `programs` policy exists
-- before the old one stops applying to anon, and every policy has moved before
-- any EXECUTE is revoked. `lock_timeout` makes a busy table fail the migration
-- fast instead of queueing an ACCESS EXCLUSIVE lock behind a long read.
--
-- After this, `anon` can execute two SECURITY DEFINER functions, both public
-- by design: `search_programs` and `program_public_status`.
--
-- Rollback (reverse order):
--   grant execute on function public.user_program_role(uuid) to anon;
--   grant execute on function public.user_program_ids()      to anon;
--   grant execute on function public.is_program_staff(uuid)  to anon;
--   grant execute on function public.is_admin()              to anon;
--   grant execute on function public.my_player_ids()         to anon;
--   grant execute on function public.visible_match_ids()     to anon;
--   grant execute on function public.visible_point_ids()     to anon;
--   alter policy "Programs readable: college public, custom orgs member-only" on public.programs to public;
--   alter policy "Users can read matches they created or played in" on public.matches to public;
--   alter policy "Users can view stats for their own matches" on public.match_stats to public;
--   alter policy "Users can view points for their own matches" on public.points to public;
--   alter policy "Users can view shots for their own matches" on public.shots to public;
--   alter policy "Members are visible to program staff" on public.program_members to public;
--   alter policy "Roster is visible to program members" on public.program_players to public;
--   alter policy "Events are visible to program members" on public.program_events to public;
--   alter policy "Entries are visible to program members" on public.program_event_entries to public;
--   alter policy "Program staff can read invites" on public.program_invites to public;
--   alter policy "Claimants and admins can read claims" on public.program_claims to public;
--   alter policy "Staff read their program's log" on public.program_audit_log to public;
--   drop policy "College programs are readable signed out" on public.programs;

set local lock_timeout = '3s';

-- 1. Keep the signed-out college directory, without a function in the policy.
create policy "College programs are readable signed out"
  on public.programs
  for select
  to anon
  using (org_type = 'college');

-- 2. Move the twelve helper-calling SELECT policies off `public`.
alter policy "Programs readable: college public, custom orgs member-only"
  on public.programs to authenticated;
alter policy "Users can read matches they created or played in"
  on public.matches to authenticated;
alter policy "Users can view stats for their own matches"
  on public.match_stats to authenticated;
alter policy "Users can view points for their own matches"
  on public.points to authenticated;
alter policy "Users can view shots for their own matches"
  on public.shots to authenticated;
alter policy "Members are visible to program staff"
  on public.program_members to authenticated;
alter policy "Roster is visible to program members"
  on public.program_players to authenticated;
alter policy "Events are visible to program members"
  on public.program_events to authenticated;
alter policy "Entries are visible to program members"
  on public.program_event_entries to authenticated;
alter policy "Program staff can read invites"
  on public.program_invites to authenticated;
alter policy "Claimants and admins can read claims"
  on public.program_claims to authenticated;
alter policy "Staff read their program's log"
  on public.program_audit_log to authenticated;

-- 3. Nothing signed out reaches these any more.
revoke execute on function public.user_program_role(uuid) from anon;
revoke execute on function public.user_program_ids()      from anon;
revoke execute on function public.is_program_staff(uuid)  from anon;
revoke execute on function public.is_admin()              from anon;
revoke execute on function public.my_player_ids()         from anon;
revoke execute on function public.visible_match_ids()     from anon;
revoke execute on function public.visible_point_ids()     from anon;
