# Brief — Score-constrained game segmentation

## Goal

When the vendor's score stream freezes or drifts, Advantage Intelligence derivation
puts game boundaries in the wrong places. Long deuce games get split into extra games,
and lets the vendor scored as points move the boundaries further. Each wrong boundary
then gives the wrong server. The frozen-stretch rebuild in `frozen.ts` reassigns every
shot's hitter from that assumed server, so one wrong server reverses every winner and
ended-by in the game.

The goal is to find a segmentation of rallies into games that agrees with what we know
for certain: the score the player entered, strict server alternation, the game-end rule
and each rally's serve side. We use it where the vendor's fold disagrees with the entered
score. We also stop the rebuild from overriding the vendor's hitter on an assumption.

## Scope

1. **Trigger and reach.** Re-segmentation runs when the folded game count disagrees
   with `matches.score`, and re-cuts the **whole match**. It is not limited to
   `frozen.ts`'s 8+-rally frozen runs, because drift outside a frozen run splits games
   too, as with Sage v Hunter Cheng's deuce games. Where the fold already reconciles,
   nothing changes.
2. **Constraints.** A segmentation is admissible only if it satisfies all four:
   - strict server alternation, game by game;
   - the game-end rule for the job's `processing_jobs.ad_scoring`: win by 2 from deuce
     under ad scoring, or a deciding point at deuce under no-ad;
   - the entered final score;
   - each rally's serve side (deuce or ad court, and the serving end).

   The kept segmentation is the one that reproduces the entered score.
   - **Ties:** when several segmentations fit, keep the one that moves the fewest of the
     vendor's game boundaries. Record that it was ambiguous and how many fits there
     were.
   - **No fit:** when no segmentation fits, record an explicit "no fit" marker with the
     closest score reached. This helps spot wrongly entered scores or missing video.
3. **Split points.** The vendor sometimes cuts one real point into two rallies at a
   serve, for example a first-serve fault followed by the second serve starting a new
   "rally". The rally pairs 22+23, 25+26, 47+48 and 52+53 on Sage v Hunter Cheng look
   like this, rather than lets. Re-segmentation may merge such a pair back into one
   point, but only on evidence that it is one point: same server, same serving court,
   the first rally ending on a fault or very short, and a short gap before the next
   serve. Every merge is flagged so it can be scored against labels. Like the
   re-segmentation, merges are review-only.
4. **Hitter reassignment ships live.** A rebuild no longer reassigns a shot's hitter
   from an assumed server unless the vendor's `pred_player_id` agrees. Where they
   disagree, the vendor's hitter stands. This removes an unsupported guess rather than
   adding one, so it changes published shots in the version bump. It is the only live
   behaviour change in this feature.
5. **Review-only re-segmentation.** The re-segmentation and the split-point merges are
   recorded in two places, and published points (game numbers, servers, winners,
   ended-by) are not rewritten:
   - a match-level summary in `processing_jobs.derivation_quality`: fits or not,
     ambiguous or not, games moved, proposed score;
   - a per-point flag carrying the proposed game number and server, so each firing can
     be scored point by point.

   Promotion to an autofix follows the bar set in `played.ts`: ≥95% correct over 30+
   firings across 2+ matches, scored with `scripts/splitstep-eval.ts`.
6. **Measurement** on the three fully checked label sessions only:

   | Session | Match | Job |
   |---|---|---|
   | `1b391e8b-88a7-4704-96ea-771420fcc23d` | Sage Nguyen v Hunter Cheng | `be930d79-6664-4710-8058-37476517e965` |
   | `f8b9a283-d62c-4fed-b186-a93a72edf3dd` | Rudy Quan v Aidan Kim | `868a7696-d905-4327-b487-39449803a0e8` |
   | `2d209aca-0abe-4984-9598-1fbafc006c14` | Emon van Loben Sels v Roger Pascual Ferra | `45ff4bd7-cec4-485b-ab79-616d42dd8fcb` |

   Each is measured with `npx tsx scripts/label-scorecard.ts --session <id>` and
   `npx tsx scripts/splitstep-eval.ts --job <id>`.
7. **Deploy notes.** List the jobs that would need re-deriving and what changes for each.

## Non-goals

- Re-deriving any live job. Re-runs happen only when the user asks.
- Promoting the re-segmentation or split-point merges to rewrite published points in this feature. That needs
  the promotion bar, and three sessions cannot meet it.
- Using the six mostly-unchecked label sessions as ground truth.
- Restoring the score-reconciliation gate. `ACCEPT_UNRECONCILED_FOLD` and the
  `-unreconciled` build stay as they are.
- Changes to the vendor integration, the webhook or the labelling console.
- Dashboard UI changes. An existing reader such as the `derivation_quality->fold`
  banner may change only as a side effect, and if it does that is called out.

## Constraints

- **Derivation is pure.** The derivation modules (`frozen.ts`, `rallies.ts`,
  `reconcile.ts`) do no I/O. The new logic follows the same rule.
- **Versioning.** Any change to derived rows, including new review flags, bumps
  `DERIVATION_VERSION` in `derivation/index.ts` and adds a changelog entry there. The
  current version is `0.7.0-unreconciled`.
- **Edge function.** The derivation runs from what is deployed, not from git. A change
  needs a deploy consideration, but no deploy happens without asking.
- **Existing readers.** `derivation_quality->fold` is already read by
  `match-detail-server.ts` and the match report (`statistics-view.tsx`,
  `match-report-context.tsx`). A new entry must not change what those readers show,
  unless that is intended and stated.
- **Privacy.** Scorecard output names players. It stays outside the repo, in the
  scratchpad or under `~/Desktop/advantage-match-labels-*`, and nothing from it is
  committed.
- **Live database.** It is the source of truth for the label tables and the jobs. Live
  specs follow `tests/fixtures/live-db.ts` rules: never set `LIVE_DB_ALLOW_PROD` in a
  loop or gate.
- **Earlier rules carry forward:**
  - `frozen.ts`'s `FROZEN_MIN_RALLIES = 8` threshold and the changeover reading
    (`server-witness.ts`) are existing evidence the new logic may use, not replace
    blindly.
  - Ad scoring moves only pressure flags, never winners or the fold (0.3.2).
  - A rule that misses below 90% on 10+ firings is demoted (`played.ts`).

## Success criteria

1. **Sage Nguyen v Hunter Cheng** (job `be930d79…`):
   - The re-segmented fold reconciles to the entered 6–2. Today it folds 11 games, 8–3.
   - Server accuracy against the labels is about 100%.
   - The 15-point game 6 and the 11-point game 8 each come out as one game.
   - In the frozen stretch (rallies 37–43), winners no longer reverse from a wrong server.
2. **Rudy Quan v Aidan Kim**: the server and game-boundary errors at points 18, 83 and
   102 are resolved or explained.
3. **Emon v Roger**: the server and game-boundary error at point 19 is resolved or
   explained.
4. **No regression.** No scorecard or eval metric gets worse on any of the three
   sessions.
5. **Hitters.** No shot's hitter is reassigned against the vendor's `pred_player_id`.
   On Sage v Hunter Cheng, this alone should end the 7 of 9 wrong winners in rallies
   37–43.
6. **Recorded per firing.** Each firing records enough to score it later against labels:
   which games moved, the old and new server, which rally pairs were merged, and whether
   the segmentation is unique. Ambiguous and no-fit results are recorded explicitly.
7. **Deploy section.** It names the jobs to re-derive and what changes for each. Nothing
   is re-derived live.

## Open questions

Answered in chat on 2026-10-09:

- **Hitter fix:** ships live.
- **Split points:** merged with evidence, review-only. The pairs are split points, not
  lets.
- **Ties:** keep the fewest-changes segmentation and flag it as ambiguous.
- **No fit:** record an explicit marker.
- **Where it is recorded:** both match level and per point.
- **Reach:** the whole match.
- **Job IDs:** resolved from `label_sessions`.

Still open, for stage 02:

1. **Session status.** All three sessions are still `status = labelling` in
   `label_sessions`, not completed, but the seed calls them fully checked. Are they
   good enough to use as ground truth now?
2. **No-ad jobs.** `label_sessions.ad_scoring` is null on all three. The game-end rule
   should read `processing_jobs.ad_scoring` (per 0.3.2). Confirm in design that each of
   the three jobs carries a value.
3. **Banner side effect.** The new `derivation_quality` entry could flip or interact
   with the match report's existing unreconciled banner. Stage 02 should decide how the
   entry keeps that banner unchanged while the feature is review-only.

## Also consulted

- `src/lib/services/splitstep/derivation/index.ts`: changelog and current
  `DERIVATION_VERSION`
- `src/lib/services/splitstep/derivation/played.ts`: promotion and demotion bar wording
- `src/lib/services/splitstep/derivation/frozen.ts`: the current frozen-run rebuild and
  `FROZEN_MIN_RALLIES`
- `src/lib/services/splitstep/derivation/quality.ts`: what `derivation_quality` feeds
- Results of `grep derivation_quality` over `src/`, to find the existing readers
- Live `label_sessions` rows for the three sessions: job IDs, status and `ad_scoring`
