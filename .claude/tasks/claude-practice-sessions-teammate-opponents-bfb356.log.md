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

## T12 · Matches list: practice rows — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4755 passed, shard 2/2 5154 passed; design-drift counts unchanged. Completion VERDICT: pass. Widget-states: row rendering only — no Suspense region, loader, `return null` or empty-state path changed; an unmeasured practice result renders `—`.
**changed:** `event-cell.tsx` gains a `practice` prop ("Practice" in the cell's ink when there is no event name; a named event still wins); `match-card-list.tsx` tests `isPracticeMatch(match.matchType)`, draws the draft row's `EmptyMark` dash instead of `ResultMark`, and in the team scope puts an outlined grey `StatePill` "Teammate" after the opponent when both seats resolve to roster profiles; `matches-title-row.tsx` reads "{n} matches · {k} practice" when the counted set holds practice, unchanged otherwise; `(list)/page.tsx` passes the practice flag into `readyMatches`. No new view pill; `matches-page-content.tsx` untouched. New `tests/matches-practice-rows.spec.ts` (12 tests).
**follow-ups:**

1. The match drawer (`match-drawer.tsx` → `DrawerHeading`) still shows a `ResultMark` and "No event" for a practice match.
2. The below-`lg` card layout (`match-card-gallery.tsx`) has no practice or teammate treatment.
3. A teammate row with a folded draft shows two pills (Draft and Teammate), against StatePill's one-per-row note.
4. Sorting by Result still orders practice rows by their stored winner.
5. `EmptyMark` draws the dash in `--ink-400`; the canvas had `--ink-300` (kept the shared primitive).
6. The `?rosterPlayer=` cut does not turn a seat-two row to that player's side (the open part of blocked T9).

## T13 · Home recent matches: practice rows — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4757 passed, shard 2/2 5156 passed. Completion VERDICT: pass. Widget-states: row rendering only — no loader, Suspense region or empty-state path changed.
**changed:** `recent-matches.tsx` reads `isPracticeMatch(event.matchType)` once per group: a practice group with no event shows "Practice" in the event ink (a named event wins); its rows draw `EmptyMark` ("Practice, no result") in the result slot instead of `ResultMark`, drop the "def. / l." prefix and the win/loss tint, and say "Practice vs …" in the aria-label. New `tests/home-recent-practice-rows.spec.ts` (4 tests).
**follow-ups:**

1. `MatchRow` has no per-match type, so a group's practice flag comes from its first match; add a `practice` flag to `MatchRow` in `home-recent-data.ts` to make mixed groups exact.
2. `MatchMetadataRow` still compares `matchType === "Practice"` literally; switch it to `isPracticeMatch`.

## T14 · Match report: Practice rail, Teammate pill, notice — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4764 passed, shard 2/2 5163 passed. Completion VERDICT: pass. Widget-states: rendering plus one read inside the existing `Promise.all`; no Suspense region or empty-state path changed.
**changed:** `match-detail-server.ts` selects `opponent_player_id`, sets `match.isPractice` (via `isPracticeMatch`) and `match.opponentIsTeammate` (new pure `opponentIsTeammate`, oriented by the existing `youSeat` result; one `program_players` read only when `opponent_player_id` is set and not a seat id); `types.ts` adds the two optional `Match` fields (on `match`, not top-level, because the sample-match JSON is typed against the loader's shape); `rail-scoreboard.tsx` draws an outlined grey `StatePill` "Teammate" after the opponent's name; `report-scoreboard.tsx` eyebrow "Practice" and caption "Practice set · {n} points tagged"; `report-facts.tsx` event item reads "Practice"; `statistics-view.tsx` `PracticeNotice` (grey note strip) directly above the insight card, two-name copy for a teammate and one name otherwise. `page.tsx` untouched. New `tests/match-report-practice.spec.ts` (14 tests).
**follow-ups:**

1. The public share page (`match-share-server.ts`) gets `isPractice` but never sets `opponentIsTeammate` — shared practice links show no Teammate pill and the one-name notice.
2. `resolveRosterSeatIds` checks `program_players.id` only; `canonicalRosterIds` would also catch a teammate seated by an older claimed user id.
3. The untagged rail state on a practice match still reads "Not scored yet" with a "Practice · hard" caption (not covered by the canvas).
4. On a practice match the facts line shows "Practice" even when an event was filed; the Matches list (T12) keeps the event name — make them agree.
5. Run `pipeline-guardrails-reviewer` at /pr-check — this touches seat-dependent report rendering.

## T9 · Player profile: practice listed, never counted — done

**gate:** re-run after the author dropped criterion 3 on 2026-11-10 (the profile route renders no match list of its own). Stash b994913f applied on top of T10–T14; a doc comment repointed at `tests/player-profile.spec.ts`. Mechanical: lint pass, typecheck pass, tests shard 1/2 4770 passed, shard 2/2 5170 passed. Completion VERDICT: pass on criteria 1, 2 and 4. Widget-states: `profile-rail.tsx` changes only when the Matches link is live; no loader, Suspense or empty-state path.
**changed:** `player-profile-server.ts` (`countedSides`, pure `profileResultsFrom` / `buildPlayerProfile`, `PlayerProfile.practiceCount`, `PlayerMatchSide.opponentOnRoster`; `matchesPlayed` excludes practice); `player-season-server.ts` (season loaders start from counted sides; `seasonOpponentCount` skips practice and teammates); `profile-rail.tsx` keeps the Matches link live while practice exists; comments in `player-insight.ts` and the route page; specs `player-profile`, `player-season-loader`, `player-insight-prompt`, `profile-rail`.
**follow-ups:**

1. The rail's "N matches" now excludes practice while the linked Matches list shows practice too; `practiceCount` is available if the rail should state the split.
2. The `?rosterPlayer=` Matches cut does not turn a seat-two row to that player's side (needs a turn that keeps `id`/`profileId` and never flips an undecided score).
3. `opponentOnRoster` is true for any roster id, staff included.

## T15 · Match drawer: practice treatment — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4774 passed, shard 2/2 5174 passed. Completion VERDICT: pass. Widget-states: heading/fact rendering only; no loader, Suspense or empty-state path.
**changed:** `drawer-sections.tsx` `DrawerHeading` gains optional `practice` (default false) and draws `EmptyMark` "Practice, no result" in place of `ResultMark`, `ScoreLine` kept; `match-drawer.tsx` tests `isPracticeMatch(match.matchType)`, passes it, and the Event fact reads "Practice" (not muted) when there is no event or schedule name. `event-line-drawer.tsx` untouched. New `tests/match-drawer-practice.spec.ts` (8 tests).
**follow-ups:**

1. The drawer's ⋯ menu label falls back to "A vs B" for a practice with no event; "Practice" might read better.
2. The drawer still draws no Teammate pill (out of scope by the task).

## T16 · Matches list: Draft pill wins over Teammate — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4775 passed, shard 2/2 5174 passed. Completion VERDICT: pass. Widget-states: pill choice on a row only.
**changed:** `match-card-list.tsx` `isTeammate` also requires `!hasDraft`, so a teammate row with a folded draft shows only the Draft pill; `tests/matches-practice-rows.spec.ts` gains a test asserting exactly one outline pill reading "Draft", and "Teammate" without the draft.

## T17 · Require match_type on prior-meeting counts — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4775 passed, shard 2/2 5175 passed. Completion VERDICT: pass.
**changed:** `OpponentAttributedRow.match_type` is now required (`string | null`); `opponentRosterForLine` (`src/lib/wizard/actions.ts`) and `opponentRosterForDual` (`src/lib/schedule/actions.ts`) select `match_type`, so their prior-meeting counts leave practice out; `tests/person-name-matching.spec.ts`'s `row` builder supplies it and a new test pins the drop. `headToHeadRows` / `opponentPlayerMatches` unchanged.

## T18 · Shared report: Teammate pill and two-name notice — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4778 passed, shard 2/2 5177 passed. Completion VERDICT: pass.
**changed:** `match-detail-server.ts` exports `resolveOpponentPlayerOnRoster`; `match-share-server.ts` calls it inside the existing `Promise.all` and sets `match.opponentIsTeammate` with the shared `opponentIsTeammate` rule, oriented by its own transform. No UI file changed. New `tests/match-share-practice.spec.ts` (5 tests).
**follow-ups:**

1. Eyes-on `/m/[token]` for a teammate practice at /pr-check (the spec pins the loader, not the share page wrapper).

## T19 · Check player2_id against the program roster — done

**gate:** mechanical: lint pass, typecheck pass, tests shard 1/2 4779 passed, shard 2/2 5186 passed (live-DB spec skipped against production by design). Completion VERDICT: pass (body diffed against live `pg_get_functiondef`: only the two new blocks differ).
**changed:** new `supabase/migrations/20261111073000_matches_player2_roster_check.sql` — `create or replace` of `public.matches_block_client_regraft()` adding insert and update `player2_id` roster arms (same two `not exists` arms as `player1_id`, errcode 42501, program matches only) and `create or replace trigger` with `player2_id` in `UPDATE OF`; security definer, `search_path ''`, no grants. New `tests/matches-player2-roster-migration.spec.ts` (offline, 10 tests, incl. an md5 pin of the unchanged body) and `tests/matches-player2-roster-check.spec.ts` (live-DB, 7 tests); `tests/fixtures/live-db-specs.ts` registers it.
**follow-ups:**

1. **Not applied:** apply the migration to the live project after review, then re-read `pg_get_functiondef`, `pg_get_triggerdef` and `proacl` (ACL should stay `postgres` + `service_role`). Against a non-production target the live spec's refusal tests fail until it is applied there.
2. The offline md5 pin goes stale when this function next changes; that migration must move or retire it.
3. A seated teammate later removed from the roster keeps the seat (only changes are checked); decide whether roster removal clears `player2_id`.
4. Both arms accept archived/merged `program_players` rows, like the existing `player1_id` arm.
5. Check `ask_patch_match` (MCP `update_match`) never writes `player2_id`, or it will hit this trigger.

## Deploy · migration and generate-insights — done (2026-11-11)

**changed:** T19's migration renamed to `supabase/migrations/20261111165059_matches_player2_roster_check.sql` to match the version recorded on apply. Applied to the live project; re-read afterwards: `proacl` is `postgres` + `service_role`, the trigger's `UPDATE OF` includes `player2_id`, and both new `player2_id` blocks are in `pg_get_functiondef`. `generate-insights` deployed (version 38, `verify_jwt` on) from the branch file, so match insights now leave practice out of the baseline. T19 follow-up 1 is done.
