# Run log — claude/design-round-46-matchid-d97cbd

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Build the two-pane shell, rail and tabs; flip page.tsx onto them — blocked

**gate:** mechanical (lint/tsc/test) pass · task-completion-reviewer `VERDICT: needs-work` · pipeline-guardrails-reviewer 1 finding · rls-boundary-reviewer skipped (no data/api/migration surface in diff)

**failed because:**
1. Completion review — the "each pane scrolling independently" criterion is not met: `dashboard-shell.tsx:73` (`<main className="flex flex-1 flex-col">`) and `page-transition.tsx:48` omit `min-h-0`, so the content pane never gets a bounded height and the ancestor scrolls as one blob (reviewer reproduced in an isolated CSS test; adding `min-h-0` at both spots fixes it). Both files sit OUTSIDE T1's `files:` list, so the subagent could not have fixed it in scope — the task's file list needs amending, not just the code.
2. Guardrails — `page.tsx` passes `film={video ? "card" : "note"}` with no `isDerived` gate, so the rail note "the stats came from the SwingVision export" renders for Advantage Intelligence–analyzed matches whose trimmed copy is missing/reclaimed — a customer-visible provenance error. Fix direction: gate the note on `!isDerived` (neutral "no video available" copy for derived matches), or defer the note strip to T6 as originally scoped.

**stash:** bd4b446832914cd6da22f0f54eb2604290025595 (`blocked: T1` — page.tsx/layout.tsx edits + 4 new match-detail components; work is otherwise complete and gates-green mechanically)

**to resume:** `git stash apply bd4b446832914cd6da22f0f54eb2604290025595`, apply the two fixes above (amend T1's `files:` to include `dashboard-shell.tsx` + `page-transition.tsx` for the min-h-0 chain), reset status to `todo`, re-run.

**follow-ups (from the build subagent):**
1. Tab switching via `router.push` refetches the whole RSC wave (reconcile + analysis + video) per switch; `window.history.pushState` shallow routing would keep back-button behavior with zero server round-trips.
2. `MatchDataProvider`'s `insights` context type omits `summary` while the server type has it — close the typing gap when T2 reads insights client-side.
3. Icons: `public/icons/{tennis-court-icon,tournament-icon}.svg` exist but bake `#888888` stroke; a token-colored variant may be wanted.

## T1 · Build the two-pane shell, rail and tabs; flip page.tsx onto them — done

**gate:** mechanical (lint/tsc/test) pass, 3rd pass · task-completion-reviewer `VERDICT: pass`, 3rd pass · pipeline-guardrails-reviewer clean, 3rd pass, no findings · rls-boundary-reviewer skipped (no data/api/migration surface in diff)

**changed:** Two-pane shell (300px rail + tabbed content pane, artboard 46a–d) replaces the old single-column render of `/dashboard/matches/[matchId]`. New: `use-match-sides.ts` (single you/opp decision point keyed on `match.isUserPlayer1`), `match-detail-shell.tsx`, `match-rail.tsx`, `match-tabs.tsx` (`?tab=` synced via `router.push` so back restores the prior tab). `page.tsx` keeps all data fetching/gates byte-identical (§3.3 short-circuit, `withStatsPublished`/`analysisFor` untouched) and parks the surviving cards per tab (Statistics: AiInsightCard/UnpublishedStatsNotice/DerivedStatsNotice/PerformanceTrackerCard/MatchStatisticsCard; Shots: ServePlacementCard; Film: MatchVideoCard or placeholder). `MatchKpiRow`, `PerformanceProfileCard`, `KeyMomentsCard`, the hero prev/next arrows, and the standalone MatchVideoCard section left the render now rather than being parked (design.md's approved "Dropped by the artboard" list — task criterion amended in this run to match, see below). `layout.tsx`'s wrapper became a self-contained `h-[calc(100vh-var(--header-h))] overflow-hidden` box (precedent: `UploadMatchFlow.tsx`'s identical calc pattern) rather than depending on `dashboard-shell.tsx`/`page-transition.tsx` passing `min-h-0` through — those two shared files are untouched, avoiding a verified side effect on 6 EventShell-based schedule routes that an earlier version of this fix would have caused. The rail's no-video copy is gated by an allowlist on `match.sourceProvider === "swing-vision"` (not merely `!video`, and not `!== "splitstep"`): only a true SwingVision import gets the SwingVision-export claim; a video-analyzed match missing its trimmed copy, a hand-scored match (`sourceProvider: null`), or any other provider gets a neutral "No video available for this match."

**Two blocked→fixed rounds this run** (see prior two log entries below for the original findings): round 2 caught that the round-1 scroll fix touched shared components with an unreviewed 6-route blast radius (reverted, replaced with the self-contained layout.tsx fix) and that the provenance gate missed the `sourceProvider === null` manual-entry case (fixed to an allowlist). The task's own `done when:` text was also amended twice during this run — once to add the two extra files then needed for the scroll fix (later abandoned when the fix was retargeted), and once to narrow "no stat data disappears" to match design.md's already-approved drop list, since the original criterion text was drafted too broadly at stage 04 without reconciling it against the design.

**follow-ups (from the build subagent, T1's original build):**
1. Tab switching via `router.push` refetches the whole RSC wave (reconcile + analysis + video) per switch; `window.history.pushState` shallow routing would keep back-button behavior with zero server round-trips.
2. `MatchDataProvider`'s `insights` context type omits `summary` while the server type has it — close the typing gap when T2 reads insights client-side.
3. Icons: `public/icons/{tennis-court-icon,tournament-icon}.svg` exist but bake `#888888` stroke; a token-colored variant may be wanted.

## T2 · Statistics tab: insight strip + head-to-head card — done

**gate:** mechanical (lint/tsc/test) pass · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer clean, no findings · rls-boundary-reviewer skipped (no data/api/migration surface in diff)

**changed:** New `insight-strip.tsx` (46a strip — ink-900 logo chip reusing `home/focus-card.tsx`'s existing pattern since no `logo-mark.svg` exists, insight summary as the sole claim line with no fabricated evidence count, dismiss X via `useSyncExternalStore` reusing `AiInsightCard`'s exact localStorage key so dismissal state carries over), `head-to-head-card.tsx` (legend + set-score chips from `sides.sets` + the relocated SERVE/RETURN/OTHER configs and `buildStatRows`/`statDisplay`, now keyed `you`/`opp` instead of `p1`/`p2`; per-set filtering recomputes derivable rows straight from `points` and falls back to the existing em-dash/tooltip convention — including staying withheld under a filter when the whole-match view is withheld, so a derived match's un-published aces can't leak a confident number through a set filter), `statistics-tab.tsx` (composes the two new cards + the still-parked PerformanceTrackerCard + the existing UnpublishedStatsNotice/DerivedStatsNotice gating, unchanged). `page.tsx` drops the stat configs/builders/chip logic entirely and renders `<StatisticsTab>` in the tab slot. All you/opp attribution — including the new per-set point-bucketing — routes through `useMatchSides()`/`sides.you.isPlayer1`; both reviewers traced this explicitly. AiInsightCard/MatchStatisticsCard files are unrendered but not deleted (T7).

**follow-ups (from the build subagent):**
1. The dismissed insight strip has no restore affordance on the Statistics tab (the old AiInsightCard had a "Show AI Insight" button; 46a has none) — the rail still shows the summary on the other three tabs. Worth a design call before T7.
2. `MatchStatisticsCard`'s `STAT_DESCRIPTIONS` tooltip copy wasn't carried over to the new rows (plain centered labels per the artboard) — if that copy is worth keeping, it needs a home before the old card is deleted.
3. Service Games Won / Service Breaks could become derivable per-set by folding game winners off each game's last point; left out as too fragile for v1 (matches design.md open question #4).
4. `match-kpi-row.tsx` imports `statRowAnchorId` from `match-statistics-card.tsx`, and neither is rendered anymore — both parked for T7, but confirm T7 deletes the pair together since the anchor contract they share is now dead.

## T3 · Statistics tab: momentum, rally length, point endings charts — done

**gate:** mechanical (lint/tsc/test) pass · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer clean, no findings · rls-boundary-reviewer skipped (no data/api/migration surface in diff)

**changed:** New `performance-tracker-chart.tsx` (mirrored momentum area chart, viewBox `0 0 600 200`, clipPath-split you/opp fills, break-of-serve dashed verticals ported from `performance-tracker.tsx`'s `detectBreaks()` with two fixes — the final game now evaluated, tiebreak games skipped via a shared-server check), `rally-length-card.tsx` (marimekko banded by rallyLength 1–4/5–8/9+, width ∝ share, fill ∝ you-won%, dark tooltips summing to a "banded points only" header total), `point-endings-card.tsx` (two 100%-stacked bars, you first per `useMatchSides()`, resultType bucketing sourced from `calculate_match_stats`'s SQL predicate, Aces segment genuinely absent — not zero-hidden — for splitstep-derived matches since derivation never emits `'Ace'` at all). `statistics-tab.tsx` swaps the parked PerformanceTrackerCard for PerformanceTrackerChart and adds the two new cards in the artboard's order. `page.tsx` drops three now-dead props that only fed the old card. Every you/opp bucket across all three charts routes through `useMatchSides()`; both reviewers traced this explicitly per-file. Reduced motion via the repo's existing `useReducedMotion()` (framer-motion) pattern, opacity/pathLength only.

**follow-ups (from the build subagent):**
1. The momentum chart is hover-only; the retired `MomentumChartCompact` had full keyboard navigation (arrows/Home/End/Escape) and an aria-live readout. Worth restoring on the new chart before T7 deletes the old one, or explicitly deciding it's dropped.
2. `MomentumChartCompact` (`matches/performance-tracker.tsx`) loses its only importer once T7 deletes `performance-tracker-card.tsx` — check whether it should go too.
3. `lib/design/player-colors.ts` (`PLAYER_1`/`PLAYER_2`/`EVENT_ACCENT`) is player-order-keyed color, the exact shape guardrails §4 warns about — worth auditing its remaining call sites on a separate branch.
