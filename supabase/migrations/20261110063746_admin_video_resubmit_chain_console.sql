-- Two admin-console paths that predate 20261110013000 keyed on the reserved
-- job (`admin_video_attempts.job_id`) alone, because until then no second job
-- could exist on a console-reserved match. A `resubmitJob()` child now can
-- (75b5e12e and 282e6e66 each hold a completed reprocess), so:
--
-- 1. `admin_reconcile_submission_item` 'abandon' also refuses ('attempt-active')
--    while any job descended from the reserved job on the match — its
--    `resubmitted_from_job_id` chain reaches the reserved job — is not yet
--    terminal (completed, failed, derivation_failed, cancelled). Otherwise it
--    could delete the attempt and mark the match `analysis_method='manual'`
--    under a retry the vendor is still working. The descendants need no row
--    lock of their own: every insert or status write of a job on a reserved
--    match runs `prevent_competing_admin_job`, which locks the match row
--    first, and abandon already holds that lock (submission → item → parent
--    match → attempt → job). Only that check is new; the body is otherwise
--    the live definition read 2026-11-10.
--
-- 2. `admin_uploads_private.video_outcome()` mirrors the state of the NEWEST
--    job in the reserved job's chain (reserved job included; newest by
--    created_at, then id) into the console item's `result.state` and
--    `error_code`, and records which job that was as `result.stateJobId`.
--    `result.jobId` stays the reserved job. A write to an older job in the
--    chain no longer overwrites a newer one's state. The trigger now fires on
--    INSERT too, so a fresh retry shows its own state before its first update.

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
    -- A live resubmission of the reserved job (a retry or reprocess) is the
    -- attempt still running. The match lock above serialises it: every write
    -- to a job on this match takes that lock in prevent_competing_admin_job.
    if exists (
      with recursive chain(id, depth) as (
        select j.id, 0 from public.processing_jobs j
          where j.match_id = v_match_id and j.resubmitted_from_job_id = job.id
        union all
        select j.id, c.depth + 1
          from chain c
          join public.processing_jobs j
            on j.resubmitted_from_job_id = c.id and j.match_id = v_match_id
         where c.depth < 32
      )
      select 1 from chain c join public.processing_jobs j on j.id = c.id
       where j.status not in ('completed', 'failed', 'derivation_failed', 'cancelled')
    ) then
      raise exception 'attempt-active' using errcode = '22023';
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

create or replace function admin_uploads_private.video_outcome()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_attempt public.admin_video_attempts;
  v_newest uuid;
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
  if not found then
    return new;
  end if;

  -- Only the newest job of the chain speaks for the console item.
  with recursive down(id, depth) as (
    select v_attempt.job_id, 0
    union all
    select j.id, d.depth + 1
      from down d
      join public.processing_jobs j
        on j.resubmitted_from_job_id = d.id and j.match_id = v_attempt.match_id
     where d.depth < 32
  )
  select j.id into v_newest
    from down d join public.processing_jobs j on j.id = d.id
   order by j.created_at desc, j.id desc
   limit 1;
  if v_newest is distinct from new.id then
    return new;
  end if;

  update public.admin_upload_submission_items i set result = i.result || jsonb_build_object(
      'state', case when new.status = 'completed' and new.derivation_version is null
                    then 'stats_pending' else new.status end,
      'stateJobId', new.id),
    error_code = new.error_message, updated_at = now()
   where i.operation_id = v_attempt.operation_id and i.item_id = v_attempt.item_id;
  return new;
end;
$function$;

create or replace trigger admin_video_outcome
  after insert or update on public.processing_jobs
  for each row execute function admin_uploads_private.video_outcome();
