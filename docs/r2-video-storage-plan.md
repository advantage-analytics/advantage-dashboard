# R2 video storage — Phase 0 findings and plan

**Status: Phase 1 built on this branch, 2026-11-09; not deployed.** Sections 1–3 record what
Phase 0 measured. Section 4 is the design you chose after it, and section 6 is what this
branch builds. The brief was `r2-video-storage-prompt-v2.md`.

**The one-line version:** only the playback copy (and the sample) moves to R2. Originals
stay in Azure for SplitStep and move to the Cold tier. R2 cannot pull from a URL, so every
byte copied from Azure to R2 is billed as Azure egress. Copying anything people rarely
watch costs about as much as it saves (§5).

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

## 4. Decided design (2026-11-09)

Decided after Phase 0: **only the playback copy, and the sample clip, go to R2.** Originals
stay in Azure and move to the Cold tier. The trimmed copy stays in Azure Hot for now. That
drops these parts of the brief:

- the original → R2 copy
- deleting the Azure copy after 14 days
- the R2 → Azure restage before resubmit, auto retry and reprocess

```
upload ─▶ Azure videos/ (Hot → Cold after 30 days) ─▶ SplitStep (Azure SAS, unchanged)
              │
              └─▶ Event Grid ─▶ playback worker ─▶ R2 playback/…  (R2_BUCKET_VIDEOS set)
                                               └▶ /api/webhooks/playback {store:"r2"}
                                                    → processing_jobs.playback_store
players: a ready copy with playback_store='r2' → HEAD + presigned GET on R2
         anything else → Azure, exactly as before
```

**Why this split:** see §5. The playback copy is the file nearly every view reads, so
moving it captures the saving for 1.4 GB of copy egress per match. Copying originals or
trimmed copies would cost about as much egress as it saves.

### Originals → Azure Cold (applied by you, not by code)

This is an Azure lifecycle-management rule on the storage account:

- filter: `blobTypes: blockBlob`, `prefixMatch: advantage-videos/videos/`
- action: `tierToCold` at `daysAfterModificationGreaterThan: 30`

Cold blobs stay online, so SplitStep's SAS URL, resubmits and reprocess all work unchanged.
Reads cost $0.01/GB and there is a 90-day early-delete charge. You apply this rule from your
own terminal; this branch does not apply it. One way to do it:

```bash
az storage account management-policy create --account-name advantagedashboardca \
  --resource-group advantage-dashboard --policy @policy.json
```

with `policy.json`:

```json
{
  "rules": [
    {
      "enabled": true,
      "name": "originals-to-cold",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["advantage-videos/videos/"]
        },
        "actions": {
          "baseBlob": {
            "tierToCold": { "daysAfterModificationGreaterThan": 30 }
          }
        }
      }
    }
  ]
}
```

`management-policy create` replaces any existing policy. The account has none today, but
check with `az storage account management-policy show` first.

### Data model

One additive column, in `supabase/migrations/20261110040000_processing_jobs_playback_store.sql`
(**not applied**; it is waiting for your review):

- `processing_jobs.playback_store text check (playback_store in ('azure','r2'))`. Null means Azure.
  - A per-object table was considered in Phase 0. It is not needed now: only the playback copy moves, and `applyPlaybackReport` already writes every job sharing an upload in one statement.
  - The resubmit insert copies the store along with the key.
- Trigger `processing_jobs_guard_playback_store`:
  - It clears the store when the upload key changes, as `processing_jobs_guard_storage_keys` does for the copy.
  - It refuses client writes. `authenticated` holds table-level UPDATE, so a column revoke would not bite.

The app reads the column with a fallback: a read that fails with `42703` (column missing)
retries without it. So the migration can go out before or after the code. Remove the
fallback (`PLAYBACK_JOB_COLUMNS_BEFORE_STORE`) once the migration is everywhere.

## 5. Cost

Prices used:

- Azure bandwidth: $0.087/GB after 100 GB/month free (account-wide).
- R2 storage: $0.015/GB-month after 10 GB free; downloads $0.
- Azure Hot LRS: about $0.02/GB-month.

Azure → R2 copies are billed as Azure egress, because R2 cannot pull from a URL.

**Per new analysed match**, using October's ~4.5 GB viewed per match:

| Copy to R2                                | Azure egress to copy | Viewing egress removed | Net per match    |
| ----------------------------------------- | -------------------- | ---------------------- | ---------------- |
| **Playback copy only (decided)**          | 1.4 GB ($0.12)       | ~4.5 GB ($0.39)        | **saves ~$0.27** |
| Playback + trimmed                        | 2.5 GB               | ~4.5 GB                | saves ~$0.17     |
| Playback + trimmed + original (the brief) | 5.0 GB ($0.43)       | ~4.5 GB                | costs ~$0.04     |

**After the change (October volumes):**

- **Bandwidth:** Azure bandwidth falls from ~$13.6 to about **$5**. SplitStep downloads, CLI downloads and the playback copy's upload to R2 remain.
- **Originals in Cold:** ~$0.45/month for today's 124.6 GB, against ~$2.5 in Hot.
- **R2 storage:** ~$1/month for today's 67.7 GB of playback copies, growing ~$0.7/month.
- **Backfill:** copying today's `playback/` to R2 is 67.7 GB, about $5.9 of egress, once. It can be spread with `--limit`.

The playback worker image on ACR (~$5/month) is unchanged.

## 6. Phase 1: what this branch builds

| Piece                    | Where                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 signing, HEAD, delete | `src/lib/services/video-storage/r2.ts`. SigV4 presign is hand-rolled and synchronous, checked byte-for-byte against `@smithy/signature-v4` in `tests/r2-presign.spec.ts`                                                                                                         |
| Store dispatch           | `src/lib/services/video-storage/stores.ts`: `mintStoredPlayback`, `storedObjectExists`, `mintSampleVideo`                                                                                                                                                                        |
| Chooser                  | `choosePlaybackFile` returns `store`, and its existence check takes the store. A borrowed copy keeps its maker's store                                                                                                                                                           |
| Readers                  | `getMatchVideo` / `getSharedMatchVideo` (match, share, admin, Ask), `loadJobVideo` (label console, 8 h) and the sample page and route                                                                                                                                            |
| Worker                   | `workers/playback/run.sh` uploads with `rclone` to R2 when `R2_BUCKET_VIDEOS` is set and reports `store`. `deploy.sh` passes the **write** key pair as Container Apps **secrets**. The Dockerfile adds `rclone`                                                                  |
| Webhook                  | `playback-copy.ts`: `parsePlaybackReport` accepts `store` (`azure` when absent, refusing anything unknown). Every `ready` write sets `playback_store`                                                                                                                            |
| Resubmit                 | A child job inherits `playback_store` with the copy                                                                                                                                                                                                                              |
| Purge                    | Match and account delete also remove playback copies from R2                                                                                                                                                                                                                     |
| Backfill                 | `scripts/backfill-playback-to-r2.ts`. Dry run by default; `--apply`, `--limit`, `--sample`. Resumable. Checks every part's MD5 against R2's ETag and the final size. Never deletes the Azure copy                                                                                |
| Redaction                | `safeErrorMessage` also drops bare `sig=` / `X-Amz-Signature=` / `X-Amz-Credential=`                                                                                                                                                                                             |
| Config                   | `.env.example`: `R2_ACCOUNT_ID`, `R2_BUCKET_VIDEOS`, the read pair `R2_READ_ACCESS_KEY_ID`/`R2_READ_SECRET_ACCESS_KEY` (Vercel), the write pair `R2_WRITE_*` (worker and backfill only, never Vercel), `SAMPLE_VIDEO_STORE`. `@aws-sdk/client-s3` is in `serverExternalPackages` |

Behaviour notes:

- Caching is unchanged:
  - The R2 URL is pinned to the same six-hour window as the Azure SAS, so it is identical across page loads within a window.
  - It carries `response-cache-control=private, no-cache`.
  - The label console keeps its 8 h TTL; R2's ceiling is 7 days.
- No CORS rule is needed: no `<video>` sets `crossOrigin`, and nothing reads a canvas back.
- **Falling back is the default.** A copy marked R2 that R2 cannot confirm, for example on a deployment without R2 configured, is skipped, and the player plays the upload from Azure.
- The Azure `playback/` copies stay where they are. Deleting them (~67.7 GB, ~$1.35/month Hot) is a separate, later step, after the backfill has run and playback from R2 is confirmed.

### Rollout order

1. **You:** create the R2 bucket (private) and two tokens scoped to it:
   - the app's, Object Read & Write
   - the worker's, Object Read & Write
2. **You:** review and apply the migration.
3. Set the four `R2_*` in Vercel (Production), and deploy this branch once it has merged through `splitstep-integration`.
4. Rebuild and push the worker image, then run `deploy.sh` with the worker token's `R2_*`. New copies now land in R2.
5. `npx tsx scripts/backfill-playback-to-r2.ts` (dry run), then `--apply --limit 3`. Check those matches play, then `--apply` the rest, and `--sample` with `SAMPLE_VIDEO_STORE=r2`.
6. **You:** apply the Cold lifecycle rule above.
7. After a few weeks: compare Azure egress (Metrics → Egress by API name and Authentication), then decide on deleting the Azure `playback/` copies.

## 7. Risks

1. **Delete with the read token only.** Vercel holds only the read token, so deleting a match or an account cannot remove its R2 playback copy. The purge logs the count, and `scripts/cleanup-orphan-storage.ts` has to learn R2 to sweep them (follow-up). This is a privacy gap on account delete until that sweep exists or a delete-capable token is given to the app.
2. **rclone's upload from the worker** is not exercised until the image is rebuilt and one upload runs through it.
3. **Revocation is unchanged.** As with an account-key SAS, a presigned URL cannot be withdrawn before it expires. Rotating the token kills all of them.
4. **The 8 h label URL** is embedded in HTML and never refreshed, exactly as with Azure today.
5. **Metrics gap:** Azure shows no egress before 10-10. Enable Storage diagnostic logs for a month if exact per-caller attribution is wanted.

## 8. Follow-ups

- **Label console uses the playback copy instead of trimmed.** `loadJobVideo` prefers `vendor-copy` while a job has no playback copy, but after the playback copy it already plays that. If nothing needs the vendor's cut, trimmed copies can go to Cold too.
- Delete the Azure `playback/` copies once R2 playback is confirmed.
- Remove `PLAYBACK_JOB_COLUMNS_BEFORE_STORE` and the 42703 fallbacks once the migration is everywhere.
- Teach `scripts/cleanup-orphan-storage.ts` to sweep R2 `playback/`.
- Stale text elsewhere:
  - The `azure-sas.ts:26-28` header and the `azure-storage` skill's layout line.
  - The 5.92 GB orphan in `videos/`.
- Spike 1 (R2 → Azure restage) and spike 3 (R2 copy over 5 GB) are no longer needed under this design. Their scripts stay in the shared notes folder in case the restage path ever returns.

## Live R2 checks (2026-11-09, bucket `advantage-video`)

These were run against a 120 s, 720p H.264 test file (43.6 MB) under `spike-r2/`, which
was deleted afterwards. URLs came from this branch's `mintR2Playback`, signed with the read
token.

| Check                                                       | Result                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| Two mints in one window                                     | identical URL                                           |
| `Range: bytes=0-1023`                                       | 206, `Accept-Ranges: bytes`, `Content-Type: video/mp4`  |
| `response-cache-control` honoured                           | yes: `Cache-Control: private, no-cache`                 |
| Seek to the middle (range)                                  | 206 with the right `Content-Range`                      |
| Revalidate with `If-None-Match: <etag>`                     | 304                                                     |
| HEAD with the GET URL                                       | 403 (as expected: the server uses the SDK's HEAD)       |
| SDK HEAD with the read token (`r2ObjectExists`)             | true for the object, false for a missing key            |
| Tampered signature / same signature on another key          | 403 / 403                                               |
| 8 h label URL                                               | 206                                                     |
| Headless Chrome `<video>`: metadata, seek to 90 s, play     | duration 120.0 s, played on from 91.5 s, `readyState` 4 |
| `PutObject` `If-None-Match: *` over an existing key (write) | 412                                                     |

The film player, `/label` and the seek-lane preview all set `src` to this URL on a plain
`<video>`, so the headless check covers them. Playing a real match from R2 waits on the
first R2-backed copy.

Not run:

- **The 8 GB R2 → Azure Put Block From URL timing.** It only matters if trimmed copies or a restage path come back. Run `r2-spikes/spike-restage-8g.mjs` in the shared notes folder with the `R2_*` exported in your shell. It builds the 8 GB object inside R2 with `UploadPartCopy`, so nothing is uploaded from your machine. It also tests `If-None-Match` on `CompleteMultipartUpload`.
