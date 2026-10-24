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
