-- SplitStep API change (September 2026): the completion webhook's `sas_url`
-- became `strokes_url`, and two per-frame datasets now arrive beside it —
-- `players_url` (player tracking) and `trajectories_url` (ball trajectory,
-- nullable). All three are 7-day SAS urls.
--
-- `sas_url` keeps its name and keeps holding the strokes url: renaming the
-- column would ripple through every reader for no gain. The new urls get their
-- own columns, and each downloaded file gets an object-key column so a
-- redelivery does not download it twice (the same role `results_object_key`
-- plays for the strokes file).
--
-- record_splitstep_webhook is DROPPED and recreated, not OR REPLACEd: the new
-- parameter list is a different signature, and two candidates differing only
-- in defaulted parameters make every PostgREST call ambiguous (same pattern as
-- 20260829174340).

alter table public.processing_jobs
  add column if not exists players_url text,
  add column if not exists trajectories_url text,
  add column if not exists players_object_key text,
  add column if not exists trajectories_object_key text;

comment on column public.processing_jobs.sas_url is
  'Vendor SAS url to the strokes JSON, as received (payload field strokes_url; sas_url before September 2026). Valid ~7 days.';
comment on column public.processing_jobs.players_url is
  'Vendor SAS url to the per-frame player tracking JSON (payload field players_url). Valid ~7 days.';
comment on column public.processing_jobs.trajectories_url is
  'Vendor SAS url to the per-frame ball trajectory JSON (payload field trajectories_url). Nullable on the vendor side. Valid ~7 days.';
comment on column public.processing_jobs.players_object_key is
  'match-results bucket key of the stored players JSON. Null until downloaded.';
comment on column public.processing_jobs.trajectories_object_key is
  'match-results bucket key of the stored trajectories JSON. Null until downloaded.';

drop function if exists public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid, text, text, text
);

create function public.record_splitstep_webhook(
  p_fingerprint text,
  p_raw_body text,
  p_parsed jsonb,
  p_headers jsonb,
  p_signature_verified boolean,
  p_external_job_id text default null,
  p_event text default null,
  p_next_status text default null,
  p_sas_url text default null,
  p_trimmed_video_url text default null,
  p_error_message text default null,
  p_match_id uuid default null,
  p_error_code text default null,
  p_error_category text default null,
  p_error_step text default null,
  p_players_url text default null,
  p_trajectories_url text default null
)
returns table(
  delivery_id uuid,
  matched_job_id uuid,
  match_id uuid,
  created_by uuid,
  job_status text,
  results_object_key text,
  already_stored boolean,
  trimmed_object_key text,
  players_object_key text,
  trajectories_object_key text
)
language plpgsql
security definer
set search_path to ''
as $function$
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
             null::text, null::text, null::text;
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
         players_url       = coalesce(p_players_url, j.players_url),
         trajectories_url  = coalesce(p_trajectories_url, j.trajectories_url),
         error_message = coalesce(p_error_message, j.error_message),
         error_code     = coalesce(p_error_code, j.error_code),
         error_category = coalesce(p_error_category, j.error_category),
         error_step     = coalesce(p_error_step, j.error_step),
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
           v_job.trimmed_object_key,
           v_job.players_object_key, v_job.trajectories_object_key;
end;
$function$;

revoke execute on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
