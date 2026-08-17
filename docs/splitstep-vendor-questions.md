# SplitStep — open questions and Phase 2 gate status

Supersedes §5 of `docs/splitstep-integration-spec.md`. Question numbers are kept
so existing `TODO(splitstep-qN)` comments in the code stay valid.

Everything below is measured against three real full-match results payloads:

| Payload | Strokes | Rallies | Quality grade |
|---|---|---|---|
| `tests/fixtures/splitstep/quan-friend-2025-09-28.json` | 1,076 | 156 | medium |
| `tests/fixtures/splitstep/rudyquan-usc-2025-05-08.json` | 1,130 | 168 | low |
| job `2a11168d`, match `2a312682` (Supabase `match-results`) | 596 | 114 | low |

Reproduce the first two with `npx playwright test tests/splitstep-derivation.spec.ts`.
Throughout, "clean" is the first fixture and "degraded" the second.

The third is **not committed** — it is a real customer match naming two
identifiable athletes, and this repository is public. Pull it from Supabase
Storage when you need it.

---

## 1. Gate status

| | Status |
|---|---|
| Real full-match JSON available | ✅ three of them |
| Q1 — are faulted serves emitted? | ✅ **answered from data: yes** |
| Q3 — does stroke numbering restart per rally, and do faults count? | ✅ **answered from data: yes to both** |
| Q13 — can point winners be derived? | ✅ **answered from data: yes, from the score stream** |
| Q2 — how are lets handled? | ❌ still open |
| Q4–Q7 | ❌ still open, unchanged |
| Q8–Q12 | ❌ open |

**The gate has substantially lifted.** The third payload settled the question
that mattered most: its match has a known true final score (6-4, 6-4), and
folding the vendor's own score stream forward reproduces it **exactly** — 20
games, 12–8, both sets ending 5-4 with the server holding. Point-winner coverage
from the score stream is 99%, 99% and 94% across the three matches.

So `points.won_by_player1` is derivable and independently checkable. What
remains blocked is `points.result_type` — the winner / forced error / unforced
error classification — which needs stroke-level outcome and attribution that the
payload does not carry. See §5.

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

### Q8b — `net_hit` contradicts the vendor's own `height_at_net_m`

Sharper than Q8, and checkable inside a single record. Taking `net_hit: true`
strokes and reading their `height_at_net_m` (net is 0.914 m at centre, 1.07 m at
the posts):

| Payload | `net_hit: true` | of those, height **above** the net | median height |
|---|---|---|---|
| clean | 66 | 5 | 0.66 m |
| third | 89 | 37 | 0.92 m |
| degraded | 327 | **209** | 1.22 m |

On the clean fixture the two fields agree — 0.66 m is genuinely into the net. On
the degraded one, 64% of balls flagged as hitting the net are simultaneously
reported as passing well over it.

This is why `net_hit` cannot be used as an error signal without per-file
calibration, and it is the most likely single fix on the vendor side.

### Q9 — How is advantage scoring represented? **Partly resolved.**

`pred_point_score` only ever takes the values `0`, `15`, `30`, `40`. There is no
`AD` rung, and every game reaching `40-40` records zero further points.

The third payload explains part of this: that match is genuinely **no-ad**
(`matches.format.ad_scoring = false`), so `40-40` as a deciding point is
*correct* there, and its 20 games reconstruct perfectly.

What we still cannot confirm is behaviour on an **ad-scoring** match, because we
have no sample of one — we do not know the setting used for the other two
fixtures. So the question narrows to: is the `Ad` request parameter honoured, and
what does `pred_point_score` emit at advantage when it is true?

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

### Q13 — Is a rally-outcome field on the roadmap? **Reframed — the winner is solved, the outcome type is not.**

**Resolved from data: point winners are derivable, and the score stream is the
signal to trust.** The third payload's match has a known true score (6-4, 6-4).
Folding the vendor's score stream forward reproduces it exactly: 20 games, 12–8,
both sets ending 5-4 with the server holding.

Coverage and cross-check, over point-to-point transitions:

| | Clean | Degraded | Third |
|---|---|---|---|
| Winner derivable from the score stream | 153/155 (99%) | 157/167 (94%) | 112/113 (99%) |
| Last-stroke `in` heuristic agrees with it | 86% | **43%** | 90% |

The earlier reading of this table was wrong in two ways, both worth recording so
they are not repeated. Game boundaries are *not* a blind spot — the winner comes
from the game-score delta once the server-perspective flip is handled. And the
two signals are not symmetric: with ground truth now available on one match, the
score stream is right and the last-stroke heuristic is the unreliable one, its
disagreement tracking stroke-tracking quality almost exactly.

**What is still missing is the outcome *type*.** Whether a point ended in a
winner, a forced error or an unforced error is not recoverable: there is no
signal for whether a returner reached a ball, which also makes Ace and Service
Winner indistinguishable. A `rally_end_reason` (`winner` / `out` / `net`), or
anything marking that a player attempted and missed a shot, would unblock the
remaining half.

---

## 5. What can and cannot be written to the database

`points.won_by_player1` is `NOT NULL` and `shots.point_id` is `NOT NULL`, so
nothing persists without a winner for **every** point. Q13 now supplies one, so
this is no longer the hard blocker it first appeared to be:

- **Writable** — `won_by_player1`, `server_is_player1`, point/game/set numbering
  and scores, `rally_length`, `video_time`, `duration`, and the whole `shots`
  row apart from outcome. Fold the score stream, then validate against
  `matches.score` per spec §4.4 and refuse to write on mismatch.
- **Not writable yet** — `result_type`. It is nullable, and 410 production rows
  already carry NULL, so leaving it unset is an established state rather than a
  new one. Ace, Service Winner, and the forced/unforced split all depend on
  Q13's second half.

Until that lands, `src/lib/services/splitstep/derivation/` stays a pure
read-only library: it parses, groups, brackets, and grades, and writes nothing.
Turning on the write path is a deliberate next step, not an oversight — it needs
the reconciliation gate built first, so that a match whose fold does not match
the user's entered score is refused rather than published.

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

Break/set/match-point flags fold out of the point winners for free, so they
arrive with the write path. The `calculate_match_stats` call waits on
`result_type`, since most of what it computes is built on outcome types.

Also unreachable regardless of the vendor's answers on `in` and `net_hit`, and
worth flagging early:

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

**The anchor is the user's entered final score.** `matches.score` is collected at
upload and is ground truth. The engine folds the vendor's score stream forward
and reconciles against it, and where the two cannot be made to agree the match is
refused rather than published.

The third payload is the evidence this works: its fold reproduces the entered
6-4, 6-4 exactly, which is spec §4.4's `derivation_confidence = 'high'` case
occurring naturally rather than being assumed.

One simplification against the original design. That design treated the vendor's
score deltas and the last stroke's `in`/`net_hit` as co-equal weighted evidence
to be constraint-solved. With ground truth in hand they are plainly not co-equal:
the score stream reproduces the true result, while the last-stroke heuristic
agrees with it only 43% of the time on the degraded payload. **So fold the score
stream and use the entered score as the check. Do not feed the last-stroke flags
into the winner decision at all** — they belong to `result_type`, which is a
different problem with a different failure mode.

A constraint solver is still the right shape for the case where the fold *misses*
the entered score, since that is where an assignment has to be searched for. It
is just not needed for the common case, which is a straight fold.

Implementation notes for whoever picks this up:

- Keep the winner/error classification a single isolated versioned module, per
  spec §4.3. Record the version in `processing_jobs.derivation_version`.
- Emit only `result_type` values already present in the live table.
- Gate on `processing_jobs.derivation_confidence` from
  `scoreQuality()` — a `low` match should not reach the stats layer at all.
