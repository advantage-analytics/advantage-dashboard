-- Finish what 20260818042938 started: no SECURITY DEFINER function is callable
-- by `anon` unless being callable signed-out is the point of it.
-- Applied live 2026-08-21 as version 20260821144754.
--
-- >>> PARTIALLY REVERSED BY 20260821144843. Read that file too. Six of the
-- >>> seven revokes below were wrong and were put back within the minute; the
-- >>> `complete_program_claim` revoke is the one that stands.
--
-- 20260818042938 explained the trap correctly in its own header — Supabase
-- grants EXECUTE on every new function to `anon, authenticated, service_role`,
-- so `revoke ... from public` does NOT remove it — then listed eight action
-- RPCs and stopped. Seven were left behind, including
-- `complete_program_claim`, whose own migration tried to lock it down with
-- exactly the `revoke ... from public` that does not work. The one function
-- that best demonstrated the bug was the one the fix missed.
--
-- WHAT STAYS ANON-CALLABLE, deliberately:
--
--   search_programs()        the program search on /claim
--   program_public_status()  the public status screen
--
-- Both are read by `lib/data/programs-server.ts` before anybody has signed in.
-- That is the claim flow's entire premise, and revoking either would break it.

revoke execute on function public.complete_program_claim(
  text, text, text, text, boolean, boolean, text
) from anon;

-- The six below are RLS helpers, and revoking them was a mistake. See
-- 20260821144843, which grants them back and explains why.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_program_staff(uuid) from anon;
revoke execute on function public.user_program_role(uuid) from anon;
revoke execute on function public.user_program_ids() from anon;
revoke execute on function public.visible_match_ids() from anon;
revoke execute on function public.visible_point_ids() from anon;
