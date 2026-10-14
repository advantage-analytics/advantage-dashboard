-- ask.points.court: the service court a point was played from, Deuce or Ad.
--
-- So Ask can split serves and returns by side ("his serve +1 on the ad
-- side", "return +1 patterns by side") the way the Video filter's Serve ›
-- Side and Return › Side do. The rule is that filter's, restated
-- (match-filters/score.ts, courtSideOf / courtSidesOf):
--
--   - when the match has any real point score (one not "0-0"), the parity of
--     the score's rungs: 0-0, 15-15, 30-0, 40-40 are Deuce; 15-0, 30-15,
--     AD-40 are Ad (0, 15, 30, 40, AD count 0, 1, 2, 3, 4);
--   - a score that does not read that way (a tiebreak count) or a match with
--     no point scores at all falls back to the point's place in its game:
--     the first point is Deuce, then they alternate.
--
-- Appended as the view's last column (create or replace keeps every other
-- column, its grants and its comments). Nothing else changes.
--
-- Applied to the live database on 2026-10-14 as version 20261014214810
-- (`ask_points_court`). VERIFIED: the rule matched the Video filter point
-- for point on all 10 program matches (once score.ts read a missing score
-- by its place in the game, as here), and the column reads through
-- ask_run_team_query (654 Deuce, 529 Ad).

create or replace view ask.points as
 WITH mine AS (
         SELECT m.id AS match_id,
            ask.my_side(m.*) = 'player1'::text AS me_is_player1
           FROM matches m
          WHERE (m.id IN ( SELECT ask.my_match_ids() AS my_match_ids)) AND ask.my_side(m.*) IS NOT NULL
        ), scored AS (
         SELECT p.*,
            bool_or(coalesce(p.point_score, '0-0') <> '0-0') OVER (PARTITION BY p.match_id) AS has_point_score,
            row_number() OVER (PARTITION BY p.match_id, p.set_number, p.game_number ORDER BY p.point_number) - 1 AS index_in_game,
            CASE upper(btrim(split_part(coalesce(p.point_score, ''), '-', 1)))
              WHEN '0' THEN 0 WHEN '15' THEN 1 WHEN '30' THEN 2 WHEN '40' THEN 3 WHEN 'AD' THEN 4
            END AS rung_a,
            CASE upper(btrim(split_part(coalesce(p.point_score, ''), '-', 2)))
              WHEN '0' THEN 0 WHEN '15' THEN 1 WHEN '30' THEN 2 WHEN '40' THEN 3 WHEN 'AD' THEN 4
            END AS rung_b
           FROM points p
          WHERE p.match_id IN ( SELECT mine_1.match_id FROM mine mine_1)
        )
 SELECT p.match_id,
    p.set_number,
    p.game_number - min(p.game_number) OVER (PARTITION BY p.match_id, p.set_number) + 1 AS game_number,
    p.point_number,
    p.server_is_player1 = mine.me_is_player1 AS i_served,
    p.won_by_player1 = mine.me_is_player1 AS i_won,
    p.is_break_point,
    p.is_set_point,
    p.is_match_point,
    p.is_pressure_point,
    p.rally_length,
    p.result_type,
    CASE
      WHEN p.has_point_score AND p.rung_a IS NOT NULL AND p.rung_b IS NOT NULL
        THEN CASE WHEN (p.rung_a + p.rung_b) % 2 = 0 THEN 'Deuce' ELSE 'Ad' END
      ELSE CASE WHEN p.index_in_game % 2 = 0 THEN 'Deuce' ELSE 'Ad' END
    END AS court
   FROM scored p
     JOIN mine ON mine.match_id = p.match_id;

comment on column ask.points.court is 'The service court the point was played from: Deuce or Ad. From the point score (0-0, 15-15, 30-0 are Deuce; 15-0, 30-15 are Ad), or the point''s place in its game when there is no score — the Video filter''s Side.';
