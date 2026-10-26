-- A game boundary the labeller dragged into place (Design B, 2026-10-24,
-- board "Boundary"): in 124 unbalanced games a winner was wrong in 103, so a
-- dragged boundary is the labeller's word, and the rail stops offering to move
-- points across it (game-shift.ts `gameOverflow` / `gameUnderflow` skip a
-- locked game) and flags the points whose winner is in doubt instead
-- (`lockedGameImbalance`).
--
-- The lock sits on the game's first live point: `lockedGames` lists the games
-- whose first live row carries it. It lives on label_points rather than a
-- session jsonb so the row-history journal (`label_row_history_capture`,
-- which stores `to_jsonb(old)`, and `undo_label_op`, which restores every
-- non-id column) rewinds it together with the boundary move that set it.
--
-- A point split keeps it on the earlier half, a combine keeps it when either
-- part held it, and a point moved out of its game leaves it behind.
--
-- Additive only; label_points keeps its service-role-writes-only policy, so
-- no grant changes.
alter table public.label_points
  add column game_start_locked boolean not null default false;

comment on column public.label_points.game_start_locked is
  'True on the first live point of a game whose start the labeller fixed by dragging its header; the rail then moves no point across that boundary.';
