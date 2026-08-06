# video-access Worker

Serves match videos to the analysis vendor. Deployed to Cloudflare, **not** to
Vercel — nothing in this directory is part of the Next.js build.

## What it does

The vendor receives `https://{worker-origin}/v/{token}` as the `VideoUrl` in a
job request. On each fetch this Worker:

1. Trades the opaque token for an R2 object key via the Supabase RPC
   `resolve_video_access_token()`, which **also records the fetch** in the same
   statement.
2. Streams the object out of the R2 binding, honouring `Range` requests.

Unknown, revoked, expired, and not-yet-uploaded tokens all return an identical
404, so a caller cannot probe which condition it hit.

## Why a Worker instead of a presigned URL

Recorded in full in `supabase/migrations/20260802205902_splitstep_video_access.sql`.
The short version:

- The vendor fetches the video when a worker **picks up** the job, not at
  submission, and will not change that. The URL has to outlive an unbounded
  queue wait; a SigV4 presigned URL is hard-capped at 7 days.
- They declined to send a "processing started" webhook. Because they fetch
  lazily, `processing_jobs.vendor_first_downloaded_at` — written by this Worker's
  RPC call — **is** that event.
- There is no status endpoint. Without this log there is no way to tell "still
  queued" from "failed to fetch our file".

## Deploying

Prerequisites: a Cloudflare account with R2 enabled, and `wrangler` authenticated
(`npx wrangler login`).

```bash
npm install
```

Create the buckets (names must match `wrangler.toml`):

```bash
npx wrangler r2 bucket create advantage-match-videos
```

```bash
npx wrangler r2 bucket create advantage-match-results
```

Set the secrets — these are prompted for, never passed on the command line:

```bash
npx wrangler secret put SUPABASE_URL
```

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Deploy:

```bash
npm run deploy
```

Take the origin `wrangler` prints and set it as `R2_PUBLIC_WORKER_URL` in the
Next.js app's environment (and in Vercel). The app appends `/v/{token}` itself.

## Watching the download log

```bash
npm run tail
```

Each vendor fetch logs a job id and byte range. The same information is on the
job row: `vendor_first_downloaded_at`, `vendor_last_downloaded_at`,
`vendor_request_count`.

To find jobs the vendor has not picked up yet:

```sql
select id, submitted_at, now() - submitted_at as waiting
from processing_jobs
where submitted_at is not null
  and vendor_first_downloaded_at is null
order by submitted_at;
```

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It lives only in Worker secrets and
  is used for exactly one RPC, which is itself revoked from `anon` and
  `authenticated`.
- The token is a bearer credential — it is never logged, and responses are
  `cache-control: private, no-store`.
- Revoke a token by setting `processing_jobs.video_token_revoked_at`, or from
  the app via `VideoUrlStrategy.revoke(jobId)`. It takes effect on the next
  request; there is no cache to wait out.
