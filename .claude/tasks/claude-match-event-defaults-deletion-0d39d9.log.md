# Run log — claude/match-event-defaults-deletion-0d39d9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T4 · Wizard saves no event instead of "P1 vs P2" — done

**gate:** mechanical GATE FAIL on one unrelated live spec (`claim-eyebrow-width.spec.ts`, programs page query error) that passed 3/3 re-run in isolation — known full-suite flake; the other 4252 passed. completion `VERDICT: pass`.
**changed:** `useUploadMatchWizard.ts` drops the `${playerName} vs ${opponentName}` fallback, so an empty Event field saves `tournament_name: null`; preset/attached lines still carry their event name. New `tests/wizard-event-default.spec.ts` covers empty and named cases through `buildMatchData`.
**follow-ups:**

1. Live repair after T5: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name` (known row `973c2645…`).
2. T1 dispatch was refused by the auto-mode classifier (applies a migration to prod); T1 reset to `todo` and T4 run out of order. T1/T2 need the author to allow the live `apply_migration`.

## T5 · Render a match with no event as "No event" — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`. widget-states: loading/empty/error paths untouched in every changed widget.
**changed:** Loaders (`matches-list-types.ts`, `match-detail-server.ts`, `home-recent-data.ts`) pass a null `tournament_name` through; `tournamentName` is `string | null` on `Match`, `DisplayMatch`, `EventGroup`. Matches list cell, match drawer and Home event heading show muted "No event" (`var(--ink-400)`); match-detail breadcrumb omits the event crumb; hero already skipped it. Search/sort in `matches-page-content.tsx` null-safe (no-event sorts last ascending). Delete-dialog labels fall back to "P1 vs P2". New offline spec `tests/match-no-event.spec.ts`.
**follow-ups:**

1. `search-command-palette.tsx:563,579` still fall back to "Unknown event".
2. Drawer Court and Home/Away fields still read "Not specified".
3. `featured-match-card.tsx` and `match-event-header.tsx` look dead (no importers) — candidates for deletion.
4. Live repair from T4 is now due: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name`.
