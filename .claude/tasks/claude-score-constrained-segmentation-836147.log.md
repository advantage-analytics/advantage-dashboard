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
