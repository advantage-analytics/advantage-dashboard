-- Vendor-id history on processing_jobs, so the re-queue fallback in
-- record_splitstep_webhook can recognise an id a job has given up even when
-- that id never delivered to it.
--
-- 20261023175626 inferred "held before" from deliveries linked to the job. A
-- job whose old id never delivered (its job_queued lost — the vendor does not
-- retry) could be walked back onto that id by a late signed delivery for it,
-- failing the job and orphaning the live run's completion.
--
-- prior_external_job_ids is kept by a trigger on every external_job_id
-- change, whoever writes it, so no writer has to remember. A client cannot
-- write external_job_id (processing_jobs_guard_storage_keys); writing this
-- column on its own row could only stop its own job relinking.
--
-- Backfills the one job relinked so far (ee5ed26a: 2fe79546 → faaa1186).
--
-- Applied to the live database via the Supabase MCP as
-- `splitstep_vendor_job_id_history`; this file carries the version the live
-- project recorded on apply.

alter table public.processing_jobs
  add column prior_external_job_ids text[] not null default '{}';

create or replace function public.processing_jobs_track_vendor_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.external_job_id is not null
     and new.external_job_id is distinct from old.external_job_id
     and not (old.external_job_id = any (new.prior_external_job_ids)) then
    new.prior_external_job_ids :=
      new.prior_external_job_ids || old.external_job_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.processing_jobs_track_vendor_ids()
  from public, anon, authenticated;

create trigger processing_jobs_track_vendor_ids
  before update of external_job_id on public.processing_jobs
  for each row execute function public.processing_jobs_track_vendor_ids();

update public.processing_jobs
   set prior_external_job_ids = array['2fe79546-9d34-4ec9-a6f9-3fd50cb935d2']
 where id = 'ee5ed26a-baf5-4d01-a710-9a9b45c0ccd1';

-- record_splitstep_webhook: body otherwise identical to 20261023175626.
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
  -- `video_id`), for a vendor re-queue only: a signed delivery, the newest job
  -- for the match, still in flight, under a vendor id that job has never held.
  -- Anything else orphans — see the header for why.
  if v_job.id is null
     and p_signature_verified
     and p_match_id is not null
     and p_external_job_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.match_id = p_match_id
     order by j.created_at desc
     limit 1;

    if v_job.id is not null
       and v_job.status in ('queued', 'processing')
       and v_job.external_job_id is not null
       and v_job.external_job_id <> p_external_job_id
       -- A late delivery for an id this job gave up must not move it back:
       -- neither one it held (prior_external_job_ids, kept by the trigger) nor one
       -- that ever delivered to it.
       and not (p_external_job_id = any (v_job.prior_external_job_ids))
       and not exists (
         select 1
           from public.splitstep_webhook_deliveries d
          where d.job_id = v_job.id
            and d.external_job_id = p_external_job_id
       ) then
      begin
        -- Compare-and-set on what was read, so a cancel or another relink in
        -- between wins and this delivery orphans instead.
        update public.processing_jobs j
           set external_job_id = p_external_job_id
         where j.id = v_job.id
           and j.status in ('queued', 'processing')
           and j.external_job_id = v_job.external_job_id;
        if found then
          v_job.external_job_id := p_external_job_id;
        else
          v_job := null;
        end if;
      exception when unique_violation then
        -- Another row took this id in between. Orphan rather than raise: a
        -- raise would roll back the delivery recorded above, and the vendor
        -- does not retry.
        v_job := null;
      end;
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
