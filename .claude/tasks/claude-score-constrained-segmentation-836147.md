# Tasks — claude/score-constrained-segmentation-836147

> Scope: score-constrained game segmentation for the Advantage Intelligence derivation (review-only proposal + live block-and-flag hitter rule); pipeline work/score-constrained-segmentation

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Add positional server module (`position.ts`)

- **status:** done
- **model:** opus
- **files:** (guess)
  - new `src/lib/services/splitstep/derivation/position.ts`
  - `src/lib/services/splitstep/derivation/frozen.ts`: `frozenGameStarts` (lines ~75–105) holds the inline `playerY` sign that `serveEnd` replaces
  - `src/lib/services/splitstep/derivation/index.ts`: exports only
  - new `tests/splitstep-position.spec.ts`
- **done when:**
  - [ ] `position.ts` exports `playerAtEnd({ topAtStart, bottomAtStart, completedSets, gamesBeforeInSet, end, tiebreakPointsBefore? })`, which returns the player at `"top" | "bottom"`. Ends swap after games 1, 3, 5… of a set, after any set whose game total is odd, and every 6 points inside a tiebreak. It also exports `serveEnd(rally)`, which returns `"top" | "bottom" | null` from the sign of the deciding serve's `playerY` (0 or null gives null)
  - [ ] `frozenGameStarts` in `frozen.ts` calls `serveEnd` instead of its own inline `playerY` sign. `index.ts` re-exports both new functions, and nothing else about it changes
  - [ ] `tests/splitstep-position.spec.ts` (offline, no `live-db` fixture) covers set 1 games 0–7; set 2 after a 6–4 set and after a 6–3 set; tiebreak points 0, 5, 6 and 11; and `playerY` of 0 and of null giving null
  - [ ] `position.ts` opens with a module header in the `frozen.ts`/`played.ts` style that says why the court end is the witness. It cites that the schedule held on every labelled game of the three labelled matches (as "three labelled matches", with no player names), and the set-break gap in `server-witness.ts` that it closes
  - [ ] `tests/splitstep-derivation.spec.ts`, `tests/splitstep-transcript.spec.ts`, `tests/splitstep-server-witness.spec.ts` and `npm run typecheck` pass with no edits to the existing specs
- **notes:**
  - Plan step 1 of `work/score-constrained-segmentation/03_plan/output/plan.md`; design §1 and "What the data says" 1 in `02_design/output/design.md`.
  - The plan's signature (an object parameter) wins over the design's positional one.
  - The plan says the inline copy lives in `frozenGameStarts`. That function is in `frozen.ts`, not `transcript.ts`.
  - Pure module, no I/O.
  - Do not read `tests/splitstep-transcript.spec.ts` whole (1,557 lines). Grep for `frozenGameStarts` and read lines 1182–1260 only.
  - No player names or labelled data in any committed file. No dashboard UI.

## T2 · Add `server_position_conflict` and `segment_proposal_differs` flags and marks

- **status:** done
- **model:** opus
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/flags.ts`: `POINT_FLAGS`, lines ~25–130
  - `src/lib/services/labels/marks.ts`: the registry, and the point-flag→mark `switch` around lines 330–345
  - `src/lib/services/labels/marks-copy.ts`
  - `tests/label-marks.spec.ts`, `tests/label-marks-copy.spec.ts`, `tests/label-session-marks.spec.ts`, only if one asserts an exhaustive code list
- **done when:**
  - [ ] `POINT_FLAGS` gains `SERVER_POSITION_CONFLICT: "server_position_conflict"` and `SEGMENT_PROPOSAL_DIFFERS: "segment_proposal_differs"`. Each has a doc comment in the existing style stating what it means, that it is review-only, and which module raises it: the `transcript.ts` frozen loop, and `segmentation.ts` via `transcript.ts`
  - [ ] The `marks.ts` registry has both codes at tier `hidden` and scope `point`, with params typed `{ positionalServer: LabelSide | null }` and `{ proposedGame: number | null; proposedServer: LabelSide | null; mergedWith: number | null }` respectively. The point-flag→mark switch has a case for each that passes null params for now; a `TODO(T6)` comment is acceptable
  - [ ] `marks-copy.ts` has chip and hint copy for both, with chips "Server by position" and "Game cut differs", in the register of the existing "Score not read" / "Winner guessed" entries
  - [ ] `tests/label-marks.spec.ts`, `tests/label-marks-copy.spec.ts`, `tests/label-session-marks.spec.ts` and `npm run typecheck` pass. Any exhaustive code list in those specs is extended, and nothing else in them changes
- **notes:**
  - Plan step 2; design §1 (first flag) and §3 (second flag).
  - `transcript.segmentation` does not exist until T6. Pass nulls; do not reach for it.
  - Independent of T1, so it may run in either order.
  - No dashboard UI. No migration: `points.flags` is already `text[]`.

## T3 · Block-and-flag hitter rule in frozen stretches

- **status:** blocked
- **model:** fable
- **needs:** T1, T2
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/transcript.ts`, only:
    - the frozen loop (lines ~261–311; `withServer` call at ~299, `frozenRallies` set at ~266/~309);
    - the point-flag assembly (lines ~555–600).
  - `tests/splitstep-transcript.spec.ts`: append one `describe` block after the `"frozen score stretch"` block (lines 1182–1485)
- **done when:**
  - [ ] Inside each frozen run, the positional server is computed independently via `playerAtEnd`/`serveEnd` from T1. Games are counted from the vendor's fold before the run, plus new games found by position alone (the positional server changes, or the end switches), never from the rebuild's own game starts
  - [ ] Where the positional and alternation servers agree, `withServer` relabels exactly as before. Where they disagree, or `serveEnd` is null, the rally is left unchanged and its point carries `POINT_FLAGS.SERVER_POSITION_CONFLICT`. The diff does not touch game keys, `score_frozen`, `winner_guessed` or the null score columns
  - [ ] A comment above the frozen loop explains why position, not `pred_player_id`, is the witness: `playerLabel` is `pred_player_id`, so the old agreement check was vacuous (design "What the data says" 5). No player names
  - [ ] The new `describe` block has three offline tests, with fixtures named for their shape:
    - (a) a frozen run where position agrees with alternation is relabelled identically to the pre-change output;
    - (b) a frozen run opening on the same end with no changeover is not relabelled, and every point is flagged;
    - (c) a serve with null `playerY` is flagged and not relabelled.
  - [ ] Every pre-existing test in `tests/splitstep-transcript.spec.ts` and `tests/splitstep-derivation.spec.ts` passes with zero edits to existing test bodies, and `npm run typecheck` passes
- **notes:**
  - Plan step 3; design §1.
  - **If any existing frozen-stretch test fails, STOP and report it in the final message. Do not edit it. Those tests encode job `ac56ef8b`'s behaviour, and a failure there is a finding, not a fixture to fix.**
  - This change writes published rows (hitter labels) on re-derive. The only behavioural change allowed is "fewer relabels plus a flag", never a new relabel.
  - Read `transcript.ts` only in the two line ranges above, plus the `Transcript` type (~107–127).
  - Never read `tests/splitstep-transcript.spec.ts` whole. Grep `frozen` and read 1182–1485.
  - Fixture (b) has the shape of the labelled frozen stretch, rallies 36–43. Name it for the shape (e.g. `sameEndNoChangeover`), never after a player.
  - **Abandoned 2026-10-09 (author's decision, option 3).** It was blocked on an existing frozen-stretch test. Position cannot see a changeover where nobody switches ends, so on `ac56ef8b` it would have left about every second frozen game unrelabelled. No live relabelling change ships. Position is used only inside the review-only segmenter (T4/T5 end cost). The work is kept in stash `d1c3a570`. Do not re-run.
  - No dashboard UI.

## T4 · Segmenter core: points, games, sets, end condition

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** (guess)
  - new `src/lib/services/splitstep/derivation/segmentation.ts`
  - new `tests/splitstep-segmentation.spec.ts`
  - `src/lib/services/splitstep/derivation/index.ts`: export only, if the house pattern exports every module
- **done when:**
  - [ ] `segmentation.ts` exports `proposeSegmentation(input): SegmentationProposal`.
    - The input has the shape from design §2: rallies; a per-rally server-won/receiver-won outcome with high/low confidence; serve end, side and gap to the previous rally; `adScoring`; `bestOf`; `score`; `topAtStart`; `player1Label`; vendor boundaries and servers.
    - The `SegmentationProposal` type is exactly as design §2 prints it: `status`, `version: 1`, `cost`, `runnerUpCost`, `games`, `merges`, `closestScore`, `diff`, `costBreakdown`.
  - [ ] The DP and its weights:
    - The state is {set, games for p1/p2 in the set, server/receiver points capped at deuce equivalence}. A no-ad deciding point closes the game at 3–3 plus one.
    - One rally is one point; there is no merge step yet.
    - The end condition is `score`, set by set.
    - The weights are one exported `SEGMENT_COSTS` constant covering end mismatch, side mismatch (free on a no-ad deciding point), high- and low-confidence outcome flip, vendor boundary moved, and vendor boundary dropped.
  - [ ] `status` is `"fit"` or `"no_fit"` only, with `closestScore` filled on `no_fit`. `ambiguous`, merges, tiebreak, gap costs and mid-match start are left as `TODO(T5)` stubs, only where a type demands a value (`runnerUpCost: null`, `merges: []`)
  - [ ] `tests/splitstep-segmentation.spec.ts` (offline, synthetic builders, fixtures named for their shape) asserts:
    - a clean ad 6–2 set with correct vendor boundaries gives `fit`, `diff.gamesMoved === 0` and `cost === 0`;
    - one ad deuce game split in two by the vendor is re-merged into one game, and the score is reached;
    - a vendor boundary one rally late at a same-end deuce→deuce changeover is moved;
    - an unreachable entered score gives `no_fit` with `closestScore`;
    - a no-ad deciding point served to the ad court adds zero side cost;
    - it never throws on empty `rallies` or a missing `playerY`.
  - [ ] A module header in the `frozen.ts`/`played.ts` style states the approach (a constrained shortest path over legal scores) and why pattern repair and a position-only witness were rejected. `npm run typecheck` passes
- **notes:**
  - Plan step 4; design §2: "Approaches considered" C, the state, steps, costs table and result type.
  - Reuse `playerAtEnd` from T1 for the end cost. Do not reimplement the schedule.
  - Pure module: no Supabase and no transcript import. The inputs include the vendor boundaries, so no transcript is needed.
  - Use the initial weights from the design table (5/2/4/1/1/1). T9 tunes them in this one constant, so nothing else may hard-code a weight.
  - "One ad deuce game split in two, re-merged" here means the DP assigns both vendor games to one proposed game. The explicit rally-pair _merge_ step is T5.
  - No player names or labelled data in any committed file. No dashboard UI.

## T5 · Segmenter completion: merges, ambiguity, tiebreak, gaps, mid-match

- **status:** done
- **model:** fable
- **needs:** T4
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/segmentation.ts`
  - `tests/splitstep-segmentation.spec.ts`
- **done when:**
  - [ ] A merge step consumes rallies i and i+1 as one point, only when they share serve end and side, the gap is under 30 s, and rally i ends on a serve or within two strokes. Merged pairs are recorded in `merges` at `SEGMENT_COSTS.merge`
  - [ ] The runner-up (the best path with a different game assignment) is tracked. `status === "ambiguous"` when `runnerUpCost − cost < 1`, and the best path is still reported. A first vendor reading that is not 0–0 / 0–0 returns `no_fit` with reason `starts_mid_match`
  - [ ] Tiebreaks, gaps and the diff:
    - At 6–6 the DP consumes tiebreak points first-to-7-by-2, with the 1, 2-2 serve rotation, no side cost, and the end swapping every 6 points via `playerAtEnd`.
    - The two gap costs are added to `SEGMENT_COSTS`: a changeover boundary with a gap under 30 s, and a boundary inside a gap of 80 s or more that is not a changeover or set break.
    - `diff` is filled against the vendor boundaries and servers in the input.
  - [ ] New offline tests:
    - an ad→ad split point is merged;
    - the same pair with a 40 s gap is not merged;
    - two equal-cost cuts give `ambiguous`, with the fewer-moves cut reported;
    - a 7–6 set passes through its tiebreak to `fit`;
    - a mid-match start gives `no_fit` / `starts_mid_match`;
    - a 150-rally synthetic match completes in under 50 ms, asserted in the spec with `performance.now()`.
  - [ ] All T4 tests pass unchanged, and `npm run typecheck` passes
- **notes:**
  - Plan step 5; design §2 (steps, costs and "Out of scope for v1") and "Open questions" 3.
  - The merge thresholds come from four ad→ad pairs in one match. Keep them as named constants beside `SEGMENT_COSTS`.
  - `starts_mid_match` needs a `reason` field on the proposal if T4 did not add one. Add it as optional, and keep the design's type otherwise.
  - Pure module. No player names or labelled data. No dashboard UI.

## T6 · Wire the segmenter into the transcript and marks

- **status:** todo
- **model:** fable
- **needs:** T2, T5
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/transcript.ts`:
    - the `Transcript` type (lines ~107–127);
    - the end of `buildTranscript`, after winners and frozen handling (~340–370);
    - the point-flag assembly (~555–600).
  - `src/lib/services/labels/marks.ts`: fill the `segment_proposal_differs` params from `transcript.segmentation`
  - `tests/splitstep-transcript.spec.ts`: append one `describe` block
- **done when:**
  - [ ] `Transcript` gains `segmentation: SegmentationProposal | null`.
    - `buildTranscript` builds the segmenter input from data it already holds: outcome relative to the server from `winners[i]` (`via: "guess"` or frozen means low confidence); vendor boundaries from `gameKeyOf` changes; vendor servers from `rally.server`; `player1Label` from the reconciliation; `topAtStart` from `initialTopIsPlayer1`.
    - It sets `segmentation` to null when the score or top player is missing, or labels ≠ 2.
  - [ ] The `proposeSegmentation` call is wrapped in try/catch. A throw is logged and gives `segmentation: null`, with the transcript still `ok`
  - [ ] Points whose proposed game or server differs from the published one, and both points of every merge, carry `POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS`. `marks.ts` fills `{ proposedGame, proposedServer, mergedWith }` from `transcript.segmentation` instead of T2's nulls
  - [ ] New offline tests:
    - a synthetic split-deuce match gives `segmentation.status === "fit"` and flags only the differing points;
    - a forced throw (a test seam, or malformed input reaching the catch) leaves `segmentation: null` and the transcript `ok`;
    - a table-driven check over the existing transcript fixtures asserts that `points` (game, server, winner, ended-by and score columns) are deep-equal with and without the segmenter, flags excluded.
  - [ ] Every pre-existing test in `tests/splitstep-transcript.spec.ts`, plus `tests/label-marks.spec.ts` and `npm run typecheck`, passes with no edits to existing test bodies
- **notes:**
  - Plan step 6; design §3 and §6.
  - The "published fields unchanged" equivalence test is the main guard that the segmenter is review-only. It is the most important criterion here.
  - **If an existing frozen or transcript test fails, stop and report. Do not edit it.**
  - Read `transcript.ts` only in the three ranges above.
  - Never read the spec whole. Grep `test.describe` for anchors: the `"transcript"` block starts at 559, `"frozen score stretch"` at 1182.
  - The with/without switch may be a test seam, for example an options flag that defaults to on. Keep production behaviour "on".
  - No player names or labelled data. No dashboard UI.

## T7 · Record the proposal on the job (`mergeDerivationQuality`)

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** (guess)
  - `src/lib/services/splitstep/derive-and-publish.ts`: `recordUnreconciledFold` at ~285, and its call site at ~245
  - `tests/derive-and-publish-codes.spec.ts`: the `"deriveAndPublish unreconciled fold"` block at ~269 shows the mocked client
- **done when:**
  - [ ] `recordUnreconciledFold` is generalised into `mergeDerivationQuality(supabase, jobId, patch)`, with the same read, merge, write and swallow-on-failure. The existing `fold` write goes through it with unchanged behaviour, and the two existing fold tests pass unedited
  - [ ] After a successful publish, `{ segmentation: transcript.segmentation }` is merged into `derivation_quality` when the proposal is non-null. The segmentation path never writes the `fold` key
  - [ ] New spec cases against the existing mocked client:
    - `segmentation` is merged and the other `derivation_quality` keys are preserved;
    - `fold` is absent or untouched when the proposal is `fit` but the vendor fold is unreconciled;
    - a write error on the segmentation merge is swallowed, and the outcome is still `ok`.
  - [ ] `npm run typecheck` passes
- **notes:**
  - Plan step 7; design §3 "Per job".
  - `derivation_quality` is already jsonb, so no migration.
  - The match report's grey "unreconciled" note reads `fold`, which is why the segmentation path must never touch it.
  - No dashboard UI.

## T8 · `splitstep-eval --session` and proposal scoring

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** (guess)
  - `scripts/splitstep-eval.ts` (390 lines; usage header lines 1–20, argument parsing ~120–130)
  - new `src/lib/services/labels/session-truth.ts` (pure join helper)
  - new `tests/label-session-truth.spec.ts`
- **done when:**
  - [ ] `--session <uuid>` is parsed and loads the job from `label_sessions`, reading `label_points` where `checked_at is not null and status <> 'deleted'`. `--labels <dir>` and `--job <id>` keep working as before
  - [ ] The join of label points to transcript points lives in a pure helper, `session-truth.ts`:
    - the first id in `vendor_rally_ids` is the point's rally, and more than one id is the labeller's merge;
    - `player1`/`player2` are mapped to names the way the sheet path does;
    - an offline spec on synthetic rows covers a single-id point, a multi-id (merged) point, a point with no matching rally, and a deleted or unchecked point being excluded.
  - [ ] The report prints:
    - server, winner and ending accuracy for both **published** and **proposed** values;
    - the proposal's status;
    - folded games against entered games;
    - each firing as a hit or miss (server and game both match the label);
    - proposed merges against the labeller's multi-id points.
  - [ ] The usage header documents `--session`, and keeps the privacy line saying output never goes in the repo
  - [ ] `npm run typecheck` and `npm run lint` pass. No committed file contains player names, session output or label data
- **notes:**
  - Plan step 8; design §5.
  - The three checked sessions for a read-only smoke run are:
    - `1b391e8b-88a7-4704-96ea-771420fcc23d`
    - `f8b9a283-d62c-4fed-b186-a93a72edf3dd`
    - `2d209aca-0abe-4984-9598-1fbafc006c14`
  - Run via `npx tsx` and write the output to the session scratchpad only.
  - In the task's final message, report (counts only, no names) that the published-accuracy numbers match the earlier `--labels` output where a sheet export exists, or otherwise agree with `label-scorecard.ts`'s winner-flip count. That run is read-only evidence for the final message, not a `done when:` item.
  - Never set `LIVE_DB_ALLOW_PROD`. This script is not a Playwright live spec and does not need it.
  - No dashboard UI.

## T9 · Tune `SEGMENT_COSTS`

- **status:** todo
- **model:** fable
- **needs:** T6, T8
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/segmentation.ts`: `SEGMENT_COSTS` and its comment only
  - `tests/splitstep-segmentation.spec.ts`: only if a synthetic expectation encoded an old weight
- **done when:**
  - [ ] The only non-test source change in the diff is the `SEGMENT_COSTS` constant (its values and/or its comment) in `segmentation.ts`. No other module, threshold or rule is edited
  - [ ] The comment on `SEGMENT_COSTS` records that the weights were tuned against three labelled sessions, and gives the result as counts only: fit status, proposed server accuracy as n/N, and firings hit/total per session. No player names; job IDs are fine
  - [ ] `tests/splitstep-segmentation.spec.ts` and `tests/splitstep-transcript.spec.ts` pass. A test edit may change only an asserted cost value or ordering, where the asserted _behaviour_ (fit/no_fit, merge, move, ambiguity) is unchanged and the test's name still describes the shape it tests
  - [ ] No committed file contains player names, session output or labelled data, and `npm run typecheck` passes
- **notes:**
  - Plan step 9; design "Open questions" 1 and 2.
  - Targets to report against in the final message. They can't be gated from the diff; stage 06 review judges them:
    - session `1b391e8b…`: the proposal is `fit` at 6–2, and proposed server accuracy is at least 55 of the 56 checked points;
    - session `f8b9a283…`: it fires at points 18, 83 and 102, each a hit;
    - session `2d209aca…`: it fires at point 19, a hit;
    - all three: no published metric gets worse, and no proposed metric falls below published.
  - Write any shortfall up as a blocker with the numbers.
  - For information only (T3 was dropped, so nothing live depends on it): run the proposal read-only on the unlabelled frozen jobs `ac56ef8b`, `5c377b0a` and `467ccbdc`, and report its status and how many points per frozen set its server differs from the published one. Do not publish or re-derive.
  - All measurement output goes to the session scratchpad, never the repo.
  - Hand the final weights and per-session counts to T10 in the final message, so the run log carries them.
  - Never set `LIVE_DB_ALLOW_PROD`. No dashboard UI, no live re-derive.

## T10 · Bump `DERIVATION_VERSION` to 0.8.0 and write the changelog entry

- **status:** todo
- **model:** sonnet
- **needs:** T9
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/index.ts`: `DERIVATION_VERSION` at line ~86, and the changelog comment above it
  - `tests/label-session-marks.spec.ts`: line ~36 pins `"0.7.0-unreconciled"`
- **done when:**
  - [ ] `DERIVATION_VERSION === "0.8.0-unreconciled"`, and `grep -rn '0\.7\.0-unreconciled' src tests scripts supabase` returns only historical changelog text, with every spec that pinned the version updated
  - [ ] The 0.8.0 changelog entry, in the house style of the existing entries, covers:
    - that a live block-and-flag hitter rule was tried and dropped (T3). `pred_player_id` cannot be the witness, because it is the label being swapped. Position cannot see a changeover where nobody switches ends, so the rule would have left about every second frozen game on `ac56ef8b` unrelabelled. Position is used only inside the review-only segmenter;
    - the review-only segmenter and its `derivation_quality.segmentation` key, which never touches `fold`;
    - the new `segment_proposal_differs` flag;
    - the tuned weights and the three-session result, as counts only;
    - the promotion bar: ≥95% of firings right on server and game, over 30+ firings across 2+ matches, re-scored with `splitstep-eval --session`;
    - that no published row changes on re-derive: every job gains only the flag and the `segmentation` key.
  - [ ] No player names appear in the entry; job IDs and session counts only
  - [ ] `npm run typecheck`, `npm run lint` and `npm run format:check` pass
- **notes:**
  - Plan step 10; design §4.
  - Take the final weights and per-session counts from T9's entry in `.claude/tasks/claude-score-constrained-segmentation-836147.log.md` (its final message). If T9 was blocked, this task cannot run; report instead.
  - No re-derive. The version bump only takes effect when the user re-derives on request.
  - No dashboard UI.

## T11 · Remove the unused `server_position_conflict` flag

- **status:** todo
- **model:** sonnet
- **files:** (guess)
  - `src/lib/services/splitstep/derivation/flags.ts`
  - `src/lib/services/labels/marks.ts`
  - `src/lib/services/labels/marks-copy.ts`
  - `tests/label-marks-copy.spec.ts`
- **done when:**
  - [ ] `grep -rn "server_position_conflict\|SERVER_POSITION_CONFLICT" src tests` returns nothing
  - [ ] `segment_proposal_differs` / `SEGMENT_PROPOSAL_DIFFERS` and its registry entry, params, switch case, chip, hover copy and spec samples are unchanged by the diff
  - [ ] T2's doc comment on `SEGMENT_PROPOSAL_DIFFERS` and the `markHover` doc-comment count stay accurate after the removal (for example "Six lines have a second form" becomes "Five", if one of the six was the removed flag)
  - [ ] `tests/label-marks.spec.ts`, `tests/label-marks-copy.spec.ts`, `tests/label-session-marks.spec.ts` and `npm run typecheck` pass
- **notes:**
  - T2 added this flag for T3's live rule. T3 was dropped (option 3, 2026-10-09), so nothing raises the flag any more.
  - Remove only what T2 added for it. See commit `094424cf` for exactly what that was.
  - No dashboard UI.
