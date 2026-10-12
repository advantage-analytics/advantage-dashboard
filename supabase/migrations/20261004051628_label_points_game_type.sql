-- What kind of game a labelled point belongs to, so the console's scoreboard
-- (lib/services/labels/score.ts) can count a tiebreak in raw points and a
-- match tiebreak to ten instead of 15/30/40 — the vendor's data never says.
--
-- A game-level annotation stored per point, like `server`: every point of one
-- game carries the same value, the console sets it game by game, and it is
-- deliberately NOT part of the frozen `seed` (20260928190425_label_rows_seed.sql)
-- — not seeded, not compared for `unchanged`, never touched by Reset.
-- Every existing row is an ordinary game, which the default says.
alter table public.label_points
  add column game_type text not null default 'game'
    check (game_type in ('game', 'tiebreak', 'match_tiebreak'));
