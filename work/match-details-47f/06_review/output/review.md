# Review — match-details-47f

Sign-off: **pending** — edit this line to `approved` (or annotate) to gate
stage 07. This review ran `/pr-check` over the feature's commit range
`475f940...HEAD`; the one thing it cannot close from here is the auth-gated
visual pass (criterion 1 below), which is the human step this sign-off should
confirm.

Range reviewed: `475f940` (base, `splitstep-integration`) → `384b381` (HEAD,
including the quality-pass commit this stage added). pr-check receipt:
`384b381 ready` (recorded 2026-09-03).

## pr-check result

**Stage 1 — mechanical, all green at HEAD:** `npm run lint` 0 errors / 37
warnings (baseline, none new), `npx tsc --noEmit` exit 0, `npm run build` exit
0, `npm test` 323 passed.

**Stage 2 — quality (`simplify` + vercel):** the four simplify angles found
the code well-factored (the `set-scope` seam, `playerSeat`/`resolveYouSide`
single seat decision, `ownSeatRows` generalization, and once-expressed KPI
absent-data handling were all confirmed at the right altitude). Two clean,
multiply-flagged fixes were applied and committed as `384b381`:
- `useSetScope()` now returns the `selectable` set it already computed, and
  `SetScopeChips` reads it instead of recomputing — the chips' disabled state
  can no longer drift from what the `?set=` parse accepts.
- the head-to-head `scopeMeta` call was memoized (moved above the early return),
  so it no longer re-allocates a scoped-points array on every row hover.

The `vercel-react-best-practices` trigger fired (new client components in the
range). Checked: every `"use client"` in the range is justified by a
client-only dependency (context hooks, `useRouter`/`useSearchParams`,
`useSyncExternalStore`); `insight-dismissal.ts` correctly carries none. No
server component was made client, no in-component data fetching added. Pass.

**Stage 3 — correctness & safety (`code-review medium`):** 5 findings, **no
genuine correctness bug**. The highest-risk surfaces were read fresh —
`parseSetParam`, `buildKpiHistory`'s window/anchor/absent handling,
`scopePoints`, `ownSeatRows` seat selection, `playerSeat`, `rowLeader` — and
all hold. Findings are one low-severity robustness note and four cleanup items
consciously left (see below).

**Guardrail reviewers — covered per-task, plus fresh where a commit was not
task-gated:** every `src`/`docs` change in the range rode a `T<n>` commit that
faced the per-task guardrail gate; the only non-task commits are six docs-only
pipeline-bookkeeping commits touching no reviewable surface. T12 additionally
ran `pipeline-guardrails-reviewer` over the whole branch range (`475f940..HEAD`)
and reported no blocking finding. The one hand-made src commit this stage added
(`384b381`, the quality pass, two dashboard files) got a fresh
`pipeline-guardrails-reviewer` pass: **behavior-preserving and clean, no
findings** (§4 attribution untouched, the memoized `meta` runs unconditionally
before the early return, `selectable` from the hook is provably the value the
parse uses). `rls-boundary-reviewer` was covered per-task for the data-layer
commits (T1/T2/T13 log entries each ran it) and the quality-pass commit touched
no data surface. `supabase:supabase-postgres-best-practices` did not apply — no
SQL, table, index, RLS policy or migration is in the diff.

## Success criteria (from the brief)

Checked against the shipped code and the specs; the visual dimension is
recorded as **browser-unverified** because the Statistics tab is auth-gated
(`/dashboard/matches → 307 → /login`) and this worktree has no dev-login, so no
1512×982 screenshot could be taken. Each criterion is backed by a code citation
instead.

| # | Criterion | Status |
|---|---|---|
| 1 | Structure/spacing/type/colour/copy match the frame at 1512×982; pane does not scroll | **Partly met, visual unverified.** Metrics match by code (white `surface-card` pane `px-5 pb-4 gap-3.5`; 300 px rail with the double-pad fixed in T12 to the frame's 18/20 px; the pane's `flex-1 min-h-0` layout). The pixel/fit-and-no-scroll comparison at 1512×982 is the one item that genuinely needs a rendered page — **the human visual pass this sign-off should confirm.** |
| 2 | KPI strip: 4 tiles in frame order; value = viewer's published stat; delta = value − own baseline; sparkline = own series ending at this match; DS good/bad colour; withheld ⇒ no invented number | **Met by code.** `match-kpi-strip.tsx` renders four `KpiTile` in order, value from `useMatchSides().you.stats`, delta `round(value − baseline)`, sparkline `kpiHistory.series[key]`, `—` + "Not measured" on null/zero-attempts, no trend/sparkline without a baseline. |
| 3 | H2H: exactly 15 rows in 3 groups; lower leads on DF/UE; fraction only in the hover tooltip; set chips in the tab row narrowing derivable rows, `—` for the rest; reset + scope label only while filtered | **Met by code + tests.** `tests/match-h2h-rows.spec.ts` pins 15 rows (Serve 7 / Return 4 / Points 4), the two lower-is-better leader flips, ties, Return winners `—`, and `9/12 → 75%`; chips mounted via `tabBarTrailing={{ statistics: <SetScopeChips /> }}`; non-derivable per-set rows keep the em dash. |
| 4 | Tracker / Rally / Endings render their 47f deltas | **Met by code** (T7/T8/T9, each completion-reviewed and guardrail-clean): inert flagged `Expand`, in-chart `above` label, no legends, no `viz-key` break verticals; fixed rally tones with no in-band %; 10 px endings bars, `Own outcomes` meta, no footer sentence; the new tooltips. |
| 5 | Rail: insight card at the bottom with the real summary; dismissal persists under the existing key; no film card, no in-pane strip | **Met by code.** `RailInsightCard` in the rail's `mt-auto` group; `useInsightDismissal` under the unchanged `advantage-ai-insight-dismissed:${matchId}` key; `insight-strip.tsx` deleted (`grep -rn insight-strip src` empty); the film cross-link card removed. |
| 6 | Player-2 viewer: every you/opp orientation correct (tested) | **Met by tests, real session unverified.** Orientation flows from `sides.you.isPlayer1`; `tests/match-h2h-rows.spec.ts` swap-symmetry test and `tests/own-seat-rows.spec.ts` seat-two selection pin it. No match in the live database currently stores anyone in `player2_id` (opponents live in `opponent_player_id`), so a real player-2 session cannot be exercised here; the honest residual gap is that `getMatchSides` with `isUserPlayer1: false` has no dedicated render spec. |
| 7 | Derived match: Aces withheld, `MatchDataBlock` visible, no fabricated score/time | **Met by code.** `isDerived = sourceProvider === "splitstep"`; endings drops the Aces segment on `isDerived`; H2H keeps whole-match null aces as em dash per set; `MatchDataBlock` renders on `isDerived && statsPublished`; the tracker appends a game score only under `showScores` (flag #9) and a clock only when `videoTime !== null`. |
| 8 | Flags doc has a row for every element still shipped as copy, and names the resolving task | **Met.** T11 carried rows #1/#2/#3/#9 forward with their 47f render sites and added #10–#13; the completion review spot-checked every new row's claim against the code. |
| 9 | Superseded components deleted; lint/types/build/tests pass; guardrails clean | **Met.** `insight-strip.tsx` deleted; all four gates green at HEAD; the whole-branch guardrails pass (T12) and this stage's fresh pass both clean. |

**Overall:** criteria 2–5, 7–9 are met by code and tests; 6 is met by tests
with a real-session/live-data gap noted; 1 is met on metrics but its
pixel-and-fit comparison at 1512×982 is the outstanding human step. Nothing in
the code gate blocks; the sign-off turns on that visual pass.

## Findings and resolutions

**Applied this stage** (`384b381`):
1. `useSetScope` re-exposes `selectable` (was recomputed in `SetScopeChips`) —
   fixed.
2. Head-to-head `scopeMeta` memoized (was re-allocating on every hover) —
   fixed.

**From `code-review medium` — consciously left** (all reported via
ReportFindings; none is a correctness bug):
1. `parseSetParam` (`set-scope.tsx`) — `Number()` coercion accepts hex/exponent
   forms (`?set=0x2`, `?set=1e0`) that land on a valid selectable set. Low
   severity: it can only resolve to an already-selectable set or `null`, never
   a crash or fabricated data. Tightening (`/^\d+$/` pre-check) would touch a
   spec'd pure function for a cosmetic edge — left, noted.
2. `fetchPlayerStatRows` runs twice per match load (`getPlayerAverageStats` +
   `getMatchKpiHistory`) — a real DB-query-count saving but latency-neutral
   (the two already run concurrently) and a merge needs a coach-id-set guard
   and touches `getPlayerAverageStats` (other pages), so it is a considered
   follow-up, not a review-gate fix.
3. `scopedPoints` memo duplicated across four cards — a `useScopedPoints()`
   hook would collapse three; marginal DRY, left rather than churn four
   just-gated files.
4. `match-rail.tsx` re-derives the games total instead of `scopeMeta` — left on
   purpose: `scopeMeta` allocates a points-array copy to count, strictly worse
   than the rail's O(sets) reduce for an always-whole-match surface.
5. Break-points-saved `(made/attempts)*100` duplicated in `match-kpi-strip` and
   `head-to-head-card` — a one-line `fractionPct` helper, deferred because each
   site's `attempts<=0 → null` guard is correctness-sensitive and deliberately
   local.

## Consciously left (branch-level, logged across the run, none a blocker)

- The page-wide **three-state viewer rule** (`viewer-side.ts`) for the
  "viewer is neither player" (coach) case — the current two-state rule seats a
  coach as player 2; T13 made this safe (neutral "vs avg" copy, own-seat
  history), and adopting the three-state rule changes rendered output, so it is
  its own task.
- `playerAverages` is now **dead** (no consumer after the strip moved to
  `kpiHistory`) — a removal candidate.
- A `size` prop on the shared `LegendSwatch` to retire the local 6 px swatch T9
  inlined; the dead `tallySide` fields in `head-to-head-card`; the duplicate
  `playerSide()` in `player-identity-server.ts`.
- `docs/README.md` line 13 still carries the round-46 point-in-time blurb — a
  docs-freshness sync (T11 follow-up).
- Whether a personal "your avg" should exclude team matches; alumni/season
  archiving (would give #10/#13's "vs season" a real definition).

## Also consulted

Beyond the declared inputs (`../05_build/output/build.md`, the range diff,
`../01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- The whole range diff `git diff 475f940...HEAD -- src docs`, saved to
  scratch for the simplify/code-review passes.
- Source read fresh for the correctness scan:
  `src/components/dashboard/matches/match-detail/{set-scope,head-to-head-card,
  match-rail,match-kpi-strip}.tsx` and
  `src/lib/data/{match-stats-server,viewer-side}.ts`.
- `.claude/tasks/claude-match-details-implementation-97c1ee.log.md` for the
  per-task gate record (guardrail coverage citations).
- The pr-check receipt store (`.claude/hooks/pr-check-receipt.sh show`).
