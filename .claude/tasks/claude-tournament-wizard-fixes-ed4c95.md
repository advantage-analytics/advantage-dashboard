# Tasks — claude/tournament-wizard-fixes-ed4c95

> Scope: Team tournament flow — builder defaults, "The result." page, upload-wizard score seeding, draw vocabulary (prequalifying / consolation routing)

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

## T1 · Default the tournament builder's format to No-Ad

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/static/static-tournament-builder.tsx (guess: `DEFAULT_FORMAT` ~line 1375), tests/schedule-static-copy.spec.ts or a new tests/tournament-format-default.spec.ts
- **done when:**
  - [ ] `DEFAULT_FORMAT` in `static-tournament-builder.tsx` resolves to the `"bo3-no-ad"` row of `FORMATS` (bestOf 3, adScoring false), and the doc comment beside it no longer says "ad scoring".
  - [ ] A committed spec asserts that a `TournamentDraftSeed` with no `format` submits `format.adScoring === false` and `bestOf === 3` (via the builder's draft/`submit` path or an exported helper — not by parsing a string).
  - [ ] The same spec asserts a seed with `format: "bo3-ad"` still opens and submits as Ad (editing an existing Ad tournament is unchanged).
  - [ ] `npm run typecheck` and the spec pass; no other builder default (`dual-build-step.tsx` `DEFAULT_FORMAT`/`DEFAULT_DOUBLES_FORMAT`, already no-ad) is touched.
- **notes:** Dual already defaults to `bo3-no-ad` / `set-to-6-no-ad` (dual-build-step.tsx:91-111); only the tournament builder still picks `"bo3-ad"` (static-tournament-builder.tsx:1376). Keep the option-name lookup — never an encoded string; docs/ui-revamp-guardrails.md §3.1/§4 govern this field.

## T2 · Default lets to Play On for college matches

- **status:** done
- **model:** sonnet
- **files:** src/lib/schedule/writes-server.ts (`recordResult` format literals ~lines 852 and 858), src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (preset seed ~line 1435), tests/schedule-write-errors.spec.ts or tests/schedule-outcome-actions.spec.ts (writer fakes), tests/upload-score-state.spec.ts or tests/upload-line-offers.spec.ts (hook fixture)
- **done when:**
  - [ ] `recordResult` inserts `format.play_on_lets: true` for both the singles and the doubles branch; a committed writer spec (fake Supabase, `createScheduleWriter` deps) asserts the inserted `format` object.
  - [ ] When the wizard is seeded from an `EventPreset` whose `eventKind` is `"dual"` or `"tournament"`, `formData.playOnLets` is `true` before the person touches the Lets cell; a committed spec through `tests/fixtures/upload-wizard-hook.ts` asserts it.
  - [ ] `DEFAULT_FORM_DATA.playOnLets` stays `false` for a wizard opened with no preset (personal upload) and the same spec asserts that.
  - [ ] `npm run typecheck` passes; `edit-match-dialog.tsx` is not changed (it edits a saved value, not a default).
- **notes:** The let rule lives on `matches.format.play_on_lets`, not on `program_events.format` — there is no event-level column, so this is a default at the two places a college match row is minted. "College match" = a match born from a schedule line (preset with eventKind). Respect docs/ui-revamp-guardrails.md §3.1 when touching the wizard seed — do not alter `bestOf`/`adScoring` handling there.

## T3 · Carry tiebreak points from a recorded result into both score seeds

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/types.ts (`EventPreset.score` ~line 468), src/lib/schedule/line-choices.ts (`presetFor`), src/lib/schedule/score-seed.ts (`seedScoreForm`), src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (preset seed ~lines 1444-1450 and `sameRecordedScore`), tests/score-seed.spec.ts, tests/upload-score-state.spec.ts
- **done when:**
  - [ ] `EventPreset.score` carries optional `player1_tiebreaks` / `player2_tiebreaks` and `presetFor` forwards them from `EntryMatch.score` unchanged (games stay in `player1`/`player2`, points in the tiebreak arrays — guardrails §4.3).
  - [ ] `seedScoreForm` on a preset whose score is 7-6(5), 6-4 returns `playerScores [7,6]`, `opponentScores [6,4]`, and the `5` in the losing side's tiebreak cell for set 1 with `null` elsewhere; asserted in tests/score-seed.spec.ts.
  - [ ] The wizard's preset seed fills `formData.playerTiebreaks` / `opponentTiebreaks` from the same arrays (and still sets `numberOfSets`), asserted through `tests/fixtures/upload-wizard-hook.ts`; a preset with no tiebreak arrays seeds nulls exactly as today.
  - [ ] Switching lines in the pinned bar still clears a score that equals the previous line's recorded one (`sameRecordedScore`) when tiebreaks are present — one added case in the existing swap spec.
- **notes:** Root cause: `EventPreset.score` is typed without tiebreaks (types.ts ~468) so the hook seed copies only `player1`/`player2` (useUploadMatchWizard.ts ~1444), and `seedScoreForm` deliberately writes `nulls(size)` into both tiebreak rows with a comment that the preset "carries no tiebreaks" (score-seed.ts ~100). The loader already hands the whole `matches.score` JSONB over (schedule-server.ts:44, 268), and `recordResult` writes `player1_tiebreaks`/`player2_tiebreaks`, so the data is there — it is dropped at the two seeds. High confidence.

## T4 · Keep the upload success screen on /dashboard/team/upload after the row is written

- **status:** done
- **model:** opus
- **files:** src/app/dashboard/team/upload/page.tsx (the `?entry=` branch, lines ~171-244), src/lib/data/schedule-server.ts (`uploadQueueFrom` / `getProgramSchedule`), possibly a new pure resolver in src/lib/schedule/ (e.g. `upload-target.ts`), tests/upload-route-guards.spec.ts (or a new spec)
- **done when:**
  - [ ] The `?entry=` (and `?entry=&match=`) branch resolves the line from the full program schedule rather than from the videoless queue, so a line whose match just gained a processing job still produces the same `EventPreset` (and the same JSX tree) on a refresh instead of `redirect("/dashboard/team/upload")`.
  - [ ] The resolution is a pure function (schedule → entryId/matchId → `{ kind: "preset" } | { kind: "redirect" }`) with a committed spec covering: entry not in program → redirect; doubles → redirect; `?match=` naming a match of another entry → redirect; `?match=` naming a match that already has video → preset (no redirect); `?entry=` alone where every match now has video → preset.
  - [ ] The wizard's own post-create `router.refresh()` (useUploadMatchWizard.ts ~3383) is left in place, and the flow's `created` state therefore survives it — a comment at the page's branch says why the queue filter must not gate this branch.
  - [ ] The queue LIST rendered for a bare `/dashboard/team/upload` still excludes lines with video (existing `uploadQueueFrom` behaviour and its spec unchanged).
- **notes:** Root cause (high confidence): 300 ms after the match row and job are written the hook calls `router.refresh()`; the team upload page rebuilds from `getUploadQueue`, which filters out any match with `hasVideo` (schedule-server.ts:588-600, "Entries with no video yet"). The just-created line is gone from the queue, so the page falls through to `redirect("/dashboard/team/upload")` (page.tsx:244) — or, with `?match=`, to the `matchId && !requested` redirect (page.tsx:198). The success screen (`UploadMatchSuccess`, "Uploading your video") is unmounted by the redirect while the upload closure keeps running with nothing showing progress. The personal route uses a different resolver (`matches/new/page.tsx`) — check it does not share the fault, but do not widen the task to it. The attach-video surface (`AttachmentUploadStatus`) shows the same words and is NOT the failing one: it has its own passing browser spec (tests/match-video-attachment-flow.spec.ts:1238). Respect docs/ui-revamp-guardrails.md §3.1 — nothing in the wizard's create/submit order changes.

## T5 · Re-sync the wizard's line preset when the event's format changes

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx (`useState(initialPreset)` ~line 84), src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (preset seed effect ~1333-1460), src/lib/schedule/writes-server.ts (`updateTournament`/`updateDual` revalidation ~line 321), tests/upload-score-state.spec.ts or tests/upload-line-offers.spec.ts, writer spec
- **done when:**
  - [ ] `updateTournament` and `updateDual` call `revalidatePath("/dashboard/team/upload")` in addition to the schedule paths; a committed writer spec asserts the call.
  - [ ] When `UploadMatchFlow` receives a new `preset` prop for the SAME line (`entryId`/`matchId` unchanged) whose `adScoring` or `bestOf` differs, the wizard's `formData.adScoring` / `bestOf` follow it (the Scoring read cell reads "No-Ad" after an Ad→No-Ad edit) without clearing the picked file or typed score; a committed spec through `tests/fixtures/upload-wizard-hook.ts` or a flow harness asserts `formData` after the re-render.
  - [ ] A new preset for a DIFFERENT line still goes through the existing swap path (`LINE_SWAP_FIELDS`, `sameRecordedScore`) — existing swap specs stay green.
  - [ ] `npm run typecheck` passes.
- **notes:** Two contributing causes, medium confidence. (1) `UploadMatchFlow` copies the server preset into `useState` once (UploadMatchFlow.tsx ~84) and only the pinned bar's `setPreset` ever changes it, so a fresh server render hands a new `initialPreset` that is ignored. (2) `updateTournament` revalidates only `/dashboard/team/schedule*` (writes-server.ts:321-322); `/dashboard/team/upload` is not revalidated, and a back/forward navigation is served from the client router cache regardless of `staleTimes`. There is no localStorage copy of `adScoring` (only SELECTED_PROVIDER / UPLOADED_FILE / DRAFT_KEPT are stored). Guardrails §3.1/§4: `adScoring` must remain the event's value or `undefined`, never a defaulted `false`.

## T6 · Change round on "The result." without losing what was typed

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/schedule/score-only-flow.tsx (`changeRound` ~line 375, `ScoreForm` state), src/app/dashboard/team/schedule/[eventId]/score/page.tsx (props it seeds), src/lib/schedule/score-seed.ts (a pure "reseed on round change" helper), tests/fixtures/schedule-score-flow-outcomes-harness.tsx + tests/schedule-score-flow-outcomes.spec.ts, tests/score-seed.spec.ts
- **done when:**
  - [ ] On a tournament entry, choosing another round in the Round menu no longer navigates/remounts: with 6 and 4 typed in set 1 and an ending chosen, switching R32→R16 leaves those cells and the ending in place and the Round menu reads R16 (asserted in the browser harness spec).
  - [ ] Choosing a round that already holds a result while the form is untouched seeds that round's saved games/tiebreaks and shows "Replaces the R32 result already recorded." in the footer; choosing it while the form is dirty keeps the typed digits and still shows the replace notice (both asserted in the harness spec; the pristine/dirty decision is a pure helper pinned in tests/score-seed.spec.ts).
  - [ ] Save sends `round` equal to the round shown in the menu at the moment of saving (the fake `recordResult` in the harness receives it), and the URL's `?round=` is kept in step via `history.replaceState` (no server round-trip) so a reload reopens the same round.
  - [ ] A dual line is unaffected (no Round control, existing dual harness cases unchanged).
- **notes:** Root cause, high confidence: `changeRound` does `router.replace(scoreHref?entry=&round=)` (score-only-flow.tsx:375-381) and the page keys the flow on `${entry.id}:${round}` (score/page.tsx:154), so every round change remounts `ScoreOnlyFlow` and `ScoreForm`, discarding typed digits, the opponent name and the ending — by design (file header comment), but the owner experiences it as a reset. The server currently seeds only the ONE requested round's match into `preset.score`; to switch in client state the page must hand over the entry's per-round matches (`entry.matches` already loaded — pass a `roundSeeds` map keyed by round, or the `EntryMatch[]`) so `seedScoreForm` can be re-run client-side for a pristine form. Keep `recordedRounds` for the notice. Keep the `key={outcomeKey(entryId, round)}` remount for LINE switches (the S1→S2 protection the header warns about) — only the round change should stop remounting.

## T7 · Let the opponent be changed on a saved or inherited tournament round

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** src/components/dashboard/schedule/score-only-flow.tsx (`namingOpponent` ~line 352, `OpponentInRow` ~1010), src/lib/schedule/line-choices.ts (`presetFor` opponentName ~line 108), tests/fixtures/schedule-score-flow-outcomes-harness.tsx + tests/schedule-score-flow-outcomes.spec.ts, tests/line-choices.spec.ts
- **done when:**
  - [ ] On a tournament entry, the opponent row is editable whether or not a name is already there: a saved round opens showing its recorded opponent with a control (a "Change" text action in the design system's link styling, or the picker itself) that lets a different name be committed, and `recordResult` receives the new `opponentLabels` (harness spec).
  - [ ] A tournament round that has no match of its own opens with an EMPTY opponent (the picker in its "Name their player" state), not the entry's last-filed opponent: `presetFor(event, entry, null, programs, "R16")` returns `opponentName: ""` for a tournament entry, asserted in tests/line-choices.spec.ts; a dual line still falls back to `entry.opponentLabels` (existing assertion kept).
  - [ ] Committing a changed opponent on a tournament round and saving writes only that round's match (`syncEntryOpponent` behaviour for tournaments unchanged — writer spec cases stay green).
  - [ ] A dual line whose opponent the lineup named keeps today's read-only label with its "Edit dual" route (harness case).
- **notes:** Two causes, high confidence. (1) `namingOpponent` is decided once on mount as `preset.opponentName.trim() === ""` (score-only-flow.tsx:352-353); once any name exists the row renders a static label and `OpponentInRow` is never drawn, so nothing on the page can change the opponent. (2) For the NEXT round of the same entry, `presetFor` sets `opponentName: (match?.opponentLabels ?? entry.opponentLabels)` (line-choices.ts ~108) and a tournament entry's `opponent_labels` means "last round filed" (writes-server.ts comment ~755), so R16 opens pre-filled with R32's opponent and — because of (1) — locked. The pool hook `useOpponentPool` is only fetched while some line is unnamed (`naming`, score-only-flow.tsx:137); it must be fetched whenever a tournament form can name an opponent.

## T8 · Choose the opponent's school on a tournament round

- **status:** todo
- **model:** fable
- **needs:** T7
- **files:** src/components/dashboard/schedule/score-only-flow.tsx (tournament branch of `ScoreForm`/`OpponentInRow`), src/components/dashboard/schedule/static/dual-school-step.tsx (directory search over `/api/programs/search` to reuse or extract), src/lib/schedule/write-types.ts (`RecordResultInput.opponentSchool`, add program id/key), src/lib/schedule/writes-server.ts (`syncEntryOpponent` ~lines 760-780), src/lib/schedule/actions.ts (`opponentRosterForDual`, `saveOpponentPlayer`), tests/schedule-score-flow-outcomes.spec.ts, writer spec
- **done when:**
  - [ ] On a tournament entry, "The result." shows a School control above the opponent name (directory search with a typed free-text fallback, the same source the dual builder uses) — a dual line shows no such control (harness spec asserts presence/absence).
  - [ ] Choosing a directory school re-points the opponent picker's pool at that school: `opponentRosterForDual` is called with the chosen program key and the picker offers that roster; a typed school (no directory row) yields a pool with no roster and a plain text opponent (harness spec with the action stubbed).
  - [ ] Save passes `opponentSchool` and the chosen program id/key in `RecordResultInput`; on a tournament round `recordResult` writes `program_event_entries.opponent_school` and `opponent_program_id` for that entry (writer spec asserts the update payload; the "correction on a later round must not clobber" rule in `syncEntryOpponent` is preserved for tournaments — write the school only when the saved round is the entry's latest, or state the chosen rule in a comment and pin it).
  - [ ] "Save to {school} roster" is offered for a two-token name against a directory school and calls `saveOpponentPlayer` with that school's key (harness spec); the tournament detail's `SchoolsFaced` rail shows the saved school (existing loader path, one assertion in tests/schedule-tournament-outcomes.spec.ts).
- **notes:** Data model, verified in code: an opponent player IS a `program_players` row under the opponent PROGRAM (school), contributed via the `contribute_opponent_player` RPC (migration 20260822150000); the entry carries `opponent_school` + `opponent_program_id` (per entry, "last round filed"); `matches` has NO opponent-school column. So no migration is needed for the entry-level interpretation above. If a school PER ROUND turns out to be required, that needs a `matches` column — a migration; verify the live schema with `mcp__supabase__execute_sql` first (the repo is ~100 migrations behind) and stop to confirm before applying. Why it is missing today: the score flow builds its pool from `current.opponentSchool ?? current.eventName` (the tournament's NAME) and `opponentProgramKey` (null on a tournament), score-only-flow.tsx:139-146, so there is no roster and nowhere to say which school the round's opponent is from. New controls use design-system primitives (`MenuSelect`, `advButton()`), see .skills/advantage-analytics-design/SKILL.md.

## T9 · After a won tournament round, offer that entry's next round first

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** src/lib/schedule/tournament-run.ts (`nextRound`), src/lib/schedule/entry-state.ts (`matchWon`), src/components/dashboard/schedule/score-only-flow.tsx (`save`/`finish`, footer labels), tests/tournament-run.spec.ts, tests/schedule-score-flow-outcomes.spec.ts
- **done when:**
  - [ ] A pure helper `nextRoundAfter(entry, savedRound, won)` in tournament-run.ts returns the next `ROUND_ORDER` step in the SAME draw when `won` is true (R32→R16, QF→SF, Q1→Q2, C1→C2), `null` after a won `F` (nothing follows a title) and after the last round of a qualifying draw only if no main-draw round is defined (otherwise the first main-draw round the entry has not played), and — until T11 lands — the existing `nextRound(entry)` value when `won` is false; pinned in tests/tournament-run.spec.ts.
  - [ ] On a tournament entry, saving a played score our side WON changes the primary from "Save and next entry" to "Save and next round" and, after the write, the form opens on the SAME entry at the returned round with an empty score and (per T7) an empty opponent; the harness spec asserts the label and the round shown after save.
  - [ ] Saving a lost round, a retirement/default, or a dual line behaves exactly as today (walks to the next open line / closes) — existing harness cases unchanged.
  - [ ] The event page's "Add result" href for an entry (tournament-detail.tsx ~526, `scoreHref(..., nextRound(entry))`) keeps pointing at the round the helper would pick for a won last match — one assertion in tests/schedule-tournament-outcomes.spec.ts.
- **notes:** Today `nextRound` (tournament-run.ts:25-34) advances one ladder step after the LAST recorded round regardless of result, and the score flow's "Save and next" always walks to the next ENTRY (`openAfter[0]`), never to the same entry's next round. There is no bracket/draw object to "create" — a round exists the moment a match row with that `round` is written, so "automatically make the next round" is realised by opening the form on it. The loss branch is T11.

## T10 · Add Prequalifying and PQ Consolation to the draw vocabulary

- **status:** todo
- **model:** fable
- **files:** src/lib/schedule/format.ts (`ROUND_ORDER`, `ROUND_LONG`, `drawOfRound`), src/lib/schedule/tournament-run.ts (`nextRound` first-round pick, `groupByDraw`), src/components/dashboard/schedule/static/static-tournament-builder.tsx (`DRAWS`, `MAIN_DRAW`, `QUALIFYING` ~line 1382, the per-row draw menu), src/components/dashboard/schedule/score-only-flow.tsx (Round menu), src/lib/schedule/fixtures.ts, tests/schedule-format.spec.ts (or wherever `drawOfRound`/`roundRank` are pinned), tests/tournament-run.spec.ts, tests/schedule-static-copy.spec.ts
- **done when:**
  - [ ] `ROUND_ORDER` becomes, in chronological order: `PQ1–PQ4`, `PC1–PC4` (PQ consolation), `Q1–Q3`, `R256`, `R128–F`, `C1–C5`; `drawOfRound` maps `PQ*`→"Prequalifying", `PC*`→"PQ Consolation", `Q*`→"Qualifying", `R*/QF/SF/F`→"Main draw", `C*`→"Consolation"; `roundLongLabel` covers every new code ("prequalifying round 2", "PQ consolation round 1", "the round of 256"); all pinned in a spec, and `roundRank` still sorts the existing fixtures identically.
  - [ ] The builder's per-row draw menu offers exactly "Prequalifying", "Qualifying", "Main draw" (stored values, in that order) and `nextRound` for an entry with no matches returns `PQ1` when `entry.draw` is "Prequalifying", `Q1` for "Qualifying", `R32` otherwise — pinned in tests/tournament-run.spec.ts and the builder copy spec.
  - [ ] The Round menu on "The result." lists rounds grouped under their draw heading in `ROUND_ORDER` order (Prequalifying · PQ Consolation · Qualifying · Main draw · Consolation) and `groupByDraw` buckets a run PQ2 → PC1 → PC2 under two headings — asserted in the harness spec and tests/tournament-run.spec.ts.
  - [ ] No migration: `program_event_entries.draw` is free text and `matches.round` is free text — a comment on `DRAWS` says so and names the ITA flight the value mirrors.
  - [ ] `npm run typecheck`, `npm run lint` and the touched specs pass; `src/components/admin/admin-tournament-result-form.tsx` still compiles against the new ladder (it may keep offering the old subset — not widened here).
- **notes:** Source of truth is the ITA draws page the owner linked (2026 ITA Men's All American: flights Prequalifying R256→F, PQ Consolation R128→F, Qualifying in 8 regional sections R64→F, Main Draw with a Main stage R64→F and a Consolation stage C-R32-Q…C-Final). The app keeps ORDINAL codes for the non-main draws (Q1, C1, PQ1) rather than the site's sized ones, matching the existing Q*/C* convention; regional qualifying sections are not modelled (one "Qualifying" draw). "Multiple draws per player" is therefore one entry whose run crosses draws by round code — no second entry row and no builder UI for entering a player twice. Doubles at a tournament is a separate concern and is out of scope. This is a vocabulary change that several sorters read; route stays `fable` because `ROUND_ORDER` is the chronology for every run on the event page and the drawer.

## T11 · Route a lost round to its consolation draw

- **status:** todo
- **model:** opus
- **needs:** T9, T10
- **files:** src/lib/schedule/tournament-run.ts (`nextRoundAfter`), src/components/dashboard/schedule/score-only-flow.tsx (`save`/`finish`, footer labels), tests/tournament-run.spec.ts, tests/schedule-score-flow-outcomes.spec.ts
- **done when:**
  - [ ] `nextRoundAfter(entry, savedRound, false)` returns `PC1` after a lost `PQ*` round, `C1` after a lost `Q*` round, `C1` after a lost main-draw round other than `F`, and `null` after a lost `F`, a lost `PC*`, or a lost `C*` round (the run is over) — every branch pinned in tests/tournament-run.spec.ts; a `PC*`/`C*` round already recorded for the entry is never returned (`recordResult` de-duplicates on entry+round).
  - [ ] On a tournament entry, saving a LOST round whose helper result is non-null shows the primary as "Save and start consolation" with a secondary text action "Save — they're out" (design system text-action styling, no icon); the primary reopens the form on the same entry at the returned round with an empty score and opponent, the secondary walks to the next open entry as today — both asserted in the harness spec.
  - [ ] Saving a lost round whose helper result is `null` keeps today's single "Save and next entry" behaviour (harness case).
  - [ ] A retirement/default/withdrawal ending and a dual line are unchanged — existing harness cases stay green.
- **notes:** Loss routing follows the ITA structure the owner linked: prequalifying losers drop into PQ Consolation; qualifying losers and main-draw losers drop into the main Consolation (the site's "C-R32-Q" feeder rounds are the qualifying losers' entry point — modelled here as the same `C1`); a loss in any consolation ends the run. The secondary action exists because not every player takes their consolation spot; the owner's own words were "consolation? another draw?", so the form asks once rather than assuming.

## T12 · Flatten the tournament table into date-ordered match rows with Player, Draw and Round columns

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/schedule/tournament-detail.tsx (`TRACKS`/`TABLE_MIN_PX`/`COLUMNS` ~112-137, `TournamentDetail` visible/rowCount ~226-244 and 456-505, `EntryHead` 570-674 and `drawWords` 927-932 to delete, `MatchTableRow` 678-789), src/lib/schedule/tournament-run.ts (new pure row comparator), tests/tournament-run.spec.ts, tests/schedule-tournament-outcomes.spec.ts (+ tests/fixtures/schedule-tournament-outcomes-data.ts if a second dated row is needed to exercise the sort in the browser)
- **done when:**
  - [ ] `COLUMNS` is exactly `["Date","Player","Draw","Round","Opponent","Result","Score","Analysis"]`, `TRACKS` lists eight tracks in that order with Date = `DATE_COL` and Result = `RESULT_COL` (both still imported from match-list-layout.ts), `TABLE_MIN_PX` sums eight track minimums plus 7×16px, and the outcomes spec's two column-header assertions and `assertTracks` (Round now `cells[3]`, Score now `cells[6]`) pass with no clipped heading, drawer closed and open at 1280px.
  - [ ] `EntryHead` and `drawWords` are deleted and `EventTable`'s children are `MatchTableRow`s only (`rowCount` counts rows, not groups; the `runFinish` import is gone). Each row's Player cell renders one 26px initials avatar (`PersonAvatar` + `getInitials`, photo null — or `InitialsAvatar`) per `entry.playerLabels` name and the names joined with " / " (doubles = two avatars, two names), the name wrapped in a `Link` to `/dashboard/team/roster/<id>` with `onClick={e => e.stopPropagation()}` only when `rosterPlayerIds` resolves it (match-card-list.tsx:181-194 pattern); the Draw cell prints `row.draw`; the Round cell keeps its `span.mono`. The outcomes spec asserts: the R16 row contains a link "Jordan Lee" with href `/dashboard/team/roster/player-browser` plus the texts "Main draw" and "R16"; the Q1 row contains "Qualifying"; no element outside the rows shows "Sam Park" or "No matches yet"; clicking R16 still sets `aria-current="true"` and `?match=played-r16`.
  - [ ] A pure comparator exported from `src/lib/schedule/tournament-run.ts` (structurally typed on `{ round: string | null; match: { date?: string | null } | null }`, no import from the component) orders rows by the calendar day of `match.date` ascending, then `roundRank(round)` for the same day, with undated (outcome-only) rows after every dated row and among themselves by `roundRank`; pinned in tests/tournament-run.spec.ts with at least: Sep 12 R16 after Sep 11 R32; same-day Q2 before R32; undated QF after dated R16 and undated Q1 before undated QF. `TournamentDetail`'s default sort uses it on the flat row list; the "Player" sort option sorts by `entryLabel` and then the same comparator.
  - [ ] Pills, the Result filter, `?match=` selection, the drawer and the dual page are unchanged in behaviour: `pillKeeps`/`rowCut` cut the flat list, `selectIgnoringCut` still lifts a cut, the drawer's run list (`LineContextList` + `RunContextRow` + `runSummary`) still lists every round of the entry in ladder order, and `git diff` touches neither `dual-detail.tsx` nor `event-table.tsx`. The existing outcomes-spec drawer cases stay green with only their order-dependent values updated (the "n / N" counter and the `span.mono` row order follow the new sort).
  - [ ] `npm run typecheck`, `npm run lint`, `npx playwright test tests/tournament-run.spec.ts tests/schedule-tournament-outcomes.spec.ts` pass. The spec case "an entry with nothing played offers its first result from its head" is replaced by one asserting the waiting entry contributes no row and the footer still reads "3 matches · 2 entries · …"; with no cut active and zero rows the empty body renders without the "Show all matches" action.
- **notes:** Owner's decisions: column order Date · Player · Draw · Round · Opponent · Result · Score · Analysis (the team Matches list's grammar, Event dropped, Analysis trailing); the per-entry head (avatar/name/draw/record/finish) is removed and record/finish stay in the drawer summary and the strip only; no rail; sort = date asc then `roundRank`. Keep `RunContextRow` — it is the drawer's run list, which the owner kept, not the table head. Consequences to accept, not re-ask: (1) an entry with nothing played no longer appears in the table at all; its "Add first result" link goes with the head — the header's "Add result" still opens the score flow on the first waiting entry, so the path is not lost; (2) the outcomes-spec line `matchRows(page).getByRole("link")).toHaveCount(0)` (~194) must become "only roster-name links" since the Player cell now carries one; (3) rename the default sort option label from "Round order" to "Date" — its old meaning was per-entry ladder grouping. Undated-rows-last is a chosen policy for outcome-only rounds (no `matches` row, no date); state it in the comparator's doc comment. Sizing guidance: Player `minmax(150px,1fr)` at 13/500 ink-900 per tables.md law 1, Draw a fixed track sized to its widest word ("PQ Consolation" after T10 — do not clip it), Round keeps 48px; Opponent stays `minmax(150px,1fr)` at 13/400 ink-700. There is no narrow-viewport card fallback in this file or in event-table.tsx (no `lg:` classes) — the grid plus `overflow-x-auto` is the only rendering. `EventGroupHead` is not imported here (the tournament used its own `EntryHead`); the dual keeps using it. `homeDraw`, `entryLabel`, `surname`, `nextRound`, `deepestRun` remain in use.
