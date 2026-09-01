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
