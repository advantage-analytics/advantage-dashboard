-- record_splitstep_webhook(): the match-id fallback now handles exactly one
-- case, a vendor re-queue, and moves the job onto the new vendor id.
--
-- The vendor echoes our MatchID as `video_id`, which the parser now reads
-- (webhook-payload.ts MATCH_ID_KEYS). Job 2fe79546 was re-queued after a
-- vendor restart as faaa1186, and its completion orphaned because nothing
-- read `video_id` and nothing knew the new id.
--
-- With `video_id` read, the old fallback would also fire on the submit race —
-- a delivery that lands before /api/splitstep/jobs writes external_job_id —
-- and the route's unguarded `status: 'queued'` write would then move a job
-- that delivery had already failed back to queued. So the fallback links only
-- a job that is still in flight (queued/processing) and already holds a
-- DIFFERENT vendor id. A race delivery (no id yet) orphans as it always has
-- and adoptOrphanedDeliveries() replays it after the queued write, under the
-- rank guard. A terminal job is never relinked, so a stray delivery cannot
-- land on a finished or superseded row.
--
-- On a re-queue the row takes the new id, so the reconciler polls, and the
-- cancel route DELETEs, the job the vendor is actually running. The fast path
-- found no row holding that id, so the unique index is not at risk outside a
-- concurrent duplicate delivery, which fails, is retried, and then takes the
-- fast path.
--
-- Body otherwise identical to the live function.
--
-- Applied to the live database via the Supabase MCP as
-- `splitstep_webhook_requeue_fallback`; this file carries the version the
-- live project recorded on apply.

create or replace function public.record_splitstep_webhook(
  p_fingerprint text,
  p_raw_body text,
  p_parsed jsonb,
  p_headers jsonb,
  p_signature_verified boolean,
  p_external_job_id text default null::text,
  p_event text default null::text,
  p_next_status text default null::text,
  p_sas_url text default null::text,
  p_trimmed_video_url text default null::text,
  p_error_message text default null::text,
  p_match_id uuid default null::uuid,
  p_error_code text default null::text,
  p_error_category text default null::text,
  p_error_step text default null::text,
  p_players_url text default null::text,
  p_trajectories_url text default null::text
)
returns table (
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

  -- Fall back to the match id we echoed on the request (the vendor's
  -- `video_id`), for a vendor re-queue only: the newest job for the match,
  -- still in flight, under a different vendor id. Anything else orphans —
  -- see the header for why the submit race must.
  if v_job.id is null and p_match_id is not null and p_external_job_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.match_id = p_match_id
     order by j.created_at desc
     limit 1;

    if v_job.id is not null
       and v_job.status in ('queued', 'processing')
       and v_job.external_job_id is not null
       and v_job.external_job_id <> p_external_job_id then
      update public.processing_jobs j
         set external_job_id = p_external_job_id
       where j.id = v_job.id;
      v_job.external_job_id := p_external_job_id;
    else
      v_job := null;
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
