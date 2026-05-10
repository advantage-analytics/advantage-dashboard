-- Bump the Key Moments 2.0 shared script from top-4 to top-6 so the
-- match-detail card has more highlights to draw narrative descriptions
-- from. The aggregations CTE (per-game break-point pressure + last point
-- in game) is unchanged; only the final ranked selection grows.

CREATE OR REPLACE FUNCTION public.key_moments(target_match_id uuid)
RETURNS TABLE(
  out_set_number integer,
  out_game_number integer,
  out_point_number integer,
  out_set_score text,
  out_game_score text,
  out_point_score text,
  out_server_is_player1 boolean,
  out_is_player1 boolean,
  out_won_by_player1 boolean,
  out_is_break_point boolean,
  out_is_set_point boolean,
  out_is_match_point boolean,
  out_winning_streak integer,
  out_rally_length integer,
  out_result_type text,
  out_shot_type text,
  out_spin_type text,
  out_speed_mph double precision,
  out_zone text,
  out_break_point_opportunities integer,
  out_video_time real,
  out_moment_score integer
)
LANGUAGE plpgsql
AS $function$
begin
  return query
  with aggregates as (
    select
      set_number,
      game_number,
      max(point_number) point_number,
      sum(case when is_break_point then 1 else 0 end) break_point_opportunities
    from points
    where match_id = target_match_id
    group by
      set_number,
      game_number
  ),
  game_results as (
    select
      p.*,
      a.break_point_opportunities
    from points p
    join aggregates a
      on p.set_number = a.set_number
      and p.game_number = a.game_number
      and p.point_number = a.point_number
    where p.match_id = target_match_id
  ),
  islands as (
    select
      *,
      row_number() over (order by set_number, game_number)
      - sum(case when won_by_player1 then 1 else 0 end)
          over (order by set_number, game_number) as island_id
    from game_results
  ),
  win_streaks as (
    select
    *,
    row_number() over (partition by island_id, won_by_player1 order by set_number, game_number) as streak_within_island
    from islands
  ), last_shots as (
    select distinct on (point_id)
      id,
      point_id
    from shots
    where point_id in (
      select point_id
      from points
      where match_id = target_match_id
    )
    order by point_id, shot_number desc, shot_type desc
  ), moments as (
    select
      set_number,
      game_number,
      point_number,
      set_score,
      game_score,
      point_score,
      server_is_player1,
      is_player1,
      won_by_player1,
      is_break_point,
      is_set_point,
      is_match_point,
      case
        when won_by_player1 then streak_within_island
        else 0
      end winning_streak,
      rally_length,
      result_type,
      shot_type,
      spin_type,
      speed_mph,
      zone,
      break_point_opportunities,
      w.video_time
    from win_streaks w
    join last_shots ls
      on w.id = ls.point_id
    join shots s
      on ls.id = s.id
  ), key_moments as (
    select
      *,
      -- context weight: what was at stake
      case when is_match_point then 40 else 0 end
      + case when is_set_point then 20 else 0 end
      + case when is_break_point then 10 else 0 end

      -- break point pressure: reward holding under pressure or converting
      + case
        when break_point_opportunities >= 3 then 25
        when break_point_opportunities = 2 then 15
        when break_point_opportunities = 1 then 8
        else 0
      end

      -- rally length: long points are exciting
      + rally_length * 5

      -- result quality
      + case
        when result_type like '%Winner' then 15
        when result_type like '%Ace' then 10
        when result_type like '%Error' then 5
        else 0
      end

      -- player1 won the moment (bias toward highlighting them)
      + case when won_by_player1 then 10 else 0 end

      -- momentum: part of a winning streak
      + case
        when winning_streak >= 3 then 15
        when winning_streak = 2 then 8
        else 0
      end

      as moment_score
    from moments
  ) select
    set_number,
    game_number,
    point_number,
    set_score,
    game_score,
    point_score,
    server_is_player1,
    is_player1,
    won_by_player1,
    is_break_point,
    is_set_point,
    is_match_point,
    winning_streak::int,
    rally_length,
    result_type,
    shot_type,
    spin_type,
    speed_mph,
    zone,
    break_point_opportunities::int,
    video_time,
    moment_score
  from key_moments
  order by moment_score desc
  limit 6;
end;
$function$;
