# Run log — claude/opponents-page-build-a55d4b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Personal opponents loader + pure grouping module — done

**gate:** mechanical pass · completion pass

**changed:** New `src/lib/data/personal-opponents.ts` (pure grouping: key = `opponent_player_id` else normalised opponent name; record, last-five form, last match, `recent` ×6, four measures, season helpers, totals), `src/lib/data/personal-opponents-server.ts` (`getPersonalOpponents(userId)`, `cache()`d, server client only, own `matches` read on `created_by = userId AND program_id IS NULL` + `match_stats_with_percentages`), `tests/personal-opponents.spec.ts` (15 offline tests). Deviations kept: viewer side via `playerSide()` + `getMyPlayerIds()`; name key is side-aware (`player1_name` when the viewer sits as player 2); matches naming no opponent are left out, so `totals.matches` counts matches against a named opponent; dates are stored ISO values; matches where `playerSide` is null are dropped.

**follow-ups:**

1. Merge a name group into the id group it matches once `opponent_player_id` starts being written.
2. Add a short `pill` label beside `label` on measures if the drawer wants "Pts won"-style pills.
3. Expose an `unattributed` count for matches with no opponent named.
4. `currentSeason` reads the clock in UTC — a user-zone clock would be exact around Aug 1.
5. The PostToolUse typecheck hook picks up the main checkout's `_video/` errors from inside a worktree.
6. Confirm at /pr-check that a `created_by = me` match is never legitimately dropped by the null-`playerSide` skip.
