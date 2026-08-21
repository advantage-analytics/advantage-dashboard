# Video storage + the results webhook — what exists and how it fits together

Written for whoever picks this up next. Branch: `splitstep-integration`.

The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep`
is internal naming only.

> **This file is mid-migration.** Source video moved from Cloudflare R2 to Azure Blob
> Storage. The app code is fully switched over; the retired R2 pieces
> (`workers/video-access/`, `supabase/functions/upload-video-r2/`,
> `supabase/functions/delete-video-r2/`) are still in the repo on purpose, because
> nothing has run against a real Azure account yet. Delete them — and rename this
> file — once one job has round-tripped. See §3.
>
> `video-url/worker-token.ts` is already gone: renaming `revoke()` to
> `markUrlRetired()` would have meant editing dead code to satisfy an interface it
> could never be used through.

---

## 0. What changed since the first version of this doc

If you read an earlier copy, these are the deltas. Everything else still holds.

| | Then | Now |
|---|---|---|
| **Source video store** | **Cloudflare R2, served via a Worker** | **Azure Blob Storage, served via a SAS URL** (§3) |
| **Vendor URL revocation** | **per job, on demand** | **not possible; bounded by a 14-day TTL and deleting the blob on completion** (§3) |
| **Browser upload** | **one PUT of the whole file** | **8 MiB blocks, with retry per block** (§4) |
| Webhook auth | plaintext shared secret in a header | **HMAC-SHA256, base64**, per the published contract (§5) |
| Signature header | unknown; a candidate list | **`X-HMAC-Signature`**, confirmed by the vendor (§5) |
| Results download | inline, before the 200 | **after the 200**, in `after()` (§5) |
| Deleting a match | left the video and the results JSON behind | **deletes both**, plus the webhook envelopes (§6) |
| **After a job completes** | **the video sat there until the match was deleted** | **the source blob is deleted once results are stored** (§6) |
| Upload progress | invented — the matches list read a fixture array | **real**, from `processing_jobs` (§7) |
| A closed tab mid-upload | showed "Uploading 0%" forever | **reaped to `failed` after 15 min of silence** (§7) |
| Orphan sweeper | Supabase Storage only | **all three stores**, including the video container (§6) |
| Max accepted video | 12 GiB, from a verbal agreement | **8,000,000,000 bytes**, the documented enforced limit (§10) |
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
  POST /api/splitstep/upload-url
    │  2. verifies the caller owns the match, mints a 6-hour `cw` SAS
    │     for exactly one blob name
    ▼
  browser → Azure direct        container: advantage-videos
    │  3. Put Block × N (8 MiB each) → Put Block List,
    │     then writes video_object_key on the job row
    ▼
  POST /api/splitstep/jobs      ← nothing calls this yet; see §10
    │  4. ownership → quota reservation → mint vendor SAS → submit → record
    ▼
  SplitStep
    │  5. GETs the blob directly from Azure with the read SAS.
    │     Their API accepts no other host.
    ▼
  POST /api/webhooks/splitstep
       6. verify HMAC → record every delivery → return 200
          → download results JSON in after() → store → delete the source blob
```

Steps 1–3 are the upload path. Steps 4–6 are submission, serving and results.

Note step 4: submission is still a **hand-run script** (`scripts/splitstep-submit.ts`).
The wizard stops at `status: 'uploaded'` and nothing in the app POSTs to
`/api/splitstep/jobs`. That is deliberate until one job has round-tripped — it means
you read the payload before anything is spent.

---

## 2. Two stores, two systems

| Artifact | Where | Why there |
|---|---|---|
| Original video, 1–8 GB | **Azure Blob** `advantage-videos`, `videos/…` | the only host the vendor's `VideoUrl` accepts (§3) |
| **Trimmed video**, returned by the vendor | **Azure Blob** `advantage-videos`, `trimmed/…` | copied server-side from their SAS; the only video that outlives the job |
| Raw results JSON, ~1 MB | **Supabase Storage** `match-results` (private) | beside `match-data`, and next to the Edge Function that will read it |
| Webhook envelopes, ~1 KB | Postgres `splitstep_webhook_deliveries` | needs to be transactional with the job row |

The vendor hands their processed video back on `trimmed_video_url` beside `sas_url`. We
ignored that field until 2026-08-13 while also deleting our own source video, so a
successful job ended with **no video anywhere**. `startTrimmedVideoCopy()` now issues
Azure's async Copy Blob, which means Azure pulls the bytes directly and none pass
through a Vercel function bounded at 60s.

> **"Trimmed" means trimmed to the window we submitted — not dead time removed.**
> This doc previously claimed the opposite, and the assumption survived until someone
> watched the file. `job-request.ts` sends `StartTime`/`EndTime`; the vendor returns
> exactly that span, re-encoded. Measured on job `2a11168d` (2026-08-14):
> window 15.136 → 5196.343 = **5181.207s**, returned video **5181.268s**, a 0.06s
> match. No annotations, no rally detection, no cuts.
>
> Two consequences. A player who selects their whole video gets their whole video
> back, so §3's delete of our 1.54 GB source in favour of a 1.33 GB / 2.2 Mbps
> re-encode of the same footage is a **downgrade**, not the upgrade the policy was
> written for — worth revisiting before more jobs run. And the offset between their
> timeline and ours is not unknown: it is `start_time_seconds` on the job row (see
> §3.6 of the integration spec).

Results JSON was originally specced for R2. It moved: at ~1 MB, egress cost is worth
pennies, nobody external reads it, and the derivation engine that will consume it runs
in Supabase. **Put the data next to whatever computes on it.** The video sits in Azure
because that is the only place the *vendor* can read it from.

The blob name is unchanged from the R2 key: `videos/{userId}/{matchId}/original.{ext}`,
still produced by `videoObjectKey()` in `object-keys.ts`. Keeping it matters — the
orphan sweeper identifies a stray by the match id in the **third path segment**, so a
tidier flat layout would have broken it silently.

> **The coupling that used to bite is gone.** `R2_BUCKET_VIDEOS` and `bucket_name` in
> `workers/video-access/wrangler.toml` had to be the same string — the write side and
> the read side of the same object, in two systems, with nothing but a human enforcing
> it. That drifted once and produced a perfect silent failure: uploads succeeded,
> `video_object_key` was recorded, and the vendor 404'd on every fetch with nothing
> looking wrong at either end. With one store there is one name, in one variable.

---

## 3. Why Azure, and what it cost us

Not a preference. The vendor's API docs constrain `VideoUrl` to
`https://<account>.blob.core.windows.net/<container>/<blob>`, "normally with a SAS
token", and state that other hosts are not supported. Asked directly whether that was
advisory, they said it was not: *"It needs to be an azure blob, unfortunately."*

Everything before that answer served the video from our own infrastructure — R2 behind
a Cloudflare Worker at `/v/{token}`. It worked, it was cheaper, and the vendor could
not read it.

### What the Worker was for, and what replaced each part

R2 had no consumer other than the vendor. In-app playback uses a local object URL, not
the stored file, so when the vendor stopped being able to fetch from our host, the
whole store lost its reason to exist. Three things justified it:

| Driver | Under the Worker | Now |
|---|---|---|
| **Cost** | zero R2 egress on 1–8 GB pulls | ~$0.09/match. Real, and irrelevant at pilot volume |
| **Observability** | `vendor_first_downloaded_at`, written by `resolve_video_access_token()` on every fetch — the "processing started" signal the vendor declined to send | **lost.** The replacement is their own `GET {BASE_URL}/jobs/{job_id}`, which is a better signal anyway — their actual queue state instead of our inference from a download log. Not wired yet (§10) |
| **Revocability** | kill one job's URL on demand | **lost.** See below |

### Revocation, honestly

A SAS signed with the storage account key **cannot be withdrawn**. The signature is
verified arithmetically, so the only kill switches are rotating the account key (kills
every URL at once) or deleting the blob. Container stored-access-policies would give
per-policy revocation, but Azure allows five per container — they cannot be per-job.

`markUrlRetired()` still writes `video_token_revoked_at`, but it is **bookkeeping
only** — and it is not called `revoke()` precisely because it revokes nothing. Its one caller is the submit-failure path, where the POST never
reached the vendor and nobody outside this system has seen the URL, so the recorded
intent and the real exposure agree. If that stops being true, delete the blob.

Two things bound the exposure instead, and neither is as good as a kill switch:

1. `VENDOR_URL_TTL_SECONDS`, cut from 30 days to **14**. It was 30 when the number cost
   nothing; now the TTL *is* the exposure rather than a ceiling above it.
2. **Deleting the source blob once results are stored** (§6). This is the real bound,
   and it is new — nothing deleted videos post-completion under R2 either.

Note the earlier version of this section argued a presigned URL was unusable because
SigV4 caps expiry at 7 days. Azure SAS has no equivalent ceiling, so that constraint no
longer applies to anything here.

---

## 4. The upload path

Two Supabase edge functions became one Next.js route. `upload-video-r2` and
`delete-video-r2` existed because the Next runtime held no storage credentials — under
Azure it must, since the same account key signs the vendor's read SAS. Keeping them
would have meant the same secret in two places.

**`POST /api/splitstep/upload-url`** — auth via the normal `createClient()` session,
ownership checked with the admin client, returns a `cw` SAS for one blob name.

- `cw` — create and write, the minimum Put Block and Put Block List need. No read, no
  delete, no list. Whoever holds the URL can put bytes at exactly one name.
- **Six hours**, not the one hour the R2 presign used. The validator accepts just under
  8 GB; at 10 Mbps that transfer takes ~1.8 hours, so the old window would have expired
  mid-upload with nothing but a 403 on a block PUT to explain it.
- The blob name comes from `videoObjectKey()`, which **throws** on a container outside
  `.mp4`/`.mov`. The old edge function's regex silently defaulted an unrecognised name
  to `.mp4`, producing a blob whose extension disagreed with its bytes.

**`src/lib/services/upload/azure-block-upload.ts`** — the browser side. Deliberately no
SDK: `@azure/storage-blob` exists to build credentials, and this code is handed one, so
including it would put a few hundred KB in the client bundle to gain nothing.
`next.config.ts` lists it under `serverExternalPackages` to keep that true.

```
PUT {sas}&comp=block&blockid={id}    once per 8 MiB chunk
PUT {sas}&comp=blocklist             once, naming the ids in order
```

Three things worth knowing:

- **A single PUT could never have worked.** Azure's Put Blob caps below the ~7.45 GB the
  validator accepts. So did R2's 5 GiB single-PUT ceiling — the old path had the same
  defect and nobody had hit it yet.
- **Nothing is visible at the blob name until the block list commits.** An abandoned
  upload leaves uncommitted blocks that Azure garbage-collects after a week, rather than
  a corrupt half-video that looks complete.
- **Block ids must be equal-length base64** or the commit is rejected. They are the
  index zero-padded to six digits — enough for 20× the 50,000-block ceiling, so the
  width never changes with file size.

Each block retries up to three times on a dropped connection or a 5xx, and never on a
403 — that is an expired SAS, and retrying just spends three attempts reaching the same
answer.

> **CORS is the failure you will hit first.** The upload goes straight from the browser
> to Azure, so the storage account needs a CORS rule on the **blob service** before any
> of this works. Without it the browser reports an indistinguishable network error with
> no CORS wording anywhere. Allowed methods `PUT, GET, HEAD, OPTIONS`; allowed headers
> `x-ms-blob-type, x-ms-blob-content-type, x-ms-version, content-type`. The error
> message in `azure-block-upload.ts` names CORS explicitly for this reason.

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

The signature arrives in **`X-HMAC-Signature`** — confirmed by the vendor by email and
since added to their published docs. It leads `SIGNATURE_HEADERS`.

The rest of that list (`x-splitstep-signature`, `x-webhook-signature`, `x-signature`,
`x-signature-256`, `x-hub-signature-256`, `signature`, `x-webhook-secret`, `x-api-key`,
`authorization`) stays, for two reasons. It is still a cheap hedge until a real delivery
confirms the documented name in practice. And the same array is the **redaction set**
for `safeHeaders()` — dropping `authorization` or `x-api-key` from it would start
writing credential values into `splitstep_webhook_deliveries`, which is worse than
carrying a few dead candidates.

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
> `X-HMAC-Signature` in practice. Leaving it fail-open past the first successful
> delivery is the single largest security debt in this integration.
>
> Do **not** collapse `SIGNATURE_HEADERS` to one entry when you do — it doubles as the
> redaction set, as above.

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

Deleting a match used to remove the row and leave everything else behind. A multi-GB
video stranded with nothing left that could even name it: the object key lives on
`processing_jobs`, which cascades away with the match.

`DELETE /api/matches/[matchId]` now runs three cleanups **before** the row delete, and
that ordering is load-bearing for exactly that reason. They run concurrently under
`Promise.all` — none reads another's output — each with its own `try`/`catch`:

1. **Video blobs**, deleted inline — **both** `video_object_key` and
   `trimmed_object_key`. This runtime already holds the storage account key because the
   same key signs the vendor's read SAS; under R2 it did not, which is the only reason
   this was ever a separate edge function. Blob names are deduped across every job for
   the match, since a re-submitted match points several jobs at one source blob; trimmed
   keys are per-job and naturally distinct.

   > Reading only the source key was a live bug for one commit. Once the reclaim pass has
   > removed the source, the trimmed copy is the **only** video for that match, so
   > deleting the match stranded several GB with nothing able to name it — precisely the
   > leak this whole section exists to prevent.
2. **Raw results JSON** in `match-results`, keyed off `processing_jobs.results_object_key`.
3. **Uploaded provider files** (SwingVision `.xlsx` and friends) in `match-data`.

Every step is **best-effort**. A stranded file is recoverable; a match the user cannot
delete is not. Storage failures log and the row delete proceeds regardless.

### The source video is deleted once something better is safely ours

The thing that makes a 14-day unrevocable SAS acceptable. In the webhook's `after()`
block, once the results JSON is stored **and** the vendor's trimmed re-encode has been
confirmed copied into our container, the source blob is deleted.

Strictly in that order, and the second condition is not optional. While the video is the
only copy of the match it is also the only way to re-run a job, so deleting before the
results are safe would trade a recoverable failure for an unrecoverable one. The
original version checked only the results and deleted unconditionally — which destroyed
the last video in existence for that match, because we were not capturing the trimmed
one. It only fires on success either way: a `failed` job keeps its video, because the
whole point of a retry is having something to retry with.

Two consequences worth knowing rather than discovering:

- **In practice the webhook always declines.** A cross-account copy of a real match is
  still `pending` when the request ends, and a redelivery cannot pick it up either —
  by then both artifacts are recorded, so the webhook takes no `after()` path at all.
  The delete therefore belongs to the scheduled pass below, not to the webhook.
- **A job whose payload carried no trimmed url keeps its source indefinitely.** Also
  deliberate. One video beats none.

### The scheduled reclaim

`reclaimSupersededSources()` in `src/lib/services/splitstep/reclaim-videos.ts` is the
pass that actually removes source videos. Two callers, one definition:

- **`/api/cron/reclaim-videos`**, daily at 04:00 UTC via `vercel.json`. This is the
  automatic path, and it exists because the webhook's own delete is unreachable in
  practice — without it, ~5 GB accumulated per completed match until a human ran a script.
- **`scripts/cleanup-orphan-storage.ts`**, the manual handle: a dry run to see what would
  go, and a way to force a sweep without waiting for the schedule.

It clears `video_object_key` after a successful delete. Without that the same rows
qualified on every run, re-issuing a no-op delete and reporting "N found / 0 deleted"
forever — on a destructive script, indistinguishable from a broken sweep.

A copy Azure reports `failed` or `aborted` is surfaced **separately** from one still
running, and logged at error level. It means the job points at a trimmed video that does
not exist, and `trimmed_video_url` — the only way to fetch it again — expires about a
week after completion.

> `CRON_SECRET` fails **closed**: unset, the route returns 503 and deletes nothing. That
> is the opposite of the webhook's default and deliberately so. The webhook accepts an
> unverifiable delivery because a refused one is gone permanently; here the repo is
> public so the path is known, the endpoint destroys data, and a skipped run simply
> happens tomorrow.

Best-effort by construction: every failure logs and returns.

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

The video container is skipped unless `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_KEY`
are in `.env.local` — copy them from Vercel when you want to sweep, because that is
where an orphan costs money.

One Azure-specific wrinkle in `removeBatch`: `sweep()` breaks out of its delete loop on
the first throw, on the reasoning that a throwing batch means a transport or credential
failure and the rest would fail identically. Azure's `deleteBlob` throws on a 404, so
the store uses `deleteIfExists` **and** its own per-key `try`/`catch` — otherwise one
already-deleted blob would abort the entire sweep. The R2 entry got this for free
because S3 returns per-key failures in the response body instead of throwing.

Its first real run freed ~360 MB of pre-existing strays. Both live videos were verified
intact afterwards.

---

## 7. Upload progress, and jobs that stop moving

Two related fixes, because the matches list was showing fiction.

**The status was a fixture.** `getMatchAnalysis()` hash-cycled a hardcoded array and
never touched the database — every status word and percentage on screen was invented.
It is gone. `src/lib/data/match-analysis-server.ts` reads real `processing_jobs` rows,
one query for a whole page rather than one per row.

**Progress is stored, not just displayed.** The browser uploads straight to Azure and is
the only party that knows how it is going. `processing_jobs.upload_progress_percent`
(nullable `smallint`, 0–100) is written coarsely — **on a 2-point move or every 60
seconds, whichever comes first**.

That rule replaced `pct % 10 === 0`, which had a real bug: a chunk boundary that stepped
over a multiple of ten skipped the write entirely. On a slow upload enough skips in a
row is 15 minutes of silence, and the reaper marks the job failed underneath an upload
that is still running. The 60-second floor is what makes that impossible regardless of
chunk size.

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

The pipeline is server-side and database-backed. Nothing about storage, the webhook,
quota or job state depends on how a component looks, what it is called, or where it
renders. Restyling, re-laying-out, splitting or renaming presentational components
cannot break the integration.

| Layer | Files | Safe to redesign? |
|---|---|---|
| Wizard presentation | `new-match-wizard/{ConfirmContent,DetailsContent,ProviderContent,ScoreCell,StepIndicator,UploadContent,VideoMetaFields,VideoStepContent,styles}.tsx` | **Yes, freely** |
| Matches list & detail | everything under `components/dashboard/matches/` except the wizard hook | **Yes, freely** |
| Wizard orchestration | `new-match-wizard/useUploadMatchWizard.ts` | **Careful — see below** |
| Everything server-side | `api/splitstep/`, `api/webhooks/splitstep/`, `lib/services/splitstep/`, `lib/services/upload/`, `supabase/functions/` | Untouched by UI work |

### The one file to be careful with

`useUploadMatchWizard.ts`, roughly **lines 780–930**. That block is the entire
browser-side upload contract, and it is four things in sequence:

1. `POST /api/splitstep/upload-url` → write SAS + blob name
2. `uploadFileInBlocks()` from `lib/services/upload/azure-block-upload.ts` — the chunked
   transfer. **XHR, not `fetch`, deliberately**: `fetch` still has no upload-progress
   event, and progress is the whole point
3. its `onProgress` callback → writes `upload_progress_percent`
4. `video_object_key` written to the job row, `status: 'uploaded'`

Four rules keep it working no matter what the UI looks like:

- **Never log the SAS URL.** It is a six-hour write credential, and the browser console
  outlives the upload — it survives screen shares, extensions, and anyone opening
  devtools. Log the blob name, which is what you want when debugging anyway.
- **Keep writing `upload_progress_percent`.** Stop and the reaper (§7) fails the job
  after 15 minutes of silence — the progress write *is* the heartbeat.
- **Keep the `beforeunload` guard around the whole transfer.** The wizard has already
  closed by then, so it is the only thing telling the user the work is not finished.
- **The upload outlives the wizard.** It continues in the background after the user
  navigates away. If you change navigation or unmount behaviour, verify a large upload
  still completes.

Everything else in that file — step order, copy, validation messages, which fields
appear on which step — is presentation and can move freely.

### Two UI gaps worth fixing during the redesign

- ~~**There is no toast or banner system.**~~ **Closed** on
  `claude/pilot-program-roadmap-724bdb`. `ToastProvider` wraps the dashboard shell and
  `UploadFailureListener` subscribes to `match-upload-failed`, which had been dispatched
  from three places to nobody. Errors do not auto-dismiss; success and info do.
- ~~**The matches list does not live-update.**~~ **Already false when this was
  written.** `useLiveMatchAnalysis` drives the matches list, the activity tray and the
  match page's progress panel. A job moving `queued → processing → completed` updates in
  place.

---

## 10. Known gaps

Three gaps in the earlier version of this doc are now closed — HMAC auth, the download
ordering, and match-deletion cleanup. What remains is almost entirely vendor-side.

**Blocking, on the vendor:**

- **`SPLITSTEP_API_URL` and `SPLITSTEP_API_KEY` are not yet in hand.** The key and the
  webhook secret are being sent in separate emails, the link valid two days and
  single-use. Nothing has been submitted end-to-end; everything downstream of submission
  has only been exercised against the local harness.
- **The 8,000,000,000-byte size limit is unconfirmed for our account.** Their docs mark
  it "Enforced"; an earlier call put it at 10–12 GB. `MAX_VIDEO_SIZE_BYTES` takes the
  documented number, because rejecting at the file picker is recoverable and having the
  vendor refuse an uploaded file is not. Ask before raising it back.
- **Phase 2 (derivation) is gated on three answers** — see §11.

**Ours, not blocking:**

- **~~Nothing calls `POST /api/splitstep/jobs`.~~** Closed. The wizard submits automatically
  once the upload finishes, and a submit failure leaves the job at `status: 'uploaded'`
  rather than marking it failed, so a retry needs nothing re-uploaded.
- **Playback is not wired.** We now keep the vendor's trimmed video (§3), but nothing
  renders it: `MatchVideoPanel` is orphaned and built for the upload flow, and the
  `matches/[matchId]/video/` route CLAUDE.md describes does not exist. The asset is
  secured; showing it is a separate piece of work.
- **Trimmed videos are in Azure, and R2 would be cheaper.** Egress is the whole argument:
  ~$0.087/GB against R2's $0, with storage a wash. Azure won on the deadline, not on
  merit — a SAS expires and Azure→Azure copy is one server-side call, while Azure→R2
  means streaming gigabytes through a Worker. Revisit when playback lands, and note this
  is the reason Phase 4 (retire R2) is on hold rather than done.
- **The job status endpoint is unused, and now matters more.**
  `GET {BASE_URL}/jobs/{job_id}` is both the recovery path for a delivery lost to an
  outage *and* the replacement for `vendor_first_downloaded_at`, which the move to Azure
  stopped populating (§3). Nothing calls it yet.
- **`vendor_first_downloaded_at`, `vendor_last_downloaded_at` and `vendor_request_count`
  are now permanently null.** Only the Worker wrote them. Nothing in `src/` reads them,
  but `docs/ux-overhaul-brief.md` plans a "Processing" status on the first — that plan
  needs the job-status endpoint instead. The columns are left in place rather than
  dropped; decide once the replacement is wired.
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
| `AZURE_STORAGE_ACCOUNT` | Vercel, **per environment** | storage account name |
| `AZURE_STORAGE_KEY` | Vercel, **per environment** | account key. Signs **both** the browser's write SAS and the vendor's read SAS |
| `AZURE_STORAGE_CONTAINER` | Vercel, **per environment** | `advantage-videos` |
| `NEXT_PUBLIC_SITE_URL` | Vercel, **per environment** | builds the vendor's WebhookUrl. One value shared across Production and Preview means a preview hands them the production origin, where the route does not exist |
| `SPLITSTEP_WEBHOOK_SECRET` | Vercel | HMAC key, **issued by the vendor**. Unset = unsigned mode, which accepts anything |
| `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` | Vercel | `true` = fail-closed on a missing signature. **Set this once a real delivery confirms `X-HMAC-Signature`** |
| `SPLITSTEP_API_URL`, `SPLITSTEP_API_KEY` | Vercel | key issued by the vendor; still in transit |
| `CRON_SECRET` | Vercel | any long random string. Vercel sends it as `Authorization: Bearer <secret>` to `/api/cron/reclaim-videos`. **Unset = the reclaim never runs** and source videos accumulate |
| `R2_*` | — | **retired.** Still in `.env.example` until the R2 code is deleted; nothing reads them |

Note that the account key is the only credential and it does everything, which is why
the write SAS is scoped to `cw` on one blob name — that scope is the containment, not
the key.

Per-environment matters as much here as it does for `NEXT_PUBLIC_SITE_URL`. A Preview
deployment sharing Production's storage account is not a smaller problem than sharing an
origin: it is test uploads landing in the container real athlete video lives in.

`.env.example` carries names only, never values. Both vendor secrets arrive over a
single-use link — put them straight into Vercel, and never paste one into a terminal
where it lands in shell history.

---

## 13. Testing without the vendor

```bash
npx tsx scripts/splitstep-webhook-test.ts --url https://www.advantage-analytics.dev
```

Nine scenarios: queued → completed → duplicate → out-of-order → failed → unmatched →
malformed → wrong-secret → **valid signature over a tampered body**. It asserts what
actually landed in the database and the bucket, and it **signs payloads with a real
HMAC** rather than sending the raw secret, so it exercises the same path a vendor
delivery will.

Neither url on a completion is mocked: it uploads two fixtures to `match-results` and
signs them, one standing in for the results JSON and one for the trimmed video, so both
the download and the Azure server-side copy run over real HTTP. Because both happen in
`after()`, the assertions poll rather than checking immediately.

Everything it creates is removed on the way out — including a blob in the **real** videos
container. Without local `AZURE_STORAGE_*` it cannot verify or clean that blob, so it
skips the check and prints the key to delete by hand.

> Two traps this suite fell into itself, both worth not repeating: the
> `results_object_key` assertion read once instead of polling (`status` flips
> synchronously inside the RPC, so the wait it relied on returns before the download
> starts), and the duplicate-delivery body was a hand-maintained second copy that
> stopped being byte-identical the moment a field was added to the first. It is one
> `completionBody` const now, because "identical body" is that test's entire premise.

Last run: all green, `signature_verified: true`, results stored, trimmed copy confirmed
`success` in Azure.

> If every delivery comes back `signature_verified: false`, the deployed build predates
> the secret being set. Redeploy — Vercel injects env vars at deploy time. This has
> already caused one false "the test is broken" diagnosis.

`scripts/splitstep-submit.ts` submits one job by hand. It defaults to a **dry run** that
prints the payload in plain English — read it before spending a job. The two fields most
likely to be wrong are invisible when wrong: `InitialTopPlayer` is camera-relative at the
first frame (not player1), and `SetGameScores` is ordered top-player-first. Get either
backwards and every statistic is attributed to the wrong player with nothing looking off
in the UI.

### Testing the storage path without the vendor

The SAS mint is verifiable on its own, and it is worth doing before spending a job —
what the vendor does with the URL is exactly what `curl` does:

```bash
curl -sI "<the VideoUrl the dry run printed>"
```

`200` with a `content-length` matching the file means the vendor can fetch it. `403`
with `AuthenticationFailed` means the SAS is wrong, expired, or not yet valid — the last
of which is why every SAS is backdated five minutes for clock skew.

For the upload path, **test with a file over 256 MB.** Anything smaller commits in a
single block and proves nothing about chunking, which is the part that is new.

---

## 14. Gotchas that will each cost you an hour

Every one of these has already cost someone one.

**Migrations applied through the Supabase MCP get stamped with the MCP's own version,
not your filename's.** Files named `20260802000000` went live as `20260802083544`.
`supabase db push` compares by version, so it will happily try to replay migrations the
database already has. After applying through the MCP, read the version back out of
`supabase_migrations.schema_migrations` and rename the file to match. Ten older files
still carry this drift.

**A missing Azure CORS rule looks exactly like a network outage.** The browser blocks
the cross-origin PUT and reports an indistinguishable error with no CORS wording, so the
job fails with a message that points nowhere near the cause. It is the first thing to
check on a new storage account. (§4 lists the rule.)

**Azure's `deleteBlob` throws on 404, unlike S3.** Anywhere a delete runs in a loop, use
`deleteIfExists` and catch per key — the orphan sweeper aborts its whole run on the
first throw, so one already-deleted blob would silently stop the sweep. (§6.)

**A SAS that is "not yet valid" returns the same 403 as an expired one.** If the server
clock runs fast, a freshly minted SAS is rejected with `AuthenticationFailed` and
nothing indicates the start time is the problem. Every SAS here is backdated five
minutes for that reason; do not remove it.

**Anything added to `processing_jobs_status_check` must also be added to
`splitstep_status_rank()`.** They are two halves of one state machine and nothing
enforces agreement. This already broke once: `deriving` was added to the constraint but
not the rank function, fell to the `else -1` branch, and a late `queued` retry dragged a
mid-derivation job backwards.

**No root `middleware.ts` exists**, so the webhook route is reachable today. If anyone
ever adds one, note that `publicPaths` in `src/lib/supabase/middleware.ts:43` does
**not** include `/api/webhooks` — an unauthenticated vendor POST would 307 to `/login`.
Their side sees a redirect; you see nothing.

**Don't route a test video through `src/lib/video/compress.ts`.** It transcodes to 720p
(`-vf scale=-2:720`), which is under the vendor's 1080p floor.

**The repo is public.** It was made public to enable Vercel git auto-deploy on Hobby.
Every commit is world-readable — secrets in env only, and never commit a test video or
its URL.

**Vercel injects env vars at deploy time**, and `NEXT_PUBLIC_*` values are inlined at
build. Changing one in the dashboard does nothing until you redeploy. A mismatched
`STRIPE_WEBHOOK_SECRET` once let payments succeed silently without upgrading the plan;
the same failure shape applies here.
