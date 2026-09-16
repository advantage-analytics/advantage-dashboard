# Settled match report — Statistics page (design 04, frames F1–F8)

**Point-in-time (2026-09-15).** The settled match report page — design canvas `04 Match report - Film room.dc.html`, frames F1–F8 — as specified for the branch `claude/match-report-film-room-a05b7e`. The frames beside this file are the spec; this document is the transcription and the decisions. Once the page ships, the components' own doc comments are current state and this file is history.

## Context

The Claude Design canvas `04 Match report - Film room.dc.html` (project
`afde9116-328b-445c-aeff-8b3c2a702d6f`) carries, in its first section, the
**settled match report page**: F1 is the full page at 1512×950, F2–F8 are its
states (insight default / collapsed / dismissed, title row without and with
Compare + the ⋯ menu open, the head-to-head hover readout, the rail scoreboard).
The file name is historical — the canvas continues at F9 "Visualizations tab,
the second tab in F1's shell" — and the user confirmed the scope: **just the
settled Statistics page, F1–F8**.

Today's page (`round 46/47f`) draws a 300px rail of facts + AI card + note
strip, a top tab strip (Statistics · Shots & placement · Film room) with set-scope
chips, a four-tile KPI strip and a two-column widget grid. The settled design
moves the view switcher and the scoreboard into the rail, puts the facts on a
display-type title row, promotes the insight to a claim-first card in the pane,
drops the KPI strip and the set-scope chips, and pins Share to the rail's foot.

The user also asked for the Vercel React composition patterns
(`~/.claude/skills/vercel-composition-patterns/AGENTS.md`): compound components
over a `{state, actions, meta}` context, state lifted into a provider, explicit
variant components instead of boolean modes, children over render props, React 19
`use()` and ref-as-prop. React is 19.1 (`package.json`).

## Design source

- Extracted, pretty-printed frames: [`2026-09-15-match-report-settled-statistics/F1.html … F8.html`](2026-09-15-match-report-settled-statistics/)
  plus `helmet-style.css` (the `.seg`/`.seg-tip`/`.ins-c` hover rules) and
  `section1-narrative.txt`. To re-extract: `DesignSync get_file` on that file —
  it truncates at 256 KiB (memory `designsync-cap-and-present-view`) but all eight
  frames sit inside the first 72 KB; ids `F1`…`F8`, `data-screen-label="Settled …"`.
- Every value below was read from those frames, not paraphrased from a plan.
  Where a frame conflicts with the design system, the frame wins and the
  conflict is recorded (memory `canvas-over-plan-paraphrase`).

## Scope and non-goals

In scope: the two-pane body of `/dashboard/matches/[matchId]` — rail, pane,
title row, insight card, Statistics widgets, and the composition refactor that
carries them. The Shots and Film views keep their existing content and only gain
the shared title row (their names become "Visualizations" and "Video").

Out of scope (state explicitly in the report):

- The 44px header. F1 draws a team-event breadcrumb ("Schedule › vs Ridgeline
  University › #2 Singles · Reid vs Okafor ▾"); that is shared chrome specified
  by the header/schedule canvases, and `src/app/dashboard/header.tsx` keeps
  its current match trail.
- The fullscreen film room branch (`claude/matchid-film-room-fullscreen-c03967`,
  unmerged) — nothing here touches `film/`.
- The awaiting-analysis short-circuit's content (`MatchAnalysisProgress`) —
  guardrails §3.3 gate stays, only its frame changes (see variants).

Guardrails: every you/opp decision goes through `useMatchSides()` /
`getMatchSides()`; nothing under `src/lib/services/splitstep/**` or the API
routes is touched; `page.tsx`'s short-circuit and `reconcileBeforePageRead`
wiring stay as they are.

## Architecture — the `MatchReport` compound component

All new files live in `src/components/dashboard/matches/match-detail/`.

### `match-report-context.tsx`

```ts
type ReportView = "statistics" | "shots" | "film"; // ?tab= values unchanged
type InsightStatus = "expanded" | "collapsed" | "dismissed";

interface MatchReportState {
  view: ReportView;
  insight: InsightStatus;
}
interface MatchReportActions {
  selectView(view: ReportView): void; // history.pushState, exactly match-tabs.tsx's `select`
  collapseInsight(): void;
  expandInsight(): void;
  dismissInsight(): void; // insight-dismissal.ts key, permanent per match
}
interface MatchReportMeta {
  matchId: string;
  summary: string | null; // viewer's insight, already `sides.pick`ed in page.tsx
  canCompare: boolean; // hasComparisonBaseline(kpiHistory) — server-computed
  isDerived: boolean; // sourceProvider === "splitstep"
  statsPublished: boolean; // both match_stats rows present
}
```

`MatchReportProvider` is the only thing that knows the view lives in the URL
(`useSearchParams` + `parseReportView`) and the insight status in localStorage
(`useInsightDismissal` for dismissed — key unchanged — and a `useState` for
collapsed). `useMatchReport()` reads it with `use()`. Value memoised.
`match-data-provider.tsx` gets the same React 19 treatment (`<Context value>`,
`use()`), no behaviour change.

### `match-report.tsx` — the parts (`MatchReport` namespace object)

| Part                                            | Role                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Provider`                                      | wraps the context                                                                                                                                           |
| `Frame`                                         | `flex min-h-0 flex-1 items-stretch` (replaces `MatchDetailShell`'s outer div)                                                                               |
| `Rail`                                          | `<aside aria-label="Match summary">`, `[flex:0_0_300px] min-h-0 overflow-y-auto flex-col bg-[var(--surface-card)] border-r border-[var(--border-hairline)]` |
| `Scoreboard`                                    | F8 card (`report-scoreboard.tsx`)                                                                                                                           |
| `ViewSwitcher`                                  | the three rail rows (`report-view-switcher.tsx`)                                                                                                            |
| `Spacer`                                        | `flex-1 min-h-4`                                                                                                                                            |
| `RailFooter`                                    | `p-3`; children = the Share trigger                                                                                                                         |
| `Pane`                                          | `min-h-0 min-w-0 flex-1 overflow-y-auto flex flex-col gap-4` with `padding:20px 56px 24px` and `background:var(--surface-card)` (white; see Decisions 1)    |
| `TitleRow` / `Title` / `Facts` / `TitleActions` | `report-title-row.tsx`, `report-facts.tsx`                                                                                                                  |
| `CompareButton` / `MoreMenu`                    | `report-compare-button.tsx`, `report-more-menu.tsx`                                                                                                         |
| `Insight`                                       | `report-insight-card.tsx`; explicit variants `InsightExpanded` / `InsightCollapsed`, `null` when dismissed                                                  |
| `When view="…"`                                 | renders children only for the active view; `role="tabpanel"`, `flex min-h-0 flex-1 flex-col gap-4`                                                          |

`report-view.ts` (pure): `REPORT_VIEWS = [{value:"statistics",label:"Statistics"},{value:"shots",label:"Visualizations"},{value:"film",label:"Video"}]`,
`parseReportView()` (same rule as `parseMatchTab`), `reportViewQuery(params, view)`.

`insight-text.ts` (pure): `splitInsight(summary) → { claim, evidence | null }` —
first sentence boundary (`[.!?]` followed by whitespace and a capital); when
there is none, the whole string is the claim. Nothing invented, no figure
highlighted (the frame's ink-900 "decisive figure" has no data source).

`src/lib/data/match-stats-server.ts`: add pure `hasComparisonBaseline(history)` =
`Object.keys(history?.baseline ?? {}).length > 0`. `buildKpiHistory` already
excludes the current match from `baseline`, so a non-empty baseline is exactly
"a second analysed match exists" (the `kpiHistory !== null` shortcut is wrong:
this match's own stat row keeps the history non-null on a first match).

### `statistics-view.tsx` (replaces `statistics-tab.tsx`)

```
{!statsPublished && <UnpublishedStatsNotice />}
<MatchReport.Insight />
<div className="flex items-start gap-4">          // widgets row
  <HeadToHeadCard />                                // flex-1 (436px at 868)
  <div className="flex w-[416px] shrink-0 flex-col gap-4">
    <PerformanceTrackerChart /> <RallyLengthCard /> <PointEndingsCard isDerived={meta.isDerived} />
  </div>
</div>
{isDerived && statsPublished && <MatchDataBlock />}   // full-width surface-card, see decisions
```

Reads `meta` from `useMatchReport()` rather than taking `statsPublished`/`isDerived`
booleans. When `!statsPublished` the head-to-head returns null, so give the
right column `flex-1` in that case so it does not sit as a lone 416px strip.
Add one `@container` rule (precedent: `adv-kpi-strip` in `globals.css`) that
stacks the row when the pane is narrower than ~720px (sidebar auto-collapses
below 1280, so this only matters on small laptops).

### `page.tsx` — two explicit variants

```tsx
// awaiting analysis (guardrails §3.3, gate computed exactly as today)
<MatchReport.Provider matchId summary={null} canCompare={false} isDerived statsPublished={false}>
  <MatchReport.Frame>
    <MatchReport.Rail>
      <MatchReport.Scoreboard />            // the score the player entered renders from `match`
      <MatchReport.Spacer />                // no switcher: there are no views yet
      <MatchReport.RailFooter><ShareMatchButton>…</ShareMatchButton></MatchReport.RailFooter>
    </MatchReport.Rail>
    <MatchReport.Pane>
      <MatchAnalysisProgress analysis matchId />   // unchanged, keeps its own heading; no title row
    </MatchReport.Pane>
  </MatchReport.Frame>
</MatchReport.Provider>

// ready
<MarkReportSeen matchId />
<MatchReport.Provider matchId summary canCompare={hasComparisonBaseline(kpiHistory)} isDerived statsPublished>
  <MatchReport.Frame>
    <MatchReport.Rail>
      <MatchReport.Scoreboard /> <MatchReport.ViewSwitcher /> <MatchReport.Spacer />
      <MatchReport.RailFooter><ShareMatchButton>…rail trigger…</ShareMatchButton></MatchReport.RailFooter>
    </MatchReport.Rail>
    <MatchReport.Pane>
      <MatchReport.TitleRow>
        <div><MatchReport.Title /><MatchReport.Facts /></div>
        <MatchReport.TitleActions><MatchReport.CompareButton /><MatchReport.MoreMenu /></MatchReport.TitleActions>
      </MatchReport.TitleRow>
      <MatchReport.When view="statistics"><StatisticsView /></MatchReport.When>
      <MatchReport.When view="shots"><ShotsTab /></MatchReport.When>
      <MatchReport.When view="film"><FilmTab video={video} /></MatchReport.When>
    </MatchReport.Pane>
  </MatchReport.Frame>
</MatchReport.Provider>
```

`page.tsx` needs `kpiHistory` (already fetched in `getMatchDetailData`) for the
gate; the `dynamic()` imports of `ShotsTab`/`FilmTab` stay. The `film` note
variants passed to the old rail go away (the no-video note strip is not in the
design; the Video row simply opens `FilmEmptyState`).

## Geometry — what each part draws (from the frames)

**Rail scoreboard (F8/F1).** Outer `p-3`; card `padding:15px 13px; border-radius:var(--radius-card); border:1px solid var(--border-hairline)`, column `gap:14px`.
Header row `items-baseline gap-2`: status word `.text-micro` at ink-500 ("Final", via
`formatScoreboardStatus(match.matchContext)` sentence-cased: Final / Unfinished /
Retired / Withdrew / Defaulted) · spacer · duration `mono tabular` 10px ink-400
(`formatClock(durationSec, {alwaysShowHours:true})`, omitted when no duration).
Two rows, `gap:11px`, each `flex items-center gap-[7px]`: viewer row = name
`font:500 13px` ink-900 `whitespace-nowrap` + 6px `--blue` dot (radius pill); opponent
row = name `font:400 13px` ink-600; right side = `mono tabular` 13px, one 11px-wide
right-aligned slot per set, `gap:8px`; set winner's digit ink-900, loser's ink-400,
level set both ink-900. Tiebreak digit as `ScoreLine`'s superscript (0.6em,
`vertical-align:1.05em`, 0.5px) inside the slot — DS `Score` rule; the frame has none.
Sets from `useMatchSides().sets` (you-first, tiebreaks swapped together).

**Rail view switcher (F1).** Container `padding:2px 12px 0; gap:2px`; row `h-10 rounded-[var(--radius-element)] text-[13px] cursor-pointer`; leading `w-10 h-10` cell with a 16px lucide icon stroke 1.5 (`Table2` Statistics · `ScatterChart` Visualizations · `Video` Video); label `flex-1 truncate`. Active: `bg-[var(--surface-subtle)] text-[var(--ink-900)] font-medium`; inactive: `text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]`, 200ms `--ease-primary`. `role="tablist" aria-orientation="vertical"`, rows `role="tab" aria-selected`. Focus: write nothing (`focus.css` rings buttons).

**Rail footer Share (F1).** `p-3`; a full-width `h-9` button, `rounded-[var(--radius-button)] bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-[13px] font-medium`, `gap-[7px]`, `Share2` 15px stroke 1.7, label "Share". It is the trigger of the existing share popover: refactor `share-match-button.tsx` (no importers — free API) to read `match` from `useMatchData()`, take `children` as the `PopoverTrigger asChild` element and `side`/`align` props (`side="top" align="start"` here); keep `SharePopoverPanel` and the ⌘⇧L shortcut; replace the `useEffect`+`setIsMac` with a lazy `useState` initialiser guarded on `typeof navigator`.

**Pane.** `overflow-y-auto; flex-col; gap:16px; padding:20px 56px 24px; background:var(--surface-card)` (F1 draws `--surface-page`; see Decisions 1). Nothing sticky any more (the old tab strip was).

**Title row (F1/F4/F5/F6).** `flex items-end gap-2.5`. Left block `min-w-0`: title `.text-display` (30/300, −0.6px; frame sets line-height 1.2 = 36px, which `.text-display` already has), `whitespace-nowrap`, text = active view's label; facts line `mt-[9px] flex items-center gap-3.5 h-[18px] flex-nowrap`, each fact `inline-flex items-center gap-1.5`: 13px icon ink-700 stroke 1.5 + `.text-micro` forced `color: var(--ink-700)` inline (unlayered DS class beats the utility — memory `ds-class-layering-trap`). Facts, in order, each gated on data: `Swords` "{points} points · {games} games" (points.length > 0; games summed from `match.score.sets` as `match-rail.tsx` does; `tabular`) · `Calendar` `shortMonthDate(match.date)` (`tabular`) · `/icons/tournament-icon.svg` `tournamentName` (frame draws `GraduationCap` "vs Ridgeline University" — an opponent school the `Match` type does not carry) · `/icons/tennis-court-icon.svg` `courtType` (frame's inline court SVG is this asset) · `CircleCheck` "Verified result" when `verificationStatus`. "Away" (`MapPin`) is omitted: no home/away field exists on `Match`.
Right: `flex-1` spacer, then the cluster.

**Compare (F5/F6).** `inline-flex items-center gap-[7px] h-8 px-3 rounded-[var(--radius-button)] text-[12px] font-medium text-[var(--ink-700)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]`, `SlidersHorizontal` 14px ink-500. Rendered only when `meta.canCompare` (F5: absent, never greyed). There is no compare feature yet: render it `aria-disabled` at full strength with a `ChromeTooltip` "Comparing matches isn't available yet" (repo precedent: `InertGlyph` in `film/film-player.tsx`).

**More menu (F6).** Trigger `size-8 rounded-[var(--radius-element)] text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]`, `MoreHorizontal` 15px stroke 1.5, `aria-label="More"` + `ChromeTooltip` (hidden while open). `FloatMenu width={212} align="end"` from `ui/float-menu.tsx`. Rows: "Export report" / "PDF with the charts" · "Re-run analysis" / "Uses your latest video" · "Review score" · `FloatMenuDivider` · "Delete match" (destructive row: `DESTRUCTIVE_ROW`/`DESTRUCTIVE_ICON` — export them from `match-actions/match-actions-menu.tsx` rather than copy; F6 draws the label resting in `--danger`, the DS rule says rest grey and turn red on intent — follow the DS here since it is the same row `MatchActionsMenu` already ships). "Review score" opens `EditMatchDialog` (`matchId, open, onOpenChange`); "Delete match" opens `DeleteMatchDialog` (`matchId, matchLabel` from `sides.you.name` / `sides.opp.name`, `open, onOpenChange`; it already routes back to the list). "Export report" and "Re-run analysis" have nothing behind them (`resubmitJob` refuses any parent that is not `failed`; no PDF exists): add `disabled?: boolean` to `FloatMenuItem` (`aria-disabled`, `opacity-45`, no wash, `onSelect` suppressed) and close the menu with a `FloatMenuNote`: "Export and re-run analysis aren't available yet."

**Insight card (F2).** `.surface-card`-equivalent container: `bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-[16px_18px_12px] flex flex-col gap-2`. Claim `text-[15px] font-light leading-[1.35] text-[var(--ink-900)] max-w-[62ch] [text-wrap:pretty]`. Evidence `text-[12px] leading-[1.65] text-[var(--ink-600)] max-w-[86ch] [text-wrap:pretty]` (rendered only when `splitInsight` yields one) with the inline "Why this" link at the end: `text-[11px] font-medium text-[var(--blue)] whitespace-nowrap` + `ArrowUpRight` 12px `ml-[3px]`, `href="/dashboard/ask"` (the existing rail card's destination). Footer `flex items-center gap-[7px] pt-2 border-t border-[var(--border-hairline)]`: 16px ink-900 square `rounded-[3px]` with `/logos/logo3.svg` at 9×6 `brightness-0 invert` (frame: `assets/logo-mark.svg`; DS `EngineChip` says 20px/12×8 — frame wins, note it) · "Advantage Intelligence" `.text-micro` at ink-500 · spacer · "Dismiss" `text-[11px] font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)]` · "Collapse" `size-[22px] rounded-[var(--radius-element)] text-[var(--ink-400)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)]` with `ChevronUp` 14px, `aria-label` + `ChromeTooltip`. Card hover/focus-within reveals nothing extra in the settled frame (the `.ins-x` rule is unused by F2) — draw the exits always.
**Collapsed (F3).** `h-11 px-[18px] flex items-center gap-2.5` same surface: logo chip · claim `flex-1 min-w-0 truncate text-[13px] text-[var(--ink-700)]` · "Show" `text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]` · `w-px h-3.5 bg-[var(--border-hairline)] mx-0.5` · "Dismiss" as above.
**Dismissed (F4).** Nothing renders; the widgets row follows the title row at the pane's 16px gap. `dismissInsight` writes the existing key `advantage-ai-insight-dismissed:${matchId}`; `useInsightDismissal`'s server snapshot says "dismissed", so the card mounts after hydration exactly as the rail card does today — accept, comment it.

**Head-to-head card deltas** (`head-to-head-card.tsx`; keep every export `tests/match-h2h-rows.spec.ts` imports): card `padding:18px 20px 14px` (was 18/24); header `pb-[14px]` with caption `text-micro tabular` forced ink-400 reading `"{meta.label} · {meta.points} points"` (drop "· N games"); column header `pb-[11px]`, `COLUMN` width 104 → 64px, viewer name `text-[12px] font-medium text-[var(--ink-900)]` + 11px `Check` `--viz-good` stroke 2 when verified, opponent `text-[var(--ink-600)]`; section title `.eyebrow-sm` forced ink-400 with `pt-3 pb-0.5`; rows `min-h-[30px] px-2 -mx-2 rounded-[var(--radius-element)] hover:bg-[var(--surface-muted)]` (200ms `--ease-primary`); values `text-[13px] tabular` right-aligned in 64px, leader 500/ink-900 else 400/ink-500 (keep `rowLeader`); readout (F7) `ChartTooltip align="center" bottomOffset={-4}` (`calc(100% + -4px)` = frame's `calc(100% - 4px)`), `px-2.5 py-2 gap-0.5`, label 12px/500 white, detail `mono tabular` 10px `text-white/[0.64]` "{you} {detail} · {opp} {detail}". Keep the `useSetScope()` read (a typed `?set=` still scopes; the pure rules stay tested) — only the chips UI goes.

**Performance tracker deltas.** `gap-2.5`; the "{you} above" label `absolute left-0 top-0 z-[2] text-[10px] pr-1.5 bg-[var(--surface-card)]` (a plain background, not the `surface-card` class which adds border/shadow); readout `px-[11px] py-[9px] gap-[3px]` with lines 12/500 white · 11px `text-white/[0.64]` · `mono tabular` 10px `text-white/[0.64] pt-px`; remove the inert "Expand" (not in the settled frame; flags-doc #11 already calls it inert).

**Rally length deltas.** `padding:16px 20px 14px; gap:12px`; mosaic `min-h-24`, bands `gap-0.5` with `--radius-cell` on the outer corners (already so); readout `px-[11px] py-[9px] gap-[3px]`: title 12/500 white · "{count} points · {share}% of the match" 11px `text-white/[0.64]` · "{you} {pct}%" 11px white `pt-0.5` · "{opp} {pct}%" 11px `text-white/[0.78]` (drop the raw counts from the two player lines); labels row 11px ink-700 + `mono tabular` 10px ink-400 count; legend 8px swatches, "Width is how often" forced ink-400.

**How points ended deltas.** `padding:16px 20px 14px; gap:12px`; per-player block `gap-1.5`; name 11px ink-600 + `mono tabular` 10px ink-400 total; bars `h-2.5 gap-0.5`; readout `px-2.5 py-2 gap-0.5` (12/500 white + 11px `text-white/[0.64]`); legend `gap-x-3.5 gap-y-1.5 pt-0.5`, 6px swatches, labels `.text-micro` forced ink-400; caption "Own outcomes" forced ink-400.

**`MatchDataBlock`.** Becomes a full-width `surface-card` block after the widgets row (drop its `border-t pt-5` rail styling); content unchanged.

## Files

**New:** `report-view.ts`, `insight-text.ts`, `match-report-context.tsx`, `match-report.tsx`, `report-scoreboard.tsx`, `report-view-switcher.tsx`, `report-title-row.tsx`, `report-facts.tsx`, `report-compare-button.tsx`, `report-more-menu.tsx`, `report-insight-card.tsx`, `statistics-view.tsx`; `tests/report-view.spec.ts`, `tests/insight-text.spec.ts`, `tests/report-scoreboard.spec.ts` (pure set-winner colouring rule — put `setOutcome(set) → "you" | "opp" | "level"` in `report-scoreboard.ts` or export it from the component file the way `head-to-head-card.tsx` exports its rules).

**Modify:** `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` (both variants above; drop the rail `film` note plumbing); `layout.tsx` (comment only — its `h-[calc(100vh-var(--header-h))] overflow-hidden` box is what the Frame needs); `match-data-provider.tsx` (`use()`); `src/lib/data/match-stats-server.ts` (`hasComparisonBaseline` + a case in `tests/match-kpi-history.spec.ts`); `src/lib/data/match-detail-server.ts` (`insights: dbRow.insights ?? null` — see decisions); `share-match-button.tsx`; `head-to-head-card.tsx`, `performance-tracker-chart.tsx`, `rally-length-card.tsx`, `point-endings-card.tsx`; `set-scope.tsx` (delete `SetScopeChips` and the `useRouter`/`select` that only it used; keep `parseSetParam`, `scopeMeta`, `scopePoints`, `selectableSets`, `setScopeQuery`, `useSetScope`); `match-actions/match-actions-menu.tsx` (export `MENU_ROW_ICON`, `DESTRUCTIVE_ROW`, `DESTRUCTIVE_ICON`); `src/components/ui/float-menu.tsx` (`disabled` on `FloatMenuItem`); `match-data-block.tsx` (surface-card).

**Delete:** `match-detail-shell.tsx`, `match-tabs.tsx`, `match-rail.tsx`, `rail-insight-card.tsx`, `statistics-tab.tsx`, `match-kpi-strip.tsx` (`shared/kpi-tile.tsx` stays — Home and the season strip use it; `legend-swatch.tsx`, `chart-tooltip.tsx`, `insight-dismissal.ts`, `format-clock.ts`, `unpublished-stats-notice.tsx` stay).

New client files may only `import type` from `match-stats-server.ts` /
`match-detail-server.ts` (`tests/client-bundle-boundary.spec.ts`);
`hasComparisonBaseline` is called in `page.tsx` only. No hex literals — tokens only
(`tests/design-drift.spec.ts` pins the off-palette count). No `title` attributes
(`forbid-dom-title-attribute` lint rule), no `forwardRef`, no
`useEffect`-to-set-state.

## Decisions taken (flag each in the report)

1. **Pane is white (`--surface-card`)**, per DS principle 6 ("the report and its rail are `--surface-card`"); the cards separate by hairline and shadow. F1 draws the pane on the grey `--surface-page` ground, and the build first followed the frame; the user overruled that on 2026-09-16 in favour of white.
2. **Unwired menu rows** (Export report, Re-run analysis) render with the frame's copy, disabled, plus a `FloatMenuNote` saying so. Alternative if dead rows are unwanted: omit both and the note.
3. **Compare** renders only past the first analysed match (frame), inert with a tooltip until a compare feature exists. Alternative: keep it hidden until then.
4. **Insight text**: claim = first sentence of the real `summary`, evidence = the rest; no figure emphasised. The loader's `FILLER_INSIGHTS` substitution (`match-detail-server.ts:487`, a fabricated paragraph for matches with no insights) is removed so the card never attributes invented prose to Advantage Intelligence; `analysis-sidebar.tsx`/`match-insights.tsx` are unimported and `team/player-profile/last-match-card.tsx` reads its own loader, so nothing else changes. "Why this" keeps the existing `/dashboard/ask` destination.
5. **Collapse** is session state; **dismiss** is the existing permanent per-match key. Insight renders on the Statistics view only.
6. **Scoreboard**: level or unfinished sets keep both digits ink-900; status word from `formatScoreboardStatus`; tiebreaks as DS superscripts.
7. **Facts** omit "Away" (no data) and use the tournament icon + `tournamentName` where the frame shows a school.
8. **`MatchDataBlock`** and **`UnpublishedStatsNotice`** stay on the Statistics view (top and bottom respectively) — neither is drawn in F1–F8 but both are real states.
9. **Awaiting-analysis variant**: rail = scoreboard + Share; pane = `MatchAnalysisProgress` as today, no title row.
10. **The header is untouched** (see non-goals).

## Sequence (the technical order the tasks follow; page keeps working after each step)

0. Baseline: `npm run typecheck && npm run lint && npm run test && npm run build`; note the warning count.
1. Pure modules + specs: `report-view.ts`, `insight-text.ts`, `hasComparisonBaseline`, the scoreboard set rule. `npm run test`.
2. `match-data-provider.tsx` → `use()`. `npm run typecheck`.
3. Provider, `match-report.tsx`, the `report-*.tsx` parts, `statistics-view.tsx`, the composable `share-match-button.tsx`, `FloatMenuItem.disabled`, the exported menu-row classes — all unused so far; old shell still renders. `typecheck && lint`.
4. Cut `page.tsx` over to `MatchReport` and delete the six retired files in the same commit; typecheck finds stragglers. Drop `FILLER_INSIGHTS`.
5. Card deltas (h2h, tracker, rally, endings), then `MatchDataBlock`, then the container query.
6. `npm run map` (no route added — must be a no-op), `npm run format`, then the full gate.
7. The commit hook `.claude/hooks/widget-states-gate.sh` blocks `git commit` on dashboard `.tsx` changes until the `widget-states` skill has run — run it before committing.

Commit in those slices on the current branch `claude/match-report-film-room-a05b7e`
(targets `splitstep-integration`); do not open a PR unless asked.

## Docs checked (context7 + `node_modules/next/dist/docs`, Next 16.3.0 / React 19.1.0)

- **React 19** — `use(Context)` reads the closest provider and may be called
  conditionally; `<SomeContext value={…}>` renders as the provider (no
  `.Provider`); `ref` is a plain prop and `forwardRef` is on its way out. The
  repo already does both in `new-match-wizard/UploadWizardProvider.tsx` — copy
  that file's shape for `match-report-context.tsx`.
- **Next 16 App Router** — `window.history.pushState`/`replaceState` integrate
  with the router and keep `useSearchParams`/`usePathname` in sync
  (`01-app/01-getting-started/04-linking-and-navigating.md` § Native History
  API), which is what `match-tabs.tsx` relies on today and what
  `selectView` keeps doing. `useSearchParams` needs a `Suspense` boundary only
  on a prerendered (static) route; this route is dynamic (cookie-backed
  Supabase client), so none is required — the `npm run build` in the gate is
  the check ("Missing Suspense boundary with useSearchParams" would fail it).
  `useSearchParams` is client-only; the provider is a `"use client"` file and
  `page.tsx` stays a Server Component that composes it.
- **Tailwind v4** — container queries are in core: mark the pane `@container`
  and stack the widgets row with an arbitrary variant, e.g. `flex-col
@min-[720px]:flex-row` (with the 416px column `@min-[720px]:w-[416px]`),
  instead of the raw `@container` CSS block `globals.css` uses for the KPI
  strip. Named containers (`@container/report`, `@min-[720px]/report:`) if a
  nested container ever appears inside the pane.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test` (Playwright specs incl. the new pure ones), `npm run build`, `npm run map` idempotent.
- Visual, at 1512×950 against F1: worktree dev server on a free port (`npx next dev -p <port>` in the background — `preview_start` reads the root `launch.json`), then the in-app Browser pane, which is signed into the app for `localhost:<any port>` (memory `designsync-cap-and-present-view`, 2026-09-04 note); force the team workspace with `document.cookie='advantage_workspace=<program id>; path=/'`. Matches to check: the Revelli–Stepanov clone `0db449ab…` (video, derived — Video view + `MatchDataBlock`), a SwingVision match with published stats and a real `insights.summary` (e.g. `5ebb25c1…`, `68a8b896…`, `9567a5c9…` from the live DB), and a match with no other analysed match (Compare absent) vs one with history (Compare present). States: insight expanded → Collapse → Show → Dismiss → reload (stays dismissed); `?tab=shots` / `?tab=film` titles "Visualizations"/"Video"; Back restores the previous view; ⋯ menu rows and both dialogs; an analysing match still short-circuits.
- Measure with `getComputedStyle` (rail 300px, pane padding 20/56/24, title 30/300/36, h2h columns 64px, rows 30px, switcher rows 40px) rather than trusting classes — the DS type classes pin colour, so check computed colour on every `.text-micro` that should be ink-700/ink-400.
- Kill the dev server and `rm -rf .next/dev` before `npm run build`.
