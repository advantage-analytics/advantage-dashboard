# Run log — claude/match-details-implementation-97c1ee

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · KPI history loader and its spec — done
- **gate:** mechanical — `npm run lint` initially FAILED with 337 `no-undef`
  errors, every one of them in
  `work/match-details-47f/02_design/references/_ds_bundle.js`, a compiled React
  bundle vendored as stage-02 pipeline reference material by commit `4ec11d5`.
  Not T1's code (`npx eslint` on both of T1's files was already clean), and it
  would have failed the gate for every task on this branch. Fixed at the root by
  adding `work/**` to `eslint.config.mjs`'s global ignores, beside the existing
  `.agents/**` and `.claude/worktrees/**` entries it matches in kind; re-ran to
  0 errors / 38 warnings (baseline is 43). `npx tsc --noEmit` exit 0, `npm test`
  271 passed. Completion review `VERDICT: pass`. Guardrails — `rls-boundary-reviewer`
  ran (diff touches `src/lib/data/`) and reported no findings;
  `pipeline-guardrails-reviewer` skipped, the diff touches no dashboard route,
  dashboard component or wizard file.
- **changed:** `match-stats-server.ts` gains a private `fetchPlayerStatRows()`
  factored out of `getPlayerAverageStats` (whose signature and 18 returned
  fields are unchanged, verified against the pre-diff file), now carrying
  `match_id` and the match `date` onto each row. On it: `MatchKpiKey`,
  `MatchKpiHistory`, `KPI_SERIES_WINDOW` (8), `KPI_SERIES_MIN_POINTS` (2), the
  pure `buildKpiHistory(rows, matchId)` and the I/O `getMatchKpiHistory(playerId,
  matchId, matchDate)`. `tests/match-kpi-history.spec.ts` is new: 14
  database-free tests over the pure function. `eslint.config.mjs` carries the
  runner's ignore fix described above.
- **follow-ups:**
  1. `getMatchKpiHistory` takes a single `playerId` where `getPlayerAverageStats`
     takes the whole id set (login plus claimed roster profile). A person whose
     matches are split across two ids gets a history covering only one. Widening
     the parameter to `readonly string[]` is small and self-contained, and T2's
     call site is where it would be decided.
  2. The `is_player1 = true` restriction — inherited from the average, not
     introduced here — means matches the player appeared in as player 2 are
     absent from both the baseline and the line. Widening it needs the
     `statKey(match_id, is_player1)` pairing from `aggregate.ts` plus a
     viewer-side resolution per row, and would change `getPlayerAverageStats`
     too, so it wants its own branch.
  3. The RLS review noted for T2 specifically: `playerId` must keep being
     derived server-side from the already-authorized match row and never
     accepted as client input — the loader authenticates nothing itself, RLS
     underneath does.
