# Plan — Score-constrained game segmentation

Implements `../../02_design/output/design.md`.

**Scope guard.** The design changes two of the brief's decisions, both agreed in chat on
2026-10-09 and recorded at the top of the design:

- the segmenter runs on every match, not only on a game-count mismatch;
- the hitter rule is block-and-flag on a position conflict, replacing the vacuous
  `pred_player_id` rule.

Everything else stays inside the brief.

- **No dashboard UI.** None of these steps touches `src/components/dashboard` or
  `src/app/dashboard`.
- **No migration, no edge-function deploy, no live re-derive.** The deploy is a merge,
  and re-derives happen only on the user's word.

**Conventions for every step:**
- derivation modules stay pure;
- match the comment density of `frozen.ts` and `played.ts`, with a module header that
  says why and cites the evidence;
- a spec runs offline (no `live-db` fixture);
- player names and labelled data never go into a committed file. Fixtures are
  synthetic.

**Large files.** `tests/splitstep-transcript.spec.ts` (1,557 lines) and `transcript.ts`
(621 lines) are large. Steps that touch them name the line ranges to read. Don't load
either whole.

---

## Step 1 — Positional server module

**Files**
- new `src/lib/services/splitstep/derivation/position.ts`
- `derivation/index.ts` (exports only)
- new `tests/splitstep-position.spec.ts`

**Change.** Add `playerAtEnd({ topAtStart, bottomAtStart, completedSets,
gamesBeforeInSet, end })`. It returns the player at `"top" | "bottom"`.

- Ends swap after games 1, 3, 5… of a set, and after any set whose game total is odd.
- Within a tiebreak, ends swap every 6 points. Count them via an optional
  `tiebreakPointsBefore`.
- Also export `serveEnd(rally)`: the sign of the deciding serve's `playerY`, giving
  `"top" | "bottom" | null`. This replaces the inline copy in `frozenGameStarts`, which
  should call it.
- Header comment: cite the three labelled matches where this held on every game, and
  the set-break gap noted in `server-witness.ts`, which this closes.

**Verification**
- Spec covers:
  - set 1, games 0–7;
  - set 2 after a 6–4 set (even total) and after a 6–3 set (odd total);
  - tiebreak point 0, 5, 6 and 11;
  - `playerY` of 0 or null giving null.
- The existing `splitstep-derivation.spec.ts` and `splitstep-transcript.spec.ts` still
  pass, since `frozenGameStarts` now calls `serveEnd`.
- `npm run typecheck` passes.

---

## Step 2 — Two new point flags and their marks

**Files**
- `derivation/flags.ts`
- `src/lib/services/labels/marks.ts`
- `src/lib/services/labels/marks-copy.ts`

**Change**
1. In `POINT_FLAGS`, add:
   - `SERVER_POSITION_CONFLICT: "server_position_conflict"`;
   - `SEGMENT_PROPOSAL_DIFFERS: "segment_proposal_differs"`.

   Give each a doc comment in the existing style: what it means, review-only, and
   which module raises it.
2. In the `marks.ts` registry, add both at tier `hidden` and scope `point`, with these
   params:
   - `server_position_conflict: { positionalServer: LabelSide | null }`;
   - `segment_proposal_differs: { proposedGame: number | null; proposedServer:
     LabelSide | null; mergedWith: number | null }`.

   Add their cases where point flags become marks (around lines 337–345). The params
   are read from `transcript.segmentation` and the point's own data. Until step 5
   exists, pass nulls.
3. `marks-copy.ts`: chip and hint copy, following the house register of "Score not
   read" and "Winner guessed". Proposed copy: "Server by position" and "Game cut
   differs".

**Verification**
- `tests/label-marks.spec.ts`, `label-marks-copy.spec.ts` and
  `label-session-marks.spec.ts` pass. If one asserts an exhaustive code list, extend
  it.
- `npm run typecheck` passes.

---

## Step 3 — Live hitter rule: block and flag in frozen stretches

**Depends on:** steps 1 and 2.

**Files**
- `derivation/transcript.ts`: only the frozen loop (about lines 261–311) and the point
  flag assembly (about lines 555–600)
- `tests/splitstep-transcript.spec.ts`: append one `describe` block. Read only the
  existing frozen-stretch tests, which you can find by grepping `frozen`.

**Change.** Inside each frozen run, compute the positional server independently:

- count the games from the vendor's fold before the run;
- add new games found by position alone: the positional server changes, or the end
  switches;
- do not count the rebuild's own game starts;
- use `playerAtEnd` from step 1.

Then:
- **They agree:** call `withServer` as today.
- **They disagree, or the position is unknown:** keep the vendor's rally unchanged, and
  record the rally so its point carries `server_position_conflict` with the positional
  server.

Game keys, `score_frozen`, `winner_guessed` and the null score columns are untouched.
Add a comment above the loop explaining why position, rather than `pred_player_id`, is
the witness (design §"What the data says" 5). Name the synthetic fixtures for what
they test, not after any player.

**Verification**
- New tests:
  - a frozen run where position agrees with alternation is relabelled exactly as
    before;
  - a frozen run that opens on the same end with no changeover is not relabelled and
    is flagged. This is Sage v Hunter Cheng's shape, rebuilt synthetically;
  - a serve with null `playerY` is flagged and not relabelled.
- Every existing frozen test passes unchanged. If one fails, stop and report it rather
  than editing it, because it encodes `ac56ef8b`'s behaviour.
- `npm run typecheck` passes.

---

## Step 4 — Segmenter core: points, games, sets, end condition

**Depends on:** step 1.

**Files**
- new `derivation/segmentation.ts`
- new `tests/splitstep-segmentation.spec.ts`

**Change.** Add `proposeSegmentation(input): SegmentationProposal`, with the input and
output types from design §2. This step implements the core only:

- **State:** set, games for player1 and player2, and server/receiver points with deuce
  equivalence. A no-ad deciding point closes the game at 3–3 plus one point.
- **Step:** one rally becomes one point. There is no merge in this step.
- **Costs:**
  - end mismatch, via `playerAtEnd`;
  - side mismatch (free on a no-ad deciding point);
  - outcome flip, high or low confidence;
  - vendor boundary moved or dropped.
- **End condition:** `matches.score` set by set.
- **Result:** the `fit` / `no_fit` status, `games`, `cost`, `closestScore` on no-fit,
  and `costBreakdown`.
- **Weights:** export them as one `SEGMENT_COSTS` constant, so step 8 can tune them in
  one place.

The `ambiguous` status, merges, tiebreak, gap costs and the mid-match start are step 5.
Stub them with `TODO(step 5)` only where a type demands it.

**Verification.** Synthetic tests:
- a clean ad set of 6–2 with correct vendor boundaries gives `fit`, zero moves and cost
  0;
- one ad deuce game split in two by the vendor is re-merged to one game, and the score
  is reached;
- a vendor boundary one rally late at a same-end changeover with deuce→deuce is moved;
- an unreachable entered score gives `no_fit` with `closestScore`;
- a no-ad deciding point served to the ad court adds no side cost;
- the function never throws on empty rallies or a missing `playerY`.

`npm run typecheck` passes.

---

## Step 5 — Segmenter completion: merges, ambiguity, tiebreak, gaps, mid-match

**Depends on:** step 4.

**Files**
- `derivation/segmentation.ts`
- `tests/splitstep-segmentation.spec.ts`

**Change**
- **Merges.** Add the merge step for rally pairs with the same serve end and side, a
  gap under 30 s, and a first rally ending on a serve or within two strokes. Record
  them in `merges`, at the merge cost.
- **Ambiguity.** Track the runner-up: the best path whose game assignment differs. Set
  `ambiguous` when `runnerUpCost − cost < 1`.
- **Tiebreak.** At 6–6, consume tiebreak points with the 1, 2-2 serve rotation. Points
  are first to 7 by 2, there is no side cost, and the end swaps every 6 points via
  `playerAtEnd`.
- **Gaps.** Add the two gap costs: a changeover boundary with a gap under 30 s, and a
  boundary inside a gap of 80 s or more that is not a changeover.
- **Mid-match start.** If the first vendor reading is not 0–0 / 0–0, return `no_fit`
  with reason `starts_mid_match`.
- **Diff.** Fill `diff` against the vendor's boundaries and servers. The inputs include
  them, so this needs no transcript.

**Verification.** Synthetic tests:
- an ad→ad split point is merged;
- the same pair with a 40 s gap is not merged;
- two equal-cost cuts give `ambiguous`, with the fewer-moves cut reported;
- a 7–6 set passes through its tiebreak;
- a mid-match start gives `no_fit` / `starts_mid_match`;
- a speed check: a 150-rally synthetic match finishes in under 50 ms.

The step 4 tests still pass. `npm run typecheck` passes.

---

## Step 6 — Wire the segmenter into the transcript and marks

**Depends on:** steps 2, 3 and 5.

**Files**
- `derivation/transcript.ts`:
  - the `Transcript` type (about lines 107–127);
  - the end of `buildTranscript`, after winners and frozen handling;
  - the point flag assembly.
- `src/lib/services/labels/marks.ts`: fill the `segment_proposal_differs` params from
  `transcript.segmentation`.
- `tests/splitstep-transcript.spec.ts`: append one `describe` block.

**Change**
- Build the segmenter's input from data the transcript already holds:
  - outcome relative to the server, from `winners[i]`, with `via: "guess"` or frozen
    meaning low confidence;
  - vendor boundaries from `gameKeyOf` changes;
  - vendor servers from `rally.server`;
  - `player1Label` from the reconciliation;
  - `topAtStart` from `initialTopIsPlayer1`.
- Add `segmentation: SegmentationProposal | null` to `Transcript`:
  - it is `null` when the score, top player or labels ≠ 2 are missing;
  - wrap the call in try/catch, so a throw is logged and gives `null`.
- Flag `segment_proposal_differs` on points whose proposed game or server differs from
  the published one, and on both points of a merge.

**Verification**
- New tests:
  - a transcript over a synthetic split-deuce match carries `segmentation.status ===
    "fit"` and flags only the differing points;
  - a segmenter forced to throw (via a test seam, or a malformed input that reaches
    the catch) leaves `segmentation: null` and the transcript `ok`.
- **Published fields are unchanged.** A table-driven check over the existing
  transcript fixtures asserts that `points` (game, server, winner, ended-by and score
  columns) are deep-equal with and without the segmenter, flags excluded.
- `label-marks.spec.ts` passes. `npm run typecheck` passes.

---

## Step 7 — Record the proposal on the job

**Depends on:** step 6.

**Files**
- `src/lib/services/splitstep/derive-and-publish.ts`
- `tests/derive-and-publish-codes.spec.ts`

**Change**
- Generalise `recordUnreconciledFold` into `mergeDerivationQuality(supabase, jobId,
  patch)`: the same read, merge, write and swallow-on-failure. Keep `fold` writes going
  through it unchanged.
- After a successful publish, merge `{ segmentation: transcript.segmentation }` when it
  is non-null.
- **Never write `fold` from the segmentation path.**

**Verification**
- Spec, against the existing mocked client, asserts:
  - `segmentation` is merged and the other `derivation_quality` keys are kept;
  - `fold` is untouched when the proposal is `fit` but the vendor fold is unreconciled;
  - a write error is swallowed and the outcome is still `ok`.
- `npm run typecheck` passes.

---

## Step 8 — `splitstep-eval --session` and proposal scoring

**Depends on:** step 6. It does not depend on step 7.

**Files**
- `scripts/splitstep-eval.ts`
- possibly a small pure helper, `src/lib/services/labels/session-truth.ts`, if the join
  is worth a spec

**Change**
- **`--session <uuid>`** loads the job from `label_sessions`, and reads `label_points`
  where `checked_at is not null and status <> 'deleted'`. It joins each point to the
  transcript by the first id in `vendor_rally_ids`; more than one id is the labeller's
  merge. It maps `player1`/`player2` to names the way the sheet path does.
- `--labels <dir>` keeps working.
- **Report:**
  - server, winner and ending accuracy for **published** and for **proposed** values;
  - the proposal's status;
  - the folded games against the entered games;
  - firings, each one a hit (server and game match the label) or a miss;
  - merges proposed against the labeller's multi-id points.
- **Usage header.** Update it, and keep the privacy line.

**Verification**
- Run it read-only on the three sessions:
  - `1b391e8b-88a7-4704-96ea-771420fcc23d`
  - `f8b9a283-d62c-4fed-b186-a93a72edf3dd`
  - `2d209aca-0abe-4984-9598-1fbafc006c14`
- Write the output to the session scratchpad, never the repo.
- The published-accuracy numbers must match what `--labels` reported before, where a
  sheet export exists. Otherwise sanity-check them against `label-scorecard.ts`'s
  winner-flip count.
- `npm run typecheck` and `npm run lint` pass.
- If the helper is extracted, it gets an offline spec.

---

## Step 9 — Tune weights and measure the live rule

**Depends on:** steps 3, 6 and 8.

**Files**
- `derivation/segmentation.ts`: `SEGMENT_COSTS` only
- scratchpad notes, never committed

**Change.** Run `splitstep-eval --session` on the three sessions and adjust only the
`SEGMENT_COSTS` weights.

Targets:
- **Sage v Hunter Cheng:** the proposal is `fit` at 6–2, and proposed server accuracy
  is about 100% (at least 55 of the 56 checked points).
- **Quan v Kim:** fires at points 18, 83 and 102, and each one is a hit.
- **Emon v Roger:** fires at point 19, and it is a hit.
- **All three:** no published metric gets worse, and no proposed metric falls below
  published.

Then measure the live hitter rule on the unlabelled frozen jobs `ac56ef8b`, `5c377b0a`
and `467ccbdc`. Count `server_position_conflict` per frozen set. If any frozen set
conflicts on most of its rallies, that is the parity failure from design open question
2: **stop and report it**, and do not ship step 3 as is.

**Verification**
- The targets above are met, or the shortfall is written up as a blocker with the
  numbers.
- The final weights and the per-session results, as counts only with no names, are
  handed to step 10's changelog entry.
- The step 4 and 5 specs still pass after tuning. If a synthetic expectation encoded an
  old weight, adjust the test only where the behaviour, not just the cost value, is
  still right.

---

## Step 10 — Version bump and changelog

**Depends on:** step 9.

**Files**
- `derivation/index.ts`: the changelog comment and `DERIVATION_VERSION`

**Change.** Set `DERIVATION_VERSION = "0.8.0-unreconciled"`. Add a 0.8.0 changelog
entry in the house style:

- the live block-and-flag hitter rule, and why `pred_player_id` could not be the
  witness;
- the review-only segmenter and its `derivation_quality.segmentation` key, which does
  not touch `fold`;
- the two new flags;
- the tuned weights and the three-session result, as counts;
- the promotion bar: ≥95% of firings right on server and game, over 30+ firings across
  2+ matches, re-scored with `splitstep-eval --session`;
- the jobs whose published rows change on re-derive: `be930d79`, `ac56ef8b`,
  `5c377b0a`, `467ccbdc`;
- that every other job gains only flags and the key.

**Verification**
- `grep` shows no other hard-coded `0.7.0-unreconciled` that should move. Specs that pin
  the version are updated.
- `npm run typecheck`, `npm run lint` and `npm run format:check` pass.

---

## Order and dependencies

```
1 ─┬─ 2 ─┐
   │     ├─ 3 ─┐
   └─ 4 ─ 5 ───┴─ 6 ─┬─ 7
                     └─ 8 ─ 9 ─ 10
```

- Steps 2 and 4 can run in either order after step 1.
- Step 3 needs steps 1 and 2.
- Step 6 needs steps 2, 3 and 5.
- Steps 7 and 8 are independent of each other.
- Step 9 needs the measurement tool and the live rule.
- Step 10 records step 9's numbers.

## Test strategy

- **Pure-module specs, offline and in CI.**
  - `splitstep-position.spec.ts` and `splitstep-segmentation.spec.ts` carry the
    algorithm.
  - They use synthetic rally builders only, each fixture named for the shape it tests:
    split deuce game, ad→ad split point, deuce→deuce boundary, gapless changeover, tie,
    unreachable score, no-ad deciding point, tiebreak, mid-match start.
  - No labelled or named data.
- **Integration specs, offline.**
  - `splitstep-transcript.spec.ts` gains:
    - the live-rule cases;
    - the proposal and flag cases;
    - the published-fields-unchanged equivalence check, which is the main guard for
      "review-only".
  - `derive-and-publish-codes.spec.ts` guards that `fold` is never written by the
    segmentation path.
  - `label-marks*.spec.ts` cover the registry.
- **Regression.**
  - Every existing frozen-stretch and transcript test must pass unchanged. A failure
    there is a stop-and-report, not a test edit.
  - The full `npm test` runs at the end. Live-DB specs follow the AGENTS.md rules:
    never set `LIVE_DB_ALLOW_PROD`.
- **Measured, outside CI.**
  - `splitstep-eval --session` on the three checked sessions is the success measure
    for the brief's criteria.
  - The frozen-job conflict count is the go/no-go for the live rule.
  - Results go to the scratchpad, and only counts reach the changelog.
- **Not tested here.** Live re-derivation. The jobs to re-derive are listed in step 10
  and run only when the user asks.

## Also consulted

- `src/lib/data/labels-server.ts` (`buildJobMarks`, lines 478–491): marks are built
  from the live transcript, so mark params can come from `transcript.segmentation`
- Line counts of `transcript.ts`, `marks.ts`, `marks-copy.ts`, `labels-server.ts`,
  `splitstep-transcript.spec.ts` and `derive-and-publish-codes.spec.ts`, used for step
  sizing
