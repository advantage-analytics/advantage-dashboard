# Draft email to Joshua — SplitStep

Two separate asks, deliberately split. The first is short and unblocks a live
integration; the second is long and unblocks the statistics layer. Send them as
two emails if you want the first answered quickly — a five-line ask gets a
five-line reply, and burying it under thirteen questions is how it gets lost.

---

## Email 1 — unblocks going live (send first)

> **Subject:** Advantage Analytics — four things to finish our integration
>
> Hi Josh,
>
> Our side of the integration is built and tested end-to-end against a local
> harness — upload to R2, video served to you over a signed URL, webhook
> received, verified and stored. We're ready to submit a real job. Four things
> from you and we're live:
>
> **1. API credentials.** The base URL and an API key for the submit endpoint.
> Happy to use a sandbox or rate-limited key first if you have one.
>
> **2. The signature header name.** We've implemented your documented scheme —
> `base64(HMAC-SHA256(secret, raw_body))` — but the docs don't say which header
> the signature arrives in. Right now we check nine likely names and log every
> header we receive so we can identify it from the first delivery. If you can
> just tell us the name, we'll pin it and switch to rejecting anything unsigned.
> Also: is there a timestamp or nonce in the signed payload, or is it the raw
> body alone?
>
> **3. Confirmation on retries.** Our understanding is there's no retry policy
> and a 30-second connection timeout, so a delivery we miss is gone permanently.
> Is that right? If so, we'll lean on `GET /jobs/{job_id}` for recovery — can you
> confirm that endpoint is stable and tell us how long results stay retrievable
> after the SAS URL expires?
>
> **4. A test job.** Is there a way to submit a job that returns quickly — a
> short clip, or a replay of a previous result — so we can verify the full round
> trip without spending processing hours or waiting on a real match?
>
> One note on our side: we fetch nothing from you at submit time. You pull the
> video from a URL we control, which means we can see exactly when a GPU worker
> picks up the job. That's been useful given there's no "processing started"
> webhook — but if one is ever on the roadmap, we'd use it.
>
> Thanks,
> Christian

---

## Email 2 — unblocks statistics (send after, or alongside)

> **Subject:** Questions from two real SplitStep result payloads
>
> Hi Josh,
>
> We've now run two full-match payloads through our parser — 1,076 and 1,130
> strokes — and written up everything we found. Two questions from our original
> list answered themselves from the data, which was great. Six new ones came out
> of it, and three of those currently block us from producing any statistics at
> all.
>
> **Answered from the data, no reply needed:** faulted serves *are* emitted as
> separate strokes, and `pred_rally_stroke_number` restarts per rally with faults
> counted. Rally segmentation is the most reliable thing in the payload — 26/26
> valid game transitions on the cleaner match.
>
> ### The three that block us
>
> **1. What does `in` mean on a serve?** This is our biggest one. Two defensible
> readings of the same payload give first-serve percentages 18–26 points apart
> and double-fault counts differing by 6–7×:
>
> | | Match A | Match B |
> |---|---|---|
> | First serve in — inferred from rally structure | 69.9% | 67.1% |
> | First serve in — from the `in` flag | 51.9% | 41.3% |
> | Double faults — rally ends on second serve | 2 | 4 |
> | Double faults — second serve flagged `in: false` | 14 | 26 |
>
> We think the flag is the unreliable half: 28 and 43 rallies contain a lone
> serve flagged `in: false` with **no second serve anywhere in the rally**, and a
> real fault brings a second serve. Serves the flag calls out land a median 0.69 m
> and 1.58 m *past* the service line — a systematic long bias rather than scatter.
>
> So: is `in` service-box containment or court containment? Is that bias known?
> Is there a per-serve confidence we could threshold on? (`line_confidence`
> doesn't help — it floors at 0.500, caps at 0.900, and doesn't move when the
> rest of the data degrades.)
>
> **2. Where do deuce and advantage points go?** `pred_point_score` only ever
> takes `0`, `15`, `30`, `40` — there's no `AD` rung. Nine games in one match and
> six in the other reach 40-40 and **zero further points are recorded in any of
> them**. Is no-ad scoring assumed? Is the `Ad` request parameter honoured? If a
> deuce game runs long, are those points dropped or folded into the next game?
>
> **3. Is a point-winner or rally-outcome field on the roadmap?** This is the
> single highest-value item for us. There's no point-winner field, and our entire
> statistics layer is built on that concept. The two signals we can derive one
> from — score deltas, and the last stroke's `in` flag — agree 88% on the cleaner
> match and **43% on the other**, which is worse than chance, with no third signal
> to arbitrate. Even a rally-end reason (`winner` / `error` / `out` / `net`)
> rather than a full winner attribution would unblock everything downstream.
>
> ### Three smaller ones
>
> **4. Lets.** Nothing in either payload marks one, and max serves per rally is 2.
> Either no lets occurred across two full matches, or they're silently dropped.
> Which? If a let were ever emitted as an extra serve, we'd misread it as a fault.
>
> **5. Score orientation and format.** Both `pred_game_score` and
> `pred_set_score` look like they're written from the **server's** perspective, so
> the string flips on every service change — can you confirm? Format also isn't
> stable between payloads: one emits `"0-0"`, the other `"0.0-0.0"` and
> `"nan-nan"`. Tiebreak points appear folded into `pred_point_score` (`1-6`,
> `5-1`) with no flag distinguishing them from game points — is there one we're
> missing? The 6-6 tiebreak in one match fragments into five pseudo-games all
> labelled `6-6`.
>
> **6. Per-job quality signal.** Our two payloads differ enormously and nothing in
> either one says so:
>
> | | Match A | Match B |
> |---|---|---|
> | Unusable bounce coordinates | 4.3% | 22.7% |
> | Unusable player positions | 0.5% | 15.8% |
> | Serves flagged `net_hit` that play continued past | 6.4% | 39.6% |
> | Consecutive strokes credited to the same player (impossible in singles) | 0.7% | 4.6% |
>
> ("Unusable" = the `-9999` sentinel, or a coordinate outside the ITF playing
> enclosure. One payload has `bounce_y_m: 371.7`.)
>
> Is there a per-job confidence score, a calibration-failure flag, or a "camera
> wasn't fixed" signal we can read? We've had to build our own quality scorer and
> would much rather use yours. Related: when the model *misses* a stroke, is
> anything emitted, or is it simply absent? That's the difference between "the
> point ended" and "we lost the ball."
>
> Happy to send you the two payload IDs and our full write-up if that's easier to
> work from.
>
> Thanks,
> Christian

---

## What to attach or offer

- **Offer, don't attach**: the two payload IDs, so they can pull them their side.
- **Offer**: `docs/splitstep-vendor-questions.md` (on `splitstep-derivation`) —
  it's the full version of Email 2 with reproduction steps.
- **Do not send**: anything with our secrets, the webhook URL, worker URLs, or
  Supabase project identifiers in it.

## What we owe them once they reply

| Their answer | What it unblocks on our side |
|---|---|
| API URL + key | first real submission; everything downstream of it |
| Signature header name | pin `SIGNATURE_HEADERS`, set `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` |
| Q8 `in` semantics | all serve statistics |
| Q9 deuce/ad | point reconstruction |
| Q13 point winner | `points` / `shots` rows, `result_type`, `calculate_match_stats` — i.e. Phase 2 |
