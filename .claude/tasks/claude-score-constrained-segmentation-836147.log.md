# Run log — claude/score-constrained-segmentation-836147

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add positional server module (`position.ts`) — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New pure `derivation/position.ts` with `playerAtEnd` (swap count = Σ ceil(T/2) over finished sets + ceil(gamesBeforeInSet/2) + floor(tiebreakPointsBefore/6)) and `serveEnd`; `frozenGameStarts` now calls `serveEnd`; `index.ts` re-exports both plus types `CourtEnd`/`EndSchedule`; new offline `tests/splitstep-position.spec.ts` (11 tests).
**follow-ups:**

1. A tiebreak set carries only its 13-game total into the next set; swaps inside the tiebreak are dropped. Confirm the ends after a tiebreak against a real match before the segmenter relies on it.
2. `frozen.ts` and `played.ts` headers already name players and jobs from earlier work; decide whether the no-names rule applies to existing headers (separate cleanup).

## T2 · Add `server_position_conflict` and `segment_proposal_differs` flags and marks — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `POINT_FLAGS` gains `SERVER_POSITION_CONFLICT` and `SEGMENT_PROPOSAL_DIFFERS` (review-only doc comments); `marks.ts` registers both hidden/point with typed params and null-param switch cases (`TODO(T6)`); `marks-copy.ts` adds chips "Server by position" / "Game cut differs" plus hover lines (merged form for the second); `tests/label-marks-copy.spec.ts` exhaustive lists extended.

## T3 · Block-and-flag hitter rule in frozen stretches — blocked

**gate:** mechanical GATE FAIL (1 failed / 5580 passed) · completion not run
**reason:** The pre-existing test `frozen score stretch › a frozen stretch keeps every point, in games, with the server alternating` (tests/splitstep-transcript.spec.ts:1263, assertion at 1330) fails under the new rule. It receives `[true, true, true]` where it expects the servers to alternate `[!last, last, !last]`. The task forbids editing this test. Per the subagent, the fixture serves its first frozen game from the end the changeover schedule gives to the _previous_ server, and later takes a same-end gap changeover that position cannot see. Position therefore blocks two of the three relabels the test expects, and no choice of top player makes it pass. The fixture encodes the old reading, "an end switch is a new game whatever the schedule says". An author decision is needed: make the fixture follow the schedule, or relax the rule.
**implementation notes:**

- Top and bottom players come from `geometryTopLabel`, which takes a majority vote in label space, because `player1Label` only exists after reconcile.
- `vendorGamesBefore` counts the games from the stream's readings.
- The positional count advances only when the serving end switches, to the next even game. So inside a frozen run, rallies after a same-end changeover stay flagged until the next end switch. On ac56ef8b, that could leave about every second frozen game with the vendor's labels.
- The test `relabelled frozen points keep their line calls…` still passes, but no longer exercises a relabel.
  **stash:** d1c3a5705111d30ca5e69fdae4db9ee8b940e25c

## T3 · Block-and-flag hitter rule in frozen stretches — abandoned (author's decision)

**decision:** On 2026-10-09 the author chose option 3: no live hitter-rule change ships, and position is used only inside the review-only segmenter. T3 stays `blocked`, and stash `d1c3a5705111d30ca5e69fdae4db9ee8b940e25c` is kept, not applied. The queue was edited by hand at the author's direction:

- T6 no longer needs T3;
- T9 drops the live-rule measurement and stop condition;
- the T10 changelog says no published rows change;
- T11 was added to remove the now-unused `server_position_conflict` flag.

## T4 · Segmenter core: points, games, sets, end condition — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New pure `derivation/segmentation.ts` (`proposeSegmentation`, `SEGMENT_COSTS` 5/2/4/1/1/1, exported types).

- The DP runs over the state {finished sets, g1, g2, server points, receiver points} with deuce equivalence; under no-ad, the point at 3–3 decides the game. It is run once per candidate first server.
- End cost comes from `playerAtEnd`, and side cost from point parity.
- `game` is numbered per set. `gamesMoved` counts the game-start indices that differ.
- `closestScore` is the cheapest path's score once the end condition is dropped.
- 6–6 is a dead state until T5.

The diff also has 15 offline tests in `tests/splitstep-segmentation.spec.ts`, and `index.ts` exports. Timing: about 37 ms for 150 rallies.
**follow-ups:**

1. The gap to the previous rally is not in the input yet; T5 should read it from `strokes[].videoTime`.
2. T5's under-50 ms assertion may be tight once merges double the branching. The exact lever is to prune states that can no longer reach the entered score with the rallies left.
3. T6 must convert `game`, which is numbered per set, before comparing it with the match-cumulative `points.game_number`.

## T5 · Segmenter completion: merges, ambiguity, tiebreak, gaps, mid-match — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `segmentation.ts` gains:

- A merge step: same end and side, a gap under 30 s, and the first rally ending on a serve or within 2 strokes.
- Ambiguity detection: each DP state keeps its 2 best paths with distinct proposal signatures. It reports `ambiguous` within `AMBIGUITY_MARGIN` 1, and `runnerUpCost` is null unless the result is ambiguous.
- Tiebreaks at 6–6: a 1, 2-2 rotation, ends swapping via `playerAtEnd`, and the next set opening with the tiebreak's first receiver serving.
- Gap rows `changeoverShortGap` and `longGapNotChangeover`, with the thresholds as named constants.
- `reason?: "starts_mid_match"`, read from the first stroke's score strings.
- Exact branch-and-bound pruning: 150 rallies take about 0.5 ms.

The `build()` helper in the spec now inserts realistic pauses. There are 8 new tests, and T4's test bodies are unchanged.
**follow-ups:**

1. The new constants `MERGE_MAX_GAP_S`, `MERGE_MAX_STROKES`, `CHANGEOVER_SHORT_GAP_S` and `LONG_GAP_S` are not yet exported from `index.ts`. T6 should add them if needed.
2. Vendor pseudo-games inside a tiebreak are charged as dropped boundaries, so review will fire on every vendor tiebreak. Decide whether that is wanted.
3. Should `changeoverShortGap` also apply at the set break after an even set?
4. The proposal signature is a 32-bit hash. A collision could in theory hide a runner-up.

## T6 · Wire the segmenter into the transcript and marks — blocked

**gate:** mechanical GATE PASS · completion VERDICT: needs-work
**reason:** One criterion is not met: the forced-throw test. "a segmenter that throws…" passes `initialTopIsPlayer1: null`, and `segmentForReview` returns null on that condition before calling the injected segmenter. The throwing function never runs, so the test would pass even with the `try`/`catch` deleted.

The fix is in the test only: use top = true or false on a fixture that reaches the segmenter (the clean fixture with top=false does), and assert that the throwing function was called.

Every other criterion was met:

- the split-deuce fit flags exactly the differing points;
- the published-fields equivalence table is not vacuous: clean with top=false runs the segmenter and flags 11 points while the rows stay identical;
- the marks params are filled;
- no existing test body was edited.
  **implementation notes:**
- The `segmenter?` seam on `BuildOptions` defaults to production behaviour.
- `proposedPointsOf` and `ProposedPoint` are exported via `index.ts`. They convert per-set game numbers to match-cumulative ones.
- Flags are applied for any proposal status, including no_fit's closest path.
- The clean fixture gives `no_fit` (cost 115) against its own folded score. That is worth a look in T9.
  **stash:** 19367490c6ffb6e32809a3869a40ab5a9680e045

## T11 · Remove the unused `server_position_conflict` flag — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Removed everything T2 added for `server_position_conflict`: the `POINT_FLAGS` entry and its doc, the `marks.ts` registry entry, params type and switch case, and the `marks-copy.ts` chip and hover case. The copy spec's sample and label are gone too. The `markHover` doc comment now reads "Five lines have a second form". The shared `TODO(T6)` comment was trimmed to cover only `segment_proposal_differs`. Nothing about `segment_proposal_differs` changed.
**follow-ups:**

1. T6's stash `19367490` touches `marks.ts` around the same switch, and its `TODO(T6)` comment mentions the positional server. Expect a small conflict when it is reapplied.

## T6 · Wire the segmenter into the transcript and marks — done

**gate:** mechanical GATE PASS · completion VERDICT: pass (re-review)
**changed:** This is a re-run at the author's direction ("fix T6").

- Before the re-run, the branch was synced with `splitstep-integration` (merge `8aeeeffb`), bringing in PR #410's hand-labelled guard.
- Stash `19367490` was reapplied. The conflict in the `marks.ts` switch was resolved by dropping the obsolete `TODO(T6)` comment and the `server_position_conflict` case that T11 removed.
- The forced-throw test now uses `initialTopIsPlayer1: false` on the clean fixture and asserts the segmenter was called once. That fixes the vacuous test that blocked the first run.

The rest of the change is as described in the blocked entry above:

- `Transcript.segmentation` via `segmentForReview`, with `try`/`catch`;
- the `segmenter?` seam on `BuildOptions`;
- `proposedPointsOf` and `ProposedPoint`, exported;
- the `segment_proposal_differs` flag and its marks params;
- 10 new offline tests, including the equivalence check that published fields are unchanged.
  **follow-ups:**

1. Flags are applied on `no_fit` closest paths as well as fits. Revisit in T9 if that proves noisy.
2. The clean fixture gives `no_fit` (cost 115) against its own folded score. Look at it in T9.

## T7 · Record the proposal on the job (`mergeDerivationQuality`) — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `recordUnreconciledFold` became `mergeDerivationQuality(supabase, jobId, patch)`: the same read, merge, write and swallow.

- After a successful publish, one patch carries `fold` (only when the fold is unreconciled, built exactly as before) and `segmentation` (from `written.transcript.segmentation`, when non-null).
- The segmentation path never writes `fold`.
- A run refused over hand labels records no proposal. PR #410's guard is unchanged.
- There are 6 new spec cases, and the existing test bodies are unedited.
  **follow-ups:**

1. A failed combined write now loses both `fold` and `segmentation`; before, only `fold` was at risk. It is logged and swallowed. Consider separate writes if that matters.
2. The proposal is stored whole, so check the `derivation_quality` jsonb size on a real match.

## T8 · `splitstep-eval --session` and proposal scoring — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `scripts/splitstep-eval.ts` gains `--session <uuid>`. It reads through `readLabelSessionRows`, SELECTs only, and adds a `reportSession()` that prints published-vs-proposed accuracy, the proposal's status and diff, game counts, firings as hit or miss, and merges. There is a new pure `src/lib/services/labels/session-truth.ts`: games are compared by partition, and the proposed ending is the published ending. `tests/label-session-truth.spec.ts` adds 6 offline specs.

**Read-only baseline before tuning (counts only):**

| Job      | Server (published → proposed) | Status    | Games                              | Firings hit |
| -------- | ----------------------------- | --------- | ---------------------------------- | ----------- |
| be930d79 | 42 → 52 / 56                  | fit       | 8 proposed vs 11 folded, entered 8 | 8 / 23      |
| 868a7696 | 101 → 103 / 106               | ambiguous | —                                  | 2 / 2       |
| 45ff4bd7 | 99 / 101, unchanged           | ambiguous | —                                  | no firings  |

On be930d79 the proposal makes all 4 merges the labeller made.

Published winner misses agree with `label-scorecard`'s flip counts on 868a7696 and 45ff4bd7. be930d79 has 2 extra misses, both on points with no seed.
**follow-ups:**

1. A firing counts any difference in game number, including the renumbering a moved boundary causes. Many of the 15 misses on be930d79 may be that knock-on effect rather than wrong cuts. Consider scoring firings by partition only.
2. Across the two matches, 10 of 25 firings hit. That is far below the promotion bar, and is input for T9.

## T9 · Tune `SEGMENT_COSTS` — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Only `SEGMENT_COSTS` and its doc comment changed.

**Final weights:** end 5 · side 2 · flipHigh **2** (was 4) · flipLow 1 · vendorBoundaryMoved 1 · vendorBoundaryDropped 1 · changeoverShortGap **4** (was 1) · longGapNotChangeover **3** (was 1) · merge 1. These came from a sweep of 11,664 combinations. The chosen point sits inside a plateau.

**Results (counts only, published → proposed):**

| Job      | Status     | Server          | Winner  | Game partition | Firings hit | Merges |
| -------- | ---------- | --------------- | ------- | -------------- | ----------- | ------ |
| be930d79 | fit at 6–2 | 42 → 54 / 56    | 35 → 43 | 15 → 43        | 22 / 23     | 4 / 4  |
| 868a7696 | fit        | 101 → 105 / 106 | —       | 63 → 97        | 5 / 5       | 1 / 1  |
| 45ff4bd7 | ambiguous  | 99 → 99 / 101   | —       | —              | no firing   | —      |

**Targets for stage 06 (shortfalls, with numbers):**

1. **be930d79: 54/56 against a target of 55.** Labels #14 and #15 both carry rally 15, with different servers, so one of them must miss. Label #17 opens game 4 on an ad-court serve after a 14 s gap. That is label noise or a point the vendor never saw, not a wrong cut.
2. **868a7696: points 18 and 102 fire and hit; point 83 cannot.** Labels #82 and #83 both carry rally 81, with different games and servers.
3. **45ff4bd7: point 19 does not fire.** The vendor's high-confidence winners on rallies 11, 13 and 18 are wrong, so the vendor's cut is self-consistent. The true cut costs 3 high flips plus 2 boundary units, against one long-gap unit of evidence. The gap is 31 s, 1 s over `CHANGEOVER_SHORT_GAP_S`. This is a rule or threshold limit, not a weight problem. Its `ambiguous` result is irreducible: two 7-point no-ad games have identical cost.

**Frozen jobs (info only, read-only):**

- ac56ef8b: ambiguous. Set 1 differs on 3/53 points and set 2 on 23/38. It pays 20 end mismatches, which is the parity problem from design open question 2.
- 5c377b0a: no_fit, closest 3–3; 26/38 servers differ.
- 467ccbdc: no_fit, closest 2–3; 8/20 servers differ.
  **follow-ups:**

1. The `segmentation.ts` header still calls the weights "first guesses". That is a one-word edit outside T9's scope.
2. The `SEGMENT_COSTS` comment carries some narrative counts, such as game numbers and gaps. Check they meet the "counts only" rule.
3. Promotion tally so far: 27 of 28 firings hit across 2 matches. That is above 95%, but short of the 30+ firings the bar needs.

## T10 · Bump `DERIVATION_VERSION` to 0.8.0 and write the changelog entry — done

**gate:** mechanical GATE PASS on re-run · completion VERDICT: pass

- The first gate run failed on one unrelated spec, `tests/film-playback-refresh.spec.ts:1498`, under full-suite load.
- That spec passes alone (81/81), and the full gate passed on the re-run.
  **changed:**
- `DERIVATION_VERSION` is now `0.8.0-unreconciled`.
- The 0.8.0 changelog entry covers:
  - the review-only segmenter, its `derivation_quality.segmentation` key that never touches `fold`, and `segment_proposal_differs`;
  - the tuned weights and the three-session counts;
  - the dropped T3 rule;
  - the promotion bar, with a 27/28 tally so far;
  - that no published row changes on re-derive.
- The `tests/label-session-marks.spec.ts` fixture now uses `DERIVATION_VERSION` instead of a literal.
  **follow-ups:**

1. Add `tests/film-playback-refresh.spec.ts:1498` ("the report player never dims a frame it has not shown yet") to the known list of specs that flake under full-suite load.
