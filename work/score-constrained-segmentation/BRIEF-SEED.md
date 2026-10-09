# Brief seed

> Captured verbatim from the `/feature-new` invocation on 2026-10-09. Stage 01
> refines it into the brief; edit freely before running `/feature-next score-constrained-segmentation`.

Score-constrained game segmentation for the Advantage Intelligence derivation. Read AGENTS.md and src/lib/services/splitstep/derivation/index.ts’s changelog first.
Problem: when the vendor’s score stream freezes or drifts, the derivation splits long deuce games into extra games, and the error cascades into wrong servers, wrong game numbers and wrong winners. The rebuild in frozen.ts takes the server from game alternation and reassigns every shot’s hitter from that assumed server, so one wrong server flips every winner and ended-by in the game. Evidence from hand-labelled sessions (label_sessions / label_points / label_shots, seed jsonb = derived prefill):

- Sage Nguyen v Hunter Cheng (session 1b391e8b-88a7-4704-96ea-771420fcc23d, job be930d79-6664-4710-8058-37476517e965, match cd4adeae-4d9a-495a-a82f-7caa51102f17): the derivation produced 11 games against the entered 6–2 (fold 8–3, written via ACCEPT_UNRECONCILED_FOLD). The 15-point game 6 became two games, and the 11-point game 8 became three. In the frozen stretch (rallies 37–43) the wrong server flipped 7 of 9 guessed winners. The 4 lets the vendor scored as points (rallies 22+23, 25+26, 47+48, 52+53) also shift game boundaries.
- The same server/game-boundary errors appear on Rudy Quan v Aidan Kim (session f8b9a283-d62c-4fed-b186-a93a72edf3dd: points 18, 83, 102) and Emon van Loben Sels v Roger Pascual Ferra (session 2d209aca-0abe-4984-9598-1fbafc006c14: point 19).

Goal: when the folded game count disagrees with matches.score, re-segment games under these constraints, and keep the segmentation that reproduces the entered score:

- strict server alternation by game;
- the game-end rule for the job’s ad_scoring (win by 2 from deuce, or no-ad deciding point);
- the entered final score;
- each rally’s serve side.

Stop reassigning hitters from an assumed server unless the vendor’s pred_player_id agrees. Ship as review-only first: a mark or a derivation_quality entry, not a rewrite. Follow the promotion bar in played.ts:18–24 (≥95% over 30+ firings across 2+ matches) before it changes published points.
Measure with these two commands, using only the three fully checked sessions above (the other six label sessions are mostly unchecked):

- npx tsx scripts/label-scorecard.ts --session <id>
- npx tsx scripts/splitstep-eval.ts --job <id>

Success on Sage v Hunter Cheng means the fold reconciles to 6–2 and server accuracy is about 100%. Scorecard output names players, so keep it outside the repo. Derivation changes need deploy considerations: published points are only re-derived when someone re-runs them, so say which jobs to re-derive and don’t re-derive anything live without asking.
