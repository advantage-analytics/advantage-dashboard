-- Put back six of the seven revokes from 20260821144754. Keep the one that
-- matters. Applied live 2026-08-21 as version 20260821144843.
--
-- WHAT WENT WRONG. That migration revoked `anon` EXECUTE on the RLS helper
-- functions on the reasoning that a policy expression is evaluated with the
-- POLICY OWNER's privileges rather than the querying role's. A throwaway
-- table-and-helper probe appeared to confirm it. The probe was invalid: it ran
-- the granted case first and the revoked case second in one session, so the
-- second read almost certainly reused a cached plan whose permission check had
-- already passed. A probe that tests the safe case first can only tell you the
-- safe case is safe.
--
-- Tested against the REAL tables, the answer is the opposite:
--
--   anon reads matches         -> permission denied for function is_program_staff
--   anon reads points          -> permission denied for function visible_match_ids
--   anon reads shots           -> permission denied for function visible_point_ids
--   anon reads program_events  -> permission denied for function user_program_ids
--   anon reads program_claims  -> permission denied for function is_admin
--
-- A signed-out read of any of those tables previously returned an empty set,
-- which is the correct answer and one a client can render. It raised instead,
-- which is a 500. Turning "nothing to show you" into an error is a worse
-- outcome than the unused API surface the revoke was tidying away — and those
-- six leak nothing to anon in the first place: every one returns false, null,
-- or an empty set for a caller with no `auth.uid()`.
--
-- `complete_program_claim` stays revoked. It is referenced by no policy, is
-- called only from `claim-actions.ts` after a verified session, and is the
-- only one of the seven that WRITES anything — it hands over program
-- ownership. It is also the function 20260818042938 was written to catch and
-- missed.
--
-- Verified after applying, as `anon`: all five tables read as 0 rows rather
-- than raising, `search_programs` still works signed out, and
-- `complete_program_claim` is refused at the grant.
grant execute on function public.is_admin() to anon;
grant execute on function public.is_program_staff(uuid) to anon;
grant execute on function public.user_program_role(uuid) to anon;
grant execute on function public.user_program_ids() to anon;
grant execute on function public.visible_match_ids() to anon;
grant execute on function public.visible_point_ids() to anon;
