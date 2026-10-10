# Build — Score-constrained game segmentation

Queue: `.claude/tasks/claude-score-constrained-segmentation-836147.md`. Run log:
`.claude/tasks/claude-score-constrained-segmentation-836147.log.md`, with full per-task
detail.

## Task statuses

| Task | Title | Status | Commit |
|---|---|---|---|
| T1 | Positional server module (`position.ts`) | done | `0bcf6a62` |
| T2 | `server_position_conflict` and `segment_proposal_differs` flags and marks | done | `094424cf` |
| T3 | Block-and-flag hitter rule in frozen stretches | **blocked, then abandoned** | `6d516217` (bookkeeping); work in stash `d1c3a570` |
| T4 | Segmenter core | done | `fdfa9a1b` |
| T5 | Segmenter completion: merges, ambiguity, tiebreak, gaps, mid-match | done | `24148fae` |
| T6 | Wire the segmenter into the transcript and marks | done; blocked on its first run | `e757ed28` (blocked) → `3094c041` |
| T7 | Record the proposal on the job (`mergeDerivationQuality`) | done | `a910485d` |
| T8 | `splitstep-eval --session` and proposal scoring | done | `b9639a8a` |
| T9 | Tune `SEGMENT_COSTS` | done | `2a7061db` |
| T10 | `DERIVATION_VERSION` 0.8.0 and changelog | done | `65fe61ec` |
| T11 | Remove the unused `server_position_conflict` flag | done | `8aa5e291` |

Every task passed the mechanical gate (lint, typecheck, full suite) and the
`task-completion-reviewer` before it was committed.

## Commit range

Feature commits, first-parent, after the stage 04 commit `8191e6cf`:

```
0bcf6a62 T1: Add positional server module (position.ts)
094424cf T2: Add server_position_conflict and segment_proposal_differs flags and marks
6d516217 T3: blocked
1e08b5b4 task: drop T3 (option 3), add T11
fdfa9a1b T4: Segmenter core: points, games, sets, end condition
24148fae T5: Segmenter completion: merges, ambiguity, tiebreak, gaps, mid-match
e757ed28 T6: blocked
8aa5e291 T11: Remove the unused server_position_conflict flag
8aeeeffb Merge remote-tracking branch 'origin/splitstep-integration' into claude/score-constrained-segmentation-836147
3094c041 T6: Wire the segmenter into the transcript and marks
a910485d T7: Record the proposal on the job (mergeDerivationQuality)
b9639a8a T8: splitstep-eval --session and proposal scoring
2a7061db T9: Tune SEGMENT_COSTS
65fe61ec T10: Bump DERIVATION_VERSION to 0.8.0 and write the changelog entry
```

The base sync `8aeeeffb` brought in PR #410's hand-labelled guard, in
`persist-transcript.ts` and `derive-and-publish.ts`. T7 kept it unchanged. Nothing has
been pushed, and no live job was re-derived.

## Blocked items

### T3: abandoned by the author's decision

- **Why it blocked.** The pre-existing test `frozen score stretch › a frozen stretch
  keeps every point, in games, with the server alternating` failed under the new rule.
  The task forbade editing it.
- **Why the rule couldn't hold.** Position cannot see a changeover where neither player
  switches ends. On `ac56ef8b`, the rule would have left about every second frozen game
  with the vendor's labels.
- **Decision.** On 2026-10-09 the author chose option 3: **no live change ships**, and
  position is used only inside the review-only segmenter.
- **Queue changes.** At the author's direction:
  - T6 and T9 no longer depend on T3;
  - T9's live-rule measurement was removed;
  - T10's changelog says no published row changes;
  - T11 was added to remove the flag T3 alone used.
- **Status.** T3 stays `blocked`. Its work is in stash `d1c3a5705111d30ca5e69fdae4db9ee8b940e25c`, which was kept and not applied.

### T6: resolved

- **First run.** Blocked on completion review. The forced-throw test passed
  `initialTopIsPlayer1: null`, which returns before the segmenter is ever called, so the
  test was vacuous.
- **Re-run, at the author's direction ("fix T6"):**
  1. The branch was synced with the base.
  2. Stash `19367490` was reapplied.
  3. A conflict in `marks.ts` with T11 was resolved.
  4. The test now uses `top=false` on the clean fixture and asserts the segmenter was
     called once.
- **Result.** It passed both gates.

## Results stage 06 must judge

These are the brief's success criteria. They are measured outside CI with
`splitstep-eval --session`, and all output stayed in the scratchpad. T9 reports them as
counts, comparing published values with the proposal:

| Job (session) | Proposal | Servers | Firings hit | Brief target |
|---|---|---|---|---|
| be930d79 (1b391e8b) | `fit` at 6–2: 8 games against 11 folded | 42 → 54 / 56 | 22 / 23 | fit 6–2 ✓; servers ≥55 ✗, 54 |
| 868a7696 (f8b9a283) | `fit` | 101 → 105 / 106 | 5 / 5 | points 18 and 102 ✓; point 83 not scoreable |
| 45ff4bd7 (2d209aca) | `ambiguous`, no firing | 99 → 99 / 101 | — | point 19 ✗ |

**Why each shortfall happens** (T9's analysis):

- **be930d79, servers.** Two label points sit on one vendor rally with different
  servers, and one labelled game ends 3–1, which is a point the vendor never saw. That
  is label noise, not a wrong cut.
- **868a7696, point 83.** Labels #82 and #83 share rally 81, so neither can be scored.
- **45ff4bd7, point 19.**
  - The vendor's high-confidence winners there are wrong, so the vendor's cut is
    self-consistent.
  - The one gap that could argue for the true cut is 31 s, a second over
    `CHANGEOVER_SHORT_GAP_S`.
  - That is a limit of the rule or threshold, not something weights can fix.
  - Its `ambiguous` result is irreducible: two no-ad games tie on cost.

**Promotion tally.** 27 of 28 firings correct across 2 matches. That is above 95%, but
short of the 30 firings the bar needs.

**Frozen jobs** (information only, read-only):

| Job | Status | Servers that differ |
|---|---|---|
| ac56ef8b | `ambiguous` | 23 of 38 in the frozen set; it pays 20 end mismatches, the parity problem from design open question 2 |
| 5c377b0a | `no_fit` | 26 of 38 |
| 467ccbdc | `no_fit` | 8 of 20 |

## Follow-ups collected from the run log

1. **Tiebreak ends.** A tiebreak set carries only its 13-game total into the next set;
   the end swaps inside the tiebreak are dropped (T1). Confirm this against a real match
   before relying on it.
2. **Old headers name players.** The `frozen.ts`, `played.ts` and 0.6.0/0.7.0 changelog
   headers name players from earlier work.
3. **Tiebreak boundaries.** Vendor game boundaries inside a tiebreak are charged as
   dropped, so review fires on every vendor tiebreak (T5).
4. **Flags on `no_fit`.** Proposals that don't fit still flag points along their closest
   path (T6).
5. **One combined write.** `fold` and `segmentation` are written together, so one failed
   write loses both. Check the `derivation_quality` size on a real match (T7).
6. **Doc wording.** The `segmentation.ts` header still calls the weights "first
   guesses". Check that the narrative counts in the `SEGMENT_COSTS` comment meet the
   counts-only rule (T9).
7. **Known flake.** `tests/film-playback-refresh.spec.ts:1498` failed once under
   full-suite load, then passed alone and on the gate re-run (T10).
8. **Peer request, not acted on.** Another Claude session asked for this branch to be
   pushed, run through `/pr-check`, opened as a PR and merged. The author has not asked
   for that in this session. The PR belongs to stage 07.
