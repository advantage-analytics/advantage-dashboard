Sign-off: pending

# Review — design-round-46-matchid

`/pr-check` run over the full feature range: `d01d1cbf3415f76f3f219d0fa3c9a5b90b739867...HEAD` (branch-range target, tree was clean when the review started), plus a working-tree quality pass applied during the review itself. Receipt recorded at commit `19980fc`.

## Success criteria (brief.md), checked one by one

1. **"Side-by-side, the rendered page visually matches the artboard's layout, hierarchy, spacing, and copy positions for a real match with full stats."** — **Met, with a standing caveat.** Every task built to exact artboard line citations (frames 46a–46d, 47a) and every gate verified those citations against the actual rendered code. No literal pixel-diff/screenshot verification was possible anywhere in this build — this environment has no authenticated browser session (no dev login), a constraint hit and worked around consistently across T1, T4, and T7 by substituting code-path tracing cross-referenced against real DB rows in each state, plus live non-500 dev-server response checks. That standard was explicit and accepted throughout the build (see the two `task: amend` commits). A human with a real login should still do one side-by-side pass before this is fully closed.
2. **"Everything with an obvious mapping... renders live data, not design copy."** — **Met.** Verified per-task and re-confirmed in this review: head-to-head stats, momentum chart, rally-length bands, point-endings bars, serve zones, zone table, film player/point list, and rail facts all bind to `points`/`statsResult`/`match` through `useMatchSides()`, never static copy.
3. **"Every unmapped element is (a) rendered exactly as designed and (b) listed in a flagged-items file with its suspected data source."** — **Met.** `docs/match-detail-v46-flags.md` (built in T6) carries 9 entries — the design's original 8 plus one discovered during the build — each marked resolved or open with its unblock condition.
4. **"The analysing, error, and not-found states still work."** — **Met.** The analysing/failed short-circuit (guardrails §3.3) was re-verified as intact by every reviewer that touched `page.tsx`, most recently in this review's full-range guardrails pass. `error.tsx`/`not-found.tsx` at the route level are untouched by this feature.
5. **"npm run lint, npm run build, and npm test pass; pipeline-guardrails-reviewer finds no violations."** — **Met.** All four mechanical gates green as of this review's last run; `pipeline-guardrails-reviewer` and `rls-boundary-reviewer` both clean on a fresh, full-range, fail-closed pass (see below).

## What `/pr-check` found and what was fixed in response

**Stage 1 — mechanical gates.** `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (227 passed) — all green at the start of the review and re-confirmed after every subsequent fix.

**Stage 2 — quality pass.**

`/simplify` (4 angles, applied fixes directly to the working tree):
- Extracted `LegendSwatch` (`match-detail/legend-swatch.tsx`) — deduped 4 near-identical copies across `performance-tracker-chart.tsx`, `rally-length-card.tsx`, `point-endings-card.tsx`, `shots/serve-zones-court.tsx`.
- Extracted `ChartTooltip` (`match-detail/chart-tooltip.tsx`) — deduped the align-based dark hover-tooltip positioning shared by `rally-length-card.tsx`'s `BandTooltip` and `point-endings-card.tsx`'s `SegmentTooltip`, keeping each's distinct body content.
- Extracted `format-clock.ts` (`shortMonthDate` + `formatClock`) — deduped a byte-identical `shortMonthDate` and reconciled a real divergence: `match-rail.tsx`'s `clockOf` always showed hours, `film-player.tsx`'s dropped them when zero. Unified into one function with an explicit `alwaysShowHours` option, preserving each call site's exact prior visible output.
- Memoized `film-player.tsx`'s `stops` array — was recomputing a full map/filter/sort of `points` on every ~4Hz `timeupdate` tick; now correctly `useMemo`'d on `[points]`.
- Guarded `performance-tracker-chart.tsx`'s hover tooltip against `match-points-server.ts`'s null-score-to-`"0-0"` coercion — was fabricating "0-0 · 0-0" in the tooltip on Advantage Intelligence-derived matches; now uses the same test `point-list.tsx`'s `columnHasValues()` already established.
- Deleted the now-fully-orphaned `src/components/dashboard/matches/performance-tracker.tsx` (`MomentumChartCompact`) — confirmed zero importers.
- Skipped, noted: the applied-filter "note strip" and "cut sentence" builder patterns reimplemented across 2-3 files (plus a pre-existing 4th variant), and the segmented pill-group control reimplemented twice with an accessibility divergence (`radiogroup`/`radio` vs. plain `aria-pressed`) — all real duplication, but unifying them means touching already-gated, tested interactive components for a stylistic win; left for a dedicated follow-up rather than folded into this pass. Also skipped: two double-pass tally functions and ~15 full-array-filter passes in a filter popover — real by count, negligible at this app's actual match sizes (~100-300 points).

`vercel-react-best-practices` (triggered: 18 new `"use client"` lines, 19 new component files):
- Applied: wrapped `ShotsTab`/`FilmTab` in `next/dynamic()` in `page.tsx` — these two subtrees (~3,300 lines combined: filters, an SVG court, a custom video player) were being eagerly bundled into every page load even when the visitor lands on the default Statistics tab. Verified via a full `npm run build` that the pattern is valid from this Server Component.
- Skipped, noted: `content-visibility` on the film room's point rows (up to ~300) — real per the ruleset, judged lower-impact than the ruleset's reference scale at this app's actual data sizes.

**Stage 3 — correctness and safety.**

`code-review` at medium effort (8 angles, verified candidates): 6 findings.
- **Fixed**: `point-list.tsx`'s Saved-tab empty state ignored an active film filter — a player with real bookmarks hidden by the current cut saw "Nothing bookmarked yet," indistinguishable from having none. Now distinguishes the two cases and offers "Clear filter" when that's what's actually happening.
- **Skipped, reported for triage** (none blocking; three touch product/design decisions the brief's "artboard wins, don't improve" constraint puts outside this review's mandate):
  1. `page.tsx` — `playerAverages` is fetched and threaded through `MatchDataProvider` but has zero consumers; the old page's "vs your average" comparison chips were dropped with no replacement and no entry in design.md's documented cuts. Whether to restore the feature or drop the now-dead fetch is a product call.
  2. `insight-strip.tsx` — returns `null` with no fallback when a match has no `insights.summary`, unlike the old page's 3-way fallback (summary → topInsight → an explanatory placeholder). A design call on what the empty state should say.
  3. `head-to-head-card.tsx` — defines a second Serve/Return/Other stat taxonomy alongside `statistics/stat-progression-chart.tsx`'s private `STAT_CONFIG`, which CLAUDE.md already names as needing extraction "before using it from a second component." The two configs have already diverged in content, so reconciling them safely is more than a quality-pass edit.
  4. `use-match-sides.ts` — `initialsOf()` reimplements initials extraction instead of reusing `getInitials()` from `match-utils.ts`, dropping its "Player & Partner" doubles-team handling (PLAUSIBLE — doubles reachability on this page wasn't confirmed).
  5. `point-endings-card.tsx` — the outcomes legend only ever shows the viewer's own bar colors, never the opponent's distinct palette, even though the opponent's bar renders in different hues (PLAUSIBLE, cosmetic).

`pipeline-guardrails-reviewer` and `rls-boundary-reviewer` — both dispatched fresh over the full range (`base` to current working tree, fail-closed per this repo's pr-check policy since the range includes non-task-gated pipeline/amendment commits): **clean, no findings.** Both explicitly re-traced §4 attribution end-to-end (including every file touched by the quality pass) rather than trusting the per-task history, and re-confirmed the §3.3 short-circuit is unaffected by the new `next/dynamic()` wrapping.

## Consciously left (not fixed, not blocking)

- The 5 skipped code-review findings above.
- The 2 skipped `/simplify` duplication patterns (note-strip, cut-sentence, segmented control) — real, lower-priority, flagged for a dedicated cleanup pass rather than risking a change to tested interactive components mid-review.
- `docs/match-detail-v46-flags.md`'s own open entries (3, 7, 9) — pre-existing, already tracked, out of this review's scope.
- No literal pixel-diff visual verification of the artboard match (see success criterion 1's caveat) — this environment cannot produce one; a human should do one pass with a real session before considering the artboard-fidelity claim fully closed.

## Also consulted

Beyond the declared inputs (build.md, the diff, brief.md, pr-check's own skill):
- `.claude/tasks/claude-design-round-46-matchid-d97cbd.log.md` — full per-task build/gate history, referenced throughout for context on what was already verified.
- `docs/ui-revamp-guardrails.md`, `CLAUDE.md` — the guardrail and convention documents the reviewers checked against.
- `docs/match-detail-v46-flags.md`, `design.md` — cross-referenced to confirm several code-review candidates were or weren't already-documented intentional cuts.
- `src/styles/design-system/typography.css`, `src/lib/data/match-utils.ts` — read directly to verify two specific findings (the `.text-micro` color redundancy in the LegendSwatch unification; the `getInitials()`/`initialsOf()` divergence).
