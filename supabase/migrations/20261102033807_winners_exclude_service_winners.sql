-- A service winner is not a winner.
--
-- Product decision 2026-10-30. calculate_match_stats counted every
-- result_type LIKE '%Winner%' in winners, so a 'Service Winner' landed in both
-- winners and service_winners. Across the 176 match_stats rows on that date,
-- 909 of 3282 winners were service winners. Aces were never included.
--
-- 1. calculate_match_stats leaves 'Service Winner' out of winners and
--    volley_winners. service_winners is unchanged. The function is edited in
--    place from its live definition: supabase/migrations is behind the live
--    database, so no file here holds the current text, and copying it would
--    risk reverting a change made since. Every other statistic stays as it is.
--
-- 2. Existing rows are recomputed from points, for these two columns only.
--    Running calculate_match_stats per match would also rewrite columns that
--    other functions adjust afterwards. Recounting makes this safe to repeat.
--
-- 3. The Ask view's column comment says so: the model reads it.
--
-- DEPLOY ORDER: apply after the matching code reaches production. Until then
-- the deployed head-to-head on a video match subtracts unreturned serves from
-- winners, which this already removes, and would undercount.

do $migration$
declare
  v_def text := pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure);
  v_new text;
begin
  if position('<> ''Service Winner''' in v_def) > 0 then
    raise notice 'calculate_match_stats already leaves out service winners';
    return;
  end if;

  -- The aliased form first, so the second replace cannot match inside it.
  v_new := replace(
    v_def,
    'p.result_type LIKE ''%Winner%''',
    'p.result_type LIKE ''%Winner%'' AND p.result_type <> ''Service Winner'''
  );
  v_new := replace(
    v_new,
    ' result_type LIKE ''%Winner%''',
    ' result_type LIKE ''%Winner%'' AND result_type <> ''Service Winner'''
  );

  -- Two sides, each with winners and volley_winners.
  if (length(v_new) - length(v_def)) <> 2 * (
    length(' AND p.result_type <> ''Service Winner''')
    + length(' AND result_type <> ''Service Winner''')
  ) then
    raise exception 'calculate_match_stats did not have the expected winner clauses';
  end if;

  execute v_new;
end;
$migration$;

with counted as (
  select
    ms.match_id,
    ms.is_player1,
    (
      select count(*)
      from public.points p
      where p.match_id = ms.match_id
        and p.won_by_player1 = ms.is_player1
        and p.result_type like '%Winner%'
        and p.result_type <> 'Service Winner'
    ) as winners,
    (
      select count(*)
      from public.points p
      where p.match_id = ms.match_id
        and p.won_by_player1 = ms.is_player1
        and p.result_type like '%Winner%'
        and p.result_type <> 'Service Winner'
        and exists (
          select 1
          from public.shots s
          where s.point_id = p.id
            and s.is_player1 = ms.is_player1
            and s.shot_type = 'Volley'
        )
    ) as volley_winners
  from public.match_stats ms
)
update public.match_stats ms
set
  winners = counted.winners,
  volley_winners = counted.volley_winners
from counted
where ms.match_id = counted.match_id
  and ms.is_player1 = counted.is_player1
  and (
    ms.winners is distinct from counted.winners
    or ms.volley_winners is distinct from counted.volley_winners
  );

comment on column ask.match_stats.winners is
  'Shots this side hit in the rally that won the point outright (winners). Serves are not included: aces and service_winners are counted on their own.';
