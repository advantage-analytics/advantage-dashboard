-- Follow-ups to 20261110063746 from its pre-merge review.
--
-- 1. `admin_reconcile_submission_item` 'abandon' on a video item now looks at
--    every other job on the match instead of walking the reserved job's
--    `resubmitted_from_job_id` chain down, so a retry orphaned by a deleted
--    middle job (`ON DELETE SET NULL`) still blocks it. It refuses:
--      • 'attempt-active' while another job is live, or completed with
--        `derivation_version` still null (derive-and-publish is running);
--      • 'analysis-present' once another job completed and derived — its
--        points and stats are on the match, which abandon would relabel
--        `analysis_method='manual'`.
--    Lock order is unchanged; the rest of the body is 20261110063746's.
--
-- 2. The console item's mirrored state (`result.state`, `result.stateJobId`,
--    `error_code`) now comes from one helper, `mirror_video_attempt`, which
--    picks the job that speaks for the attempt: the newest job of the
--    reserved job's chain that did not end failed, cancelled or
--    derivation_failed — so a reprocess that fails or is cancelled no longer
--    hides the analysis an earlier job published — and the newest overall
--    when every job ended that way. Ties on `created_at` (two jobs written in
--    one transaction share `now()`) go to the deeper job in the chain. The
--    trigger recomputes on any write to a job in the chain, and the
--    migration backfills every current attempt.
--
-- Not changed: a job write takes the match lock (prevent_competing_admin_job,
-- BEFORE) and then updates the item row (video_outcome, AFTER), the reverse
-- of abandon's item → match. That inversion predates the console chain work;
-- Postgres breaks such a deadlock by aborting one side, and both are safe to
-- retry.

create or replace function public.admin_reconcile_submission_item(p_actor_id uuid, p_operation_id uuid, p_item_id uuid, p_mode text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  submission public.admin_upload_submissions;
  item public.admin_upload_submission_items;
  video public.admin_video_attempts;
  file public.admin_file_attempts;
  job public.processing_jobs;
  v_kind text;
  v_match_id uuid;
  v_job_id uuid;
  v_file_id uuid;
  v_storage_path text;
  v_now timestamptz := now();
begin
  if p_mode is null or p_mode not in ('abandon', 'complete') then
    raise exception 'mode-invalid' using errcode = '22023';
  end if;
  -- Any current administrator, deliberately not only the operation's actor.
  if p_actor_id is null
    or not exists (select 1 from public.users where id = p_actor_id and is_admin) then
    raise exception 'admin-required' using errcode = '42501';
  end if;

  -- Lock order shared with every console mutation:
  -- submission → item → parent match → attempt (→ job).
  select * into submission from public.admin_upload_submissions
    where operation_id = p_operation_id for update;
  if not found then raise exception 'operation-not-found' using errcode = '22023'; end if;
  select * into item from public.admin_upload_submission_items
    where operation_id = p_operation_id and item_id = p_item_id for update;
  if not found then raise exception 'item-not-found' using errcode = '22023'; end if;
  if submission.kind in ('dual', 'tournament') or item.kind = 'outcome' then
    raise exception 'kind-unsupported' using errcode = '22023';
  end if;
  if item.match_id is not null then
    perform 1 from public.matches where id = item.match_id for update;
  end if;
  select * into video from public.admin_video_attempts
    where operation_id = p_operation_id and item_id = p_item_id for update;
  if found then
    v_kind := 'video';
    v_match_id := video.match_id;
  else
    select * into file from public.admin_file_attempts
      where operation_id = p_operation_id and item_id = p_item_id for update;
    if not found then raise exception 'attempt-missing' using errcode = '22023'; end if;
    v_kind := 'file';
    v_match_id := file.match_id;
    v_file_id := file.file_id;
  end if;
  -- An attempt only ever exists for a succeeded item that links its match.
  if v_match_id is distinct from item.match_id then
    raise exception 'linkage-mismatch' using errcode = '22023';
  end if;

  if v_kind = 'video' then
    if p_mode <> 'abandon' then raise exception 'mode-unsupported' using errcode = '22023'; end if;
    select * into job from public.processing_jobs where id = video.job_id for update;
    if not found then raise exception 'linkage-mismatch' using errcode = '22023'; end if;
    v_job_id := job.id;
    if coalesce(job.status, '') not in ('pending', 'uploading', 'uploaded', 'failed')
      or job.external_job_id is not null then
      raise exception 'attempt-active' using errcode = '22023';
    end if;
    -- Any other job on this match is the attempt carrying on: a retry or
    -- reprocess (a job reaches a reserved match only through the server, see
    -- prevent_competing_admin_job), found match-wide so a child whose lineage
    -- a deleted middle job cleared is still seen. Still running, or completed
    -- but not yet derived, is 'attempt-active'; completed and derived means
    -- its analysis is on the match, the video form of the file branch's
    -- 'analysis-present'. The match lock above serialises these jobs: every
    -- write to one takes it in prevent_competing_admin_job.
    if exists (select 1 from public.processing_jobs j
        where j.match_id = v_match_id and j.id <> job.id
          and (j.status not in ('completed', 'failed', 'derivation_failed', 'cancelled')
               or (j.status = 'completed' and j.derivation_version is null))) then
      raise exception 'attempt-active' using errcode = '22023';
    end if;
    if exists (select 1 from public.processing_jobs j
        where j.match_id = v_match_id and j.id <> job.id and j.status = 'completed') then
      raise exception 'analysis-present' using errcode = '22023';
    end if;
    if exists (select 1 from public.processing_usage where job_id = job.id and released = false) then
      raise exception 'quota-held' using errcode = '22023';
    end if;
    delete from public.admin_video_attempts
      where operation_id = p_operation_id and item_id = p_item_id;
    delete from public.admin_analysis_reservations
      where operation_id = p_operation_id and item_id = p_item_id;
  else
    if file.state = 'completed' then raise exception 'attempt-completed' using errcode = '22023'; end if;
    if p_mode = 'complete' then
      if file.state <> 'processing' then raise exception 'attempt-not-processing' using errcode = '22023'; end if;
      if not exists (select 1 from public.points where match_id = v_match_id)
        or not exists (select 1 from public.match_stats where match_id = v_match_id) then
        raise exception 'analysis-missing' using errcode = '22023';
      end if;
      update public.admin_file_attempts set state = 'completed', completed_at = v_now
        where operation_id = p_operation_id and item_id = p_item_id;
      -- The item stays succeeded: its admission audit and links are the truth.
      update public.admin_upload_submission_items
        set result = result || jsonb_build_object('completed',
              jsonb_build_object('actorId', p_actor_id, 'at', v_now)),
            updated_at = v_now
        where operation_id = p_operation_id and item_id = p_item_id;
    else
      -- state in ('queued', 'processing', 'failed')
      if exists (select 1 from public.points where match_id = v_match_id)
        or exists (select 1 from public.match_stats where match_id = v_match_id) then
        raise exception 'analysis-present' using errcode = '22023';
      end if;
      delete from public.admin_file_attempts
        where operation_id = p_operation_id and item_id = p_item_id;
      delete from public.admin_analysis_reservations
        where operation_id = p_operation_id and item_id = p_item_id;
    end if;
  end if;

  if p_mode = 'abandon' then
    -- The file row is the only record of the object's path and is deleted
    -- below; read it first so the caller can remove the object afterwards.
    if v_kind = 'file' then
      select storage_path into v_storage_path from public.match_files where id = v_file_id;
    end if;
    -- Item before the file delete: match_file_id references match_files.
    update public.admin_upload_submission_items
      set status = 'failed', error_code = 'abandoned', audit_id = null,
          match_id = null, processing_job_id = null, match_file_id = null,
          result = result || jsonb_build_object('abandoned', jsonb_build_object(
            'matchId', v_match_id, 'jobId', v_job_id, 'fileId', v_file_id,
            'storagePath', v_storage_path,
            'actorId', p_actor_id, 'at', v_now)),
          updated_at = v_now
      where operation_id = p_operation_id and item_id = p_item_id;
    if v_kind = 'video' then
      update public.processing_jobs
        set status = 'failed', error_message = coalesce(error_message, 'abandoned'), updated_at = v_now
        where id = v_job_id;
    else
      delete from public.match_files where id = v_file_id;
    end if;
    update public.matches set source_provider = null, analysis_method = 'manual'
      where id = v_match_id;
  end if;

  insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
    values (submission.program_id, p_actor_id, 'console.submission_reconciled', v_match_id,
      jsonb_build_object('origin', 'admin_console', 'mode', p_mode, 'kind', v_kind,
        'item_kind', item.kind, 'operation_id', p_operation_id, 'item_id', p_item_id,
        'match_id', v_match_id, 'processing_job_id', v_job_id, 'match_file_id', v_file_id)
        || case when submission.personal_user_id is null then '{}'::jsonb
           else jsonb_build_object('personal_user_id', submission.personal_user_id) end);

  return jsonb_build_object('mode', p_mode, 'kind', v_kind,
    'operationId', p_operation_id, 'itemId', p_item_id, 'programId', submission.program_id,
    'personalUserId', submission.personal_user_id,
    'matchId', v_match_id, 'jobId', v_job_id, 'fileId', v_file_id,
    'storagePath', v_storage_path,
    'consoleCreated', item.kind = 'match');
end;
$function$;

create or replace function admin_uploads_private.mirror_video_attempt(p_operation_id uuid, p_item_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_attempt public.admin_video_attempts;
  v_job public.processing_jobs;
begin
  select * into v_attempt from public.admin_video_attempts
   where operation_id = p_operation_id and item_id = p_item_id;
  if not found then
    return;
  end if;

  with recursive down(id, depth) as (
    select v_attempt.job_id, 0
    union all
    select j.id, d.depth + 1
      from down d
      join public.processing_jobs j
        on j.resubmitted_from_job_id = d.id and j.match_id = v_attempt.match_id
     where d.depth < 32
  )
  select j.* into v_job
    from down d join public.processing_jobs j on j.id = d.id
   order by (j.status in ('failed', 'cancelled', 'derivation_failed')),
            j.created_at desc, d.depth desc, j.id desc
   limit 1;
  if not found then
    return;
  end if;

  update public.admin_upload_submission_items i set result = i.result || jsonb_build_object(
      'state', case when v_job.status = 'completed' and v_job.derivation_version is null
                    then 'stats_pending' else v_job.status end,
      'stateJobId', v_job.id),
    error_code = v_job.error_message, updated_at = now()
   where i.operation_id = v_attempt.operation_id and i.item_id = v_attempt.item_id;
end;
$function$;

revoke all on function admin_uploads_private.mirror_video_attempt(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function admin_uploads_private.video_outcome()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_attempt public.admin_video_attempts;
begin
  -- The attempt this job answers to: its own (it is the reserved job), or the
  -- one whose reserved job its resubmission chain on this match reaches.
  select a.* into v_attempt
    from public.admin_video_attempts a
   where a.job_id = new.id
      or (a.match_id = new.match_id and a.job_id in (
        with recursive up(id, depth) as (
          select new.resubmitted_from_job_id, 0
          union all
          select j.resubmitted_from_job_id, u.depth + 1
            from up u
            join public.processing_jobs j on j.id = u.id and j.match_id = new.match_id
           where u.depth < 32
        )
        select id from up where id is not null))
   limit 1;
  if found then
    perform admin_uploads_private.mirror_video_attempt(v_attempt.operation_id, v_attempt.item_id);
  end if;
  return new;
end;
$function$;

-- Items written before stateJobId existed, and the two matches (75b5e12e,
-- 282e6e66) whose console rows still show the reserved job.
select admin_uploads_private.mirror_video_attempt(operation_id, item_id)
  from public.admin_video_attempts;
