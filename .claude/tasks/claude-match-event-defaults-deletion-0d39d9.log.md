# Run log — claude/match-event-defaults-deletion-0d39d9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T4 · Wizard saves no event instead of "P1 vs P2" — done

**gate:** mechanical GATE FAIL on one unrelated live spec (`claim-eyebrow-width.spec.ts`, programs page query error) that passed 3/3 re-run in isolation — known full-suite flake; the other 4252 passed. completion `VERDICT: pass`.
**changed:** `useUploadMatchWizard.ts` drops the `${playerName} vs ${opponentName}` fallback, so an empty Event field saves `tournament_name: null`; preset/attached lines still carry their event name. New `tests/wizard-event-default.spec.ts` covers empty and named cases through `buildMatchData`.
**follow-ups:**

1. Live repair after T5: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name` (known row `973c2645…`).
2. T1 dispatch was refused by the auto-mode classifier (applies a migration to prod); T1 reset to `todo` and T4 run out of order. T1/T2 need the author to allow the live `apply_migration`.
