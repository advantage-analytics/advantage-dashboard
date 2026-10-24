-- Where the video starts in the match, for a session whose recording begins
-- after the first point (Design A, 2026-10-24). Null means the video starts
-- at the beginning of the match. The one jsonb carries the whole start:
--
--   { "sets": [p1, p2], "games": [p1, p2], "points": [p1, p2], "server": "p1" | "p2" }
--
-- `sets` are sets already won before the first set on the video, `games` the
-- games already won in that set, `points` the counts already played in the
-- first game on the video (0–3 for 0/15/30/40 in an ordinary game; any count
-- when that game is a tiebreak) and `server` who serves that game. The
-- scoreboard (score.ts), the set tallies (set-scores.ts), the shift and pull
-- slots (game-shift.ts) and the publish (apply.ts) count from it.
--
-- `video_starts_mid_match` and `first_server` stay as they are: nothing reads
-- them, and nothing starts to. Additive only; label_sessions keeps its
-- service-role-writes-only policy, so no grant changes.
alter table public.label_sessions
  add column start_score jsonb
    check (start_score is null or jsonb_typeof(start_score) = 'object');

comment on column public.label_sessions.start_score is
  'Where the video starts in the match: {sets:[p1,p2], games:[p1,p2], points:[p1,p2], server:"p1"|"p2"}. Null = the video starts at the beginning of the match.';
