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
