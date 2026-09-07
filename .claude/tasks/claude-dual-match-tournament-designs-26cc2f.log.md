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
