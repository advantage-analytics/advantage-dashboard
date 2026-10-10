# Review: score-constrained game segmentation

Sign-off: approved — by the author in chat, 2026-10-10 ("approve the sign-off and land it")

**Range reviewed:** the branch range `a97f3551...7a425276`, from the merge base with
`splitstep-integration` to the last review-fix commit. The range is the build stage's
commits (see `../../05_build/output/build.md`) plus two review-fix commits:
- `b492e242`: S1 and F1;
- `7a425276`: F2 and F3.

**pr-check receipts:**
- `b492e24 not-ready 2026-10-10T05:31:04Z`, with F2 and F3 open;
- then `7a42527 ready 2026-10-10T05:55:43Z`, after they were fixed.

Both were reviewed as the branch range.

## pr-check stages

| Stage | Result |
|---|---|
| 1 Mechanical | lint ✓ · tsc ✓ · full test suite ✓ · `format:check` ✓, re-run after each round of review fixes |
| 2 simplify (sonnet subagent) | 1 change, applied and committed in `b492e242` (below) |
| 2 `vercel-react-best-practices` | skipped: no `.tsx` changed and no `"use client"` added |
| 3 `code-review medium` | 6 findings: 3 fixed, 3 left (below). The F2/F3 fix diff was then read by hand, since the review pass predates it |
| 3 `pipeline-guardrails-reviewer` | skipped: `check.sh surfaces` reports no guardrail surface touched |
| 3 `rls-boundary-reviewer` | skipped: same, no data, API or migration surface touched |
| 3 `supabase-postgres-best-practices` | not triggered: no SQL, migration or schema change |
| 3b eyes-on (`ui-verifier`) | skipped: no UI surface touched |

**Verdict: ready.** F1–F3 are fixed. F4–F6 are left consciously, for the reasons given
below.

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
   - A firing is a rally whose game assignment, server or merge changes; renumbering
     alone does not count (F2).
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

**Fixed in `7a425276`, at the author's request ("fix F2 and F3"):**

- **F2: firings counted game renumbering.**
  - The fix: a rally now fires only when the proposal moves it to another game, changes
    its server, or merges it. Each proposed game is paired one-to-one with the published
    game it shares the most rallies with.
  - Renumbering alone never fires.
  - `proposalDifferingRallies` is the single definition behind the flag and
    `splitstep-eval`.
  - **First attempt, superseded.** It compared whole game partitions. That fired every
    member of both games around a moved rally: 29/30 and 35/35, which inflated the count
    further, so it was replaced.
  - **Re-measured:**
    - be930d79: 14/15 firings right;
    - 868a7696: 5/5;
    - 45ff4bd7: no firings.

    That gives **19 of 20 across 2 matches**: 95%, but short of 30 firings. The
    changelog and the `SEGMENT_COSTS` comment were corrected from "27 of 28".
- **F3: ends after a tiebreak set.**
  - Implemented the ITF rule: during a tie-break, players change ends after every six
    points, and at the end of the tie-break.
  - A finished tiebreak set now records its point count. It adds `floor((N−1)/6)`
    changes on top of `ceil(13/2)`, and the change at the end of the tiebreak is the
    odd-set break, counted once. The segmenter keeps only the parity, in its set state.
  - Checked values: 7–0 gives 8 changes, 7–5 gives 8, 8–6 gives 9.
  - New position tests cover these, plus a segmentation fixture of a 7–5 tiebreak
    followed by a set that fits at zero end cost.
  - The rule wording is from memory of the ITF text; **verify it before sign-off**.
  - This closes build follow-up 1. It is recorded here because `build.md` is an earlier
    stage's output: an edit the fix agent made to it was reverted.

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
- **The three tuning sessions are unchanged by F3:** none has a tiebreak set, so their
  proposals and accuracy figures are the same as before.
- **Peer request (not acted on):** another session asked for this branch to be pushed,
  opened as a PR and merged. Opening the PR is stage 07's job, after sign-off.

## Also consulted

- `.claude/skills/task-next/check.sh` (`surfaces`, and the gate for the review fix)
- `.claude/hooks/pr-check-receipt.sh` (`record` / `show`)
- `src/lib/services/splitstep/derivation/segmentation.ts`, `transcript.ts`, `position.ts`
  and `derive-and-publish.ts`, read in full for stage 3
- `tests/derive-and-publish-codes.spec.ts`, edited for F1
- The F2/F3 fix diff (`position.ts`, `transcript.ts`, `session-truth.ts`), read in full
  before the second receipt
- `splitstep-eval --session` re-runs for F2, with output kept outside the repo
