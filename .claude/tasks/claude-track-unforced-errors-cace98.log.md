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

## T7 · Ask says "errors" on an unjudged match — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** `measures.ts`: new `errors` measure ("Errors", unforced + coalesce(forced, 0)) via `ASK_DERIVED_COUNTERS`/`askCounterSql`, used by compare and review SQL. `compare.ts`: "errors"/"mistakes" map to `errors`, "unforced errors" stays on `unforced_errors`. `review.ts`: the review's error row is now `errors` ("Errors") for everyone. `schema.ts`: new `unforced_errors`/`forced_errors` meanings. `prompts.ts`: `ASK_ERRORS_RULE` in both answer prompts; the worked example's rows now carry forced errors so it is a judged match. No `database.ts` or SQL-guard change; live `ask.match_stats` already exposes `forced_errors`. Specs: ask-measures, ask-compare, ask-prompt, ask-review.
**NOT APPLIED LIVE:** `supabase/migrations/20261029233000_ask_error_column_comments.sql` — two `comment on column ask.match_stats.*` statements (comments only; `ask-prompt.spec.ts` holds schema meanings equal to the latest migration comment). Live comments stay stale until it is applied with the user's approval; if the connector applies it, rename the file to the version it records.
**follow-ups:**

1. Compare's default "standard" measure set and the "Consistent" quality word still use `unforced_errors`, so a default comparison on an unjudged match prints "Unforced errors". Switch to `errors` (or pick per result).
2. Planner prompt could ask model-written SQL to return a count of null `forced_errors`, so the answer step can obey the "any match null" rule on aggregated rows.
3. `answer-render` could relabel `unforced_errors` to "Errors" in code when the row's `forced_errors` is null.

## T9 · Label console: Forced | Unforced tray pair, key E, shortcut sheet — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** `stroke-keys.ts`: `errorKindShotId` (last live non-let stroke, only when `isMarkableError`), `nextErrorKind` (unmarked→forced→unforced→forced), `isErrorKindKey`, `errorKindKeyPatch`. `label-black-shot-row.tsx`: the selected last stroke's tray draws `ErrorKindPair` ("Forced" | "Unforced" + E chip, `aria-pressed`) after Reset, before Delete; tray `flex-nowrap`, gap 16→12px, width budget in the `ShotTray` doc comment (~572px of 640). `label-black-parts.tsx`: `BlackTextAction` gains `pressed`. `label-console.tsx`: E branch in the shared `consoleKey` dispatch (inside `keysAreSpoken`), writes through `patchPoint`; rollback restores `errorKind`. `label-shortcuts.ts`: E row after Serve. Specs: label-black-rows, label-stroke-keys-court-zoom, label-shortcuts, label-console-edit.
**follow-ups:**

1. No browser harness for the black rail: add one (e.g. in `/design/labels`) so a spec can assert the tray's width at 640px; until then `/pr-check` eyes-on should look at it.
2. The undo/redo case runs against a modelled whole-row journal, not a real `undoLabelOp` round trip.

## T10 · Point sentence names the error kind; overview stats add Forced errors — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** `label-black-format.ts`: `pointSentence` case "error" reads "{Stroke} forced/unforced error by X", or today's "{Stroke} error by X" while unmarked (`SentencePoint.errorKind` optional). `apply.ts`: `SideStats.forcedErrors`; `expectedStats` counts forced apart, unforced counts the rest (null included); `AppliedPointRow` carries a non-column `errorKind`, set only for an error ending, never inserted. `label-dashboard.tsx`: "Forced errors" row after "Unforced errors". Specs: label-black-rows, label-apply.
**follow-ups:**

1. Until T11, `resultTypeOf` still writes every error as "… Unforced Error", so the overview's forced count can be non-zero while the published strings are all unforced.

## T11 · Publish writes the error kind to result_type and sets the judged marker — blocked

**gate:** not reached — dispatch refused
**reason:** Claude Code's auto-mode classifier refused to dispatch the fable subagent as a "Production Deploy": the task changes the live `verify_match` function (drop + re-create with `p_errors_judged`). Needs the user's explicit approval for that live change; reset `status:` to `todo` once given. Note for the re-run: `calculate_match_stats` reads `errors_judged_at` at run time, so the marker must be stamped before the stats run (or `verify_match` must re-run them), or a fully marked publish still gets NULL forced_errors.
**stash:** no stash — the task produced no changes

## T12 · Mark complete blocks while any error is unmarked — done

**gate:** mechanical PASS · completion VERDICT: pass
**changed:** `session-status.ts`: `unmarkedErrors(points, ghosts)` (null kind + `isMarkableError`, rail numbers ascending); `completeWarnings` untouched. `label-confirm.ts`: `complete-session` takes `blockers`; blocked copy "Mark {n} error(s) before publishing" naming the points; unblocked copy byte-identical. `label-confirm-dialog.tsx`: blocked → Publish disabled, cancel reads "Close", blue "Go to point {first}" text action closes and opens that point, list leads with "{n} errors not marked forced or unforced". `label-console.tsx`: `askComplete` passes the blockers; `goToPointNumber` wired via `findGap`. Shared `ui/confirm-dialog.tsx` gains additive `confirmDisabled` (default false). Specs: label-session-status, label-console; label-console-operations fixture gains `blockers: []`.
**follow-ups:**

1. The publish path (`completeLabelSession` / `writeLabelSessionComplete`) doesn't refuse unmarked errors itself — a stale tab or direct call could still publish past the gate.
2. The overview's publish checklist (`LabelDashboard` warnings) could show the same unmarked-errors line.
3. Blockers are a snapshot when the dialog opens; marking an error while it is open doesn't update it.
4. "the shared confirm holds a disabled action" test asserts on source text with a regex — brittle.

## T6 · AI summary says "errors" on an unjudged match — done

**gate:** mechanical PASS after a flake re-run (lint pass, typecheck pass; full suite had 1 failure, `tests/admin-search.spec.ts:203` "⌘K opens it from the page…", unreachable from this diff — re-run alone `--repeat-each=5`: 25/25 passed) · completion VERDICT: pass
**changed:** Re-run after the user approved the deploy ("Approve both"). `generate-insights/index.ts`: Deno copy of `errorSplitJudged` (reads `source_provider`, `verified`, `verified_at`, `errors_judged_at`; a failed read counts as unjudged); `presentErrors` gives an unjudged match one `errors` figure (and `forehand_errors`/`backhand_errors`), no key or word with "forced"; one prompt sentence on the unjudged path; prior-match averages summed per match then averaged as `errors`. Judged matches unchanged. `responseSchema`, model and sampling untouched. Spec: 4 new cases in `generate-insights-prompt.spec.ts`.
**deployed:** `generate-insights` v34 → **v35** via `deploy_edge_function` (plain MCP), `verify_jwt` true as before, single `index.ts`; runner confirmed v35 ACTIVE with `list_edge_functions`.
**follow-ups:**

1. Nothing stops Gemini writing "unforced" by itself on an unjudged match; a post-check that retries a summary containing "forced" would enforce it.
2. Existing summaries on unjudged matches still say "unforced"; regenerating them is a separate, approved data change.
3. `presentErrors` drops any key matching /forced/i — implicit; worth a comment if new columns arrive.
