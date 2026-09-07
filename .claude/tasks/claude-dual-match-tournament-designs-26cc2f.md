# Tasks — claude/dual-match-tournament-designs-26cc2f

> Scope: the "Add an Event" designs — event chooser link, dual/tournament
> create flows on the wizard shell, dual/tournament event pages with rail,
> courtside score entry, and edit flows for both event kinds.

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

The design and the plan these tasks come from: canvas "Add an Event" (page
*Final*, frames 1–12) and `~/.claude/plans/sequential-waddling-riddle.md`
(2026-09-07). Copy that only the canvas holds is quoted inside the tasks that
need it.

## T1 · Chooser aside becomes a real link to the one-off match
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/static/static-event-chooser.tsx, tests/schedule-static-copy.spec.ts
- **done when:**
  - [ ] The aside renders a `next/link` `<Link href="/dashboard/team/schedule/new/single">` whose text is `Add a one-off match`; the inert `<span>` and the literal `Add it in Matches` no longer appear anywhere in the file, `COPY` included
  - [ ] The header comment no longer says the link is inert or names `/dashboard/matches/new` as the destination
  - [ ] In `tests/schedule-static-copy.spec.ts` the `3b` block asserts `'Add a one-off match'` and carries a `RETIRED 'Add it in Matches'` note giving the reason (it named a rail entry a team workspace does not have; `schedule-day-zero.tsx` already uses the new label)
  - [ ] `npx playwright test tests/schedule-static-copy.spec.ts` passes; the two cards, `Cancel`, `Continue`, `Dual selected`, `Tournament selected` assertions are untouched
- **notes:** Non-goals: no layout change, no `nav.ts` change, no change to `schedule-day-zero.tsx`.

## T2 · `opponentMeetings()` beside `opponentDualHistory`
- **status:** done
- **model:** sonnet
- **files:** src/lib/schedule/opponent-history.ts, tests/opponent-meetings.spec.ts (new)
- **done when:**
  - [ ] `opponent-history.ts` exports `opponentMeetings(schedule: ProgramSchedule, opponentName: string, options?: { excludeEventId?: string }): OpponentMeeting[]` and the type `OpponentMeeting = { eventId; startsOn; site; us; them; won: boolean | null }`; it is pure (no Supabase import, no `"use client"`) and reuses the module's private name normaliser rather than a second spelling
  - [ ] Only `kind === "dual"` events whose `dualScore(entries).decided` is true are returned, `excludeEventId` is dropped, and rows are sorted newest-first by comparing `startsOn` (not by trusting `schedule.events` order)
  - [ ] `won` is `null` on a level dual, consistent with how `opponentDualHistory` lets `played` exceed `us + them`
  - [ ] `tests/opponent-meetings.spec.ts` builds a `ProgramSchedule` by hand (won dual, lost dual, undecided dual, level dual, and a tournament whose `name` equals the opponent) and asserts the returned ids and order, that the tournament and the undecided dual are excluded, that `excludeEventId` works, and that `opponentDualHistory(...)`'s `us`/`them` equal the counts of `won === true` / `won === false` rows
- **notes:** Non-goals: no UI, no change to `opponentDualHistory`'s signature. Same file shape as `tests/weekend-dual-reads.spec.ts` (hand-built `ProgramEvent`/`EventEntry`).

## T3 · `getEventTeamTotals` loader with a pure summing core
- **status:** done
- **model:** opus
- **files:** src/lib/data/event-team-totals-server.ts (new), tests/event-team-totals.spec.ts (new)
- **done when:**
  - [ ] The module exports `sumTeamTotals(rows: TeamTotalRow[]): EventTeamTotals` (pure, no Supabase import) and `getEventTeamTotals(matchIds: string[]): Promise<EventTeamTotals>`; the query selects exactly `match_id, is_player1, first_serves, first_serves_in, first_serve_points_won, break_point_opportunities, break_points_converted, total_points, total_points_won` from `match_stats_with_percentages` with `.in("match_id", ids)`, and an empty `matchIds` returns without querying
  - [ ] `EventTeamTotals` is `{ ours: SideTotals; theirs: SideTotals; matchesCounted: number }` with `SideTotals = { firstServeInPct: number | null; firstServeWonPct: number | null; breakPoints: { converted: number; opportunities: number } | null; pointsWonPct: number | null }`; `is_player1 === true` rows are `ours`
  - [ ] Every ratio is `null` when its denominator sums to 0 (never `0`), and break points are returned as the fraction, not a percentage
  - [ ] The header comment states (a) that it sums raw counts over the event and why that deviates from `meanOfPresent` in `src/lib/data/aggregate.ts` (a weekend's totals are one pool of points; a career mean is not), and (b) why `is_player1` is our side here, citing `recordResult` and `EventPreset.playerName`; the JSDoc says the caller restricts ids to `isAnalysisReady` matches
  - [ ] The spec feeds hand-built rows for two matches × two sides and asserts all four figures per side against hand arithmetic, the null-on-zero rule, and `matchesCounted`
- **notes:** Non-goals: nothing rendered; the loader does not re-check match status.

## T4 · Move `presetFor` / `lineupChoices` into `src/lib/schedule/line-choices.ts`
- **status:** done
- **model:** sonnet
- **files:** src/lib/schedule/line-choices.ts (new), src/app/dashboard/team/upload/page.tsx, src/lib/data/schedule-server.ts, tests/line-choices.spec.ts (new)
- **done when:**
  - [ ] `line-choices.ts` exports `presetFor(event, entry, match, programs)` and `lineupChoices(event, entries, programs)` with the same signatures the upload page used privately; it has no `"use client"`, no Supabase import, and imports `EventPreset`/`LineChoice` with `import type` from `@/components/dashboard/matches/new-match-wizard/types`
  - [ ] `programNamesFor(ids)` is exported from `src/lib/data/schedule-server.ts` and `team/upload/page.tsx` contains no local copy of any of the three functions
  - [ ] The `?entry=` branch of `team/upload/page.tsx` builds the same preset: the diff shows the object literal's fields unchanged apart from moving into the module (the dead `.map((choice) => (event.kind === "dual" ? choice : choice))` may be deleted, noted in the commit)
  - [ ] `tests/line-choices.spec.ts` asserts: an entry with no player → `state: "unset"`, `preset: null`; a forfeited entry → `unset`; a scored line without video → `result`; a line with `hasVideo` → `video`; a doubles entry → `playerUserId: null`; slots are deduped and in `position` order
  - [ ] `npx tsc --noEmit` clean and `npm test` green
- **notes:** Non-goals: no behaviour change to the upload page. T11 is the second consumer.

## T5 · Event page primitives: frame, facts, format capsule, detail line, table card
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/event-page.tsx (new), src/lib/schedule/format.ts, tests/event-format-label.spec.ts (new)
- **done when:**
  - [ ] `format.ts` exports `formatLabel(format: EventFormat): string` producing `Best of 3 Sets · No-Ad Scoring`, `Best of 3 Sets · Ad Scoring`, `One Set · No-Ad Scoring`, `One Set · Ad Scoring` for the four `EVENT_FORMATS` rows and `Best of 3 Sets` (no scoring half) when `adScoring` is `null`; the spec pins all five strings
  - [ ] `event-page.tsx` exports `EventPageFrame` (container `px-14 pt-5 pb-8`, `<h1 className="text-display">` as the first child with no eyebrow above it, an `actions` slot on the title baseline, a `detail` slot, and a `grid grid-cols-[1fr_340px] gap-8` body with `children` + `rail`), `EventFacts` (Lucide `Calendar`, `MapPin`, `Rows3`, plus a custom `CourtGlyph` SVG path documented the way `BracketMark` is in `static-event-chooser.tsx`) with `FormatCapsule` (outlined `rounded-full border border-[var(--border-field)] h-[22px] px-2 text-[11px] text-[var(--ink-700)]`), `DetailLine` (score slot, optional `ResultMark`, optional grey filled capsule, then counts), and `TableCard` (`.surface-card`, `eyebrow-sm` header row, `GroupHead` row, 52px rows with `-mx-4 w-[calc(100%+32px)] px-4` hover wash as in `schedule-table.tsx`)
  - [ ] `grep -n "border-l" src/components/dashboard/schedule/event-page.tsx` returns nothing, and the only `var(--blue)` / `#3B82F6` occurrences are inside `DetailLine`'s single "need a file" count and `StatusChip tone="blue"`
  - [ ] Nothing imports `event-page.tsx` yet; `dual-detail.tsx` and `tournament-detail.tsx` are untouched; `npx tsc --noEmit` clean
- **notes:** Presentational only; every prop is data, no loader import. Non-goals: no page wiring.

## T6 · Rail widgets: Team totals and Head-to-head
- **status:** done
- **model:** sonnet
- **needs:** T2, T3
- **files:** src/components/dashboard/schedule/team-totals-widget.tsx (new), src/components/dashboard/schedule/head-to-head-widget.tsx (new)
- **done when:**
  - [ ] `TeamTotalsWidget({ totals: EventTeamTotals | null; coverage: { analyzed: number; total: number } })` draws the eyebrow `Team totals`, a header `{analyzed} of {total} lines`, and four rows — `First serve in`, `1st-serve points won`, `Break points`, `Points won` — each with ours / theirs values and a 4px two-segment bar (`#3B82F6` ours, `#64748B` theirs, widths proportional to the two values); break points print as `3/7`; a `null` value prints `—` and its bar is empty
  - [ ] `HeadToHeadWidget({ school; history: OpponentDualHistory; meetings: OpponentMeeting[]; opponentProgramId: string | null })` prints `formatOpponentRecord(history)`, one row per meeting (`formatEventDay(startsOn)` · `ResultMark won` · `us–them` with an en dash), `No previous duals` when empty, and the link `All matches with {school} →` to `/dashboard/opponents/{opponentProgramId}` **only** when the id is non-null; `grep -n '"/dashboard/opponents"' head-to-head-widget.tsx` returns nothing
  - [ ] Both widgets are server-renderable (no `"use client"`, no hooks) and accept the day-one inputs (`totals: null`, `meetings: []`, `history.played === 0`) without a separate empty layout
  - [ ] Neither file imports a loader; `npx tsc --noEmit` clean
- **notes:** Non-goals: no page wiring (T7).

## T7 · Dual event page on the new frame; the route reads the season
- **status:** done
- **model:** opus
- **needs:** T5, T6
- **files:** src/components/dashboard/schedule/dual-detail.tsx, src/app/dashboard/team/schedule/[eventId]/page.tsx, src/components/dashboard/schedule/line-row.tsx
- **done when:**
  - [ ] `page.tsx` reads `getProgramSchedule(active.id)` and `eventDetailFrom(schedule, eventId)` (not `getEventDetail`); for a dual it also computes `opponentHistoryFor(opponentDualHistory(schedule), event.name)`, `opponentMeetings(schedule, event.name, { excludeEventId: eventId })`, and `getEventTeamTotals(ids)` where `ids` are the matches with `isAnalysisReady(match.status)`; the tournament branch still renders `TournamentDetail` with its existing props
  - [ ] `DualDetail` renders `EventPageFrame` with `<h1>` text `vs {event.name}` first (no eyebrow), `EventFacts` (date, site, surface via `surfaceTitle`, `{entries.length} lines`, `FormatCapsule` from `formatLabel(event.format)`), and — for staff — a ghost `Edit dual` linking to `/dashboard/team/schedule/{eventId}/edit` plus one primary via `advButton("primary","md")` that reads `Add score` linking to `/dashboard/team/schedule/{eventId}/score` while any non-forfeited entry has `entryState === "empty"`, else `Upload match video` linking to `/dashboard/team/upload`
  - [ ] `DetailLine` shows `us–them` in `var(--ink-300)` until any point is on the board, then `ResultMark` + the grey `Final` capsule only when `dualScore().decided` (a grey `Not played` capsule before any point); counts: `N lines need a file` (the only item in blue, with an upload glyph, only when N > 0), `N analyzing` (`StatusChip tone="blue" live`), `N reports ready` (Lucide `Check`), derived from `entryState` over entries
  - [ ] One `TableCard` with headers `Line / Result / Match / Score / Status`, `GroupHead` rows `Singles · won {a} of 6 courts` and `Doubles · won {b} of 3` with ` — the team point is ours` appended when `b >= 2` and ` — the team point is theirs` when lost ≥ 2; rows rendered by the existing `LineRow` (which gains an optional `showSchool?: boolean`, default `true`); the old `Section`, the 40px score, and every `StatusChip` carrying a count are gone from `dual-detail.tsx`
  - [ ] Rail: `TeamTotalsWidget` with `coverage = lineCoverageFrom(entries)` and `HeadToHeadWidget` with `opponentProgramId` from the first entry carrying one; a dual with no matches renders the same components with dashes (no `if (empty) return <Other/>` branch)
- **notes:** The score and edit routes 404 until T11 and T19 land; expected within the branch. Non-goals: no tournament changes, no loader changes.

## T9 · `AddResultDialog`: pick an entry, then round and score
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/add-result-dialog.tsx (new), src/components/dashboard/schedule/add-result-row.tsx
- **done when:**
  - [ ] `add-result-row.tsx` exports `nextRound(entry)` (logic unchanged) and `add-result-dialog.tsx` exports a `"use client"` `AddResultDialog({ entries: EventEntry[]; open; onOpenChange })` built on `@/components/ui/dialog` with: an entry picker listing `entry.playerLabels.join(" / ")` (forfeited entries excluded), a round `<select>` over `ROUND_ORDER` defaulting to `nextRound(chosen)` recomputed on every open and on every entry change, and the existing `ScoreEntry` whose `onDone` closes the dialog and calls `router.refresh()`
  - [ ] Saving goes through `ScoreEntry` → `recordResult` only; the file contains no Supabase import
  - [ ] The dialog has an accessible title `Add result`; its primary is the `advButton("primary", ...)` Save that `ScoreEntry` already renders (amended 2026-09-07: `sm`, since `score-entry.tsx` is fenced off and a second primary would duplicate the save)
  - [ ] `npx tsc --noEmit` clean; no page imports it yet (T8 does)
- **notes:** Keep `ScoreEntry`'s single tiebreak cell as-is; its storage already passes two arrays. Non-goals: no change to `recordResult`.

## T8 · Tournament event page on the new frame
- **status:** done
- **model:** opus
- **needs:** T5, T6, T7, T9
- **files:** src/components/dashboard/schedule/tournament-detail.tsx, src/lib/schedule/tournament-run.ts (new), src/lib/schedule/format.ts, src/app/dashboard/team/schedule/[eventId]/page.tsx, tests/tournament-run.spec.ts (new)
- **done when:**
  - [ ] `tournament-run.ts` exports the pure `groupByDraw(entry)` (moved from the component, rule unchanged) and `runFinish(entry): string | null` — `null` with no matches; `out in {roundLongLabel(last)}` when the highest-ranked match was lost; `won the final` when `F` was won; otherwise `through {roundLongLabel(last)}`; `format.ts` exports `roundLongLabel(code)` mapping `ROUND_ORDER` codes (`QF` → `the quarter-final`, `SF` → `the semi-final`, `F` → `the final`, `R16` → `the round of 16`, `Q2` → `qualifying round 2`, `C1` → `consolation round 1`); the spec pins each mapping and the three `runFinish` shapes
  - [ ] `TournamentDetail` renders `EventPageFrame` with `<h1>` `{event.name}` first, `EventFacts` (date span via `formatEventSpanWithYear`, site, surface, `{entries.length} entries`, `FormatCapsule`), staff actions: primary `Add result` (opens T9's dialog) and ghost `Edit tournament` linking to `/dashboard/team/schedule/{eventId}/edit`; `DetailLine` shows the summed `runRecord` as `won–lost` plus the grey capsule `Across {played} matches` (an em dash and `No results yet` before any match), and the string `Final` does not appear in the file
  - [ ] One `TableCard`: per entry a `GroupHead` with the name at 13px/500 and the subline `Seed {n} · {won}–{lost} · {runFinish}` (`Qualifier` in place of the seed when the entry's draw is qualifying; `Main draw · no matches yet` when nothing is played; null segments omitted), round rows via `LineRow` with `label={match.round}` and `showSchool={false}`, and an `eyebrow-sm` draw divider row only when `groupByDraw` yields more than one draw; `grep -n "bg-\[var(--blue)\]" tournament-detail.tsx` returns nothing (the left stripe is gone); the inline `AddResultRow` under each entry is removed
  - [ ] Rail: `TeamTotalsWidget` (same inputs as the dual) and a `SchoolsFaced` block listing each distinct `entry.opponentSchool` with W–L summed from `runRecord` over the entries that name it, each row a link to `/dashboard/opponents/{entry.opponentProgramId}` only when the id exists, with a code comment stating the school is per entry (last `recordResult`), not per match; nothing links to `/dashboard/opponents`
  - [ ] `page.tsx`'s tournament branch passes `totals`; `npm test` green including the new spec
- **notes:** Non-goals: no dual changes.

## T10 · Extract `ScoreBlock` out of `DetailsStepContent` (mechanical)
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx (new), src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx, src/components/dashboard/matches/new-match-wizard/index.ts
- **done when:**
  - [ ] `ScoreBlock.tsx` contains, moved verbatim, `ScoreBlock`, `ScoreInput`, `CELL_CLS`, `isTiebreakSet`, `FORMAT_OPTIONS` and `Required`, exporting all of them; `DetailsStepContent.tsx` imports what it still uses and its diff consists only of deletions and import lines
  - [ ] `ScoreBlock`'s `formData` prop is typed `Pick<FormData, "bestOf" | "adScoring" | "playerScores" | "opponentScores" | "playerTiebreaks" | "opponentTiebreaks" | "numberOfSets">` and `onScoreChange`/`onTiebreakChange` are typed inline as `(player: "player" | "opponent", index: number, value: string) => void`, so the block no longer depends on `DetailsStepContentProps`
  - [ ] `git diff HEAD -- src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts src/lib/services/splitstep/` is empty, and `grep -n "initialTopPlayerIsPlayer1\|fixedCamera\|adScoring" ScoreBlock.tsx` shows `adScoring` used only for the read-back label
  - [ ] `index.ts` exports `ScoreBlock`; `npx tsc --noEmit` and `npm run lint` clean (no new warnings)
- **notes:** For `pipeline-guardrails-reviewer`: before — `ScoreBlock` reads `formData.adScoring` to print ` · ad`/` · no-ad`, never writes it; after — identical, one file over. Set-score arrays pass through unchanged; the top-player reorder still happens in `job-request.ts` at submit. Non-goals: no behaviour change.

## T11 · Score-only entry route under the event
- **status:** done
- **model:** opus
- **needs:** T4, T10
- **files:** src/app/dashboard/team/schedule/[eventId]/score/page.tsx (new), src/components/dashboard/schedule/score-only-flow.tsx (new), src/lib/schedule/score-seed.ts (new), src/lib/dashboard/nav.ts, MAP.md, src/components/dashboard/schedule/README.md, tests/score-seed.spec.ts (new), tests/schedule-leaf.spec.ts (new)
- **done when:**
  - [ ] `score/page.tsx` mirrors `team/upload/page.tsx:117`: no workspace → `/login`, non-team → `/dashboard`, non-staff → `redirect("/dashboard/team/schedule/{eventId}")`; it reads `getProgramSchedule` + `eventDetailFrom`, resolves `?entry=` (defaulting to the first entry with `entryState === "empty"`), builds `preset` and `lineup` via `presetFor`/`lineupChoices` from T4, and renders `<ScoreOnlyFlow preset lineup eventHref />`
  - [ ] `score-seed.ts` exports pure `seedScoreForm(preset: EventPreset): ScoreFormState` and `toRecordResultInput(preset, state): RecordResultInput`; the spec asserts a preset with `score` seeds its sets and blanks its tiebreaks, a preset without seeds `bestOf`-length nulls, and that `toRecordResultInput` sends game counts in `ourGames`/`theirGames` and points in `ourTiebreaks`/`theirTiebreaks` (a 7–6(5) set → `7`, `6`, `null`, `5`), `round` = `preset.round` for a tournament and `null` for a dual
  - [ ] `ScoreOnlyFlow` renders `StepIndicator` (1 of 1), `PinnedLineBar` with `onSwitch` setting the current preset, the eyebrow `Line {n} of {total}`, the title `The score.` and lede `Type it the way you would say it. The winner comes from the numbers, so there is nothing else to tick.`, `ScoreBlock` from T10 plus an underline opponent-name input prefilled from `preset.opponentName`, and a sticky 64px footer: `Cancel` → `eventHref`, status `{n} lines still need a score`, ghost `Save and close`, primary `Save and next line` (label falls back to `Save and close` when no other `LineChoice` with `state === "open"` exists); **the score form is remounted on every preset switch** (`key={preset.entryId}` on the form component, state initialised from `seedScoreForm`), so switching lines never carries the previous line's digits
  - [ ] Saving calls only `recordResult` (`grep -n "supabase\|useUploadMatchWizard\|localStorage" score-only-flow.tsx` returns nothing); on success `Save and next line` moves to the next `open` choice after the current one (wrapping) and `Save and close` does `router.push(eventHref)`; an `ActionError` is printed in the footer status slot
  - [ ] `scheduleLeaf()` returns `Add score` for paths matching `^/dashboard/team/schedule/[^/]+/score$` (a regex branch beside the exact-path map), pinned by `tests/schedule-leaf.spec.ts`; `tests/header-slot.spec.ts` still passes; `npm run map` was run and `MAP.md` lists `/dashboard/team/schedule/[eventId]/score`; `README.md` §1 gains the route row
- **notes:** The reseed is the highest-risk detail in the feature. Doubles lines are scoreable here (no video); forfeited lines are excluded from the lineup walk. Non-goals: no draft persistence, no change to `dashboard-shell.tsx`, nothing added to `TEAM_NAV`/`DESTINATIONS`.

## T12 · Extract `WizardShell` + `useWizardKeys`; `UploadMatchWizard` consumes them
- **status:** todo
- **model:** fable
- **files:** src/components/dashboard/matches/new-match-wizard/WizardShell.tsx (new), src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts (new), src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, src/components/dashboard/matches/new-match-wizard/index.ts
- **done when:**
  - [ ] `WizardShell.tsx` exports `CONTENT_CLS` (the exact string from `UploadMatchFlow.tsx:57`) and `WizardShell` with props `{ stepIndex; stepCount; title; description; pinned?: ReactNode; contentRef?; contentKey?; contentClassName?; back?: () => void; cancelHref?: string; meter?: ReactNode; status?: ReactNode; secondary?: ReactNode; continueLabel: string; onContinue: () => void; continueDisabled: boolean; children }`, rendering the full-bleed `StepIndicator`, the `pinned` slot, the `${CONTENT_CLS} pb-10 pt-16` column with the `eyebrow-sm` `Step N of M`, the 30px light title and lede, the keyed `animate-fadeIn` content, and the sticky 64px footer (Back or Cancel `Link` · meter · status · spacer · secondary · primary `advButton("primary","md")` carrying `data-wizard-continue`)
  - [ ] `useWizardKeys({ contentRef, canGoBack, onBack, continueDisabled, onContinue })` contains the keydown effect from `UploadMatchFlow.tsx:890-977` and `isFormControl` moved verbatim (capture phase, `aria-expanded` guard, ⌘/Ctrl+Enter focus walk with the chord pulse, Esc back only when `canGoBack`)
  - [ ] `UploadMatchFlow.tsx` no longer defines `CONTENT_CLS`, `isFormControl` or the keydown effect, and the four `<…StepContent>` blocks and the `FooterMeter`/status/`Save draft` nodes are passed through the shell's slots with identical props (a diff of those JSX blocks is whitespace-only)
  - [ ] `git diff HEAD -- src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts src/lib/services/splitstep/ src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx` is empty; `npx tsc --noEmit`, `npm run lint`, `npm test` clean
  - [ ] `index.ts` exports `WizardShell`, `CONTENT_CLS`, `useWizardKeys`
- **notes:** For `pipeline-guardrails-reviewer`: the shell owns chrome only; `fixedCamera`, `initialTopPlayerIsPlayer1` and `adScoring` are still collected by `TrimStepContent`/`DetailsStepContent` with the same handlers, and `continueDisabled` is computed exactly where it was. Non-goals: no change to step order, drafts, quota meter, or copy.

## T13 · `PinnedEventBar` for the create flows
- **status:** todo
- **model:** sonnet
- **needs:** T5
- **files:** src/components/dashboard/schedule/static/pinned-event-bar.tsx (new)
- **done when:**
  - [ ] Exports `PinnedEventBar({ kind: "dual" | "tournament"; name: string; subline?: string | null; date?: string | null; endDate?: string | null; site?: EventSite | null; format?: EventFormat | null; onChange?: () => void })`, a 36px `border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]` bar in `PinnedLineBar`'s register: Lucide `Swords` or the `BracketMark` path, the name at 12px/500 with the subline in `ink-500`, then hairline-separated 11px facts (`Calendar` + date or span, `MapPin` + `siteLabel`, `formatLabel` when given), a spacer, and a blue 11px `Change` button calling `onChange` (omitted when `onChange` is absent)
  - [ ] Facts whose prop is null or undefined are not rendered (no `—` placeholders in the bar)
  - [ ] No Popover, no lineup menu; `npx tsc --noEmit` clean; nothing imports it yet
- **notes:** Non-goals: not a replacement for `PinnedLineBar`. The absent-`onChange` form is what the edit flow (T19) uses to pin an opponent that cannot change.

## T14 · Split `DualBuildStep` into a draft hook and two step bodies (route keeps working)
- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/schedule/static/dual-build-step.tsx, tests/schedule-static-copy.spec.ts
- **done when:**
  - [ ] `dual-build-step.tsx` exports `useDualDraft(school: ChosenSchool, initial?: DualDraftSeed)` (owning `draft`, `lines`, `pool`/roster fetch, `editOurLabels`, `editTheirLabels`, `setForfeited`, `edit`, `lineCount`, `opponentName`, `submit`, `pending`, `error`), `DualFactsStep({ draft, onEdit })` (the Date/Site/Surface/Format `FieldCell`/`FieldSelect` grid), and `DualLineupStep({ lines, pool, ... })` (the two `LineupBlock`s with the forfeit note); `DualBuildStep({ school })` still exists as a composition of the three inside the existing frame so `static-dual-builder.tsx` and the route are unchanged
  - [ ] The opponent rail (`RailRow`, `railSubline`, the drawn search field, the conference list) is deleted from the file; `useNewDualData()`'s `conferencePrograms`/`historyEntries` are no longer read in this file
  - [ ] `submit()` still passes `bestOf: draft.format.bestOf` and `adScoring: draft.format.adScoring` from the chosen `FORMATS` row; `grep -n 'split("|")\|=== "true"' dual-build-step.tsx` returns nothing
  - [ ] In the copy spec's `2b` block, `'Opponent'` and `'· type to search all'` are retired with a note (the rail left with the design); every other `2b` `drawn()` still passes; `npm test` green
- **notes:** Keep the `schoolKey` row-key contract and the stale-fetch guard verbatim (README §4). `DualDraftSeed` is optional now and used by T19. Non-goals: no new shell, no copy for steps 2/3 yet.

## T15 · `NewDualFlow`: three steps on `WizardShell` with the pinned school
- **status:** todo
- **model:** opus
- **needs:** T12, T13, T14
- **files:** src/components/dashboard/schedule/static/new-dual-flow.tsx (new), src/components/dashboard/schedule/static/static-dual-builder.tsx (delete), src/components/dashboard/schedule/static/dual-school-step.tsx, src/components/dashboard/schedule/static/dual-build-step.tsx, src/app/dashboard/team/schedule/new/dual/page.tsx, tests/schedule-static-copy.spec.ts, src/components/dashboard/schedule/README.md
- **done when:**
  - [ ] `new-dual-flow.tsx` holds `{ step: 1 | 2 | 3; school: ChosenSchool | null }` and renders `WizardShell` with `stepCount={3}`: step 1 `DualSchoolStep` (its own frame, eyebrow `New dual · step 1 of 2` and footer removed — the shell draws `Step 1 of 3`, the title and the footer; `onContinue` sets the school and advances), step 2 `DualFactsStep`, step 3 `DualLineupStep`, with `pinned={<PinnedEventBar kind="dual" …/>}` on steps 2–3 (date/site facts appear once entered) whose `Change` returns to step 1 keeping the draft
  - [ ] Titles and ledes appear verbatim: step 1 `Who are you playing?` / `The school decides the lineup you fill in later. Pick a program, or type any opponent the directory never had.`; step 2 `When it's played, and how.` / `Four facts the whole dual inherits. Every one of the nine lines is created under them.`; step 3 `The lineup.` / `Six singles and three doubles. Your side is seeded from the ladder — type over a name to put a sub on.`
  - [ ] Continue gating: step 1 until a school is chosen; step 2 until `draft.date` is non-empty; step 3 label `Create dual`, disabled while `lineCount === 0` or `pending`; footer status prints `Creates {n} line(s) vs {school}` on step 3 and `createDual`'s `ActionError` when set; Back on steps 2–3, `Cancel` → `/dashboard/team/schedule` on step 1; `useWizardKeys` wired
  - [ ] `static-dual-builder.tsx` is deleted, `dual/page.tsx` renders `<NewDualFlow />` inside `NewDualDataProvider`, and no file under `src/` imports `StaticDualBuilder` or `DualBuildStep`
  - [ ] The copy spec's `2c` block retires `'New dual · step 1 of 2'`, `'Cancel'`, `'Continue'`, `'· date, site and lineup come next'` with notes, and reads the footer strings from `new-dual-flow.tsx`; `npm test` green; `README.md` §1 row for `/new/dual` names the new files
- **notes:** No drafts/localStorage — nothing to add to `dashboard-shell.tsx`. Non-goals: no tournament changes, no edit mode yet (T19).

## T16 · `NewTournamentFlow`: two steps on `WizardShell`, one roster list
- **status:** todo
- **model:** opus
- **needs:** T12, T13
- **files:** src/components/dashboard/schedule/static/static-tournament-builder.tsx, src/components/dashboard/schedule/static/new-tournament-flow.tsx (new), src/app/dashboard/team/schedule/new/tournament/page.tsx, tests/schedule-static-copy.spec.ts, src/components/dashboard/schedule/README.md
- **done when:**
  - [ ] `static-tournament-builder.tsx` exports `useTournamentDraft(roster, defaultSurface, initial?)` (draft, `entered` map keyed by `userId`, `enter`/`remove`/`amend`, `field`, `submit`, `pending`, `error`) plus `TournamentWeekendStep` (Name, Starts, Ends, Site, Format cells) and `TournamentFieldStep`: **one** list over `roster` where each row shows the player, ladder spot, a draw `<select>` (`—`, `Main draw`, `Qualifying`) and a seed input on the same row — choosing a draw enters the player, `—` removes them, the seed is editable only once entered; the separate entries table, `RosterRail`, `RailRow`, the `+` add control and the `3 Big Ten programs` callout are gone
  - [ ] `new-tournament-flow.tsx` renders `WizardShell` `stepCount={2}` with `PinnedEventBar kind="tournament"` on step 2 (name, date span, site, format); titles and ledes verbatim: step 1 `The weekend.` / `Name it, say when and where. A tournament holds entries rather than lines — the field comes next.`; step 2 `The field.` / `Add players from the roster. An entry says where they start, not what they'll play.`
  - [ ] Continue gating: step 1 until `name.trim()` and both dates are non-empty; step 2 label `Create tournament`, disabled while `field.length === 0` or `pending`; status `Creates {n} entr(y|ies) and no matches — a match exists once it's played`; `submit()` passes `bestOf`/`adScoring` from the chosen `FORMATS` row and `adScoring` stays typed `boolean`
  - [ ] `tournament/page.tsx` renders `<NewTournamentFlow roster defaultSurface />`; no file imports `StaticTournamentBuilder`
  - [ ] The copy spec's `3c` block retires `'Roster'`, `'Add a player to the field'`, the rail state lines, `'Entries · singles'`, `'added from the roster'` and the Big Ten callout with notes, keeps the field/format/draw/seed strings (pointing at whichever file now draws each); `npm test` green
- **notes:** Non-goals: no doubles entries, no host cell, no edit mode yet (T20).

## T18 · `updateDual` / `updateTournament` server actions with a pure reconcile plan
- **status:** todo
- **model:** opus
- **files:** src/lib/schedule/actions.ts, src/lib/schedule/entry-plan.ts (new), tests/entry-plan.spec.ts (new)
- **done when:**
  - [ ] `entry-plan.ts` exports the pure `planEntryChanges(existing: EventEntry[], incoming: LineupLineInput[] | TournamentEntryInput[]): { insert; update; refuse: { slot: string; reason: string }[] }`, keyed by entry id where the incoming row carries one and by slot otherwise; any existing entry that has a match or a forfeit is never in `insert`/`update` with a changed player, label, draw or seed — a changed one lands in `refuse` naming the slot; an existing entry absent from `incoming` lands in `refuse` (never deleted) when it has a match or forfeit, and is otherwise deleted
  - [ ] `tests/entry-plan.spec.ts` pins: unchanged entries produce no update; a renamed unplayed line updates; a renamed played line refuses; a dropped played line refuses; a dropped unplayed line deletes; a new slot inserts
  - [ ] `actions.ts` exports `updateDual(input: UpdateDualInput)` and `updateTournament(input: UpdateTournamentInput)` (`{ eventId } & CreateDualInput minus opponent` / `& CreateTournamentInput`), each behind `requireStaff()`, refusing an event of the other kind or another program, updating `program_events` (date/span, site, `surface || null`, `format: { best_of, ad_scoring }` from the chosen row) and applying the plan; a non-empty `refuse` returns an `ActionError` naming the first slot and writes nothing
  - [ ] Both call `revalidatePath("/dashboard/team/schedule")` and `revalidatePath("/dashboard/team/schedule/{eventId}")`; `npm test` green; `npx tsc --noEmit` clean
- **notes:** Never touch `matches` rows here; the opponent of a dual is not editable through this action. `rls-boundary-reviewer` runs on this task.

## T19 · Dual edit route on the same flow
- **status:** todo
- **model:** opus
- **needs:** T15, T18
- **files:** src/app/dashboard/team/schedule/[eventId]/edit/page.tsx (new), src/components/dashboard/schedule/static/new-dual-flow.tsx, src/components/dashboard/schedule/static/dual-build-step.tsx, src/lib/dashboard/nav.ts, MAP.md, src/components/dashboard/schedule/README.md, tests/schedule-leaf.spec.ts
- **done when:**
  - [ ] `edit/page.tsx` is staff-gated like the create routes, reads `getProgramSchedule` + `eventDetailFrom`, `notFound()`s a missing event, and for a dual renders `<NewDualFlow mode="edit" event={detail} />` inside `NewDualDataProvider` (the tournament branch renders T20's component, or a `notFound()` until T20 lands)
  - [ ] In `mode="edit"` the flow opens at step 2 with `useDualDraft`'s `initial` seeded from `EventDetail` (date, site, surface, format, and the nine lines with their ids), the school pinned via `PinnedEventBar` with no `Change`, step 1 unreachable, lines whose entry has a match or forfeit rendered read-only with a `Played` / `Forfeited` micro in place of the inputs, and the step 3 primary reading `Save changes`, calling `updateDual` and navigating to `/dashboard/team/schedule/{eventId}` on success; an `ActionError` prints in the footer status
  - [ ] `scheduleLeaf()` returns `Edit` for `^/dashboard/team/schedule/[^/]+/edit$`, pinned in `tests/schedule-leaf.spec.ts`; `npm run map` was run and `MAP.md` lists the route; `README.md` §1 gains the row
  - [ ] T7's `Edit dual` ghost now resolves; `npm test` green
- **notes:** Non-goals: no tournament edit (T20).

## T20 · Tournament edit mode
- **status:** todo
- **model:** opus
- **needs:** T16, T18, T19
- **files:** src/components/dashboard/schedule/static/new-tournament-flow.tsx, src/components/dashboard/schedule/static/static-tournament-builder.tsx, src/app/dashboard/team/schedule/[eventId]/edit/page.tsx
- **done when:**
  - [ ] `NewTournamentFlow` accepts `mode="edit"` and `event`, opens at step 1 with `useTournamentDraft`'s `initial` seeded from `EventDetail` (name, dates, site, format, and the entered field with ids, draws and seeds), the pinned bar showing the tournament with no `Change`
  - [ ] In `TournamentFieldStep`, an entry whose entry has a match cannot be removed (its draw select is disabled with a `Played` micro) but its seed stays editable; new players can still be entered
  - [ ] The step 2 primary reads `Save changes`, calls `updateTournament`, and navigates to the event page on success; an `ActionError` prints in the footer status
  - [ ] `edit/page.tsx`'s tournament branch renders it; T8's `Edit tournament` ghost resolves; `npm test` green
- **notes:** Non-goals: no change to `updateTournament`'s rules.

## T17 · Docs sweep for the new route set
- **status:** todo
- **model:** sonnet
- **needs:** T11, T15, T16, T19
- **files:** src/components/dashboard/schedule/README.md, CLAUDE.md, MAP.md
- **done when:**
  - [ ] `README.md` §1's route table lists `/dashboard/team/schedule/[eventId]/score` and `/dashboard/team/schedule/[eventId]/edit` and names the files each route renders (`new-dual-flow`, `new-tournament-flow`, `event-page`, the two widgets, `score-only-flow`); §3 no longer lists deleted files (`static-dual-builder.tsx`) and §4's `createDual` bullet points at `useDualDraft`
  - [ ] `CLAUDE.md`'s Routes bullet for `dashboard/team/{…}` mentions `schedule/[eventId]/score` and `schedule/[eventId]/edit`
  - [ ] `npm run map` produces no diff (`tests/generate-map.spec.ts` green)
- **notes:** Non-goals: no code.
