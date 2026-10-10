# Review: score-constrained game segmentation

Sign-off: pending

**Range reviewed:** the branch range `a97f3551...b492e242`, from the merge base with
`splitstep-integration` to the review-fix commit. The range is the build stage's
commits (see `../../05_build/output/build.md`) plus one review-fix commit, `b492e242`.

**pr-check receipt:** `b492e24 not-ready 2026-10-10T05:31:04Z`, reviewed as the branch
range.

## pr-check stages

| Stage | Result |
|---|---|
| 1 Mechanical | lint ✓ · tsc ✓ · full test suite ✓ · `format:check` ✓, re-run after the review fixes |
| 2 simplify (sonnet subagent) | 1 change, applied and committed in `b492e242` (below) |
| 2 `vercel-react-best-practices` | skipped: no `.tsx` changed and no `"use client"` added |
| 3 `code-review medium` | 6 findings: 1 fixed, 5 left (below) |
| 3 `pipeline-guardrails-reviewer` | skipped: `check.sh surfaces` reports no guardrail surface touched |
| 3 `rls-boundary-reviewer` | skipped: same, no data, API or migration surface touched |
| 3 `supabase-postgres-best-practices` | not triggered: no SQL, migration or schema change |
| 3b eyes-on (`ui-verifier`) | skipped: no UI surface touched |

**Verdict: not-ready.** Two correctness findings (F2 and F3 below) need a decision. Both
are review-only in effect, since no published row changes. But F2 inflates the number
the promotion bar is judged on, and that inflated number is already written into the
0.8.0 changelog.

## Success criteria, one by one

The brief's criteria are listed as amended in chat during stages 01–02. The decisions
taken were: the segmenter runs on every match, the live hitter rule was dropped (option
3), and measurement uses only fully checked sessions. All numbers come from T9's run of
`splitstep-eval --session`; the output stayed outside the repo.

1. **Sage v Hunter Cheng (be930d79).**
   - Fold reconciles to 6–2: **met, in the proposal.** The proposal is `fit` at 6–2 with 8
     games, against 11 folded. The published rows still fold 8–3, by design, because
     the feature is review-only.
   - Server accuracy about 100%: **partly met.** 54 of 56 (96%), against 42 published.
     Both misses are label artefacts:
     - two label points carry one vendor rally with different servers;
     - one labelled game ends 3–1, which is a point the vendor never saw.
   - Games 6 and 8 each one game: **met, by inference.** The proposed game partition
     matches the labels on 43 of 56 points, against 15 published, and all 4 split points
     the labeller combined are proposed as merges. Neither game was checked one by one.
   - Frozen stretch winners no longer reversed: **improved in the proposal.** Proposed
     winners are right on 43 of 56 points, against 35 published.
2. **Rudy Quan v Aidan Kim (868a7696): met where scoreable.**
   - Points 18 and 102 fire and hit.
   - Point 83 is explained, not resolved: labels #82 and #83 share one rally, so no
     proposal can score on both.
   - The proposal is `fit`, with 105 of 106 servers right and 5 of 5 firings correct.
3. **Emon v Roger (45ff4bd7): explained, not resolved.** Point 19 does not fire:
   - The vendor's high-confidence winners there are wrong, so its cut is self-consistent.
   - The only contrary evidence is one 31 s gap, a second over `CHANGEOVER_SHORT_GAP_S`.
   - Fixing it needs a rule or threshold change, which tuning cannot do.
   - The proposal is `ambiguous`, from an irreducible tie between two no-ad games.
4. **No regression: met.** Published rows are byte-identical with and without the
   segmenter, which T6's equivalence test checks across fixtures. No proposed metric
   falls below its published value in any of the three sessions.
5. **No hitter reassigned against `pred_player_id`: superseded by decision.** The live
   rule (T3) was dropped. The existing frozen-run relabelling ships unchanged, with the
   same behaviour as 0.7.0. Design finding 5 showed the brief's rule was vacuous as
   written.
6. **Recorded per firing: met.**
   - The match-level summary lives in `derivation_quality.segmentation`: status,
     ambiguity, runner-up, diff, merges and cost breakdown.
   - Each differing point carries `segment_proposal_differs`, with its proposed game,
     proposed server and merge partner.
   - Caveat: see F2. A "firing" also counts renumbering.
7. **Deploy section: met.**
   - The 0.8.0 changelog states that no published row changes on re-derive; jobs gain
     only the flag, the key and the version stamp.
   - Nothing was re-derived live.
   - Re-deriving is optional, and is how firings would be collected toward promotion.

## Findings and resolutions

**Fixed in `b492e242`:**

- **S1 (simplify):** the differing-point test was duplicated between `transcript.ts` and
  `session-truth.ts`. It is now one exported `proposalDiffers`, so the flag and the eval
  can never disagree on what a firing is.
- **F1 (code-review): a stale proposal survived a re-derive.** A re-derive whose proposal
  was null (no top player, a segmenter throw) left the previous run's `segmentation` in
  `derivation_quality`. A publish now always overwrites the key, null included. The spec
  case "a null proposal writes nothing" became "a null proposal clears a stale one from
  an earlier run".

**Open, needing a decision** (the reason the verdict is not-ready):

- **F2: firings count game renumbering.**
  - `segment_proposal_differs`, and so the promotion tally, compares the match-cumulative
    game *number*. One moved boundary early in a match flags every later point whose
    number shifted, even when its game partition is unchanged. On be930d79, 3 moved games
    produced 23 firings.
  - So the changelog's "27 of 28 firings across 2 matches" is not yet a sound promotion
    measure.
  - Fix: compare game partitions or the boundary set instead of numbers, as T8's hit test
    already does. Then re-run T9's measurement and correct the changelog counts.
- **F3: tiebreak-set end carry.** `playerAtEnd` carries only a tiebreak set's 13-game
  total into the next set, and ignores the end swaps every 6 points inside the
  tiebreak. If those swaps do carry, every rally of the following set pays the `end`
  cost on the true cut. None of the three tuning sessions had a tiebreak set. Decide the
  rule, add a fixture, and adjust if needed. This was first flagged at T1.

## Consciously left

These have reasons, and are recommended as follow-ups:

- **F4: the short-gap cost fires at changeovers with no rest.** `changeoverShortGap`
  (tuned to 4) also applies at the changeover after game 1 and at tiebreak swaps, where
  players don't sit down. It was tuned on three sessions without visible harm; revisit
  if a match with quick walk-rounds mis-cuts.
- **F5: `proposedPointsOf` assumes rally ids rise with play.** It walks rally-id ranges.
  Vendor ids have been contiguous on every payload seen, so the risk is low, but mapping
  by position would be safer.
- **F6: `no_fit` cost.** On a `no_fit` match, `bestOver` climbs the whole cost-cap ladder
  twice, for both first servers. That is acceptable at today's sizes; an early
  infeasibility check would avoid it.
- **Build follow-ups,** carried from `build.md`:
  - tiebreak pseudo-boundaries are charged as dropped;
  - flags are applied on `no_fit` closest paths;
  - one combined write covers `fold` and `segmentation`;
  - the `segmentation.ts` header still says "first guesses";
  - the `SEGMENT_COSTS` comment carries narrative counts;
  - older headers name players;
  - `film-playback-refresh.spec.ts:1498` is a known flake.
- **Peer request (not acted on):** another session asked for this branch to be pushed,
  opened as a PR and merged. Opening the PR is stage 07's job, after sign-off.

## Also consulted

- `.claude/skills/task-next/check.sh` (`surfaces`, and the gate for the review fix)
- `.claude/hooks/pr-check-receipt.sh` (`record` / `show`)
- `src/lib/services/splitstep/derivation/segmentation.ts`, `transcript.ts`, `position.ts`
  and `derive-and-publish.ts`, read in full for stage 3
- `tests/derive-and-publish-codes.spec.ts`, edited for F1
