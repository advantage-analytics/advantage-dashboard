# Run log — claude/dual-match-tournament-designs-26cc2f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Chooser aside becomes a real link to the one-off match — done
**gate:** lint pass · tsc pass · npm test pass (475) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (dashboard surface) — no findings · rls-boundary-reviewer skipped (no data/api/migration surface touched)
**changed:** `static-event-chooser.tsx` — the aside's inert span is a `next/link` to `/dashboard/team/schedule/new/single` labelled "Add a one-off match"; header comment rewritten. `tests/schedule-static-copy.spec.ts` — `3b` asserts the new label with a RETIRED note for the old.

## T2 · `opponentMeetings()` beside `opponentDualHistory` — done
**gate:** lint pass · tsc pass · npm test pass (482) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer skipped (no dashboard surface) · rls-boundary-reviewer skipped (pure function in src/lib/schedule, no query)
**changed:** `opponent-history.ts` — `OpponentMeeting` type and `opponentMeetings()` (decided duals only, newest-first by `startsOn`, `won: null` on a level dual, `excludeEventId`). New `tests/opponent-meetings.spec.ts`, 7 cases including agreement with `opponentDualHistory`'s tally.
**follow-ups:** none.

## T3 · `getEventTeamTotals` loader with a pure summing core — done
**gate:** lint pass · tsc pass · npm test pass (491) · task-completion-reviewer `VERDICT: pass` · rls-boundary-reviewer ran (new read in src/lib/data) — no findings (cookie-scoped client, view is security_invoker over `visible_match_ids()`, `.in()` only narrows) · pipeline-guardrails-reviewer skipped (no dashboard surface)
**changed:** new `src/lib/data/event-team-totals.ts` (pure `sumTeamTotals`, types, the sum-vs-mean and `is_player1` rationale) and `event-team-totals-server.ts` (`getEventTeamTotals`, nine columns off `match_stats_with_percentages`, empty ids short-circuit, re-exports the pure half). New `tests/event-team-totals.spec.ts`, 9 cases.
**follow-ups:** (1) the view's actual nullability of `first_serve_points_won` / `break_point_opportunities` on Advantage Intelligence matches is unverified against live data until a page renders it; (2) `matchesCounted` counts matches that returned rows, not ids passed — a "6 of 9 lines measured" receipt would need a second field; (3) the caller must scope ids to the event (documented contract, re-check when T7 wires it).

## T4 · Move `presetFor` / `lineupChoices` into `src/lib/schedule/line-choices.ts` — done
**gate:** lint pass · tsc pass · npm test pass (498) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (upload page feeds the wizard) — no findings, §4 inputs traced byte-identical · rls-boundary-reviewer ran (src/lib/data) — no findings, cookie client, read unchanged
**changed:** new `src/lib/schedule/line-choices.ts` (`presetFor`, `lineupChoices`, moved verbatim with closures turned into parameters; the identity `.map` deleted); `programNamesFor` exported from `schedule-server.ts`; `team/upload/page.tsx` imports all three and drops its locals. New `tests/line-choices.spec.ts`, 7 cases.
**follow-ups:** T11's preset shape must match this signature — check when it lands.

## T5 · Event page primitives: frame, facts, format capsule, detail line, table card — done
**gate:** lint pass · tsc pass · npm test pass (500) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (dashboard surface) — no findings, no wizard file touched · rls-boundary-reviewer skipped (presentational, no query)
**changed:** `format.ts` gains `formatLabel()` (null `adScoring` drops the scoring half). New `src/components/dashboard/schedule/event-page.tsx`: `EventPageFrame`, `EventTitle`, `EventFacts` (+ private `CourtGlyph`), `FormatCapsule`, `DetailLine` (`DetailCount` action/live/done), `TableCard`, `GroupHead`, `TABLE_ROW_CLS`. New `tests/event-format-label.spec.ts`, 2 cases.
**follow-ups:** `EventTitle` and `TABLE_ROW_CLS` are extra exports for T7/T8; `schedule-table.tsx` should import `TABLE_ROW_CLS` in a later sweep instead of carrying its own copy.

## T6 · Rail widgets: Team totals and Head-to-head — done
**gate:** lint pass · tsc pass · npm test pass (500) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (dashboard surface) — no findings, side labels read straight off the props · rls-boundary-reviewer skipped (no query)
**changed:** new `team-totals-widget.tsx` (`TeamTotalsWidget`, private `SplitBar`: blue ours / `#64748B` theirs, empty track on null) and `head-to-head-widget.tsx` (`HeadToHeadWidget`; record line, 36px meeting rows, footer link only with a program id; school name appears only in the link copy).
**follow-ups:** T7 must pass analysis-ready match ids to `getEventTeamTotals` and the coverage counts alongside.

## T7 · Dual event page on the new frame; the route reads the season — done
**gate:** lint pass · tsc pass · npm test pass (500) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (dashboard route + components) — no findings: schedule keyed by `active.id`, totals ids only from this event's entries, staff gating kept · rls-boundary-reviewer skipped (no new query; existing cookie loaders)
**changed:** `[eventId]/page.tsx` reads `getProgramSchedule` + `eventDetailFrom`, computes history, meetings and `getEventTeamTotals` (analysis-ready ids) for a dual; `dual-detail.tsx` rebuilt on `EventPageFrame` / `EventFacts` / `DetailLine` / one `TableCard` with Singles/Doubles group heads + rail (Team totals above Head-to-head); `line-row.tsx` gains `showSchool?: boolean` (default true); README loader row corrected.
**follow-ups:** `/edit` and `/score` 404 until T19 / T11. Doubles "team point is theirs" counts played-and-lost lines only. The subagent believed `/dashboard/opponents/{id}` was not a route — it is (`src/app/dashboard/opponents/[programId]`), so the head-to-head link resolves. `ResultMark` is withheld on a decided-but-level score (defensive, unreachable in practice).

## T9 · `AddResultDialog`: pick an entry, then round and score — done
**gate:** lint pass · tsc pass · npm test pass (500; one live-RLS spec failed on the first run and passed on the re-run — nothing in the diff touches data) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran — no findings: saves only via `ScoreEntry` → `recordResult`, side attribution stays server-side · rls-boundary-reviewer skipped (no query)
**changed:** `add-result-row.tsx` exports `nextRound` (logic unchanged); new `add-result-dialog.tsx` — `"use client"` `AddResultDialog({ entries, open, onOpenChange })` on `@/components/ui/dialog`, entry select (forfeits excluded), round select over `ROUND_ORDER`, `ScoreEntry` inline; resets are structural (Radix unmount on close, `key={chosen.id}` on the round+score section), no effects.
**follow-ups:** criterion amended — the primary is `ScoreEntry`'s own `advButton("primary","sm")`; a `size` prop on `ScoreEntry` would give `md` if wanted. Cancel also fires `router.refresh()` (harmless). The shadcn `DialogContent` X is hand-replaced per dialog; fixing the shared primitive is its own branch.

## T8 · Tournament event page on the new frame — done
**gate:** lint pass · tsc pass · npm test pass (510, new `tournament-run.spec.ts` 9 cases) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran — no findings: totals ids from this event only + `isAnalysisReady`, staff gating kept, won/lost via `matchWon` · rls-boundary-reviewer skipped (no new query)
**changed:** new `src/lib/schedule/tournament-run.ts` (`groupByDraw` moved verbatim, `runFinish` reads the furthest round by ladder rank); `format.ts` gains `roundLongLabel` (all 13 codes, unknown passes through); `tournament-detail.tsx` rebuilt on the frame — one `TableCard` (`Round / Result / Match / Score / Status`), `GroupHead name` + run subline, draw divider only when a run crosses draws, no stripe, no inline `AddResultRow`; rail = Team totals + `SchoolsFaced`; new `add-result-button.tsx` client island (open state + `AddResultDialog`); `page.tsx` computes `totals` for both kinds via `readyMatchIds(detail)`; `event-page.tsx` `GroupHead` gains optional `name` (default path unchanged).
**follow-ups:** `AddResultRow` component is now dead code (only `nextRound` is consumed) — delete in its own change. `SchoolsFaced` under-reports a run across several programs (school is per entry). "Across 1 match" pluralises.

## T10 · Extract `ScoreBlock` out of `DetailsStepContent` (mechanical) — done
**gate:** lint pass · tsc pass · npm test pass (510) · task-completion-reviewer `VERDICT: pass` (byte-diff of the moved bodies verified) · pipeline-guardrails-reviewer ran (wizard surface, high attention) — no findings: `adScoring` still read-only for the label, score arrays pass through, top-player reorder untouched at submit, `useUploadMatchWizard.ts` and `src/lib/services/splitstep/` empty diff · rls-boundary-reviewer skipped
**changed:** new `new-match-wizard/ScoreBlock.tsx` holding `ScoreBlock`, `ScoreInput`, `CELL_CLS`, `isTiebreakSet`, `FORMAT_OPTIONS`, `Required` (all exported, verbatim); `DetailsStepContent.tsx` deletes them and imports back; `index.ts` exports `ScoreBlock`; `utils.ts` `setHasData` parameter widened to a `Pick<...>` of the four score arrays (type only).
**follow-ups:** none.

## T11 · Score-only entry route under the event — done
**gate:** lint pass · tsc pass · `npm run map` current · npm test pass (535, new `score-seed.spec.ts` + `schedule-leaf.spec.ts`) · task-completion-reviewer `VERDICT: pass` (remount key and lazy seed verified; tiebreak encoding compared against `score-entry.tsx`) · pipeline-guardrails-reviewer ran (high attention, wizard reuse) — no findings: games in set cells, points in tiebreak cells, our side first, `adScoring ?? undefined` is a display-only type bridge, staff gate mirrors the upload page · rls-boundary-reviewer skipped (no new query)
**changed:** new `[eventId]/score/page.tsx` (staff-gated, `?entry=` with an unknown value falling back to the first empty line), `score-only-flow.tsx` (step indicator 1/1, pinned bar, `ScoreBlock`, sticky footer; `ScoreForm` remounted on `key={entryId}` with a lazy `seedScoreForm`), pure `score-seed.ts` (`ScoreFormState`, `seedScoreForm`, `toRecordResultInput`); `nav.ts` gains the `/score` regex branch → "Add score"; MAP.md 60 routes; README route row.
**follow-ups:** the subagent reported "nothing links to /score" — not so, `dual-detail.tsx:145` already does. A tournament run is walked as one line per entry, so scoring a specific round would need `?match=`-style disambiguation.

## T12 · Extract `WizardShell` + `useWizardKeys`; `UploadMatchWizard` consumes them — done
**gate:** lint pass · tsc pass · npm test pass (535) · task-completion-reviewer `VERDICT: pass` (step blocks diff whitespace-only; keydown effect verbatim) · pipeline-guardrails-reviewer ran (highest attention) — no findings: the three inputs keep their bindings in `UploadMatchFlow.tsx`, `continueDisabled` and `data-wizard-continue` still connect hook to button, the four protected paths have an empty diff · rls-boundary-reviewer skipped
**changed:** new `WizardShell.tsx` (exports `CONTENT_CLS` + the chrome: full-bleed step indicator, pinned slot, 832px column, sticky footer) and `useWizardKeys.ts` (keydown effect + `isFormControl`, moved verbatim); `UploadMatchFlow.tsx` consumes both; `index.ts` exports all three plus their types.
**follow-ups:** `score-only-flow.tsx` could adopt the shell, but its eyebrow reads "Line N of M" — that needs an `eyebrow?` override prop, a design call left open. `UploadMatchFlow.tsx`'s header comment still calls the file "the shell".

## T13 · `PinnedEventBar` for the create flows — done
**gate:** lint pass · tsc pass · npm test pass (535) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer skipped (one unused presentational file, no wizard or data surface) · rls-boundary-reviewer skipped
**changed:** new `static/pinned-event-bar.tsx` — 36px bar in `PinnedLineBar`'s register, `Swords` / inlined `BracketMark`, name + subline, hairline-separated facts via the existing formatters, blue `Change` only when `onChange` is given.
**follow-ups:** the bar inlines `BracketMark` because `static-event-chooser.tsx` keeps its copy private; a shared glyph module would remove the duplicate.

## T14 · Split `DualBuildStep` into a draft hook and two step bodies — done
**gate:** lint pass · tsc pass · npm test pass (535) · task-completion-reviewer `VERDICT: pass` (facts grid, lineup blocks, header and footer compared against HEAD — moved, not rewritten) · pipeline-guardrails-reviewer ran — no findings: format still travels as the chosen `FORMATS` row, seeds resolve through `formatFor`, labels re-resolve via `rosterIdsForLabels`, stale-fetch guard and `schoolKey` key verbatim · rls-boundary-reviewer skipped
**note:** the first attempt was cut off by an infrastructure error after deleting a few imports; that partial edit was reverted and the task re-run from a clean tree.
**changed:** `dual-build-step.tsx` exports `useDualDraft(school, initial?)`, `DualFactsStep`, `DualLineupStep`, with `DualBuildStep` composing them inside the existing frame; opponent rail deleted and the layout collapsed to one column; `DualDraftSeed`/`DualLineSeed` added for T19 (`surface: ""` and `forfeit: null` are honoured as stated values). A doc comment that spelled the dead encoding literally was reworded so the grep criterion holds. Copy spec retires `Opponent` and `· type to search all` with notes.
**follow-ups:** README §2 still credits the deleted left pane; `RAIL_SCHOOLS` in `fixtures.ts` now has no rendering counterpart.

## T15 · `NewDualFlow`: three steps on `WizardShell` with the pinned school — done
**gate:** lint pass · tsc pass · npm test pass (536) · task-completion-reviewer `VERDICT: pass` (draft survives a Change round trip; `useDualDraft` is never called conditionally) · pipeline-guardrails-reviewer ran — no findings: format literals unchanged into `createDual`, `src/components/dashboard/matches/` diff empty, labels still resolve via `rosterIdsForLabels` · rls-boundary-reviewer skipped
**changed:** new `static/new-dual-flow.tsx` — outer `NewDualFlow` owns `{step, school}`, inner `DualDraftFlow` keyed on the school holds `useDualDraft` and draws all three steps, so `Change` returns to step 1 without losing the draft and a different school reseeds. `static-dual-builder.tsx` and the `DualBuildStep` composite deleted; `dual-school-step.tsx` gains optional `onChoiceChange`; `dual/page.tsx` renders the flow inside `NewDualDataProvider`; copy spec `2b`/`2c` updated with a new `new-dual-flow.tsx` screen block; README §1–§3 corrected.
**follow-ups:** `dual-build-step.tsx`'s header comment still describes the single-frame builder. Some `2b` assertions are short substrings that pass off type names.

## T16 · `NewTournamentFlow`: two steps on `WizardShell`, one roster list — done
**gate:** lint pass · tsc pass · npm test pass (537) · task-completion-reviewer `VERDICT: pass` (`createTournament` payload byte-identical to HEAD; the field really is one list) · pipeline-guardrails-reviewer ran — no findings: format literals off the `FORMATS` row, `TournamentDraftSeed.format` is an opaque option name, `src/components/dashboard/matches/` diff empty, staff gate unchanged · rls-boundary-reviewer skipped (no query change)
**changed:** `static-tournament-builder.tsx` becomes `useTournamentDraft(roster, defaultSurface, initial?)` + `TournamentWeekendStep` + `TournamentFieldStep` (one roster list: ladder spot, name, draw select, seed cell); rail, entries table, `+` control, Big Ten callout and the composite deleted. New `static/new-tournament-flow.tsx` on `WizardShell` (2 steps, pinned bar on step 2). `tournament/page.tsx` rewired; copy spec `3c` retired/moved; README updated.
**follow-ups:** T20 wires `initial`. `TOURNAMENT_FIELD` in `fixtures.ts` still records the deleted rail. No search on the field list — a long roster is a long scroll.
