# R2 video storage — Phase 0 findings and plan

**Status: Phase 0, 2026-11-09.** Nothing in this document is built. It records what was
measured, what the spikes showed, and what needs a decision before Phase 1 starts. The
brief is `r2-video-storage-prompt-v2.md`.

**Read this first: the copies to R2 cost Azure egress.** R2 has no server-side "copy from
URL". Every byte moving from Azure to R2 streams out of Azure over the internet, and Azure
bills that at the same $0.087/GB as a browser download. The design as briefed copies the
original, the playback copy and the vendor's trimmed copy for every match: about 5 GB per
match. The dashboard currently reads roughly 4.5 GB per analysed match. So copying
everything uses up most of the saving (see [Cost](#cost)). Decision 1 under
[Open questions](#open-questions) is the one that matters most.

## 1. Code map (verified)

The earlier map was mostly right. Corrections are in **bold**.

### Playback (read) surfaces

Every surface returns a signed Azure URL. None of them proxies bytes.

| Surface                                                                                          | What it signs                                                                                           | TTL                            | Where the URL goes                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| `getMatchVideo` / `getSharedMatchVideo` (`src/lib/data/match-video-server.ts:489, :534`)         | Attachment if active, else `choosePlaybackFile` over the newest 5 jobs                                  | 30 min, snapped to 6 h windows | RSC/HTML: match, share, admin, sample pages |
| `loadJobVideo` (`src/lib/data/labels-server.ts:949-981`)                                         | `choosePlaybackFile` with prefer `vendor-copy`, so trimmed first                                        | 8 h (`:937`)                   | Label console HTML, never refreshed         |
| `GET api/matches/[matchId]/video`, `api/share/[token]/video`, `admin/matches/[matchId]/playback` | **Attachment lane only** (`match-video/playback.ts:173-325`). They return `{attachment:null}` otherwise | 30 min                         | JSON refresh                                |
| `api/sample-match/video`                                                                         | Constant `sample/match-v1.mp4` (`services/sample-match/video.ts:66`)                                    | 30 min                         | JSON                                        |
| `/api/ask/show` (`route.ts:222`)                                                                 | Through `getMatchVideo`                                                                                 | 30 min                         | JSON                                        |
| **Missed:** `src/lib/data/ask-server.ts:623`                                                     | Calls `getMatchVideo` per linkable match only to test that a video exists (HEADs plus a mint)           | n/a                            | not returned                                |

- **Signing.** `mintPlaybackSas` (`splitstep/video-url/azure-sas.ts:313-345`) snaps expiry to a 6 h boundary (`playbackSasWindow`, `:288`). It signs `rscc=private, no-cache` only when `stable`. The attachment copy source uses `stable:false` with a 1 h TTL.
- **`choosePlaybackFile`** (`src/lib/data/match-video-choice.ts:61-121`) works through each job in this order:
  1. A ready `playback_object_key`, also borrowed from a sibling job with the same `video_object_key`.
  2. With prefer `vendor-copy`: `trimmed_object_key`.
  3. `video_object_key`.
  4. With prefer `upload`: `trimmed_object_key`, with no HEAD.

  Each candidate except the last costs a HEAD (`BlockBlobClient.exists()`), so up to 3 per job.

- **Seek-lane preview** (`film/use-seek-preview.ts:26-40, :245`) is a second muted `<video>` on the same `src` with `preload="metadata"`.
- **No `crossOrigin` attribute appears anywhere in `src/`.** `drawImage` from a remote video occurs in `film-fullscreen.tsx:1071` and `admin/labels/label-video.tsx:190`, but nothing reads the canvas back. So **R2 needs no CORS rule for playback.**

### Writes

| Writer                   | Key                                                                                                                           | Mechanism                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SplitStep upload         | `videos/{uid}/{match}/original.ext` (`splitstep/object-keys.ts:44-50`)                                                        | Browser PUTs blocks with a `cw` SAS (6 h)                                                                                                                                                                                                                 |
| Attachment ("Add video") | `match-video/{match}/{attachment}/staged[.ext]` then `…/final[.ext]`. **Built in SQL** (`migrations/20260925023004…:307-310`) | Browser upload. **`probe.ts:233-252` does ranged server-side reads** of staged and final. Promotion is a same-container `beginCopyFromURL` with `ifNoneMatch:"*"` and a source `ifMatch` (`storage.ts:200-206, 426, 506`)                                 |
| Vendor trimmed copy      | `trimmed/{uid}/{match}/{job}.mp4` (`object-keys.ts:184-189`)                                                                  | **Azure async copy pulls straight from the vendor URL** (`vendor-archive.ts:295-309`). Started by the webhook; `archive-vendor-files` cron retries it                                                                                                     |
| Playback worker          | `playback/{uid}/{match}/original.mp4` (`run.sh:76`, `--overwrite`)                                                            | Event Grid `BlobCreated` on `videos/`, for `PutBlockList`, `PutBlob` and **`CopyBlob`**. Goes through a storage queue, KEDA, then a Container Apps job (user-assigned identity). Reports to **`/api/webhooks/playback`** (`run.sh:19`'s comment is stale) |

### Deletes

- `purge-match-storage.ts:334-360` deletes the job keys, deduped, and skips keys another match shares. It runs on match delete, account delete and console abandon.
- `match-video/cleanup.ts` deletes attachment blobs through `deleteAttachmentBlob` (`storage.ts:589`). It runs from the cron and from `remove.ts` / `purge.ts`.
- `scripts/cleanup-orphan-storage.ts` knows only `videos/`, `playback/` and `trimmed/`.
- `reap-stalled-uploads` deletes no blobs.
- **No code deletes `videos/` originals after a job completes.** The policy is retired (`webhooks/splitstep/route.ts:447`). The `azure-sas.ts:26-28` header and the `azure-storage` skill's layout line are stale; the real layout is `videos/{uid}/{match}/…`.

### Key columns (live schema)

| Table                                                                      | Column                                                                                       | Store                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| `processing_jobs`                                                          | `video_object_key`, `trimmed_object_key`, `playback_object_key` (+ `playback_status`)        | Azure                    |
| `processing_jobs`                                                          | `results_object_key`, `players_object_key`, `trajectories_object_key`, `label_backup_keys[]` | Supabase Storage. Stays. |
| `match_video_attachments`                                                  | `staged_blob_key`, `final_blob_key`                                                          | Azure                    |
| `label_sessions`, `label_transcript_cache`, `splitstep_webhook_deliveries` | `results_object_key` (+ `trajectories_object_key`)                                           | Supabase Storage. Stays. |
| (constant)                                                                 | `sample/match-v1.mp4`                                                                        | Azure                    |

**`video_object_key` is shared across a chain.** 27 keys are used by more than one job (up to 4), and `applyPlaybackReport` updates every row with the same source key. Store state therefore belongs to the **object**, not the job row (see §4).

### Retry rules (unchanged by this work)

- `MAX_TOTAL_ATTEMPTS = 3` (`match-analysis.ts:365`); one automatic retry per chain (`resubmit-job.ts:569-576`).
- Reprocess skips the ceiling (`:555`).
- `video_unavailable` refusals: `:491`, `:520`, `:640`, `:648`. The HEAD is `io.blobExists` (`:594`).
- Admin reprocess (`api/admin/splitstep/reprocess`) → `resubmitJob({reprocess:true})`. It refuses `labelling`/`submitted` sessions unless forced (`handler.ts:175-250`).
- Auto-retry callers: the webhook, `reconcile.ts:965` (pg_cron every 10 min), `splitstep/jobs/route.ts:266`, and adopted deliveries.

### Other facts the plan relies on

- `safeErrorMessage` (`analytics.ts:92-100`) already replaces every `https?://\S+` with `[url]`, so an R2 URL is covered as long as it goes through that function.
- `serverExternalPackages` (`next.config.ts:39-44`) holds `@azure/storage-blob`; `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` join it.
- `.env.local` still has `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_PUBLIC_WORKER_URL` from the dropped setup. No code reads them and `.env.example` does not list them. There is no bucket variable.

## 2. Measurements

### Container `advantage-videos` (2026-11-09)

| Prefix         | Blobs   | GB         | Notes                                              |
| -------------- | ------- | ---------- | -------------------------------------------------- |
| `videos/`      | 51      | 124.55     | One 5.92 GB blob is referenced by no job (orphan)  |
| `trimmed/`     | 58      | 69.60      |                                                    |
| `playback/`    | 48      | 67.66      |                                                    |
| `sample/`      | 1       | 1.99       |                                                    |
| `match-video/` | **0**   | 0          | No "Add video" attachment is stored today          |
| **Total**      | **158** | **263.79** | All Hot tier. Largest blob 6.21 GB, median 1.43 GB |

New bytes per month (by `lastModified`):

| Month        | `videos/`          | `trimmed/`   | `playback/`                                |
| ------------ | ------------------ | ------------ | ------------------------------------------ |
| October      | 89.1 GB (36 blobs) | 33.7 GB (32) | 58.4 GB (43, including the 10-19 backfill) |
| November 1–9 | 20.5 GB (6)        | 30.8 GB (23) | 9.3 GB (5)                                 |

Per new match: original ≈ 2.5 GB, playback ≈ 1.4 GB, trimmed ≈ 1.1 GB.

### Egress by source (Azure Monitor, `Egress` metric, `ApiName=GetBlob`)

The Storage account has no diagnostic logs, so a caller cannot be named per request. The
`Authentication` split identifies callers well enough:

| Auth type                             | Who                                                                           | Oct 10–31              | Nov 1–9  |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- | -------- |
| `SAS` (account-key SAS the app mints) | Browsers (playback, label, share) **and SplitStep**                           | 220.2 GB               | 140.8 GB |
| `OAuth`                               | Playback worker (managed identity, same region, so free) + `az` CLI downloads | 131.2 GB (79 on 10-19) | 25.8 GB  |
| `DelegationSAS`                       | A one-off on 10-19                                                            | 112.8 GB               | 0.1 GB   |

- Metrics show nothing before 10-10, although the account dates from 2026-09-03.
- `az costmanagement query` failed on this subscription, so the billed GB could not be read.
  - At $0.087/GB past the free 100 GB, $13.57 means ≈ 256 GB of internet egress. That fits SAS 220 GB plus about 36 GB of CLI downloads.
  - To confirm: portal → Cost Management → Cost analysis, group by **Meter**, filter to service "Bandwidth".
  - The per-API split is at Storage account → Metrics → Egress, split by **API name** and then **Authentication**.

**SplitStep's share**, from `processing_jobs.submitted_at` joined to blob sizes. This
assumes one full download of `video_object_key` per submission. `StartTime`/`EndTime` do not
shrink the download.

| Window    | Submissions                   | Source GB | SAS GB | SplitStep share | Viewing (SAS − SplitStep)   |
| --------- | ----------------------------- | --------- | ------ | --------------- | --------------------------- |
| Oct 10–31 | 32                            | 77.0      | 220.2  | ~35%            | **~143 GB** (~200 GB/month) |
| Nov 1–9   | 20 (23 resubmits in November) | 54.5      | 140.8  | ~39%            | **~86 GB** (~290 GB/month)  |

Viewing egress is growing. It works out to roughly **4.5 GB read per analysed match** in
October.

Job counts (93 jobs):

- Status: 69 completed, 17 failed, 4 queued, 1 processing, 2 uploaded.
- `attempt_count`: 80 at 1, 12 at 0, 1 at 2.
- `auto_resubmitted`: 2 jobs.
- `playback_status`: 78 ready, 4 failed.

## 3. Spikes

The scripts are throwaway and live outside the repo, in the shared notes folder
`r2-spikes/`: `spike1-restage.mjs`, `spike2-presign.mjs`, `spike3-r2-copy.mjs`, plus a
`package.json`. Run `npm i` there. Each script prints no URLs and writes only under
`spike-r2/`, which is outside the `videos/` Event Grid filter, and deletes what it wrote.

### Spike 1: R2 → Azure restage

Tested against Azure with non-Azure, query-string-signed stand-in sources. No R2
credentials were available (see [What's needed](#whats-needed-to-finish-the-spikes)).

- **Put Block From URL works with a non-Azure URL.** 100 MiB from an external host was staged and committed as one block in **3.1 s** (~34 MB/s).
  - AzCopy uses the same call for S3 → Blob with S3 presigned URLs, so an R2 presigned GET (SigV4, `SignedHeaders=host`) is expected to pass.
  - That still needs one live run.
- **Async Copy Blob accepts a non-Azure source but failed reading both test hosts.**
  - jsdelivr returned `412 PreconditionFailed`. Azure sends conditional reads while copying, and that CDN's ETags vary by edge.
  - OVH returned `429`.
  - Cloudflare's speed endpoint answered `403 CannotVerifyCopySource`.
  - R2 handles conditional GETs correctly, so this may work against R2. **Do not depend on it.**
- **Recommendation: chunked Put Block From URL.**
  - 100 MiB blocks: 80 calls for 8 GB. The limits are 4000 MiB per block and 50,000 blocks.
  - Each call is synchronous, so the R2 URL only has to outlive one block call. A 1 h presign is plenty, or re-mint per block.
  - Uncommitted blocks survive 7 days, so a cron can stage blocks across several invocations (`maxDuration` 300 s) and commit at the end. Nothing has to hold one long request open.
  - An 8 GB end-to-end time from R2 was **not measured**. Extrapolating 34 MB/s per stream with 8 in parallel gives about 1–4 min.
- **Trap: restaging into `videos/` re-fires the playback worker.**
  - The Event Grid filter matches `PutBlockList`, `PutBlob` and `CopyBlob` under `videos/`, so a restage commit transcodes again.
  - `run.sh` then overwrites `playback/` with `--overwrite` and calls back.
  - Phase 3 must stop this: mark restaged blobs with metadata and skip them in `run.sh`, or have the worker check that the playback copy already exists.

### Spike 2: R2 presigned GET

Run offline with dummy credentials. SigV4 signing is local.

- **Stable 6 h window: yes.** `getSignedUrl(..., { signingDate, expiresIn })` with `signingDate = windowEnd − 6h − ttl − 5 min` and `expiresIn = windowEnd − signingDate` is the same arithmetic as `playbackSasWindow`.
  - It gave a byte-identical URL for two mints 47 min apart and a different URL in the next window.
  - `X-Amz-Expires` is 23,700 s for the 30 min TTL and 50,700 s for the label console's 8 h. Both are well under R2's 7-day cap.
- **`response-cache-control`: signed into the query** (`response-cache-control=private, no-cache`).
  - Whether R2 honours the override on the response is **unverified live**. R2's S3-compatibility table should say; the spike prints the header.
- **Range and seeking:** R2 serves `Range` on GET as standard. The live script checks `206` + `Content-Range` at offset 0 and mid-file, plus a `304` on `If-None-Match`.
  - In-browser checks (film player, `/label`, seek-lane preview) were not run without a bucket. They need no code change, since `src` is just a URL.
- Facts that shape Phase 1:
  - A presigned URL is method-scoped. A GET URL answers HEAD with 403, so server-side existence checks must use the SDK's `HeadObject`, not the URL.
  - Presigned URLs work only on `<account>.r2.cloudflarestorage.com`, not on a custom domain.
  - SDK v3 adds `x-amz-checksum-mode=ENABLED` to presigned GETs. Cloudflare's own example shows the same, so it is accepted. Set `requestChecksumCalculation`/`responseChecksumValidation: "WHEN_REQUIRED"` on the client anyway.

### Spike 3: R2 copy over 5 GB and a no-overwrite guard

Answered from Cloudflare's docs; the live script is ready.

- **The question mostly falls away under the target design.**
  - Attachments still upload to and promote inside Azure. Moving them to R2 is an Azure → R2 **stream** (multipart `UploadPart` from bytes read out of Azure), not an R2 `CopyObject`.
  - An R2 → R2 copy over 5 GB only arises if promotion itself moves into R2.
  - If it does, `UploadPartCopy` is implemented: parts of 5 MiB–5 GiB, at most 10,000, all equal except the last.
- **No-overwrite guards:**
  - `PutObject` honours `If-None-Match: *` atomically: concurrent writers get exactly one success and the rest `412`.
  - `CopyObject` has R2's own `cf-copy-destination-if-none-match` (beta).
  - **`CompleteMultipartUpload` with `If-None-Match` is not documented for R2.** `spike3-r2-copy.mjs` tests it; every copy over 100 MB uses that path.
  - Until it is confirmed, guard with a `HeadObject` before `CreateMultipartUpload` plus the per-object lease in §4. The copier is the only writer of `video/`-class keys in R2, so last-writer-wins on identical bytes is safe.
- Multipart ETags are `md5-of-part-md5s-N`, not the object's MD5. Verify a copy by size plus a stored `x-amz-meta-content-md5` (Azure's `Content-MD5`, where set), or by recomputing part MD5s at the same part size.

## 4. Target flow and data model

```
upload ─▶ Azure videos/ ─▶ Event Grid ─▶ playback worker ─┬─▶ playback copy ──▶ R2 (Phase 1)
                      │                                   └─▶ /api/webhooks/playback (records store)
                      └─▶ SplitStep (Azure SAS, unchanged) ─▶ webhook ─▶ trimmed copy
chain final + playback ready ─▶ copier (cron or Container Apps job) ─▶ R2 (original, trimmed)
                              ─▶ Azure delete 14 days later (cleanup cron, lease)
resubmit / auto retry / reprocess ─▶ restage R2 ─▶ Azure (Put Block From URL) ─▶ SAS ─▶ SplitStep
readers: R2 if r2_verified_at, else Azure
```

**Recommendation: one row per stored object, not per job column.** Two facts rule out the
simpler options:

- Keys are shared across chains (27 of them) and the playback key is borrowed between jobs, so the same state would have to be kept in sync on several rows.
- During the 14-day window an object lives in **both** stores, so a key-prefix rule cannot express where it is.

```sql
create table public.video_objects (
  object_key        text primary key,          -- same key in both stores
  kind              text not null check (kind in ('original','playback','trimmed','attachment','sample')),
  size_bytes        bigint not null,
  content_md5       text,                      -- base64, from Azure Content-MD5 when present
  r2_verified_at    timestamptz,               -- set only after size (+md5) match
  r2_etag           text,
  azure_present     boolean not null default true,
  azure_expires_at  timestamptz,               -- chain final + 14 days; reset by restage
  azure_deleted_at  timestamptz,
  copy_lease_token  uuid, copy_lease_until timestamptz,   -- same pattern as match_video_claim_cleanup
  copy_attempts     int not null default 0, copy_last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- RLS on, no policies: service role only. Readers call a server loader, never the table.
```

- **Reading:** `choosePlaybackFile`'s `exists()` becomes "a `video_objects` row with `r2_verified_at` → R2 `HeadObject`; else Azure `exists()`". `mintPlaybackSas` gains an R2 twin with the same window arithmetic.
- **Expiry:**
  - `azure_expires_at = max(completed_at / failed-final time over the chain) + 14 days`. A chain is final when no job is `queued`/`processing`/`uploaded`, and either one completed or attempts reached the cap.
  - Deletion also requires `r2_verified_at is not null` and no `label_sessions.status in ('labelling','submitted')` for the match.
- **Attachments:** a `video_objects` row with `kind='attachment'` keyed by `final_blob_key`, made when the row goes `active`. The expiry sweep and `cleanup.ts` then delete from whichever store holds it.

## 5. Cost

Prices: Azure bandwidth $0.087/GB after 100 GB/month free (account-wide); R2 storage
$0.015/GB-month after 10 GB free, egress $0; Azure Hot LRS about $0.02/GB-month.

**Per new analysed match**, using October's ~4.5 GB viewed per match:

| Copy to R2                                        | Azure egress to copy | Viewing egress removed | Net per match    |
| ------------------------------------------------- | -------------------- | ---------------------- | ---------------- |
| Playback copy only (worker writes straight to R2) | 1.4 GB ($0.12)       | ~4.5 GB ($0.39)        | **saves ~$0.27** |
| Playback + trimmed                                | 2.5 GB               | ~4.5 GB                | saves ~$0.17     |
| Playback + trimmed + original (the brief)         | 5.0 GB ($0.43)       | ~4.5 GB                | **costs ~$0.04** |

Notes on that table:

- SplitStep downloads alone (~100–180 GB/month) already use most of the free 100 GB, so copy bytes are billed at the margin.
- The vendor's trimmed copy currently comes in from the vendor for free (Azure pulls it). Streaming it from the vendor URL straight into R2, through a Container Apps job or a Cloudflare Worker, avoids that 1.1 GB of Azure egress per match.
- **Originals are the expensive part.** They are viewed only as a fallback, yet copying them costs ~2.5 GB of egress each.
  - The cheaper way to stop paying Hot storage for them is an Azure lifecycle rule that moves `videos/` blobs to **Cold** after 14 days of chain-final.
  - Cold is about $0.0036/GB-month, has a $0.01/GB read charge and a 90-day early-delete charge, and **stays online**: SplitStep can still read it with the same SAS.
  - That needs no restage and no R2 copy, and keeps the SplitStep contract byte-identical.

**One-time migration (Phase 4):**

- Copying all 263.8 GB, less the 5.9 GB orphan, is about $22 of Azure egress.
- Copying only `playback/` (67.7 GB) is about $5.9 and captures nearly all of the viewing saving.
- Spreading over months does not help while SplitStep uses up the free 100 GB.

**After the change (October volumes):**

- Azure storage drops from ~$5/month to under $1 for a 14-day window.
- R2 storage starts at ~$4/month and grows ~$1–2.5/month each month.
- Azure bandwidth, using the Oct 10–31 bytes (SplitStep 77 GB, CLI ~36 GB, 32 new matches):
  - "Playback only" bills ~158 GB, about **$5** (today ~$13.6).
  - "Copy everything" bills ~273 GB, about **$15**: no better than today.

The playback worker image on ACR (~$5/month) is unchanged.

## 6. Risks

1. **Copy egress outweighs the saving** if originals and trimmed copies are streamed out of Azure (§5).
2. **Restage re-triggers the playback worker** through Event Grid `CopyBlob`/`PutBlockList` on `videos/` (Spike 1).
3. **Shared keys:**
   - Deleting or restaging per job row would race with chain siblings and with matches that share a key (`purge-match-storage` already skips those).
   - The table keyed by object in §4 avoids this.
4. **8 h label URLs** are embedded in HTML and never refresh. An R2 presign with a pinned date at 50,700 s is fine, but labelling sessions longer than 8 h will still break, exactly as they do today.
5. **Revocation is unchanged.** As with Azure account-key SAS, a presigned R2 URL cannot be withdrawn before it expires; rotating the R2 token kills all of them. Use a **dedicated, object-read-only R2 token** for presigning, separate from the copier's write token.
6. **Unverified R2 behaviours:**
   - `response-cache-control` override
   - `If-None-Match` on `CompleteMultipartUpload`
   - Put Block From URL against a real R2 URL
   - 8 GB restage time
7. **Metrics gap:** Azure shows no egress before 10-10, and per-caller attribution relies on the `Authentication` split. Enable Storage diagnostic logs (StorageRead to Log Analytics; costs a little) for a month if exact attribution is wanted after Phase 1.
8. **`ask-server.ts:623`** calls `getMatchVideo` just to test existence. Once both stores exist, make it a `video_objects` lookup rather than doubling the HEADs.

## 7. Open questions

1. **What goes to R2?**
   - Recommended: the playback copy (and the sample), with trimmed streamed vendor → R2. Originals move to Azure **Cold** after 14 days instead of to R2.
   - This drops the restage path entirely, keeps SplitStep byte-identical, and saves the most.
   - The brief's decision was originals → R2 + delete Azure after 14 days. That works, but nets about $0 per match on bandwidth.
2. If originals do go to R2: **who runs the copier?** A Container Apps job next to the playback worker reads Azure for free in-region, but its upload to R2 is still billed egress. A Vercel cron cannot stream 6 GB inside 300 s, though it can drive staged Put Block From URL the other way for restage.
3. **Label console prefers the trimmed copy** (`vendor-copy`). Keep that? If label used the playback copy, trimmed would never need to be in R2.
4. R2 bucket name, and whether to reuse the old `R2_*` keys or mint new scoped tokens (recommended: new tokens, one read-only for presign and one read-write for the copier and worker).
5. The 5.92 GB orphan in `videos/`: delete it via `scripts/cleanup-orphan-storage.ts --apply` before migrating? It needs your OK.

## What's needed to finish the spikes

- **R2:** an R2 API token pair (Object Read & Write, scoped to one bucket), the account ID and a bucket name, exported in a shell. `.env.local` has old `R2_*` keys, but the repo's secrets guard blocks reading them on purpose, and their bucket is unknown. Upload one real match video (> 5 GB for spike 3) to the bucket as `R2_TEST_KEY` / `R2_SRC_KEY`. Then:
  - `spike2-presign.mjs`: range, seek, `304`, HEAD behaviour, and whether `response-cache-control` is honoured.
  - `spike1-restage.mjs block` with `SRC_URL` set to a presigned R2 GET and `BYTES` set to the object size: the real 8 GB restage time.
  - `spike3-r2-copy.mjs`: `UploadPartCopy` over 5 GB and the three no-overwrite guards.
- **`az login`:** present (Owner + Storage Blob Data Contributor on the account). Nothing needed.
