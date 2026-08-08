# Cloudflare R2 + the results webhook — what exists and how it fits together

Written for whoever picks this up next. Branch: `splitstep-integration`.

The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep`
is internal naming only.

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
       6. verify → record every delivery → download results JSON → store
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
2. **Authenticate.** Currently a shared secret compared in constant time, accepted via
   `X-Webhook-Secret`, `X-Api-Key` or `Authorization: Bearer`. See §7 — this needs to
   become HMAC.
3. **Record durably** via `record_splitstep_webhook()` before attempting anything else.
   That is what makes the envelope, and the `sas_url` inside it, recoverable by hand.
4. **On `job_completed`**: fetch `sas_url`, write the JSON verbatim to
   `match-results`, then `finalize_splitstep_results()`.

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

## 6. Quota

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

## 7. Known gaps

**Webhook authentication is not what the docs specify.** The published contract is
HMAC-SHA256 over the raw body, base64-encoded, compared against a signature the vendor
sends. We currently compare a plaintext shared secret in a header. The drop-in point
is marked `TODO(splitstep-q4)` immediately after the raw body is read — the handler was
structured so this is a single guard, and nothing above it depends on the parsed body.
**The header name carrying the signature is not documented; it has to be asked for.**

**The results download runs inline, before the 200.** The vendor has a 30s connection
timeout and **no retry policy at all**. A slow download risks exceeding their timeout,
and a timed-out delivery is gone permanently. It should return 200 first and download
after the response is committed.

**A job status endpoint now exists** — `GET {BASE_URL}/jobs/{job_id}` — which was
previously assumed impossible. That is the recovery path for any delivery lost during
an outage, and nothing uses it yet.

**`video_id` and the structured `error` object are not captured.** The failure payload
now carries `error.code` / `category` / `step`; we store only the free-text `message`.

---

## 8. Environment

| Variable | Where | Notes |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Supabase edge fn secrets | S3 API, used only to presign uploads |
| `R2_BUCKET_VIDEOS` | Supabase edge fn secrets | **must equal** `bucket_name` in wrangler.toml |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Worker secrets (`wrangler secret put`) | token resolution |
| `R2_PUBLIC_WORKER_URL` | Vercel | the Worker origin handed to the vendor |
| `NEXT_PUBLIC_SITE_URL` | Vercel, **per environment** | builds the vendor's WebhookUrl. One value shared across Production and Preview means a preview hands them the production origin, where the route does not exist |
| `SPLITSTEP_WEBHOOK_SECRET` | Vercel | unset = unsigned mode, which accepts anything |
| `SPLITSTEP_API_URL`, `SPLITSTEP_API_KEY` | Vercel | still blocked on the vendor |

The Worker reads video through an **R2 binding**, not S3 credentials. The R2 API keys
exist only for the upload presign.

---

## 9. Testing without the vendor

```bash
npx tsx scripts/splitstep-webhook-test.ts --url https://www.advantage-analytics.dev
```

Drives queued → completed → duplicate → out-of-order → failed → unmatched → malformed
→ wrong-secret, and asserts what actually landed in the database and the bucket. The
`sas_url` is not mocked: it uploads a fixture to `match-results` and signs it, so the
download path runs over real HTTP. Everything it creates is removed on the way out.

Last run: all checks green, `signature_verified: true`, results stored.

`scripts/splitstep-submit.ts` submits one job by hand. It defaults to a **dry run** that
prints the payload in plain English — read it before spending a job. The two fields most
likely to be wrong are invisible when wrong: `InitialTopPlayer` is camera-relative at the
first frame (not player1), and `SetGameScores` is ordered top-player-first. Get either
backwards and every statistic is attributed to the wrong player with nothing looking off
in the UI.
