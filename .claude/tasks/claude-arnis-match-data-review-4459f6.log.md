# Run log — claude/arnis-match-data-review-4459f6

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Start score: column + scoring from a start — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024075521_label_sessions_start_score` adds `label_sessions.start_score jsonb` (applied live). `LabelStartScore` + `LabelSession.startScore`; `session-fields.ts` parses `start_score` (four exact keys) or null. `labelScores`, `labelSetScores`, `gameOverflow`/`gameUnderflow` (and the shift/pull plans), `buildAppliedRows` and the completion warnings count from an optional start; null behaves as before. New start-score specs in five label spec files.
**follow-ups:**

1. Console consumers (label-console, black rail, point menu, game underflow, dashboard, flag-nav, scorecard, score-marks, tiebreak-fold, game-shift-session) still call the scorers without the start — thread `session.startScore` through all of them in T2.
2. Validate the start's point counts against the first game's type in the editor: a start that already settles the first game makes its first row a leftover.
