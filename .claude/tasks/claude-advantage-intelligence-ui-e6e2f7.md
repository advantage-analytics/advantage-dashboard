# Tasks — claude/advantage-intelligence-ui-e6e2f7

> Scope: Advantage Intelligence UI polish on the match page's Statistics view — the generated summary's length, statistic → Video-tab click-through, cursor-following chart tooltips, and the in-progress upload panel.

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

## T1 · Lengthen the Advantage Intelligence summary the generator writes

- **status:** done
- **model:** fable
- **files:** supabase/functions/generate-insights/index.ts (prompt at ~line 351), tests/generate-insights-prompt.spec.ts (new, guess — or a new case in tests/generate-insights-guards.spec.ts), tests/insight-text.spec.ts, src/components/dashboard/matches/match-detail/report-insight-card.tsx (doc comment only)
- **done when:**
  - [ ] In `supabase/functions/generate-insights/index.ts` the `summary` instruction no longer reads "a short paragraph of 2-3 sentences, under 350 characters in total" and instead asks for "4-5 sentences, under 600 characters in total", keeping the existing rules unchanged (first sentence is the single most important takeaway; the rest is evidence and what to focus on next; no greeting, no markdown, no bullet list, no restating raw numbers as a list). The strengths/weaknesses instruction, the `responseSchema`, `temperature`, the model URL and the comparison-context block are byte-identical to before.
  - [ ] An offline Playwright spec (pattern: `tests/generate-insights-guards.spec.ts` — transpile `index.ts` with `ts.transpileModule`, run in `runInNewContext` with a stubbed `createClient`) captures the Gemini request body via a `fetch(url, init)` stub, parses `contents[0].parts[0].text`, and asserts the prompt contains `4-5 sentences` and `under 600 characters` and does not contain `350`. (The existing guards stub is `fetch: async (url)` and discards `init`; the new spec must read `init.body`.)
  - [ ] `tests/insight-text.spec.ts` gains a case with a five-sentence summary (≥ 450 characters, including one decimal like "1.5") asserting `splitInsight` returns the first sentence as `claim` and the remaining four as `evidence` — proving the card's claim/evidence split needs no change for the longer text.
  - [ ] `report-insight-card.tsx` still has no `line-clamp`, `truncate`, `maxLength` or `slice(` on the expanded variant's claim or evidence (the only `truncate` in the file remains the collapsed F3 claim line), and the `InsightExpanded` doc comment's "a 2–3 sentence summary sets as a line or two" is updated to the new sentence count.
  - [ ] `src/components/dashboard/home/focus-card.tsx`, `src/components/dashboard/team/player-profile/last-match-card.tsx` and `src/components/dashboard/schedule/single-detail.tsx` are not in the diff.
- **notes:** This is a prompt-only change: the expanded card already renders the whole `meta.summary` (trace: `matches.insights.player{1,2}.summary` → `match-detail-server.ts` → `sides.pick` in `page.tsx:186-191` → `MatchReportProvider summary` → `meta.summary` → `splitInsight`). The current cap is the prompt's "2-3 sentences, under 350 characters"; 4-5 / 600 was confirmed by the author 2026-09-27. The Home Focus card does not read this summary. The share page `/m/[token]` draws the same `MatchReportInsight`; `schedule/single-detail.tsx` shows the full string unclamped at `max-w-[640px]`; `player-profile/last-match-card.tsx` clips via `splitClaim` (CLAIM_MAX 64, BODY_MAX 170), so a longer summary is clipped harder there, never overflows. Summaries are written once at upload — existing matches keep their current text; regenerating stored insights is out of scope. The function is deployed separately: `supabase functions deploy generate-insights` (repo == deployed at insights v24). Guardrails §2: the summary is customer-facing text — the prompt must keep naming no vendor (do not add "SplitStep"/"SwingVision"). §4: the prompt speaks of Player 1/Player 2; which one the viewer sees is decided only by `sides.pick` in `page.tsx` — do not touch that.

## T2 · Add a "watch this cut" intent from the report into the Video tab

- **status:** done
- **model:** fable
- **files:** src/components/dashboard/matches/match-detail/match-report-context.tsx, src/components/dashboard/matches/match-detail/film/film-tab.tsx, a new src/components/dashboard/matches/match-detail/film-cut-context.tsx (pattern: film-head-context.tsx), tests/film-cut-intent.spec.ts — guess
- **done when:**
  - [ ] `MatchReportActions` gains `watchCut(cut: Partial<FilmFilters>)` which, like `watchPoint`, pushes `?tab=film` through `window.history.pushState` and stores the cut in a context that `MatchReportProvider` provides; it is a no-op when `meta.hasPlayableVideo` is false
  - [ ] `FilmRoom` reads the pending cut through an optional hook that returns null outside a provider (the playback harness mounts the tab bare — `usePublishFilmHead` is the precedent), and on receiving one sets `filters` to `{ ...DEFAULT_FILM_FILTERS, ...cut }` so `filteredPoints` is `applyFilmFilters(points, thatCut, youIsPlayer1)`
  - [ ] The pending cut is consumed once: it is cleared after it is applied, so leaving and re-entering the Video view keeps whatever filters the viewer set since rather than re-applying the cut
  - [ ] After applying, the shell player seeks to the first admitted point's stop (`stops`/`walkStops`) and `pointFocus` is set to hold that point; when the cut admits no points the filters still apply and the player does not seek
  - [ ] `serializeCut`/`parseCut` are unchanged (only `cut=` and `serve=` reach the URL — the Advanced axes are deliberately kept out), and an offline Playwright spec covers the pure merge/consume helper
- **notes:** Shared plumbing for T3/T5. Keep the film subtree free of a hard dependency on `useMatchReport()` (film-tab.tsx header comment). Guardrails §4: the cut's `outcome`/`server` axes are you/opp-relative and `applyFilmFilters` already resolves them via `youIsPlayer1`; nothing new may decide sides. `/m/[token]` renders `hasPlayableVideo={false}` so the share page is untouched. Decision: seek the shell player rather than open the fullscreen room (which is what `watchPoint` does via `fullscreen=1`) — the author saw this and did not flip it.

## T3 · Head-to-head rows open their points in the Video tab

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/components/dashboard/matches/match-detail/head-to-head-card.tsx, tests/head-to-head-cuts.spec.ts — guess
- **done when:**
  - [ ] `H2HRowConfig` gains an optional `cut: Partial<FilmFilters>` and at minimum these rows carry one: Aces → `{ serve: ["ace"] }`, Double faults → `{ serve: ["double-fault"] }`, First serve points won → `{ ball: "first" }`, Second serve points won → `{ ball: "second" }`, Break points saved → `{ pressure: "break" }`, Winners → `{ result: ["winner"] }`, Unforced errors → `{ result: ["unforced"] }`; rows whose statistic has no point-level equivalent (e.g. Service games won) carry none
  - [ ] Each value cell of a row with a `cut` is a `<button>` that calls `actions.watchCut` with the row's cut plus the cell's side — `server: "you" | "opp"` for the serve rows, `outcome: "you" | "opp"` for the result rows — only when `meta.hasPlayableVideo` is true; otherwise the cell renders exactly as today (no button, no pointer cursor)
  - [ ] Rows without a `cut`, and the em-dash "no data" cells, are not clickable in either case
  - [ ] The hover readout (`RowTooltip`) gains a last line reading "Watch in Video" only when the row is clickable
  - [ ] An offline spec asserts every configured `cut` uses only keys of `DEFAULT_FILM_FILTERS` and that the mapping table is exactly the one above
- **notes:** Intent 3, first wiring. The head-to-head card only renders when `meta.statsPublished` (statistics-view.tsx), so a timeline-only match never reaches this. Aggregates on a derived match are approximate (page.tsx comments) — the cut shows the points the filter model admits, not a reconstruction of the aggregate; the counts may differ and that is acceptable.

## T4 · Add a `rallyMax` axis to the film filter model

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/film/filters/types.ts, src/components/dashboard/matches/match-detail/film/film-advanced-panel.tsx, tests/film-filters-model.spec.ts — guess
- **done when:**
  - [ ] `FilmFilters` gains `rallyMax: number | null` (default `null`), and `applyFilmFilters` rejects a point whose `rallyLength` exceeds it, alongside the existing `rallyMin` test (points with `rallyLength === 0` stay excluded from any bounded range, as rally-length-card.tsx treats them)
  - [ ] `hasActiveFilmFilters`, `filmFiltersEqual`, `describeFilmCut` (e.g. "rallies of 1–4 shots" when both bounds are set, "rallies of 9+ shots" when only the min is) and `FILM_FILTER_SECTIONS.rally.keys` all account for the new axis
  - [ ] The Advanced panel's Rally section still renders and applies without error with the new key present (either exposes a max control or ignores the key — say which in the diff)
  - [ ] `tests/film-filters-model.spec.ts` gains cases for the bounded range and passes with the rest of the offline project
- **notes:** Mechanical half of intent 3's "other widgets": the rally-length card's Short (1–4) and Medium (5–8) bands cannot be expressed with `rallyMin` alone. Does not touch the URL cut (`parseCut`/`serializeCut`).

## T5 · Rally, point-endings and performance-tracker widgets open their points in the Video tab

- **status:** done
- **model:** opus
- **needs:** T2, T4
- **files:** src/components/dashboard/matches/match-detail/rally-length-card.tsx, src/components/dashboard/matches/match-detail/point-endings-card.tsx, src/components/dashboard/matches/match-detail/performance-tracker-chart.tsx, src/components/dashboard/matches/match-detail/chart-tooltip.tsx — guess
- **done when:**
  - [ ] Rally-length bands: clicking (or Enter on) a band calls `actions.watchCut` with `{ rallyMin, rallyMax }` for Short `{1, 4}`, Medium `{5, 8}`, Long `{9, null}`, only when `meta.hasPlayableVideo`
  - [ ] Point-endings segments: clicking a segment calls `watchCut` with, for the viewer's row, Winners `{ result: ["winner"], outcome: "you" }`, Unforced `{ result: ["unforced"], outcome: "opp" }`, Double faults `{ serve: ["double-fault"], server: "you" }`, Aces `{ serve: ["ace"], server: "you" }`, and the sides swapped for the opponent's row; only when `meta.hasPlayableVideo`
  - [ ] Performance tracker: clicking the chart while a point is hovered calls the existing `actions.watchPoint(hoveredPoint.id)` (no new cut needed), only when `meta.hasPlayableVideo`
  - [ ] The `ChartTooltip` readouts on the rally bands and point-endings segments gain a last line "Watch in Video" only when the element is clickable; without video the three widgets render byte-identical markup to today
  - [ ] `npx tsc --noEmit` and the offline Playwright project pass
- **notes:** Intent 3's "same with other widgets on hover" is read as: the hover readout advertises the click-through and the hovered element takes the click — hovering alone must never move the video. Guardrails §4: sides come from `useMatchSides()` as these cards already do. `cursor-default` on the rally bands becomes a pointer only in the clickable state.

## T6 · Match page's uploading state mirrors the wizard's "Uploading your video"

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/match-analysis-progress.tsx, src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx, a new shared copy module (e.g. src/components/dashboard/matches/upload-progress-copy.ts), src/components/dashboard/shared/vertical-steps.tsx (import only) — guess
- **done when:**
  - [ ] When `analysis.status === "uploading"`, `MatchAnalysisProgress` renders the headline "Uploading your video" and a `VerticalStep` list of exactly three steps — "Match saved" (done), "Uploading video" (now, `value` = `NN%` from `analysis.uploadPercent`), "Analysis" (later) — in place of the four-milestone track
  - [ ] The "Uploading video" step body is an `AnalysisProgressTrack` (`live`, `label="Video upload"`) followed by the ETA from `formatEta(uploadEtaSeconds(...))` when available, then the two notes "Keep this tab open until the upload finishes." and "You can keep using the dashboard."
  - [ ] Those title, step-label and note strings live in one module imported by both `UploadMatchSuccess.tsx` and `match-analysis-progress.tsx`, so the wizard's `successView` uploading branch reads them from there and the two surfaces cannot drift
  - [ ] Every other status (`uploaded`, `queued`, `processing`, `deriving`, `processed`, failed states, the submit-stalled notice) renders as it does today, and `ANALYSIS_LABEL.uploading` stays "Uploading" for the matches list
  - [ ] `useLiveMatchAnalysis` gating and the `isWorking`/`isLiveUpdating` reads are untouched, and `npx tsc --noEmit` passes
- **notes:** Intent 4. Guardrails §3.3: keep `page.tsx`'s `isInFlight || isAnalysisFailed` short-circuit; §3.2: do not collapse the three predicates; §3.5: the progress panel's appearance is free to redesign. The wizard's "Preparing your video"/"Trimming video" variant is client-local (`progress.stage`) and cannot be known from the DB, so the match page only ever shows the uploading wording. The job-record `<dl>` (Video/Window/Job facts) may stay below the stepper.

## T7 · Make the Statistics chart tooltip follow the cursor

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/chart-tooltip.tsx, src/components/dashboard/matches/match-detail/chart-tooltip-position.ts (new, guess), src/components/dashboard/matches/match-detail/head-to-head-card.tsx (row hover ~line 675-706, `RowTooltip` ~540-571), src/components/dashboard/matches/match-detail/rally-length-card.tsx (~195-222, `BandTooltip` ~301-334), src/components/dashboard/matches/match-detail/point-endings-card.tsx (~310-325, `SegmentTooltip` ~354-375), tests/chart-tooltip-position.spec.ts (new, guess)
- **done when:**
  - [ ] A new pure module `chart-tooltip-position.ts` exports a function (suggested `positionReadout({ pointer: {x,y}, size: {width,height}, bounds: {width,height}, offset })` → `{ left, top }`) that places the box's bottom-left corner `offset` px above and `offset` px right of the pointer, flips below the pointer when `pointer.y - size.height - offset < 0`, and clamps `left` to `[0, bounds.width - size.width]`; a new offline spec `tests/chart-tooltip-position.spec.ts` (pattern: `tests/report-view.spec.ts`, plain import, no rendering) covers those four cases: default placement, right-edge clamp, left-edge clamp, top flip.
  - [ ] `ChartTooltip` accepts an optional `pointer: { x: number; y: number } | null` prop. When `pointer` is set, the box's inline style has `left`/`top` from the helper and no `bottom`, and `align` is ignored (no `right: 0`, no `translateX(-50%)`). When `pointer` is null/absent the existing `align` + `bottom: calc(100% + bottomOffset)` anchoring renders unchanged, so the `align` prop stays for the focus fallback. The style's `transition` covers `opacity` only (no `left`/`top`/`all`), and `pointer-events-none`, `aria-hidden`, `whitespace-nowrap`, `DARK_READOUT_CLASS`/`DARK_READOUT_STYLE` and the exported `DARK_READOUT_*` constants are unchanged.
  - [ ] All three callers track the pointer with `onPointerMove` (coordinates from `event.clientX/Y` minus the positioned element's `getBoundingClientRect()`, the same arithmetic as `performance-tracker-chart.tsx` `selectFromClientX`) and clear it on `onPointerLeave`; `RowTooltip`, `BandTooltip` and `SegmentTooltip` forward it as `pointer`. In `rally-length-card.tsx` and `point-endings-card.tsx` the `onFocus`/`onBlur` handlers still set `hovered` but leave `pointer` null, so a keyboard-focused band/segment shows the tooltip in today's element-anchored position with today's `align` value (`isFirst ? "start" : isLast ? "end" : "center"`). Head-to-head rows, which have no focus handler today, gain none.
  - [ ] `radar-chart-section.tsx`, `performance-tracker-chart.tsx`, and the Radix `Tooltip`/`TooltipTrigger`/`TooltipContent` in `head-to-head-card.tsx`'s `ValueCell` (the em-dash "No data" note, ~line 511-529) are not in the diff, and no file under `src/components/dashboard/shared/`, `team/`, `film/` or `shots/` that imports `DARK_READOUT_*` changes.
  - [ ] No tooltip string changes: `row.label`, `band.title`, the `points · % of the match` line and `youName/oppName` lines are rendered exactly as before (the diff touches positioning props only).
- **notes:** Today `ChartTooltip` is `absolute` inside the hovered row/band/segment, hung from `bottom: calc(100% + bottomOffset)`, with `align` choosing `left:0` / `left:50% + translateX(-50%)` / `right:0` so the first/last segment never runs off the card. Clamping via the helper replaces that edge behaviour for the pointer path; the `bounds` should be the card's `<section>` (add a `ref` there and pass its client size), not the hovered row, so the box stays inside the card rather than inside a 30px row. Head-to-head `RowTooltip` uses `bottomOffset={-4}` (overlapping the row), rally `8`, point-endings `6` — keep those for the focus fallback. The performance tracker is the reference for the rect arithmetic only: it snaps to the nearest data point's x rather than the raw cursor, and parks the readout top/bottom by the sign of the margin, which this task does not copy. If T5 lands first, it adds a "Watch in Video" line to these same readouts — positioning props only here, keep that line. Guardrails §2: no customer-facing strings change. §4: the tooltip reads `youName`/`oppName` already picked by `useMatchSides`; nothing new decides a side.

## T8 · Split the progress card's failure copy by status

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** src/components/dashboard/matches/analysis-failure-copy.ts (new), src/components/dashboard/matches/match-detail/match-analysis-progress.tsx (the `failed ? (…)` alert, ~line 197-250 today), tests/analysis-failure-copy.spec.ts (new, guess — pattern `tests/report-empty-states.spec.ts` + `tests/fixtures/vm-modules.ts` `createLoader`)
- **done when:**
  - [ ] A new module `src/components/dashboard/matches/analysis-failure-copy.ts` exports one constant (suggested `ANALYSIS_FAILURE_COPY`) holding, for `derivation_failed`, the title `Analyzed, but the score couldn't be read cleanly` and the body `The rallies found in your video couldn't be matched point by point to the final score you entered, so no statistics were saved for this match.`; and for `failed`, verbatim from today's two components: fallback title `Analysis stopped`, the card body beginning `Retrying uses the video you already uploaded — nothing needs uploading again.`, the link label `Upload a new recording`, and the drawer's two bodies `Retrying uses the video you already uploaded. Nothing needs uploading again.` and `The match page has the details.` (the last two are unused until T9). `grep -rn "Analysis stopped\|Retrying uses\|Upload a new recording" src/components/dashboard/matches/match-detail/match-analysis-progress.tsx` returns nothing — the card imports every one of those strings from the module.
  - [ ] When `analysis.status === "derivation_failed"`, the `role="alert"` block renders the module's title in the headline `<p>` and the body beneath it; `analysis.failNote`, when present, appears only as a third, smaller muted line under the body (e.g. `text-[11px] text-[#888888]`); `<RetryAnalysis>` is not rendered and no `addVideoHref` `<Link>` is rendered, regardless of `jobId`. The `TriangleAlert` icon and the `ANALYSIS_LABEL[analysis.status]` headline above the milestones ("Stats failed") are unchanged.
  - [ ] When `analysis.status === "failed"`, the alert renders exactly as today: headline `failNote ?? "Analysis stopped"`, the card body, `<RetryAnalysis jobId>` when `jobId` is set, and the `Upload a new recording` link — the only change in that branch is that the three strings come from the module.
  - [ ] A new offline spec `tests/analysis-failure-copy.spec.ts` loads `match-analysis-progress.tsx` through `createLoader({ markUnknown: true, stubs })` (stubbing `@/hooks/use-live-match-analysis` as `{ useLiveMatchAnalysis: () => new Map(), withLiveAnalysis: (a) => a }`, `next/link` and `@/lib/matches/add-video-href` as markers/identity) and `renderToStaticMarkup`s it twice with `failNote: "5 point(s) resolved no winner"` and `jobId: "job-1"`: for `derivation_failed` the markup contains the title and body, does not contain `data-component="RetryAnalysis"`, `Upload a new recording` or `Retrying uses`, and the headline `<p>` (the first `<p` inside `role="alert"`) does not contain the failNote text; for `failed` the markup contains the failNote as headline, `Retrying uses`, `data-component="RetryAnalysis"` and `Upload a new recording`. Both markups and the module source match `/splitstep|swingvision/i` zero times.
  - [ ] `src/lib/data/match-analysis.ts`, `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` and `src/components/dashboard/matches/drawer-sections.tsx` are not in the diff (`isAnalysisFailed`, `ANALYSIS_LABEL` and the short-circuit untouched; the drawer is T9), and `npx tsc --noEmit` passes.
- **notes:** Live case (job b74a1e04, 2026-09-27): vendor analysis succeeded (all outputs present) but `deriveAndPublish` (`src/lib/services/splitstep/derive-and-publish.ts:79`) wrote `reconcile.ts:283`'s reason "5 point(s) resolved no winner" into `error_message`, which reaches the UI as `failNote` and today becomes the alert headline, followed by a body that promises a retry the card does not offer (`RetryAnalysis` and the add-video link are already gated on `status === "failed"` because `resubmitJob()` 409s on anything else) and suggests re-shooting footage the vendor read well. Guardrails: §2 — customer strings never name the vendor; §3.2 — `isAnalysisFailed` still covers both statuses and the three predicates stay as they are, the card branches on the literal status inside the `failed` block; §3.3 — `page.tsx`'s `isInFlight || isAnalysisFailed` short-circuit is untouched; §3.5 — copy is free to change. Existing spec pattern for asserting rendered markup offline: `tests/report-empty-states.spec.ts`; `lucide-react` can load for real. Out of scope, flagged for the author: `analysisAction()` in `match-analysis.ts` offers "Start over" → `/dashboard/matches/new` for both failed statuses in the matches list row, and `notifyAnalysisOutcome(…, outcome: "failed")` fires for a derivation refusal too — the email may carry the same conflation.

## T9 · Drawer's `AnalysisNotice` reads the shared failure copy

- **status:** todo
- **model:** sonnet
- **needs:** T8
- **files:** src/components/dashboard/matches/drawer-sections.tsx (`AnalysisNotice`, ~line 165-215), tests/drawer-sections.spec.ts (extend — its `createLoader` already stubs `next/link`, `next/image`, the supabase client, `ResultMark`, `ScoreLine`)
- **done when:**
  - [ ] `AnalysisNotice` branches on `status === "derivation_failed"` before the generic `isAnalysisFailed` fallthrough: the headline `<p>` is the module's derivation title and the body is the module's derivation body, both imported from `src/components/dashboard/matches/analysis-failure-copy.ts`; `failNote`, when present, is a third muted line under the body and is never the headline; the `canRetry` prop is ignored in this branch (no "Retrying uses…" and no "The match page has the details." text).
  - [ ] For `status === "failed"` the rendered strings are unchanged — headline `failNote ?? <fallback title>`, body `canRetry ? <drawer retry body> : <drawer no-retry body>` — but all three come from the module: `grep -n "Analysis stopped\|Retrying uses\|The match page has the details" src/components/dashboard/matches/drawer-sections.tsx` returns nothing.
  - [ ] `tests/drawer-sections.spec.ts` gains cases that `renderToStaticMarkup(React.createElement(sections.AnalysisNotice, props))`: (a) `derivation_failed`, `failNote: "5 point(s) resolved no winner"`, `canRetry: false` → contains the title and body, does not contain `The match page has the details` or `Retrying uses`, and the first `<p` inside `role="alert"` does not contain `5 point(s)`; (b) `failed`, `canRetry: true` → contains `Retrying uses the video you already uploaded. Nothing needs uploading again.`; (c) `failed`, `canRetry: false`, no `failNote` → contains `Analysis stopped` and `The match page has the details.`; (d) an in-flight status (`processing`) still renders `Serve and pressure numbers appear here once analysis finishes.` and no `role="alert"`.
  - [ ] `src/components/dashboard/matches/match-drawer.tsx` (`canRetry = status === "failed" && …`, ~line 146) and `src/components/dashboard/schedule/event-line-drawer.tsx` (`retryJobId`, ~line 213, and its `AnalysisNotice` call ~line 390) are not in the diff, `match-analysis-progress.tsx` is not in the diff, and `npx tsc --noEmit` passes.
- **notes:** Two callers feed `AnalysisNotice`: `match-drawer.tsx` (passes `failNote` always; `canRetry` is `status === "failed" && jobId && canManage !== false`) and `schedule/event-line-drawer.tsx` (passes `failNote` only when `retryJobId` is set, so a derivation failure there already arrives with `failNote: null` — the new branch must render its title/body without one). Today a `derivation_failed` row in either drawer shows the raw reconcile reason as the headline and "The match page has the details." as the body. Guardrails §2 (no vendor name), §3.2 (`isInFlight`/`isAnalysisFailed` untouched — the drawer branches on the literal status inside the failed block), §3.5 (copy free). Do not merge with T8: different surface, different spec file, and T8's module must exist first.
