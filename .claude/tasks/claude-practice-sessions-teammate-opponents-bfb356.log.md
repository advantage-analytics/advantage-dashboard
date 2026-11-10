# Run log — claude/practice-sessions-teammate-opponents-bfb356

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Share match-type options and an isPracticeMatch predicate — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion VERDICT: pass. `tests/court-options.spec.ts:94` fails when that file runs alone, also at a clean HEAD, and passes inside the full suite — environmental, not this diff.
**changed:** new `src/lib/matches/match-type.ts` (`MATCH_TYPE_OPTIONS` Tournament / Dual Match / Practice, `isPracticeMatch` trims and lowercases); `edit-match-dialog.tsx` imports the options instead of declaring its own array; new `tests/match-type.spec.ts`.
**follow-ups:**

1. The edit dialog could branch on `isPracticeMatch` once Practice behaviour lands.

## T2 · Show Match type first under Context on wizard step 4 — done

**gate:** mechanical GATE PASS; completion VERDICT: pass.
**changed:** new `MatchTypeField.tsx` (`MatchTypeCell` underline MenuSelect with T1's options and "Not set", `PracticeNotice`, helpers `matchTypeFieldValue` / `showsMatchTypeField` / `matchTypeForEventKind`); `DetailsStepContent.tsx` puts Match type first in the Context grid (hidden for Doubles), routes `EventCell`'s pick through `matchTypeForEventKind`, and renders the Practice notice under Context naming the subject only; `WizardNotice.tsx` gains a grey `tone="note"`; new `tests/upload-details-match-type.spec.ts`. The notice takes a `profiles` list so T4 can add the teammate.
**follow-ups:**

1. Picking Tournament in the menu does not set `eventKind` or Round; only an event pick does. Decide whether the two should stay independent.
2. A Practice value survives picking an "other" event; a tournament pick replaces it (unchanged behaviour).

## T3 · Truncate opponent-menu rows and widen the menu to 360 — done

**gate:** mechanical GATE PASS; completion VERDICT: pass.
**changed:** new `OpponentMenuRow.tsx` (`OpponentMenuRow`, `OpponentNewRow`, `OPPONENT_MENU_WIDTH_CLS = "w-[360px]"`; `Avatar` and `NewRing` moved over unchanged); `DetailsStepContent.tsx` renders every opponent-menu row through it — name `min-w-0 truncate` in a `min-w-0` flex parent, meta `shrink-0 whitespace-nowrap` — and the menu is 360px in every branch; new `tests/upload-opponent-menu-rows.spec.ts` with a 60-character name.
**follow-ups:**

1. `RosterMenu.tsx`'s `RosterRow` uses the opposite grammar (nowrap name, truncating meta); decide whether the two menus should agree.
2. The T2 and T3 specs each build their own popover/loader stubs; a shared fixture would trim that.

## T4 · Add the Teammates section to the opponent picker — blocked

**gate:** mechanical FAIL — lint pass, typecheck pass, tests (shard 1/2) 1 failed / 4718 passed: `tests/design-drift.spec.ts:13` "lower-case middot segment: 3 (seed 2)", new hit `DetailsStepContent.tsx:963 return "Teammate · from the roster";` (capitalise the segment after the middot, e.g. "Teammate · From the roster"). Shard 2/2 not run (stopped at first failure). Completion review not run. Two earlier full `npm test` runs were killed by SIGTERM mid-suite (exit 143, no failing test); the suite was re-run in shards to reach a verdict.
**stash:** 24f65723863cf61d82a4b3672d927ad81fcdc231
**changed (stashed):** new `teammates.ts` and `OpponentMenu.tsx`; `RosterMenu.tsx` exports `RosterRow` + `TeammatesMenuSection`; `types.ts` adds `"teammate"` to `ValueSource`; `DetailsStepContent.tsx` / `UploadWizardSteps.tsx` wire the Teammates section; new `tests/upload-opponent-teammates.spec.ts`; `tests/upload-player-details.spec.ts` follows the moved name button.
**follow-ups:**

1. `buildMatchData` already writes `opponentPlayerId` to `opponent_player_id`, so a teammate pick reaches the DB before T5; a roster "safety arm" row without a real `program_players` id could break the FK on save — T5 should guard it.
2. A restored draft keeps `opponentSource: "teammate"` without re-checking the roster.

## T4 · Add the Teammates section to the opponent picker — done

**gate:** re-run at the author's request after the blocked run. Stash 24f65723 applied; the provenance copy changed to "Teammate · From the roster" (source and spec), design drift back to seed. Mechanical: lint pass, typecheck pass, tests shard 1/2 4719 passed, shard 2/2 5118 passed (one shard-2 attempt killed by signal, exit 144, no failing test; re-run clean). Completion VERDICT: pass.
**changed:** new `teammates.ts` (roster minus subject, term filter, played-list dedupe, `teammatesFirst`, `teammatePick`) and `OpponentMenu.tsx` (`OpponentMenuBody`, `OpponentReadBack` with the grey Teammate `StatePill`); `RosterMenu.tsx` exports `RosterRow` and adds `TeammatesMenuSection`; `types.ts` adds `"teammate"`; `DetailsStepContent.tsx` / `UploadWizardSteps.tsx` wire it and pass the teammate to `PracticeNotice`; new `tests/upload-opponent-teammates.spec.ts`.
**follow-ups:**

1. T5: a teammate pick already writes `opponent_player_id`; guard roster rows without a real `program_players` id (FK).
2. A restored draft keeps `opponentSource: "teammate"` without re-checking the roster.
3. `pickTeammate` writes fields through an `Object.entries` loop with a `keyof FormData` cast.

## T5 · Persist a teammate opponent in seat two — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4724 passed, shard 2/2 5123 passed (suite run in two shards; a single full run gets killed mid-suite). Completion VERDICT: pass.
**changed:** `teammates.ts` adds `teammateSeat()` / `rosterProfileId()`, which re-read the pick from the loaded roster at save time (null when the opponent was not a teammate pick, is no longer on the roster, is the subject, or the workspace is not a team); `utils.ts` `buildMatchData` writes `teammateSeatId` to `player2_id` (never equal to `player1_id`); `useUploadMatchWizard.ts` passes it and skips `contribute_opponent_player` for a teammate. A roster "safety arm" row (member with no profile, login id as `player_id`) is seated by login id with `opponent_player_id` left null, so the FK cannot fail. Comments in `utils.ts`, `types.ts`, `program-side.ts`, `viewer-side.ts`, `opponents-server.ts` and an exception note in `docs/ui-revamp-guardrails.md` §3.1 state the teammate exception. New `tests/teammate-opponent-seat.spec.ts`; `tests/fixtures/upload-wizard-hook.ts` registers the new import. No migration, no policy.
**follow-ups:**

1. The schedule-line update branch still writes no `player2_id`, so a teammate on a reused line row gets `opponent_player_id` but no seat.
2. The database does not check `player2_id` against the roster (the insert policy is `created_by = auth.uid()`); a trigger arm mirroring the `player1_id` roster check would close it — needs a migration.
3. Add `profileId` to `RosterPlayerOption` (the RPC returns `profile_id`) instead of inferring "no profile" from `playerId === userId`.
4. Rename the guardrails note "A reviewed exception" once /pr-check's reviewers pass it.
5. A live-DB spec proving the teammate can read the row through `player2_id` after insert.
