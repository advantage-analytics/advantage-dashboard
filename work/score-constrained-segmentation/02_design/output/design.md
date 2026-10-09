# Design — Score-constrained game segmentation

Brief: `../../01_brief/output/brief.md`. This stage changed two of the brief's decisions,
both agreed in chat on 2026-10-09:

- **Where it runs.** The re-segmentation runs on **every match** (review-only) and fires
  wherever its proposal differs from the vendor's games or servers. The brief had it run
  only when the folded game count disagrees with the entered score.
- **The hitter rule.** "Swap only if `pred_player_id` agrees" turned out to be vacuous,
  and is replaced by **block and flag on a position conflict**. See §1.

## What the data says

Each rally was dumped beside its labelled point for the three sessions. The dump script
is in the scratchpad, and its output names players, so nothing of it is in the repo. Six
findings shape the design.

1. **The server's court end is the strongest signal in the payload.** The changeover
   schedule is known: who started at the top (`initial_top_player_is_player1`, `true`
   on all three jobs), and ends swap after games 1, 3, 5… of each set. With it, the end
   of a rally's serve names the server. This held on every labelled game in all three
   matches. Within a set, the server's end follows *same, switch, same, switch…* from
   one game to the next. So switch-boundaries are visible directly, and only the
   same-end boundaries (changeovers) must be placed.
2. **Serve-side runs mark both kinds of error.** Inside a game the serve side alternates
   deuce/ad.
   - **Two ad-court serves in a row** mark a split point: one real point cut in two at a
     serve. All four of Sage v Hunter Cheng's pairs (rallies 22+23, 25+26, 47+48,
     52+53) are ad→ad.
   - **Two deuce-court serves in a row** mark a new game. Quan v Kim rallies 17→18 and
     98→99 are both deuce→deuce at the true boundary.
3. **Long gaps help but cannot be trusted alone.** Quan's and Emon's true changeover
   boundaries carry 86–179 s gaps. Sage v Hunter Cheng's do not: they run 12 s, 62 s
   and 67 s, against `CHANGEOVER_MIN_GAP_S = 80`. The study-only `server-witness.ts`
   swaps ends on the gap alone, so it would fail on Sage. Gap is a soft cost here, never
   a rule.
4. **Who won is robust relative to the server.** Swapping a rally's labels flips the
   *identity* of the point winner, but not whether the *server* or the *receiver* won.
   The segmentation therefore reasons in server-won / receiver-won terms, and names
   players only after the server of each game is fixed.
5. **The `pred_player_id` rule is vacuous.** `playerLabel` is `pred_player_id`
   (`parse.ts:146`), and `withServer` swaps only when the two disagree. On Sage v
   Hunter Cheng's frozen stretch (rallies 36–43), the vendor and the rebuild agree,
   wrongly, on rallies 36–42, and the rebuild swaps rally 43 wrongly. Only a correct
   game cut fixes all eight.
6. **Quan and Emon have the right game count.** The vendor places one boundary a rally
   or two late at a changeover: Quan points 18, 83 and 102, Emon point 19. A
   count-mismatch trigger would never fire there. Running everywhere does.

Labels also carry noise any hard-constraint search would choke on. Points the vendor
never saw were added, rallies were deleted, and one labelled game ends 3–1. So every
constraint except the entered score is a **cost**, not a rule.

## Approaches considered

### A. Pattern repair

Fix known shapes in place: merge ad→ad pairs, split at deuce→deuce, move a boundary to
the nearest long gap.

- **For:** small, easy to explain per rule.
- **Against:**
  - Each rule fires blind to the others.
  - Nothing ties the result to the entered score.
  - On Sage v Hunter Cheng's block of rallies 10–22, two cuts satisfy every local rule
    (6+7 and 4+9 rallies). Only game length plus who won picks between them.
  - It cannot reach a 6–2 guarantee. Rejected.

### B. Position-only witness

Promote `server-witness.ts` to name every server from end plus changeovers, then fold
on those servers.

- **For:** reuses study code, and needs no score.
- **Against:**
  - It finds changeovers by gap, which fails on Sage v Hunter Cheng (finding 3).
  - The same-end boundary still has to be placed by something.
  - It cannot use the entered score at all.

  Rejected as the engine. Its end logic is reused inside C.

### C. Constrained shortest-path segmentation (recommended)

One dynamic-programming pass over the rallies. Each state is a legal tennis score; each
step consumes one rally, or a merged pair, as one point. The cost adds up every piece of
evidence the proposal contradicts. The final state must equal the entered score. The
cheapest path is the proposal, and the runner-up's cost says whether the answer is
unique.

- **For:**
  - It uses every signal at once, which is what resolves the 6+7 vs 4+9 case.
  - The entered score is a hard end condition.
  - The state space is tiny (§2), so it is exact, not heuristic.
  - It is pure and testable.
- **Against:**
  - Cost weights need tuning, against three matches only.
  - It is harder to read than a list of rules. This is mitigated by recording, per
    firing, which costs decided it.

**Recommendation: C**, with two companions: B's end/changeover arithmetic as one of C's
costs, and the live hitter rule (§1) built on the same arithmetic.

## Chosen design

### 1. Live change: block and flag on a position conflict (frozen stretches only)

Today `transcript.ts` (lines 272–311) walks each frozen run. It takes the server from
game alternation, and `withServer` relabels the rally's strokes to it.

New behaviour:

- **Compute the positional server independently.** For each frozen rally, the
  positional server is the player the changeover schedule puts at the serve's end. It
  counts games as follows:
  - the vendor's fold before the run;
  - plus new games found by position alone: a new game starts when the positional
    server changes, or on a switch of end;
  - **not** the rebuild's own game starts.
- **Agreement.** Where the positional server agrees with the alternation server, relabel
  exactly as today.
- **Conflict.** Where they disagree, or where position is unknown because the serve has
  no `playerY`:
  - do not relabel, so the vendor's labels stand;
  - flag the point `server_position_conflict`. This is a new hidden-tier point flag in
    `flags.ts` and the `marks.ts` registry, with params `{ positionalServer: LabelSide
    | null }`.
- **What does not change.** Game keys, the `score_frozen` flag, `winner_guessed` and
  null score columns are unchanged. Only which hitters are relabelled changes.

Expected effect on Sage v Hunter Cheng:

- Rally 43 is no longer swapped. The positional server is Sage, which is right, against
  the rebuild's Hunter.
- Rallies 36–42 are flagged, and stay wrong until the re-segmentation is promoted.

Job ac56ef8b must not regress: where its relabels agree with position they still
happen. The amount it changes is measured in testing.

This is the only change to published rows beyond flags. It lives in a new pure module,
`derivation/position.ts`: `playerAtEnd(topAtStart, gamesBeforeInSet, setIndex,
priorSetGameTotals)`. Ends also swap after a set whose game total is odd, which
closes the "set break" gap noted in `server-witness.ts`. `frozen.ts` calls it, and §2
reuses it.

### 2. Review-only: the segmenter (`derivation/segmentation.ts`, pure)

`proposeSegmentation(input): SegmentationProposal`

**Input**
- `rallies`: post-`playedRally`, as the transcript sees them.
- `outcome[i]`: server-won / receiver-won, with a confidence. It is *high* when the
  score stream resolved the winner, and *low* when guessed (`via: "guess"`) or frozen.
- The serve end and side of each rally, plus the gap to the previous rally.
- `adScoring`, `bestOf`, `matches.score`, `topAtStart`, and which vendor label is
  player1 (`reconciliation.player1Label`).
- The vendor's own game boundaries and servers, for the movement cost.

**State** (after each consumed unit)
- set index;
- games won by player1 and player2 in the set;
- points for server and receiver in the current game. This is capped at deuce
  equivalence (3–3, 4–3, 3–4), and a no-ad game has a deciding point at 3–3;
- tiebreak point counts when the set reaches 6–6.

Who serves the game, and where each player stands, follow from the state plus
`topAtStart`. The tiebreak serve rotation is 1, then 2-2. At most 3 sets × 7×7 games ×
~12 point states gives under 2,000 states, times ~150 rallies. That is negligible.

**Steps** from each state:
1. **Point.** Consume rally *i* as the next point.
2. **Merge.** Consume rallies *i* and *i+1* as one point. Allowed only on split-point
   evidence: same serve end, same serve side, a gap under 30 s, and rally *i* ending on
   a serve or within two strokes.

After each point, the rules for `adScoring` close the game; on game end the server
alternates; on set end the next set starts. A set ends at 6 with a margin of 2, at 7–5,
or at 7–6 via the tiebreak.

**Costs** (initial weights; tuning is a stage-03 task against the three sessions)

| Evidence the step contradicts | Cost |
|---|---|
| Serve end ≠ the end the schedule puts this game's server at | 5 |
| Serve side ≠ expected side for the point count (free on a no-ad deciding point; off in a tiebreak in v1) | 2 |
| Outcome flipped against a high-confidence winner | 4 |
| Outcome flipped against a low-confidence winner | 1 |
| Game boundary not where the vendor's game key changed | 1 |
| Vendor boundary not kept | 1 |
| Changeover boundary with a gap < 30 s | 1 |
| A boundary inside a gap ≥ 80 s that is not a changeover or set break | 1 |
| Merge | 1 |

**End condition.** The final state must equal `matches.score` set by set: games won,
and the tiebreak's existence where the score has one. Paths that cannot reach it are
discarded.

**Result**

```ts
type SegmentationProposal = {
  status: "fit" | "ambiguous" | "no_fit";
  version: 1;
  cost: number;
  /** Cost of the best path with any different game assignment. */
  runnerUpCost: number | null;
  /** Fit only, or the closest reachable on no_fit. */
  games: Array<{
    set: number;
    game: number;
    server: "player1" | "player2";
    firstRallyId: number;
    lastRallyId: number;
    winner: "player1" | "player2";
  }>;
  merges: Array<[rallyIdA, rallyIdB]>;
  /** On no_fit: the score the cheapest unconstrained path reaches. */
  closestScore: MatchScore | null;
  diff: {
    gamesMoved: number;
    serversChanged: number;
    rallies: number[];
  };
  /** Which cost rows decided it. */
  costBreakdown: Record<string, number>;
};
```

- **ambiguous** means `runnerUpCost − cost < 1`, below one unit of evidence. The best
  path is still reported, per the brief's tie rule (fewest vendor boundaries moved,
  which the movement cost already favours).
- **no_fit** means no path reaches the entered score. The cheapest path with the end
  condition dropped is reported as `closestScore`.

**Firing.** A proposal *fires* when `diff.gamesMoved + diff.serversChanged > 0`, or when
it is `no_fit`. This replaces the brief's count-mismatch trigger.

**Out of scope for v1:**
- re-cutting inside a tiebreak (its rallies are consumed as tiebreak points, with sides
  not costed);
- a video that starts mid-match. The DP starts from 0–0. A match whose first reading is
  not 0–0 is recorded as `no_fit` with reason `starts_mid_match` rather than guessed.

### 3. Where it is recorded

- **The transcript.** `buildTranscript` gains `segmentation: SegmentationProposal |
  null`. It is computed after winners and frozen handling, and published rows are
  unaffected.
- **Per point.** Each point whose proposed game or server differs from the published
  one gets the flag `segment_proposal_differs`. It is hidden tier, with params
  `{ proposedGame: number, proposedServer: LabelSide }`. The params come from the
  transcript, which the labelling console's marks are rebuilt from (`buildJobMarks`),
  so no new column is needed. Merged pairs carry the same flag on both points, with
  params `{ mergedWith: rallyId }`.
- **Per job.** `derive-and-publish.ts`:
  - `recordUnreconciledFold` becomes one helper, `mergeDerivationQuality(jobId,
    patch)`, used for both `fold` and the new key;
  - it writes `derivation_quality.segmentation = proposal` on every derivation;
  - **it never touches `fold`**, so the match report's grey note is unchanged (brief
    decision);
  - a write failure is logged and swallowed, like `fold` today.

No migration. `derivation_quality` is already jsonb, and flags are already a string
array.

### 4. Versioning and deploy

- **Version.** Bump `DERIVATION_VERSION` to `0.8.0-unreconciled`, with a changelog entry
  in `index.ts` covering:
  - the live hitter rule and its flag;
  - the review-only segmentation key and flag;
  - the promotion bar: ≥95% of firings right on server *and* game, over 30+ firings
    across 2+ matches, scored with `splitstep-eval`.
- **Deploy.** The derivation runs in the Next app (the webhook and
  `api/splitstep/jobs/[jobId]/rederive`), not in an edge function. Merging to
  `splitstep-integration` and on to `main` is the deploy. No `deploy_edge_function` is
  needed.
- **Jobs to re-derive.** Re-derive only when the user says so. Published points change
  only on the four live jobs with frozen points:

  | Job | Frozen points | What changes |
  |---|---|---|
  | `be930d79` (Sage v Hunter Cheng) | 8 | Rally 43's hitters revert to the vendor's |
  | `ac56ef8b` | 38 | Relabels kept where position agrees, otherwise reverted and flagged |
  | `5c377b0a` | 38 | Same as `ac56ef8b` |
  | `467ccbdc` | 20 | Same as `ac56ef8b` |

  Every other job gains only flags and the `segmentation` key. Re-deriving those is
  optional, and worth doing in bulk later to collect firings toward promotion.

### 5. Measurement tooling

- **`splitstep-eval.ts`**:
  - It only reads point-check sheet exports today (`--labels <dir>`). Add `--session
    <uuid>`, which reads `label_points`, uses every non-deleted checked point, and joins
    on `vendor_rally_ids` (the first id is the point's rally; a multi-id point is a
    merge).
  - Report server, winner and ending accuracy for both **published** and **proposed**
    values.
  - Report the proposal's status, game count against the entered score, and per-firing
    hit or miss. This is the promotion-bar tally.
  - The brief's `--job <id>` command still works through the session's job.
- **`label-scorecard.ts`**: the two new marks appear automatically via `marks.ts`. Add
  no new section.
- **Privacy.** All output goes to the scratchpad or the labels folder on the Desktop,
  never the repo.

### 6. Error handling

- **Missing inputs.** No `matches.score`, unknown `topAtStart`, or labels ≠ 2 give
  `segmentation: null`, and nothing is written. Today's transcript refusals are
  unchanged.
- **Missing serve position.** A serve with no `playerY` or side contributes zero end and
  side cost, never a guess. In the live rule, an unknown position means no relabel plus
  the flag.
- **Failures.** A throw inside `proposeSegmentation` is caught in `buildTranscript`,
  logged, and gives `null`. A review-only feature must never fail a derivation.
- **Write failures.** These are logged and swallowed (§3).

### 7. Testing

- **Unit (offline, Playwright spec), `tests/splitstep-segmentation.spec.ts`.** Synthetic
  rally builders cover:
  - an ad deuce game split in two, which is re-merged;
  - an ad→ad split point that is merged;
  - a deuce→deuce boundary;
  - a changeover with no gap, decided by end;
  - two equal-cost cuts, giving `ambiguous`;
  - an unreachable score, giving `no_fit` with `closestScore`;
  - a no-ad deciding point on the ad side, which costs nothing;
  - a 7–6 set whose tiebreak passes through;
  - a mid-match start, giving `no_fit` with reason `starts_mid_match`.
- **Unit, `tests/splitstep-position.spec.ts`.** `playerAtEnd` across sets with odd and
  even game totals.
- **Transcript.** In `splitstep-transcript.spec.ts`, a frozen-run fixture where position
  disagrees asserts no relabel plus `server_position_conflict`, and one where it agrees
  asserts the relabel. The existing frozen tests must still pass.
- **Derive and publish.** In `derive-and-publish-codes.spec.ts`, assert that
  `segmentation` is merged and `fold` is untouched.
- **Measured, not CI.** Run `splitstep-eval --session` on the three sessions, before
  and after:
  - Sage v Hunter Cheng: the proposal is `fit` at 6–2, and proposed server accuracy is
    about 100%.
  - Quan v Kim and Emon v Roger: the proposal fires at points 18/83/102 and 19, and
    gets them right.
  - All three: published accuracy is no worse.

  The numbers go into stage 06's review, not the repo.

## Open questions

1. **Cost weights** are first guesses. Stage 03 should plan a tuning task, and record
   the final weights and the per-session result in the changelog entry, as `played.ts`
   does for its rule.
2. **Positional server when the fold before a frozen run has the wrong parity.** The
   live rule counts games from the vendor's fold up to the run. If that count is off by
   one, position names the wrong player and the rule *blocks a correct relabel* (it
   cannot create a wrong one). Measure on `ac56ef8b`, `5c377b0a` and `467ccbdc` before
   shipping. Those three have no fully checked labels, so the check is: no more than a
   handful of new `server_position_conflict` flags per set. A frozen *set* in which
   position disagrees with every rally is a parity error, and should be reported, not
   shipped.
3. **The split-point merge thresholds** (gap < 30 s, rally ≤ 2 strokes or ending on a
   serve) are set from Sage v Hunter Cheng's four pairs alone. Quan and Emon are no-ad
   and show none, so a false merge is the main risk there. The no-regression check
   covers it.

## Also consulted

- `src/lib/services/splitstep/derivation/frozen.ts`: `frozenStretches`,
  `frozenGameStarts`, `withServer`
- `src/lib/services/splitstep/derivation/transcript.ts` (lines 100–140 and 225–372):
  game and set keys, the frozen loop, guesses
- `src/lib/services/splitstep/derivation/rallies.ts`: grouping, `collapsedTailStart`
- `src/lib/services/splitstep/derivation/server-witness.ts`: the study-only
  end/changeover witness and its gap thresholds
- `src/lib/services/splitstep/derivation/reconcile.ts`: `foldGames`,
  `ACCEPT_UNRECONCILED_FOLD`
- `src/lib/services/splitstep/derivation/court.ts`: `serveCourtSide`
- `src/lib/services/splitstep/derivation/types.ts` and `parse.ts:146`: `playerLabel =
  pred_player_id`
- `src/lib/services/splitstep/derivation/flags.ts` and `src/lib/services/labels/marks.ts`:
  flag codes, mark tiers and params
- `src/lib/services/splitstep/derive-and-publish.ts`: the `deriveAndPublish` signature
  and `recordUnreconciledFold`
- `scripts/splitstep-eval.ts` and `scripts/label-scorecard.ts`: inputs and what they
  measure
- `tests/` listing, for existing spec names
- Live database:
  - `label_points` for the three sessions, joined to the rallies by a scratchpad dump
    script whose output stays out of the repo;
  - `processing_jobs.initial_top_player_is_player1` and
    `matches.initial_top_player_is_player1`;
  - `points.flags` containing `score_frozen`, to list the four affected jobs.
- `label-scorecard.ts` baseline for Sage v Hunter Cheng, saved to the scratchpad.

MAP.md was not needed: every file was reached from the derivation directory the brief
names, and no dashboard UI is touched.
