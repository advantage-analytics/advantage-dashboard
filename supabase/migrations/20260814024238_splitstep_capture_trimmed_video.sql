-- Capture the vendor's trimmed video.
--
-- Their `job_completed` payload carries TWO urls: `sas_url` (the results JSON)
-- and `trimmed_video_url` ("Azure Blob SAS URL to the trimmed and re-encoded
-- video used for processing"). We consumed the first and dropped the second.
--
-- That was quietly destructive. The webhook deletes our own source video once
-- results are stored, and their url is a SAS with about a week on it, so a
-- successful job ended with NO video anywhere — and the trimmed one is the
-- better asset, being the match with dead time cut.
--
-- `processing_jobs.trimmed_video_url` has existed since the first splitstep
-- migration (20260802083544), written by nothing and read by nothing. The spec
-- asked for it — "as received; we do not adopt it as playback asset, but record
-- it" — and it never got wired. This wires it, and adds the column for where
-- OUR copy of the bytes lands, which is the part that actually survives.
--
-- Additive only. Nothing here touches the SwingVision path.

-- ---------------------------------------------------------------------------
-- 1. Where our copy lives
-- ---------------------------------------------------------------------------
--
-- Distinct from `trimmed_video_url` on purpose, and the distinction is the
-- whole point: that column is THEIR url and it expires, this one is OUR object
-- key and it does not. Recording the url without copying the bytes would have
-- looked like a fix for about seven days.
--
-- Key layout is `trimmed/{user_id}/{match_id}/{job_id}.mp4` — see
-- trimmedObjectKey() in src/lib/services/splitstep/object-keys.ts. Same shape
-- as the results key, so cleanup-orphan-storage.ts's "the match id is the third
-- path segment" rule still identifies an orphan.

alter table public.processing_jobs
  add column if not exists trimmed_object_key text;

comment on column public.processing_jobs.trimmed_object_key is
  'Object key of OUR copy of the vendor''s trimmed, re-encoded video, in the videos container. Null until the copy is started. Distinct from trimmed_video_url, which is the vendor''s expiring SAS to the same content.';

comment on column public.processing_jobs.trimmed_video_url is
  'The vendor''s SAS url to their trimmed, re-encoded video, as received. Expires in about a week — recovery path only. The durable copy is trimmed_object_key.';

-- ---------------------------------------------------------------------------
-- 2. record_splitstep_webhook — now records the trimmed url too
-- ---------------------------------------------------------------------------
--
-- DROP before CREATE, deliberately. Adding a parameter produces an OVERLOAD
-- rather than replacing the function, and PostgREST resolves an overloaded name
-- by the argument names it is given — leaving both in place means a delivery
-- could silently land on the old body and lose the trimmed url, which is the
-- exact failure this migration exists to fix.
--
-- Everything else is unchanged from 20260805005801: same idempotency on all
-- three axes (fingerprint, status rank, payload containment), same fallback
-- match on the echoed MatchID, same table qualification on every column.

drop function if exists public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, uuid
);

create or replace function public.record_splitstep_webhook(
  p_fingerprint text,
  p_raw_body text,
  p_parsed jsonb,
  p_headers jsonb,
  p_signature_verified boolean,
  p_external_job_id text default null,
  p_event text default null,
  p_next_status text default null,
  p_sas_url text default null,
  -- Their SAS to the trimmed video. Recorded for recovery; the bytes are copied
  -- separately by the route, which is what actually outlives the url.
  p_trimmed_video_url text default null,
  p_error_message text default null,
  -- Fallback link. We set `MatchID` on the job request ourselves, so an echoed
  -- copy is the one identifier in the payload whose name we control. If the
  -- vendor's job-id field turns out to be named something other than the docs
  -- say, this is what still attaches the delivery to a job.
  p_match_id uuid default null
)
returns table (
  delivery_id uuid,
  matched_job_id uuid,
  match_id uuid,
  created_by uuid,
  job_status text,
  results_object_key text,
  already_stored boolean,
  -- So a redelivery does not start a second copy of a video we already have.
  trimmed_object_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.splitstep_webhook_deliveries%rowtype;
  v_job public.processing_jobs%rowtype;
begin
  -- 1. Record the delivery. The no-op UPDATE is what makes RETURNING fire on
  --    conflict, so a retry gets back the row it created the first time.
  insert into public.splitstep_webhook_deliveries as d (
    fingerprint, raw_body, parsed, headers,
    signature_verified, external_job_id, event
  )
  values (
    p_fingerprint, p_raw_body, p_parsed, p_headers,
    p_signature_verified, p_external_job_id, p_event
  )
  on conflict (fingerprint) do update
    set received_at = d.received_at
  returning * into v_delivery;

  -- 2. Attach to a job, if one claims this vendor id.
  --
  -- Every column reference below is table-qualified. This function's OUT
  -- parameters include `match_id` and `created_by`, which are also column names
  -- on processing_jobs — unqualified, PL/pgSQL raises "column reference is
  -- ambiguous" at runtime, not at create time.
  if p_external_job_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.external_job_id = p_external_job_id
     limit 1;
  end if;

  -- Fall back to the match id we echoed on the request. Newest job wins: a match
  -- reprocessed after a failure has more than one job row, and the delivery
  -- belongs to the most recent submission.
  if v_job.id is null and p_match_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.match_id = p_match_id
     order by j.created_at desc
     limit 1;

    -- Claim the vendor id while we have it, so later deliveries take the fast
    -- path above. Guarded by the partial unique index on external_job_id.
    if v_job.id is not null
       and v_job.external_job_id is null
       and p_external_job_id is not null then
      update public.processing_jobs j
         set external_job_id = p_external_job_id
       where j.id = v_job.id
         and j.external_job_id is null;
    end if;
  end if;

  if v_job.id is null then
    -- Orphan. Deliberately not an error: the payload is what matters and it is
    -- already recorded above. The route logs this loudly and still returns 200,
    -- because a retry would orphan identically.
    return query
      select v_delivery.id, null::uuid, null::uuid, null::uuid,
             null::text, v_delivery.results_object_key,
             (v_delivery.results_object_key is not null),
             null::text;
    return;
  end if;

  -- 3. Advance the job.
  update public.processing_jobs j
     set status = case
           when p_next_status is null then j.status
           -- Never move backwards, and never off a terminal state.
           when public.splitstep_status_rank(p_next_status)
              > public.splitstep_status_rank(j.status)
             then p_next_status
           else j.status
         end,
         sas_url = coalesce(p_sas_url, j.sas_url),
         -- coalesce in this order so a later delivery without the field cannot
         -- blank a url we already hold, matching how sas_url behaves.
         trimmed_video_url = coalesce(p_trimmed_video_url, j.trimmed_video_url),
         error_message = coalesce(p_error_message, j.error_message),
         queued_ack_at = case
           when p_event = 'job_queued' then coalesce(j.queued_ack_at, now())
           else j.queued_ack_at
         end,
         completed_at = case
           when p_next_status in ('completed', 'failed')
             then coalesce(j.completed_at, now())
           else j.completed_at
         end,
         raw_webhook_payload = case
           when p_parsed is null then j.raw_webhook_payload
           when j.raw_webhook_payload @> jsonb_build_array(p_parsed)
             then j.raw_webhook_payload
           else j.raw_webhook_payload || jsonb_build_array(p_parsed)
         end
   where j.id = v_job.id
  returning * into v_job;

  -- 4. Link the delivery to the job it landed on.
  update public.splitstep_webhook_deliveries d
     set job_id = v_job.id
   where d.id = v_delivery.id;

  return query
    select v_delivery.id, v_job.id, v_job.match_id, v_job.created_by,
           v_job.status, v_job.results_object_key,
           (v_job.results_object_key is not null),
           v_job.trimmed_object_key;
end;
$$;

revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid
) from public;
revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid
) from anon;
revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid
) from authenticated;
grant execute on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. record_splitstep_trimmed_copy — where our copy landed
-- ---------------------------------------------------------------------------
--
-- Separate from the function above for the same reason finalize_splitstep_results
-- is: it runs AFTER the copy is started, in after(), and the envelope has to be
-- durable before any of that is attempted.
--
-- Only ever sets the key when it is currently null. A redelivery that got past
-- the route's guard must not repoint a job at a second copy and strand the
-- first.

create or replace function public.record_splitstep_trimmed_copy(
  p_job_id uuid,
  p_trimmed_object_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processing_jobs j
     set trimmed_object_key = coalesce(j.trimmed_object_key, p_trimmed_object_key)
   where j.id = p_job_id;
end;
$$;

revoke all on function public.record_splitstep_trimmed_copy(uuid, text) from public;
revoke all on function public.record_splitstep_trimmed_copy(uuid, text) from anon;
revoke all on function public.record_splitstep_trimmed_copy(uuid, text) from authenticated;
grant execute on function public.record_splitstep_trimmed_copy(uuid, text) to service_role;
