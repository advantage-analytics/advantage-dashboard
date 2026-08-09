# Cloudflare R2 + the results webhook — what exists and how it fits together

Written for whoever picks this up next. Branch: `splitstep-integration`.

The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep`
is internal naming only.

---

## 0. What changed since the first version of this doc

If you read the earlier copy, these are the deltas. Everything else still holds.

| | Then | Now |
|---|---|---|
| Webhook auth | plaintext shared secret in a header | **HMAC-SHA256, base64**, per the published contract (§5) |
| Results download | inline, before the 200 | **after the 200**, in `after()` (§5) |
| Deleting a match | left the video in R2 and the results JSON in Storage | **deletes both**, plus the webhook envelopes (§6) |
| Upload progress | invented — the matches list read a fixture array | **real**, from `processing_jobs` (§7) |
| A closed tab mid-upload | showed "Uploading 0%" forever | **reaped to `failed` after 15 min of silence** (§7) |
| Orphan sweeper | Supabase Storage only | **all three stores**, including R2 (§6) |
| Phase 2 gate | blocked on a real results fixture | **fixture obtained**; now blocked on vendor answers Q8/Q9/Q13 (§11) |

Three known gaps from the earlier copy are closed. The vendor-side ones are not, and
have grown — see §10.

---

## 1. The shape of it

Six links. A break anywhere stops the chain, so it is worth knowing which piece owns
which problem.

```
  browser
    │  1. pick + trim video, local validation (≥1080p, ≥30fps, singles)
    │     src/components/dashboard/matches/new-match-wizard/
    ▼
  upload-video-r2  (Supabase edge function)
    │  2. verifies the caller owns the match, presigns a 1-hour R2 PUT
    ▼
  browser → R2 direct           bucket: advantage-videos
    │  3. XHR PUT with progress, then writes video_object_key on the job row
    ▼
  POST /api/splitstep/jobs
    │  4. ownership → quota reservation → mint vendor URL → submit → record
    ▼
  SplitStep
    │  5. fetches the video through OUR Worker, not from R2 directly
    │     advantage-video-access.advantage-analytics.workers.dev/v/{token}
    ▼
  POST /api/webhooks/splitstep
       6. verify HMAC → record every delivery → return 200
          → download results JSON in after() → store
```

Steps 1–3 are the upload path (dklopstein). Steps 4–6 are submission, serving and
results.

---

## 2. Two buckets, two systems — and the one coupling that bites

| Artifact | Where | Why there |
|---|---|---|
| Original video, 1–5 GB | **R2** `advantage-videos` | vendor egress is free on R2; the Worker logs their fetch |
| Raw results JSON, ~1 MB | **Supabase Storage** `match-results` (private) | beside `match-data`, and next to the Edge Function that will read it |
| Webhook envelopes, ~1 KB | Postgres `splitstep_webhook_deliveries` | needs to be transactional with the job row |

Results JSON was originally specced for R2. It moved: at ~1 MB, R2's zero-egress
advantage is worth pennies, nobody external reads it, and the derivation engine that
will consume it runs in Supabase. **Put the data next to whatever computes on it.**
The video stays in R2 because the *vendor* computes on it.

> ### The coupling
>
> `R2_BUCKET_VIDEOS` (Supabase edge function secret) and `bucket_name` in
> `workers/video-access/wrangler.toml` **must be the same string**. They are the
> write side and the read side of the same object.
>
> This already went wrong once. A second bucket `advantage-match-videos` was created
> on the assumption that `advantage-videos` was a stray; it was not, it was the one
> the upload path writes to. The Worker read from the empty one. Symptom: upload
> succeeds, `video_object_key` is recorded, and the vendor 404s on every fetch, with
> nothing looking wrong at either end. Both now say `advantage-videos`, and the edge
> function requires the variable rather than defaulting, so it cannot drift silently
> again.

---

## 3. Why a Worker instead of a presigned R2 URL

The vendor needs a URL they can GET the video from. The obvious answer is a presigned
S3 URL. We do not use one.

A presigned URL cannot be revoked once issued, caps at 7 days (SigV4), and gives no
signal that anyone ever fetched it. The vendor confirmed they **fetch the video only
when a GPU worker actually starts the job**, not at submit — and they declined to send
a "processing started" webhook.

So the Worker's download log *is* the processing-started signal they do not provide:

- `processing_jobs.vendor_first_downloaded_at` — when they actually began
- `vendor_last_downloaded_at`, `vendor_request_count` — retries and range requests

`workers/video-access/src/index.ts` serves `/v/{token}`, trades the opaque token for
an object key via the `resolve_video_access_token()` SECURITY DEFINER function (which
also writes that log), and streams from R2 through an R2 binding — no S3 credentials
in the Worker at all. Tokens are 32 bytes of base64url, bound to a job, revoked when
the job reaches a terminal state.

Range requests work: verified against the real 1.93 GB match video, `206` with correct
`content-range` for offset, mid-file and suffix ranges.

---

## 4. What changed in `upload-video-r2`, and why

The function was deployed eight times but existed nowhere in git — only on Supabase's
servers. It is now committed at `supabase/functions/upload-video-r2/`, and the repo
copy matches what is deployed.

Two changes on top of the original (deployed as **version 9**):

**Required config instead of placeholder fallbacks.** It used to read
`Deno.env.get("R2_ACCOUNT_ID") || "filler_account_id"` and the same for the two keys
and the bucket. A placeholder still produces a perfectly well-formed presigned URL —
against a host that does not exist — so a missing secret surfaced at PUT time as an
opaque DNS or signature error, nowhere near the cause. They now throw, the log names
the variable, and the caller gets a 503 rather than the variable name.

**`contentType` is no longer applied to the presign.** This was already true in
version 8 and is now documented rather than left as dead code. Signing with
`ContentType` binds the signature to that exact header, so the browser must then send
a byte-identical `Content-Type` or R2 rejects the PUT with `SignatureDoesNotMatch`.
Dropping it from the presign is what fixed that. The field stays on the request
interface for compatibility.

`verify_jwt` is **false** at the platform level — deliberately. The handler does its
own check: requires an `Authorization` header, resolves the real user via
`getUser()`, and 403s unless `match.created_by` matches. Do not flip `verify_jwt` on
without checking the client still works.

---

## 5. The webhook

`POST /api/webhooks/splitstep` — `src/app/api/webhooks/splitstep/route.ts`.

Deliberately thin. The original spec had it running the derivation engine and
`calculate_match_stats` inline; that is wrong twice over. Webhook senders retry on
timeout, so slow inline work produces duplicate deliveries against partial state — and
this app runs on Vercel where the function ceiling is 60s. Derivation moves to a
Supabase Edge Function later, mirroring the SwingVision `process-match` pattern.

What it does, in order:

1. **Read the raw body first**, before any parsing can throw. If the payload differs
   from the docs at all, that log is the only thing that will tell you.
2. **Verify the HMAC.** `base64(HMAC-SHA256(SPLITSTEP_WEBHOOK_SECRET, raw_body))`,
   compared with a constant-time digest compare. This is the vendor's documented
   scheme — "encryption" in their email was loose phrasing for it.
3. **Record durably** via `record_splitstep_webhook()` before attempting anything else.
   That is what makes the envelope, and the `sas_url` inside it, recoverable by hand.
4. **Return 200.**
5. **On `job_completed`, in `after()`**: fetch `sas_url`, write the JSON verbatim to
   `match-results`, then `finalize_splitstep_results()`.

### Authentication, in detail

The docs give the algorithm but **never name the header**. So rather than guessing one
and failing silently on the first real delivery, `SIGNATURE_HEADERS` is a candidate
list — `x-splitstep-signature`, `x-webhook-signature`, `x-signature`,
`x-signature-256`, `x-hub-signature-256`, `signature`, `x-webhook-secret`,
`x-api-key`, `authorization` — checked in order. Same tactic `webhook-payload.ts`
already uses for body keys.

Three outcomes, and the asymmetry is deliberate:

| Situation | Result | Why |
|---|---|---|
| A candidate header matches the HMAC | accept, `signature_verified = true` | |
| A candidate header carries the **raw secret** rather than a signature | accept, `signature_verified = false`, warn | proves they hold the secret; says nothing about the body |
| A candidate header is present and **wrong** | **401** | a real failure, not an unknown-header problem |
| **No** candidate header found | accept, `signature_verified = false`, log every header name received | see below |

Rejecting on "no signature found" is the tempting default and it is wrong here. The
vendor has **no retry policy and a 30s connection timeout**, so a delivery we refuse is
gone permanently — there is no second attempt to fix it on. Combined with a header name
nobody has written down, fail-closed risks discarding valid results because we looked
in the wrong place. The log that fires in this case prints the full set of header names
received, which is exactly what identifies the right one.

> **Flip this before real athlete video goes through.** Set
> `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` as soon as one real delivery has confirmed
> the header name, then collapse `SIGNATURE_HEADERS` to that one value. Leaving it
> fail-open past the first successful delivery is the single largest security debt in
> this integration.

If `SPLITSTEP_WEBHOOK_SECRET` is unset entirely, the route runs unsigned and accepts
anything, logging a warning on every delivery.

### Why the download moved after the 200

It used to fetch the results JSON inline and only then respond. With a 30s vendor
timeout and no retries, a slow vendor host could hold our response past their deadline
and the delivery would be lost — carrying the `sas_url` with it. Now the 200 goes out as
soon as the envelope is durable and the fetch runs in `after()` from `next/server`,
still inside the same invocation's `maxDuration`.

The old code also returned **500 on a failed download "to invite a retry"**. That was
wrong twice: no retry policy exists, so the 500 bought nothing, and it risked the
timeout. Recovery is now by hand from the stored `sas_url` (valid ~7 days), or via
`GET {BASE_URL}/jobs/{job_id}`.

### Why the database functions

Recording a delivery is one atomic statement, not a read-modify-write. Two identical
deliveries arriving together would otherwise both miss the duplicate check.

- `record_splitstep_webhook()` — dedupes on a SHA-256 fingerprint of the raw body,
  matches the job by `external_job_id`, returns `already_stored` so retries are cheap
- `splitstep_status_rank()` — stops a retried or out-of-order delivery dragging a job
  backwards. `deriving` (7) and `derivation_failed` (8) rank above anything a webhook
  can carry (6), so the vendor cannot move a job once our engine has it
- `finalize_splitstep_results()` — records the stored key, or the failure reason

> Anything added to `processing_jobs_status_check` **must** also be added to
> `splitstep_status_rank()`. They are two halves of one state machine and nothing
> enforces that they agree. This already caused a bug: `deriving` was added to the
> constraint but not the rank function, fell to the `else -1` branch, and a late
> `queued` retry dragged a mid-derivation job backwards.

### Unmatched deliveries

A delivery whose `job_id` matches no row is answered **200, not 404** — there is no row
to attach it to and there never will be, so a retry replays the same dead end. The full
payload is logged and stored in `splitstep_webhook_deliveries` regardless, so nothing
is lost.

---

## 6. Deleting a match — where the bytes go

Deleting a match used to remove the row and leave everything else behind. A 1–5 GB
video stranded in R2 with nothing left that could even name it: the object key lives on
`processing_jobs`, which cascades away with the match.

`DELETE /api/matches/[matchId]` now runs three cleanups **before** the row delete, and
that ordering is load-bearing for exactly that reason. They run concurrently under
`Promise.all` — none reads another's output — each with its own `try`/`catch`:

1. **Source video in R2** → delegated to the `delete-video-r2` edge function. The Next
   runtime has no S3 client and no R2 keys; duplicating them there for one call would
   widen the credential surface for nothing. The function mirrors `upload-video-r2`'s
   ownership check, dedupes keys across every job for the match, and issues one
   `DeleteObjects`.
2. **Raw results JSON** in `match-results`, keyed off `processing_jobs.results_object_key`.
3. **Uploaded provider files** (SwingVision `.xlsx` and friends) in `match-data`.

Every step is **best-effort**. A stranded file is recoverable; a match the user cannot
delete is not. Storage failures log and the row delete proceeds regardless.

### Webhook deliveries cascade too

`splitstep_webhook_deliveries.job_id` was `ON DELETE SET NULL`, which left the envelope
behind with no owner. `raw_body` is the vendor's full payload, and on a completion it
contains `sas_url` — **a working credential to the results for about a week**. Retaining
that after a user deletes the match was a retention decision nobody made. It is now
`ON DELETE CASCADE`.

Unmatched deliveries — ones whose `external_job_id` matched no job — already have
`job_id = NULL` and no parent to cascade from, so they survive. Those are exactly the
"something is wrong" rows worth keeping.

### The sweeper

```bash
npx tsx scripts/cleanup-orphan-storage.ts            # dry run
npx tsx scripts/cleanup-orphan-storage.ts --apply    # delete
```

Sweeps all three stores for objects whose match no longer exists. The match id is the
third path segment in every layout we write, which is what identifies an orphan. It
**refuses to run if the match table comes back empty** — far more likely a failed query
or the wrong project than a genuinely empty database, and without that guard it would
wipe everything.

R2 is skipped unless `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` are
in `.env.local`. Those normally live only in the Supabase edge-function secrets — copy
them in when you want to sweep, because R2 is the bucket where an orphan costs money.

Its first real run freed ~360 MB of pre-existing strays. Both live videos were verified
intact afterwards.

---

## 7. Upload progress, and jobs that stop moving

Two related fixes, because the matches list was showing fiction.

**The status was a fixture.** `getMatchAnalysis()` hash-cycled a hardcoded array and
never touched the database — every status word and percentage on screen was invented.
It is gone. `src/lib/data/match-analysis-server.ts` reads real `processing_jobs` rows,
one query for a whole page rather than one per row.

**Progress is stored, not just displayed.** The browser uploads straight to R2 and is
the only party that knows how it is going. `processing_jobs.upload_progress_percent`
(nullable `smallint`, 0–100) is written coarsely — every ~10%, since a 2 GB upload fires
hundreds of progress events and the bar cannot show more than a tenth anyway.

**A percentage is shown only while uploading.** The vendor sends queue and analysis
transitions with no percentage attached, so a bar for those stages would be invented
all over again. Those render a bare status word.

**Stalled uploads are reaped.** Close the tab mid-upload and the XHR dies with the page
— no catch block ever runs, and the row sits at `uploading` forever, indistinguishable
from an upload still in flight. Observed exactly that: a job wrote 0% and was never
touched again, showing "Uploading 0%" indefinitely.

`reap_stalled_uploads()` fails `pending`/`uploading` jobs whose `updated_at` has been
silent for 15 minutes. Keyed on **staleness, not age** — a live upload keeps touching
`updated_at` no matter how large the file, so absolute age would false-fail a
legitimately long upload. It runs on the read path in `loadMatchAnalysis()`, which is
exactly when a stale row is misleading, and avoids enabling `pg_cron` for one statement.
It is **not** `SECURITY DEFINER`: RLS applies, so a caller only ever reaps their own.

---

## 8. Quota

The pilot allows 75 processing-hours/month per collegiate program and 2 per individual.
The `processing_usage` ledger existed from the first migration and nothing wrote to it.

`reserve_processing_quota()` now reserves the trimmed length **before** the vendor is
called — an allowance only checked afterwards cannot refuse anything. An advisory lock
per account+month makes the check and the insert atomic. Failures release; completion
reconciles the estimate against actual billed seconds.

Only the `individual` tier is reachable: `public.users` has `plan` and `role` but
nothing tying a user to a program, so there is no membership to read. Inventing one
would hand every user a 75-hour allowance. `accountTypeFor()` in
`src/lib/services/splitstep/quota.ts` is the single place that changes when a program
model exists.

---

## 9. What is safe to change while redesigning the UI

Short answer: **all of it, except one file.**

The pipeline is server-side and database-backed. Nothing about R2, the Worker, the
webhook, quota or job state depends on how a component looks, what it is called, or
where it renders. Restyling, re-laying-out, splitting or renaming presentational
components cannot break the integration.

| Layer | Files | Safe to redesign? |
|---|---|---|
| Wizard presentation | `new-match-wizard/{ConfirmContent,DetailsContent,ProviderContent,ScoreCell,StepIndicator,UploadContent,VideoMetaFields,VideoStepContent,styles}.tsx` | **Yes, freely** |
| Matches list & detail | everything under `components/dashboard/matches/` except the wizard hook | **Yes, freely** |
| Wizard orchestration | `new-match-wizard/useUploadMatchWizard.ts` | **Careful — see below** |
| Everything server-side | `api/splitstep/jobs/`, `api/webhooks/splitstep/`, `lib/services/splitstep/`, `supabase/functions/`, `workers/` | Untouched by UI work |

### The one file to be careful with

`useUploadMatchWizard.ts`, roughly **lines 780–920**. That block is the entire
browser-side upload contract, and it is four things in sequence:

1. `supabase.functions.invoke("upload-video-r2")` → presigned PUT URL + object key
2. `XMLHttpRequest` PUT to that URL — **XHR, not `fetch`, deliberately**: `fetch` has no
   upload-progress event, and progress is the whole point
3. `xhr.upload.onprogress` → writes `upload_progress_percent` every ~10%
4. `video_object_key` written to the job row, then `POST /api/splitstep/jobs`

Four rules keep it working no matter what the UI looks like:

- **Do not send a `Content-Type` the presign did not sign for.** The presign
  deliberately omits `ContentType` (§4); the PUT sends `video/mp4` as a fallback. If you
  change one side, change both, or R2 answers `SignatureDoesNotMatch`.
- **Keep writing `upload_progress_percent`.** Stop and the reaper (§7) fails the job
  after 15 minutes of silence — the progress write *is* the heartbeat.
- **Keep `video_object_key` written before `POST /api/splitstep/jobs`.** The submit
  route reads it to mint the vendor URL.
- **The upload outlives the wizard.** It continues in the background after the user
  navigates away. If you change navigation or unmount behaviour, verify a large upload
  still completes.

Everything else in that file — step order, copy, validation messages, which fields
appear on which step — is presentation and can move freely.

### Two UI gaps worth fixing during the redesign

- **There is no toast or banner system.** A background upload failure is currently
  invisible: `match-upload-failed` is dispatched to nobody. The reaper eventually turns
  it into a "Failed" row on the matches list, but the user gets no notification at the
  moment it happens. If you are building UI anyway, this is the natural time.
- **The matches list does not live-update.** Analysis state is read server-side at
  render, so a job moving `queued → processing → completed` only appears on refresh.

---

## 10. Known gaps

Three gaps in the earlier version of this doc are now closed — HMAC auth, the download
ordering, and match-deletion cleanup. What remains is almost entirely vendor-side.

**Blocking, on the vendor:**

- **The signature header name is still unknown**, so the webhook remains fail-open on a
  missing signature (§5). This closes the moment one real delivery lands.
- **`SPLITSTEP_API_URL` and `SPLITSTEP_API_KEY` are still not issued**, so nothing has
  been submitted end-to-end. Everything downstream of submission has only been exercised
  against the local harness.
- **Phase 2 (derivation) is gated on three answers** — see §11.

**Ours, not blocking:**

- **The job status endpoint is unused.** `GET {BASE_URL}/jobs/{job_id}` exists and is the
  recovery path for a delivery lost to an outage. Nothing calls it yet.
- **`video_id` and the structured `error` object are not promoted to columns.** The
  failure payload carries `error.code` / `category` / `step`; only the free-text
  `message` reaches `processing_jobs.error_message`. The full object is retained in
  `raw_body`, so nothing is lost — it just is not queryable.
- **Only the `individual` quota tier is reachable** (§8).
- **Ten older migration files carry no applied version stamp.** Pre-existing drift, not
  from this work; each needs verifying against the live DB before `supabase db push` is
  trusted.

---

## 11. Phase 2 — where the derivation engine actually stands

This changed materially since the first version of this doc and is the most important
thing to know if you are picking the project up.

**The gate is no longer a missing fixture.** Two real full-match payloads are committed
on the `splitstep-derivation` branch (1,076 and 1,130 strokes; 156 and 168 rallies).
`src/lib/services/splitstep/derivation/` parses, groups, brackets and grades them, with
a Playwright suite over both.

**It writes nothing to the database, on purpose.** `points.won_by_player1` is `NOT NULL`
and `shots.point_id` is `NOT NULL`, so there is no schema-legal way to persist one
derived shot without first committing to a winner for *every* point in the match. The
payload has no point-winner field, and the two signals we can derive one from agree
**88% on the clean fixture and 43% on the degraded one** — worse than chance, with no
third signal to arbitrate.

So a completed job correctly rests at "processed, analysis pending" with a quality
report attached.

Full analysis, including everything the fixtures answered and the six new questions they
raised, is in **`docs/splitstep-vendor-questions.md`** on the `splitstep-derivation`
branch. The three that block Phase 2 are **Q8** (what `in` means on a serve), **Q9**
(where deuce/advantage points go), and **Q13** (is a point-winner field coming).

---

## 12. Environment

| Variable | Where | Notes |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Supabase edge fn secrets | S3 API, used only to presign uploads |
| `R2_BUCKET_VIDEOS` | Supabase edge fn secrets | **must equal** `bucket_name` in wrangler.toml |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Worker secrets (`wrangler secret put`) | token resolution |
| `R2_PUBLIC_WORKER_URL` | Vercel | the Worker origin handed to the vendor |
| `NEXT_PUBLIC_SITE_URL` | Vercel, **per environment** | builds the vendor's WebhookUrl. One value shared across Production and Preview means a preview hands them the production origin, where the route does not exist |
| `SPLITSTEP_WEBHOOK_SECRET` | Vercel | HMAC key. Unset = unsigned mode, which accepts anything |
| `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` | Vercel | `true` = fail-closed on a missing signature. **Set this once the header name is known** |
| `SPLITSTEP_API_URL`, `SPLITSTEP_API_KEY` | Vercel | still blocked on the vendor |

The Worker reads video through an **R2 binding**, not S3 credentials. The R2 API keys
exist only for the upload presign.

`.env.example` carries names only, never values. Worker secrets go in via
`wrangler secret put`, which prompts — never pass a secret on the command line, it lands
in shell history.

---

## 13. Testing without the vendor

```bash
npx tsx scripts/splitstep-webhook-test.ts --url https://www.advantage-analytics.dev
```

Nine checks: queued → completed → duplicate → out-of-order → failed → unmatched →
malformed → wrong-secret → **valid signature over a tampered body**. It asserts what
actually landed in the database and the bucket, and it **signs payloads with a real
HMAC** rather than sending the raw secret, so it exercises the same path a vendor
delivery will.

The `sas_url` is not mocked: it uploads a fixture to `match-results` and signs it, so
the download path runs over real HTTP. Because the download now happens in `after()`,
the assertions poll rather than checking immediately. Everything it creates is removed
on the way out.

Last run: all nine green, `signature_verified: true`, results stored.

> If every delivery comes back `signature_verified: false`, the deployed build predates
> the secret being set. Redeploy — Vercel injects env vars at deploy time. This has
> already caused one false "the test is broken" diagnosis.

`scripts/splitstep-submit.ts` submits one job by hand. It defaults to a **dry run** that
prints the payload in plain English — read it before spending a job. The two fields most
likely to be wrong are invisible when wrong: `InitialTopPlayer` is camera-relative at the
first frame (not player1), and `SetGameScores` is ordered top-player-first. Get either
backwards and every statistic is attributed to the wrong player with nothing looking off
in the UI.
