-- ask.points: the running score only where it is server-first.
--
-- 20261104192304 turned point_score, game_score and set_score viewer-first on
-- the assumption that public.points stores every one server-first. Video
-- points do (derivation/scores.ts; label publish writes the same shape): the
-- server-first reading fits 99% of the point-to-point changes and every set
-- change on the live data, 2026-11-04. SwingVision imports do not: of 44
-- imported matches, 21 read server-first, 14 player1-first and 9 neither, and
-- set_score read player1-first at all 41 set changes. Swapping those by the
-- server put a player who trailed 15-30 ahead 30-15. Until the importer writes
-- one shape, the three columns are null on any point that is not derived
-- (public.points.derived is false on exactly the SwingVision rows).
--
-- game_score and set_score now also follow point_score's has_point_score test:
-- the 8 live matches whose point scores never leave 0-0 carry one placeholder
-- game score for every point, which read as a whole match at 0-0.
--
-- Same columns in the same order: `create or replace` keeps the grants.

create or replace view ask.points as
with mine as (
  select match_id, me_is_player1
    from ask.my_matches()
   where me_is_player1 is not null
),
scored as (
  select p.*,
         bool_or(coalesce(p.point_score, '0-0') <> '0-0') over (partition by p.match_id) as has_point_score,
         row_number() over (partition by p.match_id, p.set_number, p.game_number order by p.point_number) - 1 as index_in_game,
         case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 1)))
           when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
         end as rung_a,
         case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 2)))
           when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
         end as rung_b
    from public.points p
   where p.match_id in (select mine_1.match_id from mine mine_1)
)
select p.match_id,
       p.set_number,
       p.game_number - min(p.game_number) over (partition by p.match_id, p.set_number) + 1 as game_number,
       p.point_number,
       p.server_is_player1 = mine.me_is_player1 as i_served,
       p.won_by_player1 = mine.me_is_player1 as i_won,
       p.is_break_point,
       p.is_set_point,
       p.is_match_point,
       p.is_pressure_point,
       p.rally_length,
       p.result_type,
       case
         when p.has_point_score and p.rung_a is not null and p.rung_b is not null
           then case when (p.rung_a + p.rung_b) % 2 = 0 then 'Deuce' else 'Ad' end
         else case when p.index_in_game % 2 = 0 then 'Deuce' else 'Ad' end
       end as court,
       -- Server-first on derived (video) points; swapped when the viewer returned.
       case
         when p.derived is not true or not p.has_point_score or p.point_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.point_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.point_score, '-', 2) || '-' || split_part(p.point_score, '-', 1)
       end as point_score,
       case
         when p.derived is not true or not p.has_point_score or p.game_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.game_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.game_score, '-', 2) || '-' || split_part(p.game_score, '-', 1)
       end as game_score,
       case
         when p.derived is not true or not p.has_point_score or p.set_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.set_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.set_score, '-', 2) || '-' || split_part(p.set_score, '-', 1)
       end as set_score
  from scored p
  join mine on mine.match_id = p.match_id;

comment on column ask.points.point_score is
  'The point score before this point was played, the viewer first: 30-40 is the viewer on 30 and the opponent on 40; AD is advantage, 0-0 opens every game, and a tiebreak counts in plain numbers (3-2). Video matches only: null on every SwingVision point, and null when the source never read point scores or the server is unknown. Unless ask.matches.is_verified is true it is the video analysis''s running reading, which can stall or drift; ask.matches.score_text is the entered result.';
comment on column ask.points.game_score is
  'Games in the current set before this point, the viewer first, e.g. 4-5. Null where point_score is null for the same reasons, and when not recorded; unless ask.matches.is_verified is true it is the video analysis''s running count, which can drift from ask.matches.score_text.';
comment on column ask.points.set_score is
  'Sets each side had won before this point, the viewer first, e.g. 1-0. Null where point_score is null for the same reasons, and when not recorded.';
