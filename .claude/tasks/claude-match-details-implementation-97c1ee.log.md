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

## T3 · Set-scope primitive: hook, helpers, chips, spec — done
- **gate:** mechanical — `npm run lint` 0 errors / 37 warnings (baseline 43),
  `npx tsc --noEmit` exit 0, `npm test` green with the new spec's 19 tests.
  Completion review `VERDICT: pass`; it re-ran the spec itself and ruled on the
  one judgement call below. Guardrails — `pipeline-guardrails-reviewer` ran
  (both new files are untracked but land under `src/components/dashboard/`, so
  the `git ls-files --others` half of the surface check is what caught it) and
  reported clean: `useMatchSides().sets` is the sole, unbypassed orientation
  source, the tiebreak games rule is right, and the design-system radius and
  blue-accent rules hold. `rls-boundary-reviewer` skipped — no query, no
  loader, no migration; the file reads context only.
- **changed:** new `set-scope.tsx` with a pure layer (`selectableSets`,
  `parseSetParam`, `setScopeQuery`, `scopePoints`, `scopeMeta`), the
  `useSetScope()` hook over `?set=` writing with `router.replace` and
  `scroll: false`, and the `SetScopeChips` segmented control. New
  `tests/set-scope.spec.ts`, 19 database-free tests. Nothing mounts the chips
  yet; T4 does that.
- **follow-ups:**
  1. **Sequencing risk the guardrails reviewer raised, worth acting on before
     T4.** T4 mounts `SetScopeChips` in the tab row; T6 removes
     `head-to-head-card.tsx`'s own local `activeSet` chips. Neither depends on
     the other, and file order runs T4 first — so between them the Statistics
     pane carries TWO unsynchronised set filters: selecting a set in one does
     not filter the other, and the card's own "Whole match" reset does not
     clear the URL param the tab-row chips read. Both derive orientation
     correctly, so it is not a misattribution bug, just a visible split-brain
     state in an intermediate commit. Marking T6 `next` before T4 runs, or
     running T6 immediately after T4, closes the window. The queue is the
     author's, so this run changed nothing.
  2. `?set=` naming a set that exists but has no point rows reads as `null`
     (whole match), not as an empty filter — stronger than the criterion's
     "out-of-range", taken from the design's error-handling section, and
     implemented as one `selectableSets` rule shared by the URL parse and the
     chips' disabled state so the two cannot drift. The completion reviewer
     ruled this faithful rather than an overreach. If T6 ever wants a
     zero-row set selectable-but-empty, that rule is the single line to change.
  3. `SetScopeChips` calls `useMatchData()`/`useMatchSides()` and then
     `useSetScope()`, which calls both again. Harmless today (context reads,
     `getMatchSides` is cheap), but memoize inside the hook if `useMatchSides`
     ever grows real work.
  4. `select()` has no "already there" guard, unlike `match-tabs.tsx`.
     Unreachable through the UI, since re-selecting the active chip toggles to
     null; a direct `select(activeSet)` would issue a no-op `replace`.

## T4 · Shell surface and tab row with the trailing slot — done
- **gate:** mechanical — `npm run lint` 0 errors / 37 warnings (baseline 43),
  `npx tsc --noEmit` exit 0, `npm test` green; the subagent also ran
  `npm run build` to exit 0, which is the real proof for a server-to-client
  element prop. Completion review `VERDICT: pass`; it verified the §3.3 branch
  independently rather than on the subagent's word, and ruled the ARIA
  restructure a necessary consequence of the trailing slot rather than
  unrequested scope. Guardrails — `pipeline-guardrails-reviewer` ran and
  reported "no guardrail violation": the `isAwaitingAnalysis` condition is
  byte-identical, the tab-less branch still renders rail plus
  `MatchAnalysisProgress` and no stat section, and `tabBarTrailing` is read
  only inside the `tabs` branch so it structurally cannot leak a control into
  the short-circuit. §3.1 wizard and §3.2 predicates have empty diffs; no
  customer-facing "splitstep" string. `rls-boundary-reviewer` skipped — no
  query, loader or migration; the new control filters already-fetched,
  already-RLS-scoped points.
- **changed:** the content pane moves to `surface-card` at `px-5 pb-4 gap-3.5`,
  keeping `min-h-0 overflow-y-auto`. `MatchTabs` becomes a 42 px sticky row on
  `surface-card` with its bottom hairline removed, `role="tablist"` moved to an
  inner wrapper holding only the tab buttons, then a `flex-1` spacer and a new
  `trailing` slot. `MatchDetailShell` takes
  `tabBarTrailing?: Partial<Record<MatchTab, ReactNode>>` and renders only the
  active tab's entry, so a filter cannot outlive the panel it filters.
  `page.tsx` passes `{ statistics: <SetScopeChips /> }` on the analysed branch
  only.
- **follow-ups:**
  1. **Two set filters are now live at once**, as predicted in T3's entry: the
     tab-row chips and `head-to-head-card.tsx`'s own local chips do not talk to
     each other. T6 removes the card's copy. This is the intermediate state the
     author chose when they left the queue order alone.
  2. **The analysing pane is now white**, so `MatchAnalysisProgress`'s own
     white card sits card-on-card and loses the contrast the grey page
     background used to give it. `match-analysis-progress.tsx` is outside this
     task's files and no criterion covers it; both reviewers saw it and agreed
     leaving it was right rather than patching silently. Worth a look in T12.
  3. **The dropped tab-strip hairline diverges from the repo's only other tab
     row on the same pattern**, `film/point-list.tsx`, which keeps its
     `border-hairline` under an identical blue-underline treatment. Removing it
     is what the 47f frame draws, so this is the design's call rather than a
     defect — but strip and pane are now the same white with nothing between
     them until a card mounts under the row in T5. A designer's eye before
     that lands would settle it.
  4. `MatchDetailShell`'s `tabs` prop is still a hand-written
     `{ statistics; shots; film }` object while the new prop uses
     `Record<MatchTab, …>`. Collapsing the two would keep them in step if a
     fourth tab ever appears.
