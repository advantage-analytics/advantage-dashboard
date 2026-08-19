-- Take EXECUTE on the round-4 functions away from `anon`.
-- Applied live 2026-08-18 as version 20260818042938.
--
-- The three migrations before this each ended with
--   revoke all on function … from public;
--   grant execute on function … to authenticated;
-- and that is not enough. Supabase ships `alter default privileges in schema
-- public grant execute on functions to anon, authenticated, service_role`, so
-- every function is created with an EXPLICIT `anon=X` grant already on it.
-- Revoking from PUBLIC does not touch an explicit grant to a named role, so
-- `anon` kept EXECUTE and the database linter was right to say so
-- (`anon_security_definer_function_executable`).
--
-- Nothing leaked. Every one of these either raises on a null `auth.uid()` or
-- filters through `is_program_staff` / `user_program_ids`, both of which are
-- empty for an anonymous caller — an anonymous `program_roster` call returns
-- zero rows rather than a roster. This closes the door rather than the window:
-- an unauthenticated request should not reach a SECURITY DEFINER body at all.
--
-- Scoped to the functions round 4 added. The older ones (`search_programs`,
-- `user_program_ids`, `visible_match_ids`, …) carry the same grant and are
-- deliberately left alone — `search_programs` in particular is called from the
-- unauthenticated claim flow, so revoking it here would break that.

revoke execute on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean, boolean
) from anon;

revoke execute on function public.program_roster(uuid) from anon;

revoke execute on function public.program_usage_by_member(uuid, date) from anon;

revoke execute on function public.program_usage_total(uuid, date) from anon;

revoke execute on function public.create_program_invite(
  uuid, text, text, text, timestamptz
) from anon;

revoke execute on function public.revoke_program_invite(uuid) from anon;

revoke execute on function public.remove_program_member(uuid, uuid) from anon;

revoke execute on function public.set_member_upload_enabled(uuid, uuid, boolean)
  from anon;
