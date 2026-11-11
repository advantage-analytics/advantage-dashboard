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

## T6 · Leave practice out of personal record and season readers — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4730 passed, shard 2/2 5130 passed. Completion VERDICT: pass.
**changed:** `countViewerWins` skips practice; new pure `buildPersonalSeasonKpis` (season strip) and `buildOverallPerformance` (records, matchCount, win rate, form, KPI cards, ratings — `/api/home-insight` reads these) work from competitive rows only; `loadHomeServes` filters practice before cutting its four-match window (fallback query selects `match_type`, limit 50; `(home)/page.tsx` passes the full list); `match-stats-server.ts` `baselineMatches` drops practice from `getPlayerAverageStats` / `getMatchKpiHistory` baselines but keeps the open match; every exclusion uses `isPracticeMatch`. New `tests/practice-excluded-from-record.spec.ts` (13 tests).
**follow-ups:**

1. `analyzedMatchCount` ("N matches analyzed") still counts practice reports; the Focus card footer shows it next to evidence that now excludes practice — decide whether it needs a competitive-only count.
2. The Recent card header "N matches · W won" and `SeasonTitle`'s count take N from every row (practice included) while W excludes practice.
3. `getPlayerAverageStats` has no caller in `src/`; possibly dead.
4. The home-insight prompt's "Matches recorded: N" now means competitive matches; the wording could say so.
5. The serves fallback's `limit(50)` would show an empty preview after 50+ consecutive practice rows.

## T7 · Leave practice and teammates out of both Opponents pages — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4737 passed, shard 2/2 5136 passed. Completion VERDICT: pass.
**changed:** `opponents-load.ts` selects `match_type` and drops practice (`competitiveOnly`, via `isPracticeMatch`) before the statistics read and grouping in both loaders, and passes `player2_id` to the team grouper; `team-opponents.ts` `groupTeamOpponents` skips any match whose `opponent_player_id` or `player2_id` resolves to the program's roster, whatever the match type, without counting it unattributed; `opponents-server.ts` `headToHeadRows` / `opponentPlayerMatches` drop practice and the detail / opponent-player reads select `match_type`. The MCP `opponent_scouting` tool inherits it through the shared loaders, nothing under `src/lib/services/mcp/` changed. New `tests/opponents-practice-excluded.spec.ts` (13 tests).
**follow-ups:**

1. `headToHeadRows` callers in `src/lib/schedule/actions.ts` (~250) and `src/lib/wizard/actions.ts` (~593) don't select `match_type`, so their prior-meeting counts still include practice; add the column, then make the field required.
2. The teammate test reads player-role roster rows only; staff ids are not treated as teammates.

## T8 · Leave practice out of Team Home and roster records — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4742 passed, shard 2/2 5141 passed. Completion VERDICT: pass.
**changed:** `team-home-server.ts`: the season read selects `match_type`; `teamSeasonKpis` skips practice (even one relabelled onto a dual line); `teamMatchRow` gives practice `won: null` and `matchContext` says "Practice". `team-roster-server.ts`: the match read selects `match_type`; new pure `memberResultsByPlayer` (files a practice per seated member, once even when both seats resolve to one member) and `rosterRecordFrom` (wins, losses, form, drawer windows from competitive rows), so the drawer measures and `topMovers` (read by `/api/team-insight`) exclude practice. `courtRecordFrom` and the dual record unchanged — the schedule reader attaches only matches on a line, pinned in the spec. New `tests/practice-excluded-from-team.spec.ts` (10 tests).
**follow-ups:**

1. Roster `matchesPlayed` and "Last match" still include practice (it is still a match played; `matchesPlayed` also drives the invite dialog's "Their N matches…"). "Last match" skipping practice is a one-line change in `getRosterData` if wanted.
2. `teamMatchRow` / `matchContext` have no caller in `src` since the Team Home redesign (cad6d131b); delete or wire back.
3. Team Home "matches analyzed", "N new results" and `teamFirstReport` still count practice reports (reports, not records).
4. If Edit match can relabel a dual line's match as Practice, decide whether the dual score and court record drop it (needs `match_type` on `EntryMatch`, kept in agreement).

## T9 · Player profile: practice listed, never counted — blocked

**gate:** mechanical PASS (lint, typecheck, tests shard 1/2 4748 passed, shard 2/2 5148 passed); completion VERDICT: needs-work — criterion 3 not met. The profile route `/dashboard/team/roster/[playerId]` renders no match list of its own any more (its only list is the rail's "N matches ›" link to `/dashboard/matches?rosterPlayer=<id>`), so the "Practice" label, the missing `ResultMark` and the seat-turned score were not built there; that rendering lives in T12's files (`event-cell.tsx`, `match-card-list.tsx`) and the `?rosterPlayer=` cut does not turn rows to the cut player's seat today. Criteria 1, 2 and 4 met.
**stash:** b994913f8201418a94e8041ffac741d4d3db2a8d
**changed (stashed):** `player-profile-server.ts` (`countedSides`, pure `profileResultsFrom` / `buildPlayerProfile`, `PlayerProfile.practiceCount`, `PlayerMatchSide.opponentOnRoster`; `matchesPlayed` excludes practice); `player-season-server.ts` (season loaders start from counted sides; `seasonOpponentCount` skips practice and teammates); `profile-rail.tsx` keeps the Matches link live while practice exists; comments in `player-insight.ts` and the route page; specs `player-profile`, `player-season-loader`, `player-insight-prompt`, `profile-rail`.
**to unblock:** amend criterion 3 (or move it to T12) and re-run; T12 would need the `?rosterPlayer=` list to turn a seat-two row to that player's side (a turn that keeps `id`/`profileId` and does not flip an undecided score). Also fix a doc comment that points at a non-existent `tests/practice-excluded-from-profile.spec.ts`.

## T10 · Teach Ask and the MCP tools that practice never counts — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4745 passed, shard 2/2 5144 passed. Completion VERDICT: pass.
**changed:** `prompts.ts` adds `ASK_PRACTICE_RULE` / `ASK_PRACTICE_FILTER` (`coalesce(lower(trim(match_type)), '') <> 'practice'`, which passes `checkAskSql`) to "Rules for both" in the personal and team plan prompts, and the team record example carries the filter; `schema.ts` puts the rule on `matches.match_type` through a new `AskColumn.rule` field rendered beside the meaning (the meaning must stay the migration comment verbatim, pinned by `tests/ask-prompt.spec.ts`); `facts.ts` `booleanStatements` counts non-practice rows when rows are mixed and says how many it left out; `arrival.ts` comment only (it computes no record); MCP `INSTRUCTIONS`, the `list_matches` / `opponent_scouting` / `run_query` descriptions and `describe_views` state the rule; still ten tools. Specs: `ask-prompt`, `ask-facts`, `ask-arrival`, `mcp-auth`, `mcp-route`. No migration, RPC or `database.ts` change.
**follow-ups:**

1. Existing bug: both plan prompts tell the planner to write `match_type is distinct from 'Doubles'`, which the SQL guard's parser refuses.
2. Re-run `scripts/ask-examples-seed.ts` so the seeded record example in `ask_examples` carries the practice filter (writes to the DB — not run).
3. The app's own fixed Ask queries (`compare.ts` baseline, `review.ts` all-matches side, `ask.ts` `ASK_ALL_MATCHES_SCOPE`) still include practice — a separate server-side change.
4. The other worked examples (`ASK_PLAN_EXAMPLE_QUERY` / `_BASELINE` / `_REVIEW`, `ASK_TEAM_PLAN_EXAMPLE_PLAYER`) do not show the filter.
5. Sample live planner output; retrieved thumbs-up examples predate the rule.
6. `docs/ask-mcp-connector.md` could mention the rule.

## T11 · Keep practice out of the match-insight baseline — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4749 passed, shard 2/2 5148 passed. Completion VERDICT: pass.
**changed:** `supabase/functions/generate-insights/index.ts`: a local `isPracticeMatch` (trimmed, case-insensitive; comment points at `src/lib/matches/match-type.ts`); the history read selects `match_type` and drops practice before the baseline ids and the previous match are taken; the current match's `match_type` is read and a practice match's prompt gains "This match is a practice set: it does not count toward the player's record, so never call it a win or a loss that changes their record." Summary voice and generation config unchanged. `tests/generate-insights-prompt.spec.ts`: new practice assertions; its stub's `.in()` now returns only the requested stats rows (no existing assertion edited).
**follow-ups:**

1. **Not deployed:** the live function changes only after `deploy_edge_function` for `generate-insights` once merged.
