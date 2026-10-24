# Run log — claude/arnis-match-data-review-4459f6

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Start score: column + scoring from a start — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024075521_label_sessions_start_score` adds `label_sessions.start_score jsonb` (applied live). `LabelStartScore` + `LabelSession.startScore`; `session-fields.ts` parses `start_score` (four exact keys) or null. `labelScores`, `labelSetScores`, `gameOverflow`/`gameUnderflow` (and the shift/pull plans), `buildAppliedRows` and the completion warnings count from an optional start; null behaves as before. New start-score specs in five label spec files.
**follow-ups:**

1. Console consumers (label-console, black rail, point menu, game underflow, dashboard, flag-nav, scorecard, score-marks, tiebreak-fold, game-shift-session) still call the scorers without the start — thread `session.startScore` through all of them in T2.
2. Validate the start's point counts against the first game's type in the editor: a start that already settles the first game makes its first row a leftover.

## T2 · Start score: rail prompt, editor, saved line — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `label-start-score.tsx`: the amber "Does the video start mid-match?" prompt above point 1 (built on `gameSlot`), the inline editor (sets/games steppers, 0/15/30/40 or tiebreak count, server; refuses a start that already settles the first game) and the saved line "Video starts at … , X serving" with Edit. The rail gains a "⋯" session menu with "Video starts mid-match…". "It starts at 0–0" saves a real 0–0 start. `session.startScore` is threaded through every console-side scorer (console, rail, dashboard, underflow, point menu, row parts, flag-nav, score-marks, scorecard + script, tiebreak-fold, session-status, game-shift-session). New `tests/label-start-score.spec.ts` (15 specs).
**follow-ups:**

1. The rail's "⋯" session-menu button has an aria-label but no dark tooltip, which the design system's banned list requires for icon-only buttons.
2. The prompt only shows when marks are built (it reuses the score chip's mismatch gate).
3. No way to clear a saved start back to null; saving 0–0 has the same effect.
4. A start with sets already played is not matched against the vendor's set numbering.

## T3 · Locked game boundary: lock column + lock-aware readings — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024085016_label_points_game_start_locked` adds `label_points.game_start_locked boolean not null default false` (applied live; the undo journal already captures whole rows, so Undo rewinds the lock with no journal change). `LabelPoint.gameStartLocked` via `rows.ts`. `planGameBoundary` returns `lockPointId` / `unlockPointIds`, and `writeLabelPointsMove` writes the lock in the same op as the moves. New `lockedGames` and `lockedGameImbalance` in `game-boundary.ts`; `gameOverflow` / `gameUnderflow` skip locked games, `planGameShift` refuses a locked destination and `planGamePullFrom` answers `add_point` for a locked donor. Split keeps the lock on the earlier half, combine keeps it from either part, a move out clears it. Specs in label-game-shift, label-serve-order, label-operations, label-point-split, label-point-combine.
**follow-ups:**

1. The one-at-a-time `movePoint` fallback writes no lock (the page always supplies `movePoints`).
2. Inserting a point before a locked first point leaves the lock on the second row — decide whether insert-before should carry it.
3. No way to clear a lock except Undo; T4 may want an explicit unlock.
4. `lockedGameImbalance` follows the literal `band.winner` rule; in an overflowing game it flags the decider's points — confirm on real data.

## T4 · Locked game boundary: band lock + amber "doesn't add up" slot — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `label-game-band.tsx` reads `locked` from the game's first live row and draws a Lucide Lock + "set by you" (`data-game-locked`). New `label-game-locked.tsx`: `lockedSlotsAtPoints`, a wrapping per-game `checkStepper`, and `BlackGameLocked` — the amber `gameSlot` row `game-imbalance` "Game N doesn’t add up: an ending is probably wrong" with "Check N points" (steps through `lockedGameImbalance`'s ids via the console's `findGap(id, { arm: true })`) and "Add point" (the underflow slot's insert). Rendered by `label-black-rail.tsx` under the locked band; `label-black-parts.tsx` gains the row value. Specs in label-game-band (+2) and label-game-shift (+5).
**follow-ups:**

1. The locked-game slot is not in `slotStops`, so `]` / `[` and the header's flag count skip it.
2. Two specs check console/rail wiring by reading source text — brittle against refactors.
3. Not yet checked in a browser.
