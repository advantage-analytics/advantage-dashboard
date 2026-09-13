-- The caller's identity set: their login, plus every profile they have claimed.
--
-- Before coach-managed profiles, "is this match mine" was `auth.uid() in
-- (created_by, player1_id, player2_id)` and that was complete, because a
-- player id was always a user id. Now a player id may be a `program_players.id`
-- that the caller claimed months after the matches were recorded.
--
-- This is the ONE place that fact is expressed. It is referenced by exactly two
-- policies (`visible_match_ids()` and the inline `matches` predicate) and one
-- TypeScript module. A rule restated in a second place is a second answer able
-- to drift from the enforced one.
--
-- Set-returning, not a boolean taking a row: the same reason 20260817074029
-- gives for `visible_match_ids()`. Uncorrelated with the outer query, so the
-- planner hoists it to an InitPlan evaluated once per statement and both
-- reference sites share it — the property 20260818043926 and 20260821070000
-- were written to obtain.

create or replace function public.my_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- The login itself. Guarded so a signed-out caller yields an empty set
  -- rather than a row containing NULL.
  select (select auth.uid())
   where (select auth.uid()) is not null
  union
  select pp.id
    from public.program_players pp
   where pp.claimed_by_user_id = (select auth.uid())
     and pp.merged_into_id is null;
$$;

revoke all on function public.my_player_ids() from public;
grant execute on function public.my_player_ids() to authenticated;

-- anon TOO, and this is not an oversight. 20260821144843 is the receipt: a
-- function referenced by an RLS policy but revoked from anon turns a signed-out
-- read from "0 rows" into "permission denied for function", which is a 500 on
-- a page that should have rendered an empty state. This one leaks nothing —
-- with no auth.uid() it returns the empty set.
grant execute on function public.my_player_ids() to anon;

comment on function public.my_player_ids() is
  'Every id that identifies the caller as a player: their user id, plus every live program_players profile they have claimed.';
