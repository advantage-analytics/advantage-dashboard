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
