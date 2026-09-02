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

## T2 · Thread kpiHistory through getMatchDetailData and the provider — done
- **gate:** mechanical — `npm run lint` 0 errors / 37 warnings (baseline 43),
  `npx tsc --noEmit` exit 0, `npm test` green. Completion review
  `VERDICT: pass`; it independently verified the extracted attribution
  predicate is algebraically identical to the inline one it replaced for null
  ids, an empty id set and a viewer who is neither player, and judged the
  fifth-file signature widening minimal and justified rather than scope creep.
  Guardrails — both ran, the diff touching both surfaces.
  `pipeline-guardrails-reviewer`: no blocking finding; confirmed §4 attribution
  intact end to end (the KPI baseline cannot land on a different player than
  the one `isUserPlayer1` seated as "you"), §3.3 short-circuit untouched, §3.1
  wizard fields and §3.2 status predicates absent from the diff, no
  customer-facing "splitstep" string. `rls-boundary-reviewer`: no findings;
  every read stays on the cookie-scoped client, no `supabase/admin.ts` import
  on any path, the id widening changes no boundary (`fetchPlayerStatRows`
  already took an array, and the ids passed all name one authenticated
  person), and `getMatchDetailData`'s five existing reads are byte-identical
  in argument.
- **changed:** `match-detail-server.ts` gains a private `resolveYouSide(row,
  myPlayerIds)` — the single home of the you-side rule, now called by both
  `transformDbMatchToMatch` and the new `resolveKpiHistory`, built on the
  existing `isMe()` from `player-identity-server.ts`. `resolveKpiHistory` sets
  `viewerIsPlayer` (which the loader deliberately leaves `false`) and joins the
  existing `Promise.all` wave as a sixth branch, chained after
  `getMyPlayerIds()` the way the averages branch is. `kpiHistory` is on the
  returned data, on `MatchDataProvider`/`useMatchData()` defaulting to `null`,
  and passed by `layout.tsx`; `playerAverages` is untouched.
  `match-stats-server.ts` widens `getMatchKpiHistory`'s first parameter to
  `readonly string[]` (T1's own flagged follow-up, decided here): a claimed
  athlete's matches sit under a login id and a roster-profile id, so a
  single-id history would cover half a season under a label reading "your
  avg", and would disagree with `getPlayerAverageStats`, which already spans
  the set. No component reads the new field yet, so nothing rendered changes.
- **follow-ups:**
  1. **The two-state you-side rule, and what a coach sees.** Both the subagent
     and both reviewers landed on the same pre-existing behaviour from
     different directions: `isUserPlayer1` is two-state, so a viewer who is
     NEITHER player — a coach or teammate reading an athlete's match — is
     seated at player 2, the opponent. That is unchanged by T2 and was true
     before it, but T2 makes it consequential: `resolveKpiHistory` will now
     compute and ship that player's up-to-8-match season baseline and
     sparkline to a non-participant's browser (every row of it already inside
     that viewer's RLS visibility, so not an authorization defect — the RLS
     reviewer was explicit about that — but new information density on the
     page, and a product decision nobody has made). It also means T5's coach
     copy, "vs avg", would describe the opponent's history. A legacy row with
     no player ids at all gets its win/loss inverted by the same rule, the bug
     `statistics-server.ts` already documents. `src/lib/data/viewer-side.ts`
     holds the three-state rule the Home page uses. Worth its own task, and
     worth settling BEFORE T5 renders the strip.
  2. `fetchPlayerStatRows` counts only matches where the id was `player1_id`
     (`.eq("is_player1", true)`), inherited from `getPlayerAverageStats`. A
     match the subject played as player 2 contributes no point — possibly
     including the anchor match itself in the seat-two case — so the strip can
     show a truncated series or none. T5 should check this against a real
     seat-two match.
  3. A coach's history covers only the row's single id; resolving the
     athlete's full id set would need `program_roster_full`, which maps
     `player_id` to `user_id`.
  4. `playerAverages` now has no consumer anywhere — only the loader, provider
     and layout carry it. A removal candidate once the strip reads
     `kpiHistory`.
  5. No dev-server check ran: the subagent could not create a logged-in
     session, and the secrets guard blocked its `.env.local` probe. The "no
     rendered output" claim rests on the verified predicate equivalence and on
     no component reading the new field — both independently confirmed by the
     completion reviewer.
