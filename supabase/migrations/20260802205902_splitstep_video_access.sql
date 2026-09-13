-- SplitStep video access — opaque token + vendor download log.
--
-- Implements the vendor URL strategy chosen in spec §3.2: option (b), a Worker
-- on our own domain fronting R2, rather than (a) an S3-style presigned GET.
--
-- Why (b), recorded here because the reasoning is not obvious from the schema:
--
--   1. The vendor downloads the video when a worker PICKS UP the job, not when
--      the job is submitted. They confirmed on the pilot call that they will not
--      change this. The URL therefore has to outlive an unbounded queue wait.
--   2. They declined to send a "processing started" webhook. Because they fetch
--      lazily, `vendor_first_downloaded_at` below IS that event — this download
--      log is the only processing-started signal we have.
--   3. There is no documented status endpoint (§5 Q5). Without a download log we
--      cannot tell "still queued" from "failed to fetch our file".
--
-- A SigV4 presigned URL could not have done this: hard 7-day expiry ceiling, no
-- revocation, and no visibility into whether the file was ever fetched.
--
-- Additive only. Nothing here touches the SwingVision path.

-- ---------------------------------------------------------------------------
-- processing_jobs — token + download log
-- ---------------------------------------------------------------------------

alter table public.processing_jobs
  -- Opaque high-entropy bearer token embedded in the URL handed to the vendor.
  -- Not derived from any identifier: it must not leak the match id, user id, or
  -- object layout. 32 random bytes, base64url.
  add column if not exists video_access_token text,
  add column if not exists video_token_issued_at timestamptz,

  -- Set when the token is retired. The Worker refuses a revoked token even if
  -- video_url_expires_at is still in the future — this is the kill switch that
  -- a presigned URL cannot offer.
  add column if not exists video_token_revoked_at timestamptz,

  -- First fetch of the video by the vendor. Stands in for the
  -- "processing started" webhook they declined to build.
  add column if not exists vendor_first_downloaded_at timestamptz,
  add column if not exists vendor_last_downloaded_at timestamptz,

  -- Counts HTTP requests, not distinct downloads. A ranged/resumed fetch of one
  -- video increments this many times; that is intentional, since a climbing
  -- count with no completion is itself a useful signal.
  add column if not exists vendor_request_count integer not null default 0;

comment on column public.processing_jobs.video_access_token is
  'Opaque bearer token in the vendor-facing video URL. Validated by the video-access Worker via resolve_video_access_token().';

comment on column public.processing_jobs.vendor_first_downloaded_at is
  'When the vendor first fetched the video. Proxy for "processing started" — they fetch lazily when a worker picks up the job and send no such webhook.';

comment on column public.processing_jobs.vendor_request_count is
  'HTTP request count against the video URL, including range requests. Not a distinct-download count.';

-- Token lookup is the Worker's hot path and must be unique.
create unique index if not exists processing_jobs_video_access_token_key
  on public.processing_jobs (video_access_token)
  where video_access_token is not null;

-- Finds jobs the vendor has never fetched — the stalled-job query from §3.5.
create index if not exists processing_jobs_awaiting_download_idx
  on public.processing_jobs (submitted_at)
  where vendor_first_downloaded_at is null;

-- ---------------------------------------------------------------------------
-- resolve_video_access_token — the Worker's single call
-- ---------------------------------------------------------------------------
--
-- Validates the token and records the fetch in one statement, so the log write
-- cannot be skipped by a caller that forgets it. Returns zero rows for a token
-- that is unknown, revoked, expired, or has no object key yet — the Worker maps
-- an empty result to 404 and never learns which of those it was.

create or replace function public.resolve_video_access_token(p_token text)
returns table (job_id uuid, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with resolved as (
    update public.processing_jobs j
       set vendor_first_downloaded_at = coalesce(j.vendor_first_downloaded_at, now()),
           vendor_last_downloaded_at  = now(),
           vendor_request_count       = j.vendor_request_count + 1
     where j.video_access_token = p_token
       and j.video_token_revoked_at is null
       and (j.video_url_expires_at is null or j.video_url_expires_at > now())
       and j.video_object_key is not null
    returning j.id, j.video_object_key
  )
  select resolved.id, resolved.video_object_key from resolved;
end;
$$;

-- Only the Worker (service role) may call this. Left open to `anon`, PostgREST
-- would expose it as a public RPC and turn it into a token oracle.
revoke all on function public.resolve_video_access_token(text) from public;
revoke all on function public.resolve_video_access_token(text) from anon;
revoke all on function public.resolve_video_access_token(text) from authenticated;
grant execute on function public.resolve_video_access_token(text) to service_role;
