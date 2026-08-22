-- Take `anon` off the four new functions that have no business being reachable
-- signed out. Round 6, same exercise as 20260821144754.
--
-- `revoke all ... from public` in the migrations that created these does NOT do
-- this: Supabase carries a default privilege granting EXECUTE on new functions
-- in `public` to `anon`, and a role-specific grant is not what PUBLIC's revoke
-- removes. The existing membership writes are all `anon_exec = false`; these
-- four were the odd ones out, found by the database linter after applying.
--
-- The three writes already refuse with 'not authenticated' before touching a
-- row, so nothing could have been written. This is the grant matching the
-- guard rather than relying on it.
revoke execute on function public.add_program_player(uuid, text, text, text, integer, text) from anon;
revoke execute on function public.update_program_player(uuid, text, text, text, integer, text) from anon;
revoke execute on function public.archive_program_player(uuid) from anon;

-- Reads, but server-side ones. Both gate on `user_program_ids()`, so a
-- signed-out caller already got an empty set; neither is referenced by an RLS
-- policy, which is the one thing that would make revoking them a mistake.
revoke execute on function public.program_roster_full(uuid) from anon;
revoke execute on function public.program_seat_usage(uuid) from anon;

-- `my_player_ids()` deliberately KEEPS its anon grant and must not be added to
-- the list above. It is referenced by the `matches` SELECT policy and by
-- `visible_match_ids()`, and 20260821144843 is the receipt for what happens
-- when a policy-referenced function is revoked from anon: a signed-out read
-- stops returning zero rows and starts returning "permission denied for
-- function", which is a 500 on a page that should have rendered empty.
