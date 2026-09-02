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

## T5 · KPI strip and the Statistics tab layout — blocked
- **gate:** stage 5c, `pipeline-guardrails-reviewer`. Mechanical passed
  (`npm run lint` 0 errors / 37 warnings, `npx tsc --noEmit` exit 0,
  `npm test` green, subagent's `npm run build` clean) and the completion review
  returned `VERDICT: pass` on all four criteria. The guardrails reviewer then
  found a fabricated-data path the criteria did not cover, and the gate is
  fail-closed on any finding.
  (A first dispatch of this task was killed by a spend limit before writing
  anything; the tree was clean and it was simply re-dispatched. Not the reason
  for the block.)
- **reason:** the sparkline can silently omit the very match it sits on, and
  nothing on screen says so. `fetchPlayerStatRows` selects matches with
  `.in("player1_id", playerIds)` and their `is_player1 = true` stat rows, so a
  match where the viewer is stored as **player 2** is absent from the set
  entirely. `getMatchKpiHistory` then appends a bare `{ match_id, date }`
  anchor with no stat columns; `buildKpiHistory` drops it on its
  `v !== null` filter, so `series` ends on the PREVIOUS qualifying match. The
  strip suppresses the sparkline only when `value === null`, but `value` comes
  from `you.stats` (this match's own published aggregates, correctly picked by
  side) and is present — so the line renders, ending on an older match, under a
  headline that is correct for this one. No `detail` prop is passed, so the
  tile has no hover chart and no per-point labels: nothing distinguishes it
  from a series ending at today. This hits a genuine participant, not only the
  already-recorded "viewer is neither player" case.
  Two fixes the reviewer offered, neither prescribed: gate the sparkline in the
  component on its last plotted value matching the headline, or seed the
  anchor row in the loader with the match's own known statistics instead of an
  empty placeholder. The loader is `match-stats-server.ts` (T1's code), outside
  T5's `files:` list, so a re-run may need that file added to the task.
  This was foreseen: T2's log entry, follow-up 2, said "T5 should check this
  against a real seat-two match." It did not, and the reviewer caught it.
- **stash:** `4de079114543891fc9fb6e6a2e042ea365d67d3b` — the whole task's work,
  which is otherwise sound and worth recovering rather than rewriting:
  `match-kpi-strip.tsx` (new), the `statistics-tab.tsx` reflow, and `page.tsx`'s
  prop change. Recover with
  `git stash apply 4de079114543891fc9fb6e6a2e042ea365d67d3b`.

## T6 · Head-to-head as a 15-row table — done
- **gate:** mechanical — `npm run lint` 0 errors / 37 warnings (baseline 43),
  `npx tsc --noEmit` exit 0, `npm test` green with the new spec's 18 tests; the
  subagent also ran `npm run build` clean. Completion review `VERDICT: pass`,
  having checked all 15 labels, their group membership and casing against the
  design table itself rather than the subagent's summary. Guardrails —
  `pipeline-guardrails-reviewer` ran and reported clean on the point that
  matters most for this card: with two players' numbers in fixed columns, a
  disagreement between column assignment and value lookup would swap every
  statistic while all of them stayed real. It traced the binding end to end —
  `useMatchSides()` is the only column source, `buildStatRows(configs, you,
  opp)` never sees player order, `tallySide` is passed `sides.you.isPlayer1`
  and its negation rather than a hardcoded side, the verified glyph is gated on
  `match.verificationStatus` and sits on the viewer's column, and the leader
  rule inverts correctly on the two lower-is-better rows. The new spec's
  `orientation` test swaps you/opp and asserts the leader follows, which is the
  test that would catch a future drift. `rls-boundary-reviewer` skipped — no
  query, loader or migration.
- **changed:** the card becomes the 47f two-column table: 15 rows in Serve 7 /
  Return 4 / Points 4, sentence-case labels, `rowLeader()` exported pure with
  `lowerIsBetter` on Double faults and Unforced errors, Break points saved
  rendered as a percentage from `fractions.breakpointsSaved` with `9/12` in the
  tooltip, and Return winners a keyless row that always renders the em dash.
  Gone: the legend row, the local set chips and their state, the two-segment
  share bars, and the 9 px fraction sub-figures. The per-set derivation is
  kept and now reads `useSetScope()`/`scopePoints()`, with the header meta from
  `scopeMeta()`. New `tests/match-h2h-rows.spec.ts`, 18 database-free tests.
- **follow-ups:**
  1. **A latent "absent is never zero" gap in the data layer, not in this
     card.** `match-stats-server.ts` coalesces `winners`, `unforcedErrors`,
     `totalPoints` and `totalPointsWon` with `?? 0`, while only the five
     columns `suppress_derived_match_stats()` may null reach the card as real
     nulls. If a future source ever withholds one of those four, the Winners,
     Unforced errors or Total points won row prints a confident `0` instead of
     an em dash. Identical in the old 46a card and outside this diff, so not a
     regression — but it is the one place the card's honesty contract rests on
     an assumption the loader does not enforce.
  2. **Dead computation left in `tallySide`.** It still tallies
     `servicePoints`, `returnPoints` and the three rally bands, which fed rows
     the old 24-row config carried and no surviving row reads. The subagent
     kept them reading "keep the derivation intact" literally; the completion
     reviewer called that dead code rather than restraint, and it is a
     `/simplify` candidate at branch end rather than a defect.
  3. Two tooltips can overlap on an em-dash cell — the row's `ChartTooltip`
     carrying label and fraction, and the cell's own missing-data tooltip. Both
     were required by the criteria. Worth a look in T12 once the card can be
     seen in the real two-column layout.
  4. The third group is titled "Points" per the design, where the old card said
     "Other". Nothing else referenced those titles.

## T13 · KPI history covers both seats — fix the loader that blocked T5 — done
- **gate:** mechanical — `npm run lint` 0 errors / 37 warnings (baseline 43),
  `npx tsc --noEmit` exit 0, `npm test` green with 29 tests across the two KPI
  specs (15 new). Completion review `VERDICT: pass`, verified against `HEAD`:
  the `playerSeat` extraction is byte-for-byte the old inline clauses in the
  same order before the uploader clause (so `performance-server.ts` and
  `recent-activity.tsx` are behaviour-identical), and `getPlayerAverageStats`'s
  body — signature and all 18 fields — is absent from the diff. Guardrails —
  `rls-boundary-reviewer` ran (diff is entirely `src/lib/data/`) and reported
  no findings: reads stay on the cookie-scoped client, the `.or()` widens the
  request but RLS ANDs its `USING` clause on before the filter narrows, the
  `match_stats` view is `security_invoker` so the opponent's row was already
  readable and is dropped server-side in `ownSeatRows`, and the id list is
  always `getMyPlayerIds()` (RPC off `auth.uid()`) or an already-authorised
  row id, never request input. Its one note — the `.or()` builds its list by
  string-join — it labelled non-exploitable (uuid columns can't hold `,`/`)`/`.`)
  and explicitly not a finding. `pipeline-guardrails-reviewer` skipped: no
  dashboard component, route or wizard file in the diff.
- **live-DB check (the gap the RLS reviewer couldn't close in its
  environment):** ran a read-only query via Supabase MCP. **No match in the
  live database has `player2_id` set** — opponents are stored in
  `opponent_player_id`, never `player2_id` (the wizard rule the guardrails doc
  states). So every one of the 19 analysed matches is seat one, all carry both
  seat stat rows, and the new both-seats `.or()` query returns the identical
  set the old `.eq("is_player1", true)` did. The fix is therefore
  **behaviour-preserving on today's data and correct for the day a seat-two
  row exists** — exactly what the flags doc predicted for round 46. The bug it
  removes (a sparkline ending on an older match) is real in the code and
  unreachable with current data; the pure `ownSeatRows` spec pins the
  seat-two case live data cannot yet exercise. Corollary: `getPlayerAverageStats`'s
  numbers do NOT move for any real viewer today — the "values move for
  seat-two players" caveat is theoretical until seat-two data exists.
- **changed:** `viewer-side.ts` gains `playerSeat(match, playerIds)` and
  `viewerSide` delegates to it. `match-stats-server.ts` gains the pure exported
  `ownSeatRows(matches, stats, playerIds)` (own-seat row per match via
  `playerSeat`, both-ids → seat one, unknown-match rows dropped, `is_player1`
  stripped, nulls preserved); `fetchPlayerStatRows` fetches both seats with
  `.or()` and no `is_player1` SQL filter and returns `ownSeatRows(...)`;
  `getMatchKpiHistory` loses its `matchDate` param and the empty-anchor
  fallback that was the mechanism of the bug. `match-detail-server.ts`'s
  `resolveKpiHistory` calls the two-arg signature and its `Pick` drops `date`.
  New `tests/own-seat-rows.spec.ts` (15 pure tests); one comment rewritten in
  `tests/match-kpi-history.spec.ts`, whose ~L205 "no anchor → no series" test
  is now the load-bearing contract that makes deleting the fallback safe.
  The three seat-one-limitation doc comments were rewritten to say why both
  seats and why no fallback.
- **resolves:** T1 follow-up 2, T2 follow-ups 1–2, and the flags-doc seat-two
  truncation note — all were this same defect seen from different tasks.
- **follow-ups (recorded, not built — all in the approved plan's out-of-scope
  list):** the page-wide three-state viewer rule (own task; also fixes a
  legacy no-id row inverting win/loss); `playerAverages` is now dead code with
  no consumer and is computed for the viewer rather than the you-side player, a
  removal candidate once the strip reads `kpiHistory`; whether a personal
  "your avg" should exclude team matches; the duplicate `playerSide()` in
  `player-identity-server.ts`; alumni/season archiving (its own feature —
  `programs.season` and `program_players.archived_at` are the existing
  vocabulary).
- **NEXT:** T5 is unblocked. Its stash `4de0791` is applied to the tree and its
  status set to `todo` in this same commit, so the next `/task-next` re-runs it
  against this fixed loader; the strip code needs no edit and must clear the
  guardrails reviewer on the exact sparkline-ends-early finding.
