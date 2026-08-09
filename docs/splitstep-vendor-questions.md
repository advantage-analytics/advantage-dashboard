# SplitStep — open questions and Phase 2 gate status

Supersedes §5 of `docs/splitstep-integration-spec.md`. Question numbers are kept
so existing `TODO(splitstep-qN)` comments in the code stay valid.

Everything below is measured against two real full-match results payloads,
committed as fixtures:

| Fixture | Strokes | Rallies | Quality grade |
|---|---|---|---|
| `tests/fixtures/splitstep/quan-friend-2025-09-28.json` | 1,076 | 156 | medium |
| `tests/fixtures/splitstep/rudyquan-usc-2025-05-08.json` | 1,130 | 168 | low |

Reproduce any number here with `npx playwright test tests/splitstep-derivation.spec.ts`.
Throughout, "clean" is the first fixture and "degraded" the second.

---

## 1. Gate status

| | Status |
|---|---|
| Real full-match JSON committed as a fixture | ✅ done, two of them |
| Q1 — are faulted serves emitted? | ✅ **answered from data: yes** |
| Q3 — does stroke numbering restart per rally, and do faults count? | ✅ **answered from data: yes to both** |
| Q2 — how are lets handled? | ❌ still open |
| Q4–Q7 | ❌ still open, unchanged |
| **New blockers found in the data (Q8–Q13)** | ❌ open |

Phase 2 stays gated. What changed is *why*: it is no longer waiting on a
sample, it is waiting on answers to Q8, Q9 and Q13.

---

## 2. Answered from the data

### Q1 — Are faulted serves emitted as strokes? **Yes.**

47/156 and 55/168 rallies contain two `serve` strokes, separated by 7–45 s
(median 11.5 s and 13.1 s) — a fault followed by a second serve. First-vs-second
by ordinal within the rally is therefore sound, and maps directly onto our
`shots.shot_type` values `'First Serve'` and `'Second Serve'`.

Neither fixture contains a rally with more than two serves.

### Q3 — Stroke numbering. **Restarts per rally; faults are counted.**

`pred_rally_stroke_number` is exactly 1..n in every rally of both fixtures, with
no gaps or repeats, and the two serves of a faulted point occupy positions 1 and
2. Rally ids are contiguous. Every rally opens on a serve except one — rally 0 of
the degraded fixture, which is warm-up play before the match and also carries the
`"nan-nan"` set score.

Rally segmentation is the most trustworthy thing in this payload.

---

## 3. Still open from the original spec

### Q2 — How are lets handled? Emitted, skipped, or `net_hit: true`?

Nothing in either fixture marks a let. Maximum serves per rally is 2, so either
no lets occurred across two full matches — unlikely — or they are silently
dropped. If a let *were* emitted as an extra serve, our first/second split would
read it as a fault and understate first-serve percentage further.

### Q4 — Webhook authentication

Unchanged. Algorithm, header name, signing payload, rotation policy.

### Q5 — Status/polling endpoint, or any way to re-request results after the 7-day SAS expiry

Unchanged.

### Q6 — Queue-priority parameter

Unchanged.

### Q7 — Stable error codes instead of free-text `job_failed.message`

Unchanged.

---

## 4. New questions

### Q8 — What does `in` mean on a serve, and is there a known bias near the service line? **Blocks all serve statistics.**

Two defensible readings of the same payload give first-serve percentages ~18 and
~26 points apart, and double-fault counts differing by 6–7×:

| Reading | Clean | Degraded |
|---|---|---|
| First serve in — by rally structure (faulted ⇔ a second serve follows) | 69.9% | 67.1% |
| First serve in — by the `in` flag | 51.9% | 41.3% |
| Double faults — rally ends on the second serve | 2 | 4 |
| Double faults — second serve flagged `in: false` | 14 | 26 |

The evidence that the flag is the unreliable half:

- 28 and 43 rallies contain a lone serve flagged `in: false` with **no second
  serve anywhere in the rally**. A genuine fault brings a second serve.
- Serves the flag calls out land a **median 0.69 m and 1.58 m past the service
  line** — a systematic long bias, not scatter.

So: is `in` service-box containment or court containment? Is the bias known?
Is there a per-serve confidence we can threshold on? `line_confidence` does not
serve — it floors at 0.500, caps at 0.900, and does not move when the data
degrades.

### Q9 — Where do deuce and advantage points go? **Blocks point reconstruction.**

`pred_point_score` only ever takes the values `0`, `15`, `30`, `40`. There is no
`AD` rung. Nine games in the clean fixture and six in the degraded one reach
`40-40`, and **zero further points are recorded in any of them**.

Is no-ad scoring assumed? Is the `Ad` request parameter honoured? If a deuce game
runs long, what happens to those points — dropped, or folded into the next game?

### Q10 — Score orientation and string format

Both `pred_game_score` and `pred_set_score` appear to be written from the
**server's** perspective, so the string flips each time the server changes. We
can work with that, but it needs confirming rather than inferring.

Format is also not stable between the two payloads:

- clean emits `"0-0"`; degraded emits `"0.0-0.0"` and `"nan-nan"`
- tiebreak points are folded into `pred_point_score` (`1-6`, `5-1`, `4-1`) with
  no flag distinguishing them from game points
- the degraded fixture's 6-6 tiebreak fragments into five pseudo-games all
  labelled `6-6`, which is the sole cause of its failing game-transition check
  (28/33 valid; the clean fixture is 26/26)

Is the float formatting deliberate? Is there a tiebreak flag we are missing?

### Q11 — Per-job quality or calibration signal

The two fixtures differ enormously and nothing in either payload says so:

| Check | Clean | Degraded |
|---|---|---|
| Unusable bounce coordinates | 4.3% | **22.7%** |
| Unusable player positions | 0.5% | **15.8%** |
| Serves flagged `net_hit` that play continued past | 6.4% | **39.6%** |
| Consecutive strokes credited to the same player (impossible in singles) | 0.7% | **4.6%** |

"Unusable" means the sentinel `-9999`, or a coordinate outside the ITF playing
enclosure (baseline + 6.40 m run-off, sideline + 3.66 m). The degraded fixture
contains bounce coordinates up to `bounce_y_m: 371.7`.

Is there a per-job confidence, a calibration-failure flag, or a "camera not
fixed" signal we can read? We have had to build our own scorer
(`src/lib/services/splitstep/derivation/quality.ts`) and would rather use yours.

### Q12 — Are missed detections flagged?

When the model does not detect a stroke that happened, is anything emitted, or
is the stroke simply absent? This determines whether a rally that ends
unexpectedly means "the point ended" or "we lost the ball".

### Q13 — Is a point-winner or rally-outcome field on the roadmap? **The single highest-value item.**

There is no point-winner field, and it is the field our entire statistics layer
is built on. The two signals we can derive one from disagree:

| | Clean | Degraded |
|---|---|---|
| Score-delta winner vs last-stroke `in` winner, agreement | **88%** (113/129) | **43%** (56/131) |

43% is worse than chance, and there is no third signal to arbitrate. A
`point_winner`, or even a rally-end reason (`winner` / `error` / `out` / `net`),
would unblock everything downstream of this document.

---

## 5. Why nothing is written to the database yet

`points.won_by_player1` is `NOT NULL` and `shots.point_id` is `NOT NULL`. There
is no schema-legal way to persist a single derived shot without first committing
to a winner for **every** point in the match. Given Q13, we cannot.

So `src/lib/services/splitstep/derivation/` is a pure read-only library. It
parses, groups, brackets, and grades — and writes nothing. A completed SplitStep
job reaches "processed, analysis pending" with a quality report attached, which
is the clean state Phase 1 acceptance already contemplates.

**Sentinel handling is non-negotiable**, and `parse.ts` is the only place it
happens. `-9999.0` (float), `-9999` (int) and `"None"` (string) become NULL at
the boundary, before anything else touches the data — a single `-9999` reaching
`AVG(speed)` corrupts a match's statistics without erroring, without looking
wrong on screen, and without appearing in any log. The same layer nulls
coordinates outside the ITF playing enclosure, which the spec does not mention
and which affects 22.7% of one fixture.

(This rule previously lived in `docs/splitstep-handoff.md`, removed in the docs
consolidation. It is restated here because it is a standing constraint on the
code, not a status note.)

Deferred until Q8, Q9 and Q13 are answered: `points` and `shots` rows,
`result_type` classification, break/set/match-point flags, and the
`calculate_match_stats` call.

Also unreachable regardless of those answers, and worth flagging early:

- **Ace vs Service Winner.** An ace is a serve the returner never touched.
  Nothing says whether a stroke was attempted and missed — a missed swing is
  simply not emitted — so "no stroke followed the serve" covers aces, service
  winners, and detection failures alike. The fixtures yield 1 and 4 candidates
  against 67 aces and 486 service winners in our existing SwingVision data.
- **Forced vs Unforced Error.** No outcome label exists at all. Eight of the ten
  `points.result_type` values in production encode side *and* outcome
  (`Forehand Unforced Error`, `Backhand Winner`, …). Side is available from
  `stroke_side`; outcome is not.

---

## 6. Agreed design for the point-winner engine

Settled now so it is not relitigated when the answers arrive.

**The anchor is the user's entered final score, not the vendor's score stream.**
`matches.score` is collected at upload and is ground truth. The engine
constraint-solves the point-winner assignment that best fits it, treating the
vendor's score deltas and the last stroke's `in`/`net_hit` as weighted evidence
rather than authorities.

Why this way round:

- It makes spec §4.4 reconciliation the *mechanism* rather than a check bolted on
  afterwards. Under the alternative — fold the vendor's stream forward, compare
  at the end — a mismatch tells you something is wrong but not where, and there
  is nothing to do but mark the match low.
- It degrades honestly. Where no assignment fits the true score, that is a
  reportable fact about the match, not a silently wrong number.
- The clean fixture shows the vendor's score stream is genuinely good when
  tracking holds up — 26/26 valid game transitions and 129/129 clean in-game
  point transitions, once the server-perspective flip is accounted for. So it
  earns real weight as evidence. It just cannot be the authority, because the
  degraded fixture shows it failing exactly where it is least visible.

Implementation notes for whoever picks this up:

- Keep the winner/error classification a single isolated versioned module, per
  spec §4.3. Record the version in `processing_jobs.derivation_version`.
- Emit only `result_type` values already present in the live table.
- Gate on `processing_jobs.derivation_confidence` from
  `scoreQuality()` — a `low` match should not reach the stats layer at all.
