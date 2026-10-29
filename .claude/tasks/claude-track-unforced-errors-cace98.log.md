# Run log — claude/track-unforced-errors-cace98

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Migration: errors_judged_at marker and calculate_match_stats counts forced errors — blocked

**gate:** not reached — dispatch refused
**reason:** Claude Code's auto-mode classifier refused to dispatch the fable subagent, because the task applies a migration to the live production project (pouxujkhtbvkdwbzfvka). Needs the user's explicit approval for the live write; reset `status:` to `todo` once given. T2–T4, T6, T7 and T11 wait on it.
**stash:** no stash — the task produced no changes

## T5 · Cross-match surfaces always say "Errors" (unforced + forced) — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** One helper `totalErrors(unforced, forced)` in `player-profile.ts` (unforced + coalesce(forced, 0), null when unforced is null). Performance tracker tile `unforced-errors` → "ERRORS" with the total (key unchanged); Home recent matches' `errors` is the total; profile chip "Unforced" → "Errors" (`ProfileStatRow.unforcedErrors` renamed `errors`; `chipsFrom`/`ProfileChip` moved to `player-profile.ts`, re-exported); `STAT_COLUMNS` and the averaged select add `forced_errors`; `averageErrors()` averages per-match totals to one decimal. Specs: `player-profile.spec.ts` (13 = 10 + 3, null cases), `match-kpi-history.spec.ts` (10.5). Per-match cards untouched.
**follow-ups:**

1. `getPlayerAverageStats` (match-stats-server.ts) has no callers — delete it or wire it up; its averaged-errors change is unreachable today.
2. `PlayerStatistics.unforcedErrors` now carries a total on the averaged path — consider renaming.
3. `totalErrors` lives in `player-profile.ts` but is imported by `home-recent-data.ts` and `match-stats-server.ts`; a shared home (e.g. `aggregate.ts`) may suit it better.
4. Ask design previews (`src/app/design/ask/…`) and the admin label overview still say "Unforced" — out of this task's scope.

## T8 · label_points.error_kind write path, undo/redo and point shape — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** `edit.ts`: `error_kind` joins `LABEL_POINT_VALUE_FIELDS` (forced | unforced | null, anything else rejected); `labelPointStatusAfterPatch` now filters on the unchanged `LABEL_POINT_SEED_FIELDS`, so marking a kind never flips a point to edited. `session.ts`: `LabelErrorKind`, `LabelPoint.errorKind`. `rows.ts`: column selected and mapped. `ending-derived.ts`: `isMarkableError(point, ghosts)`, true only for a derived `error`. The write path (`writeLabelPointEdit`) and undo/redo (whole-row SQL journal, `applyUndoDiff`) needed no change beyond the read-back column. One-line `errorKind: null` in `point-insert.ts`, `point-split.ts` and two fixtures. Specs: `label-edit`, `label-ending-derived`, `label-undo`.
**follow-ups:**

1. Reset (`reset.ts` / `reset-session.ts`) doesn't clear `error_kind` — decide whether resetting a point should.
2. A later edit that stops a point ending on an error leaves a stale `error_kind`: clear it when the ending settles, or have readers gate on `isMarkableError` (T9/T10/T11/T12 should do the latter at least).
3. Combine/split don't carry `error_kind` to the surviving or new points.
4. `session.ts`: the `LabelErrorKind` block sits between the `LabelPoint` doc comment and its interface, orphaning the comment.

## T1 · Migration: errors_judged_at marker and calculate_match_stats counts forced errors — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** Re-run after the user approved the live write ("Fix all teh blockers and then continue with the goal command"). Migration `20261029222042_forced_errors_judged` applied live (plain MCP, first try) and committed: adds `matches.errors_judged_at` with its comment; `calculate_match_stats` counts `forced_errors` (Forced Error, not Unforced) only when `source_provider = 'swing-vision'` or `errors_judged_at` is set, NULL otherwise — rest of the body byte-identical to the previous live one (md5 checked); grants restated without anon; closing DO block recomputes every SwingVision match. Live after apply: 44 SwingVision matches, 0 with NULL forced_errors, sum 261; 0 non-SwingVision rows non-null; 18 verified matches untouched; 0 matches judged. `result-type.ts` header updated; `tests/forced-errors-migration.spec.ts` (6 cases).
**follow-ups:**

1. `supabase/migrations/20260219000000_populate_serve_return_placement_stats.sql` still carries a stale `calculate_match_stats` — add a pointer comment to the new file.
2. T11 must run `calculate_match_stats` after stamping `errors_judged_at` (the function reads it at run time); a spec on that order is cheap.
3. `ask.match_stats` exposes `forced_errors` already, so Ask sees real counts on SwingVision matches now — T7's schema copy should state the NULL = unjudged meaning.

## T2 · errorSplitJudged predicate and forced-errors plumbing into report data — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** New pure `errorSplitJudged()` in `src/lib/data/error-split.ts` (swing-vision, or verified with `errors_judged_at` set) with `tests/error-split.spec.ts`. `match-detail-server.ts` selects `errors_judged_at` and sets `Match.errorSplitJudged` (shared with the `/m/[token]` loader). `MatchFilterContext.errorSplitJudged` built once in `buildFilterContext` (no `match-report-context.tsx` exists; the provider needed no change). `PlayerStatistics.forcedErrors: number | null` read straight from `forced_errors`, null kept. Sample match is splitstep (anonymised), so unjudged with null forced errors. No user-visible copy changed.
**follow-ups:**

1. `Match.errorSplitJudged` is optional — a loader that forgets it reads as "Errors"; consider making it required.
2. `shots/viz-model.ts` fallback context (~:822) leaves the flag absent (= not judged) — fine, worth knowing for T4.
3. Comment at `match-stats-server.ts:281` (null forced counts as 0 in career averages) vs the per-match "never coerce" rule — reconcile wording.

## T3 · Report cards and Film labels: "Errors" until the split is judged — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** Head to head reads `errorSplitJudged` from the filter context: unjudged shows one "Errors" row (unforced + forced, via a new `plusKey`), judged shows "Unforced errors" then "Forced errors" (`ending: "forced-error"`) — both SwingVision and derived row sets via `withErrorSplit`. `FilmCutEnding` gains `forced-error` and `error`. Point endings: unjudged outcome "Errors" with `{ resultEnding: ["error"], ending: "error" }`, tally includes forced. `pointResultLabel` drops "Unforced"/"Forced" before a closing "Error" when unjudged (stored value untouched); `film-fullscreen.tsx` passes the flag. Specs: match-h2h-rows, head-to-head-cuts, film-cut-intent, match-filters-model; report-empty-states gained a `useMatchFilters` stub. Widget-states checklist run and marked.
**follow-ups:**

1. Unjudged H2H "Errors" row's cut is `{ resultEnding: ["error"] }` as the criterion said, which in this codebase also opens double faults, while the figure leaves them out. One-line fix: `ERRORS_ROW.cut = { resultEnding: ["error"], ending: "error" }` (matches Point endings). Needs the user's call.
2. `useMatchFilters()` fallback context (`match-filters/provider.tsx` ~:240) doesn't set `errorSplitJudged`; every current route wraps a provider.
3. `rowLeader` doc comment still says "Two of the fifteen rows invert".

## T4 · Shots tab errors cut: "Errors" until judged, forced URL fallback — blocked

**gate:** mechanical FAIL (lint pass, typecheck pass, test FAIL) · completion VERDICT: pass (not sufficient)
**reason:** Six offline Shots browser specs fail with T4's diff: `viz-all-zones-browser.spec.ts:93` and `:198`, `viz-rally-placement-browser.spec.ts:86` and `:164`, `viz-serve-zones-browser.spec.ts:85` and `:138`. Reproduced alone: the harness draws no `[data-viz-mark]` and no `output` (0 of 42 marks), so the Shots view fails to render — most likely the browser harness has no match-filter provider and T4's new `useMatchFilters()` reads (viz-state-context, default-tiles/viz-wall, filters-popover) break it. Fix in the re-run: give the harness a provider or make those reads tolerate the fallback context, then re-run the three specs. Runner note: the first gate's GATE FAIL was misread as a pass and committed; that commit was undone with `git reset --soft` before this entry, nothing was pushed.
**stash:** beb26b319fb90fdc291a3e33930e8a4299748c29 (`git stash apply beb26b31` restores the work; the completion reviewer had passed it against the criteria)

## T6 · AI summary says "errors" on an unjudged match — blocked

**gate:** not reached — dispatch refused
**reason:** Claude Code's auto-mode classifier refused to dispatch the subagent as a "Production Deploy": the task ends with `deploy_edge_function` for `generate-insights` on the live project. Needs the user's explicit approval to deploy; reset `status:` to `todo` once given.
**stash:** no stash — the task produced no changes
