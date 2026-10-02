-- `program_former_players`, take two: fold both id eras and count in one pass.
--
-- Forward-only fix to the function 20260913031528_restore_program_player.sql
-- introduced; that file is applied and stays as it is. Two things were wrong:
--
-- 1. `match_count` was a correlated scalar subquery, so `matches` was scanned
--    once per archived row. This is one LEFT JOIN with a GROUP BY instead, and
--    `count(m.id)` reads 0 — not null — for a profile with no matches.
-- 2. It matched `pp.id` only. A claimed player has TWO ids in their history:
--    matches recorded since coach-managed profiles exist carry the profile id,
--    and matches recorded before that carry their raw auth uid — claiming
--    deliberately does not re-attribute them (docs/ui-revamp-guardrails.md §2).
--    `program_roster_full` arm 1 binds `user_id = pp.claimed_by_user_id` to
--    `player_id = pp.id`, and `canonicalRosterIds` in
--    src/lib/data/roster-ids.ts folds the two onto one key for every reader.
--    The join predicate here is the SQL half of that same rule, so the Add
--    player dialog's "removed with N matches" note — which drives a real
--    restore-vs-add-as-new decision — counts a claimed-then-archived player's
--    pre-claim matches too. `x in (pp.id, pp.claimed_by_user_id)` is null-safe:
--    an unclaimed profile's null second value can never equal anything, so it
--    counts `pp.id` matches only.
--
-- Everything else — the member gate, the program-scoped join, the ordering,
-- the grants — reads exactly as before.

create or replace function public.program_former_players(p_program_id uuid)
returns table (
  profile_id   uuid,
  display_name text,
  email        text,
  archived_at  timestamptz,
  match_count  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.id,
    btrim(pp.first_name || ' ' || pp.last_name),
    pp.email,
    pp.archived_at,
    count(m.id)
  from public.program_players pp
  left join public.matches m
    on m.program_id = pp.program_id
   and (
         m.player1_id in (pp.id, pp.claimed_by_user_id)
      or m.player2_id in (pp.id, pp.claimed_by_user_id)
       )
  where pp.program_id = p_program_id
    and pp.archived_at is not null
    and pp.merged_into_id is null
    and p_program_id in (select public.user_program_ids())
  group by pp.id, pp.first_name, pp.last_name, pp.email, pp.archived_at
  order by pp.archived_at desc;
$$;

revoke all on function public.program_former_players(uuid) from public;
revoke execute on function public.program_former_players(uuid) from anon;
grant execute on function public.program_former_players(uuid) to authenticated;

comment on function public.program_former_players(uuid) is
  'Archived, unmerged player profiles in a program with how many of its matches each still carries, under either the profile id or — for a claimed profile — the pre-claim auth uid. Empty for a caller who is not a member.';
