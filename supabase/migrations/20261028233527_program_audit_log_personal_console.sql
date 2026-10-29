-- Console uploads into a player's personal workspace keep an audit row.
--
-- `admin_upload_submission_items` requires a `program_audit_log` row for every
-- succeeded item (`(status = 'succeeded') = (audit_id is not null)`), and that
-- log's `program_id` was NOT NULL, so a personal upload could not succeed.
-- Rather than weaken the item invariant, the log accepts a null program for
-- exactly the console's own actions, and those rows name the player and the
-- billing in `details`. Every reader of the log filters by `program_id`, so a
-- null row appears on no team page. Supersedes the "personal writes no audit"
-- branches of 20261028231751 (applied before this) in `finish_item` and
-- `admin_reconcile_submission_item`; signatures and grants unchanged.

alter table public.program_audit_log
  alter column program_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint
      where conrelid = 'public.program_audit_log'::regclass
        and conname = 'program_audit_log_program_check') then
    alter table public.program_audit_log
      add constraint program_audit_log_program_check check (
        program_id is not null
        or action in ('console.result_added', 'console.submission_reconciled')
      );
  end if;
end $$;

create or replace function admin_uploads_private.finish_item(p_operation_id uuid, p_item_id uuid, p_result jsonb, p_match_id uuid default null::uuid, p_outcome_id uuid default null::uuid, p_processing_job_id uuid default null::uuid, p_match_file_id uuid default null::uuid, p_error_code text default null::text)
 returns admin_upload_submission_items
 language plpgsql
 set search_path to ''
as $function$
declare
  submission public.admin_upload_submissions;
  item public.admin_upload_submission_items;
  audit bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  select * into strict submission from public.admin_upload_submissions where operation_id = p_operation_id for update;
  if submission.actor_user_id is distinct from auth.uid() then
    raise exception 'Operation actor mismatch' using errcode = '42501';
  end if;
  select * into strict item from public.admin_upload_submission_items
    where operation_id = p_operation_id and item_id = p_item_id for update;
  if item.status = 'succeeded' then return item; end if;
  if p_error_code is null then
    if item.kind = 'outcome' then
      if p_match_id is not null or p_processing_job_id is not null or p_match_file_id is not null
        or not exists (select 1 from public.program_event_outcomes where id = p_outcome_id and program_id = submission.program_id) then
        raise exception 'Outcome linkage mismatch' using errcode = '22023';
      end if;
    else
      if p_outcome_id is not null or not exists (select 1 from public.matches where id = p_match_id
          and (program_id = submission.program_id
            or (submission.personal_user_id is not null and program_id is null and created_by = submission.personal_user_id))) then
        raise exception 'Match linkage mismatch' using errcode = '22023';
      end if;
      if p_processing_job_id is not null and not exists (select 1 from public.processing_jobs where id = p_processing_job_id and match_id = p_match_id and created_by = submission.actor_user_id) then
        raise exception 'Job linkage mismatch' using errcode = '22023';
      end if;
      if p_match_file_id is not null and not exists (select 1 from public.match_files where id = p_match_file_id and match_id = p_match_id and uploaded_by = submission.actor_user_id) then
        raise exception 'File linkage mismatch' using errcode = '22023';
      end if;
      if item.kind = 'analysis_attachment' and p_processing_job_id is null and p_match_file_id is null then
        raise exception 'Analysis linkage required' using errcode = '22023';
      end if;
    end if;
    insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
      values (submission.program_id, submission.actor_user_id,
        case when item.kind = 'analysis_attachment' then 'console.analysis_attached' else 'console.result_added' end,
        coalesce(p_match_id, p_outcome_id), jsonb_build_object('origin', 'admin_console',
          'operation_id', p_operation_id, 'item_id', p_item_id, 'kind', item.kind,
          'match_id', p_match_id, 'outcome_id', p_outcome_id,
          'processing_job_id', p_processing_job_id, 'match_file_id', p_match_file_id)
          || case when submission.personal_user_id is null then '{}'::jsonb
             else jsonb_build_object('personal_user_id', submission.personal_user_id, 'billing', submission.billing) end)
      returning id into audit;
  end if;
  update public.admin_upload_submission_items set
    status = case when p_error_code is null then 'succeeded' else 'failed' end,
    match_id = case when p_error_code is null then p_match_id end,
    outcome_id = case when p_error_code is null then p_outcome_id end,
    processing_job_id = case when p_error_code is null then p_processing_job_id end,
    match_file_id = case when p_error_code is null then p_match_file_id end,
    result = p_result, error_code = p_error_code, audit_id = audit, updated_at = now()
    where operation_id = p_operation_id and item_id = p_item_id returning * into item;
  return item;
end;
$function$;

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
