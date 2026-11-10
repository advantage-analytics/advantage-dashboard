# Tasks — claude/practice-sessions-teammate-opponents-bfb356

> Scope: practice sessions (existing `match_type` Practice) and teammates as opponents — wizard field, opponent picker, record/stat exclusions, list/report surfaces. Design: canvas https://claude.ai/artifact/X4EfYCSf1ExbH3Yx9v5wYV.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Share match-type options and an isPracticeMatch predicate

- **status:** todo
- **model:** sonnet
- **files:** (guess) new `src/lib/matches/match-type.ts`; `src/components/dashboard/matches/match-actions/edit-match-dialog.tsx` (~233); new `tests/match-type.spec.ts`
- **done when:**
  - [ ] A dependency-free module exports `MATCH_TYPE_OPTIONS` (`Tournament`, `Dual Match`, `Practice`, in that order) and `isPracticeMatch(value)`
  - [ ] `isPracticeMatch` is true for `"Practice"`, `" practice "` and `"PRACTICE"`, and false for `null`, `undefined`, `""`, `"Singles"`, `"Doubles"`, `"Dual"`, `"Dual Match"` and `"Tournament"`, asserted in `tests/match-type.spec.ts`
  - [ ] `edit-match-dialog.tsx` imports the options from the module and no longer declares its own array; its rendered option labels are unchanged
- **notes:** `match_type` is overloaded: live writers still store the discipline in it (`Singles`/`Doubles` from `lib/schedule/writes-server.ts:924`, the wizard preset seed at `useUploadMatchWizard.ts` ~1723, and the `/api/upload` body ~3493). The predicate must match Practice only. Keep the module free of `next/headers` and Supabase so client components and offline specs can load it.

## T2 · Show Match type first under Context on wizard step 4

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx` (Context section; `EventCell` `onPick` ~2138), `WizardNotice.tsx`; new `tests/upload-details-match-type.spec.ts` (pattern: `tests/upload-details-video-section.spec.ts`, `tests/wizard-event-default.spec.ts`)
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] The first field of the Context section is a "Match type" underline `MenuSelect` offering exactly the T1 options, and it reads "Not set" when `formData.matchType` is empty or any value outside those options (e.g. `Singles`)
  - [ ] Picking an option writes it to `formData.matchType`; picking a tournament or dual event through `EventCell` still sets `Tournament` / `Dual Match` and the field shows it
  - [ ] When `formData.matchType` is `Doubles` the field is not rendered and the value is left untouched
  - [ ] While the value is Practice a `WizardNotice` renders directly under Context with the copy in the notes; it is absent for every other value
  - [ ] The diff leaves `validation.ts`, `useWizardGates.ts` and `score-state.ts` untouched, and the new spec asserts the field's position, the "Not set" default, the event-pick behaviour and the notice
- **notes:** Canvas boards 1–2. Notice copy from board 1: "**Practice.** Shows on {player}'s and {opponent}'s profiles under Practice. Win–loss, the season record, head-to-head and season statistics all leave it out." Name both players only when the opponent is a teammate (T4 sets that); otherwise name the player alone. Score stays required because the vendor payload needs it. Do not change the preset seed that writes `Singles`, or the `Doubles` check feeding `job-request.ts`. Read `docs/ui-revamp-guardrails.md` §3.1 and §4 first.

## T3 · Truncate opponent-menu rows and widen the menu to 360

- **status:** todo
- **model:** sonnet
- **files:** (guess) `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx` (~1840–1960, width class at ~1844), `RosterMenu.tsx` (`RosterRow`, for the grammar); a spec beside `tests/upload-player-details.spec.ts`
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] Every opponent-menu row's name element carries `min-w-0 truncate` inside a `min-w-0` flex parent, and its meta element carries `whitespace-nowrap` and `shrink-0`
  - [ ] The opponent menu's width class is `w-[360px]` in every branch; `w-[320px]` no longer appears in that menu
  - [ ] A spec renders the menu with a 60-character opponent name and asserts the name element has the truncate classes and the meta element the nowrap class
- **notes:** Styling only: `pickPlayed`, `pickRoster` and `createOpponent` must not change. Canvas boards 3 and 3b carry the row constants.

## T4 · Add the Teammates section to the opponent picker

- **status:** todo
- **model:** opus
- **needs:** T2, T3
- **files:** (guess) `DetailsStepContent.tsx` (opponent menu; `pickRoster` ~1356 is the model), `RosterMenu.tsx` (reuse `RosterRow`), `useUploadMatchWizard.ts` (roster already read through `program_roster_full` ~2093–2129), `types.ts` (`opponentSource`), `opponent-team.ts`, `src/components/dashboard/matches/opponent-team-field.tsx`, `src/components/ui/state-pill.tsx`; new `tests/upload-opponent-teammates.spec.ts`
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] In a team workspace the opponent menu has a "Teammates" section built from the program's active roster minus the match's subject, with rows in `RosterRow` grammar; the section is absent in a personal workspace and when the roster has nobody else
  - [ ] With Match type Practice the Teammates section renders before "People you've played"; with any other value it renders after "People you've played" and after the dual roster, asserted on DOM order both ways
  - [ ] Picking a teammate sets `opponentName`, sets `opponentPlayerId` to that player's `program_players` id, marks the opponent source as a teammate, fills `opponentHand` / `opponentBackhand` from the roster row, and clears the opponent-team fields
  - [ ] While the opponent is a teammate a grey "Teammate" `StatePill` renders where "Add their team" would; picking a played, roster or typed opponent afterwards restores "Add their team"
  - [ ] A teammate is not also listed under "People you've played" in the same menu
- **notes:** Canvas boards 3 (Practice order) and 3b (tournament/dual order); section label on the canvas is "Teammates · {program}". This task changes form state only; T5 owns what reaches the database. `opponent_player_id` has an FK to `program_players(id)`, so take the roster row's `program_players` id, not the claimed user id.

## T5 · Persist a teammate opponent in seat two

- **status:** todo
- **model:** fable
- **needs:** T4
- **files:** (guess) `src/components/dashboard/matches/new-match-wizard/utils.ts` (`buildMatchData`, `MatchMetadata` ~112–195), `useUploadMatchWizard.ts` (~3660–3840), `types.ts` (~228–240 doc comments), `src/lib/data/program-side.ts`, `src/lib/data/viewer-side.ts`, `src/lib/data/opponents-server.ts` (~614 comment), `docs/ui-revamp-guardrails.md`; new `tests/teammate-opponent-seat.spec.ts`
- **done when:**
  - [ ] For a teammate opponent `buildMatchData` returns `opponent_player_id` = the teammate's `program_players` id and `player2_id` = the id that teammate's own matches carry (`program_roster_full.player_id`); for every non-teammate opponent `player2_id` is exactly what it is today
  - [ ] A spec asserts that for one fixed form input every other key of `buildMatchData`'s output (`player1_id`, names, score, format, camera/end fields) is identical with and without a teammate opponent
  - [ ] A spec asserts that on such a row `viewerSide` and `youSeat` return `player2` for the teammate's ids and `player1` for the subject's, and `programSide` returns `player1`
  - [ ] The comments that forbid an opponent id in `player2_id` (`utils.ts` ~122, `types.ts` ~233, `opponents-server.ts` ~614, `program-side.ts`) state the teammate exception and why it is safe
  - [ ] The diff contains no migration and no policy change
- **notes:** This is how decision (4) lands without schema work. Every seat reader and both read gates already key on `player2_id`: the `matches` SELECT policy, `visible_match_ids()`, `playerSeat`/`viewerSide`/`youSeat`, `ask.my_side()`, `readPlayerMatchSides`, the roster table. Nothing reads `opponent_player_id` for a seat and no live row sets it. The repo rule being narrowed (migration `20260823090000`) exists so a rival cannot read the match by claiming a profile; a teammate is a program member who can read the program's matches already. Never touch `shots`, `points` or `match_stats`: the report turns by seat, it is never re-attributed. Run `pipeline-guardrails-reviewer` and `rls-boundary-reviewer` over the diff.

## T6 · Leave practice out of personal record and season readers

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/lib/data/home-recent-data.ts` (`countViewerWins` ~118), `personal-kpis-server.ts`, `personal-matches-server.ts` (`getPersonalMatchData`), `performance-server.ts` (`getOverallPerformance` ~864, feeds `/api/home-insight`), `home-serve-data.ts`, `match-stats-server.ts` (`getPlayerAverageStats` ~300, `getMatchKpiHistory` ~570); specs beside `tests/personal-home-scope.spec.ts`, `tests/home-serve-data.spec.ts`
- **routes:** /dashboard
- **done when:**
  - [ ] `countViewerWins` and the season strip from `getPersonalSeasonKpis` give the same wins, losses and KPI values with and without an added practice row, asserted in a spec with a fixture
  - [ ] `getOverallPerformance`'s `matchCount`, overall record and last-30-days record skip practice rows, so the figures `/api/home-insight` quotes exclude them
  - [ ] `loadHomeServes`, `getPlayerAverageStats` and `getMatchKpiHistory` never use a practice match as season or baseline data, while a practice match's own report still loads its own statistics
  - [ ] Every exclusion calls T1's `isPracticeMatch`; the diff adds no `=== "Practice"` literal
- **notes:** Leave `personal-activity-server.ts` (the activity heatmap counts play, not results) and `finished-match-count-server.ts` (usage, not record) alone. `loadRecentMatches` must still return practice rows; T13 draws them. Several of these loaders select no `match_type` today, so add the column to the select.

## T7 · Leave practice and teammates out of both Opponents pages

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/lib/data/opponents-load.ts` (`loadPersonalOpponents` ~150, `loadTeamOpponents` ~253, both column lists), `personal-opponents.ts`, `team-opponents.ts`, `opponents-server.ts` (`headToHeadRows` ~203, `opponentPlayerMatches`, `getOpponentsPlayed`, `getOpponentDetail`, `getOpponentPlayerProfile`); `tests/personal-opponents.spec.ts`, `tests/team-opponents.spec.ts`, `tests/team-opponent-scope.spec.ts`
- **routes:** /dashboard/opponents
- **done when:**
  - [ ] `loadPersonalOpponents` and `loadTeamOpponents` drop practice rows before grouping: a spec shows an opponent's matches, wins and losses unchanged by an added practice match, and an opponent met only in practice not listed
  - [ ] `loadTeamOpponents` never forms an opponent group for someone on the program's own roster (by `opponent_player_id` or a roster id in seat two), whatever the match type
  - [ ] `headToHeadRows` and the opponent detail and opponent-player loaders in `opponents-server.ts` exclude practice rows from head-to-head counts
  - [ ] The MCP `opponent_scouting` tool returns the same exclusions with no change under `src/lib/services/mcp/`, shown by a spec on the shared loaders it calls
- **notes:** `src/lib/services/mcp/user-reads.ts` (~456–462) calls the two loaders directly, so fixing them covers the tool. The wizard's "People you've played" list is `opponentsPlayed` in `src/lib/wizard/actions.ts`, a different function; T4 handles the teammate overlap there.

## T8 · Leave practice out of Team Home and roster records

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/lib/data/team-home-server.ts` (season read ~1654–1690, `teamSeasonKpis` ~1339, `teamMatchRow` ~1207, row type ~572), `team-court-record.ts` (`courtRecordFrom` ~139), `team-roster-server.ts` (match read ~399, wins tally ~532), `src/app/api/team-insight/route.ts`; `tests/team-court-record.spec.ts`, `tests/team-home-week.spec.ts`
- **routes:** /dashboard/team, /dashboard/team/roster
- **done when:**
  - [ ] `teamSeasonKpis` and `courtRecordFrom` return the same values with and without added practice rows, asserted in specs
  - [ ] The roster table's per-player wins, losses and form from `getRosterData` do not count a practice match for either seated player
  - [ ] `teamMatchRow` gives a practice match no result (the row renders without a `ResultMark`) and labels it "Practice" where it would otherwise say "Match"
  - [ ] Every exclusion calls T1's `isPracticeMatch`
- **notes:** The dual record comes from schedule lines, which a practice never has, so it should need no change; confirm rather than assume. Once T5 lands a teammate practice has roster ids in both seats, so check no reader counts it twice.

## T9 · Player profile: practice listed, never counted

- **status:** todo
- **model:** fable
- **needs:** T1, T5
- **files:** (guess) `src/lib/data/player-profile-server.ts` (`readPlayerMatchSides` ~180, `getPlayerProfile` ~264), `player-profile.ts` (`seasonStrip`, `seasonKpis`, `dualRecordFrom`, `profileFormBar`, `kpiSeries`), `player-season-server.ts`, `player-season.ts`, `player-insight.ts`, `src/components/dashboard/team/player-profile/*` (match list, `profile-rail.tsx`); `tests/player-profile.spec.ts`, `tests/player-season-loader.spec.ts`, `tests/player-insight-prompt.spec.ts`
- **routes:** /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] `readPlayerMatchSides` returns a teammate practice for both seated players, with `isPlayer1` false for the player in seat two, asserted with a fixture
  - [ ] The profile's record, form bar, KPI strip and KPI series, and every season loader (`loadPlayerSeason`, `loadPlayerSeasonCourts`, season head-to-head, point endings, rally and net cards) produce identical output with and without added practice rows
  - [ ] The profile's match list still shows practice rows, with "Practice" as the event label, no `ResultMark`, and the score printed from that profile player's side
  - [ ] `buildPlayerInsightPrompt`'s "Matches recorded" figure and tallies exclude practice, pinned in `tests/player-insight-prompt.spec.ts`
- **notes:** The canvas has no profile board; "their profiles list it under Practice" appears only in the notice copy. This draft keeps practice rows in the existing match list rather than inventing a section. `seasonOpponentCount` (`player-season-server.ts` ~184) must not count a teammate as an opponent faced.

## T10 · Teach Ask and the MCP tools that practice never counts

- **status:** todo
- **model:** fable
- **needs:** T1
- **files:** (guess) `src/lib/services/ask/prompts.ts` (rules block ~1471–1476), `schema.ts` (`match_type` meaning ~285), `facts.ts`, `arrival.ts`, `examples.ts`, `src/lib/services/mcp/server.ts` (`INSTRUCTIONS` ~175 and the `list_matches` / `describe_views` descriptions); `tests/ask-prompt.spec.ts`, `tests/ask-facts.spec.ts`, `tests/ask-arrival.spec.ts`, `tests/ask-views-parity.spec.ts`
- **done when:**
  - [ ] The Ask system prompt has a rule that rows with `match_type = 'Practice'` are left out of any record, win–loss, head-to-head or season statistic unless the question asks about practice, pinned by an assertion in `tests/ask-prompt.spec.ts`
  - [ ] The `match_type` column meaning in `schema.ts` states the same exclusion
  - [ ] Any server-computed record or season figure in `facts.ts` and `arrival.ts` excludes practice rows, asserted in their specs
  - [ ] The MCP server instructions or the relevant tool descriptions tell a connected client the same rule
  - [ ] The diff adds no migration, no new RPC and nothing to `src/lib/services/ask/database.ts`
- **notes:** `ask.matches` already exposes `match_type`, so no view change is needed; this stays a prompt-and-facts change inside the existing Ask boundary. Practice rows must stay queryable ("how did my practice sets go"). `tests/ask-views-parity.spec.ts` fails if `schema.ts` drifts from the live views.

## T11 · Keep practice out of the match-insight baseline

- **status:** todo
- **model:** opus
- **files:** (guess) `supabase/functions/generate-insights/index.ts` (baseline and previous-match reads, prompt ~659); `tests/generate-insights-prompt.spec.ts`, `tests/generate-insights-guards.spec.ts`
- **done when:**
  - [ ] The function's baseline averages and previous-match reads exclude matches whose `match_type` is Practice (trimmed, case-insensitive)
  - [ ] When the match being summarised is itself a practice the prompt says it is a practice set that does not count toward the player's record, pinned in `tests/generate-insights-prompt.spec.ts`
  - [ ] The settled summary voice is unchanged: 2–3 sentences under 350 characters, no sampling parameters, no `thinkingBudget`; the existing prompt-spec assertions still pass unedited
- **notes:** Edge functions cannot import from `src/`, so restate the predicate locally with a comment pointing at T1's module. The function runs from what is deployed: this needs `deploy_edge_function` after merge, which no diff can show.

## T12 · Matches list: practice rows

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess, run `trace-route` on `/dashboard/matches` first) `src/components/dashboard/matches/event-cell.tsx`, `match-line.tsx`, `match-card-list.tsx`, `matches-title-row.tsx`, `drawer-sections.tsx`, `src/lib/data/matches-list-types.ts` (~133), `matches-page-server.ts` (`withRosterProfiles`); `tests/matches-row-state.spec.ts`, `tests/matches-list-grouping.spec.ts`
- **routes:** /dashboard/matches
- **done when:**
  - [ ] A practice row's Event cell reads "Practice" where it would otherwise read "No event"; a practice row filed under a named event keeps the event name
  - [ ] A practice row's Result cell renders "—" and no `ResultMark`
  - [ ] In the team scope a row whose two players both resolve to roster profiles shows a grey "Teammate" `StatePill` beside the opponent name
  - [ ] The title row's count reads "{n} matches · {k} practice" when k > 0 and is unchanged when k is 0
  - [ ] No new view pill is added and the Filters › Match type checklist in `matches-page-content.tsx` (~237) is untouched
- **notes:** Canvas board 4. `withRosterProfiles` already gives both players a `profileId` in the team scope, which is enough to tell a teammate without a new query. `matchType` falls back to the string `"Match"` in `matches-list-types.ts`, so test Practice with `isPracticeMatch`, not truthiness.

## T13 · Home recent matches: practice rows

- **status:** todo
- **model:** sonnet
- **needs:** T1
- **files:** (guess) `src/components/dashboard/home/recent-matches.tsx` (~295–310); a spec beside `tests/home-empty-loading.spec.ts`
- **routes:** /dashboard
- **done when:**
  - [ ] A practice row in Home's recent matches reads "Practice" where it would otherwise read "No event"
  - [ ] A practice row there renders no `ResultMark`
  - [ ] A spec renders one practice row and one tournament row and asserts both behaviours
- **notes:** `event.matchType` is already on the row (`home-recent-data.ts` ~218). Same grammar as T12.

## T14 · Match report: Practice rail, Teammate pill, notice

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess, run `trace-route` on `/dashboard/matches/[matchId]` first) `src/components/dashboard/matches/match-detail/rail-scoreboard.tsx`, `report-scoreboard.tsx` (~138), `report-title-row.tsx`, `report-facts.tsx`, `report-insight-card.tsx`, `match-report.tsx`, `src/lib/data/match-detail-server.ts` (~204, select ~494); a harness spec in the style of the existing match-detail specs
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] For a practice match the rail header and meta line read "Practice" where the event name and type would otherwise be
  - [ ] When the opponent is on the match's program roster a grey "Teammate" `StatePill` renders beside the opponent's name
  - [ ] A Practice notice renders directly above the insight card for a practice match and is absent otherwise, with the copy in the notes
  - [ ] `getMatchDetailData` exposes whether the match is practice and whether the opponent is a teammate; `page.tsx`'s still-analysing short-circuit is unchanged
  - [ ] A spec renders the report for a practice-teammate fixture and a tournament fixture and asserts the rail text, the pill and the notice in each
- **notes:** Canvas board 5. Notice copy: "**Practice.** Not in {A}'s or {B}'s record or season statistics. Both players see this report; their profiles list it under Practice." When the opponent is not a teammate, name the player alone and drop the second sentence. The report already turns to the viewer's seat through `youSeat` (`viewer-side.ts`); do not add a second orientation path. Read `docs/ui-revamp-guardrails.md` §3.3 first.
