-- T29: return the abandoned file's storage path from
-- admin_reconcile_submission_item, so the service can remove the .xlsx.
--
-- T21 (20260927084958_reconcile_admin_submission_items.sql) made `abandon`
-- delete a file attempt's match_files row in the same transaction that
-- rewrites the item. That row was the only record of the object's
-- `storage_path` — `_admin-console/{operation}/{item}/{sha256}.xlsx` in the
-- match-data bucket (docs/admin-match-file-submissions.md) — and the return
-- carried `fileId` alone. So once the RPC commits, nothing can find the blob:
-- a console-created abandon's later purgeMatchStorage() reads match_files by
-- match_id (lane 3) and finds no row; an attachment abandon never purges at
-- all, because the match is the coach's and stays; and the orphan sweep
-- (scripts/orphan-attribution.ts, MATCH_DATA_LAYOUTS) knows only the
-- {user}/{provider}/{match}/{file} layout. The object outlived everything.
--
-- The one change: a new `v_storage_path`, read from match_files at the top of
-- the `abandon` block — before the item UPDATE, which precedes the match_files
-- delete — and carried both under result->'abandoned' (the durable record,
-- so a remove that fails can be redone by hand) and in the return as
-- `storagePath`. It is null for a video abandon (a closed job keeps its
-- video_object_key, which the console-created purge reads) and for `complete`
-- (nothing is deleted). The service removes the object right after the RPC
-- returns and before any purge, and logs a failure rather than failing the
-- reconcile: nothing references the object once this transaction commits, and
-- a purge refusal must not strand it. Everything else — the checks, the lock
-- order, the write order, the audit row — is T21's body verbatim.
--
-- `create or replace`, where 20260927094436 and 20260927103502 are one-shot
-- `create function`: those functions did not exist, this one does, and its
-- signature is unchanged, so replacing in place keeps the oid and the ACL. The
-- revoke/grant pair is repeated all the same so the file stands on its own,
-- and the comment is re-set to name the new field.
--
-- Live on 2026-09-27, immediately before this file was written (Supabase MCP,
-- SELECT only): md5(prosrc) of the live function equals the md5 of the
-- $$-body in 20260927084958 (2eba0257d94e12676d6236c0e45491ce, 6493 bytes),
-- so the live body is T21's verbatim; prosecdef true; search_path pinned
-- empty; EXECUTE false for anon and authenticated, true for service_role.
-- Applying this replaces one function definition and reads and writes no row.
-- program_audit_log_action_check is not touched.
--
-- Applied to the live database via the Supabase MCP as
-- `reconcile_returns_file_storage_path`; this file carries the version the
-- live project recorded on apply.

create or replace function public.admin_reconcile_submission_item(
  p_actor_id uuid, p_operation_id uuid, p_item_id uuid, p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
        'match_id', v_match_id, 'processing_job_id', v_job_id, 'match_file_id', v_file_id));

  return jsonb_build_object('mode', p_mode, 'kind', v_kind,
    'operationId', p_operation_id, 'itemId', p_item_id, 'programId', submission.program_id,
    'matchId', v_match_id, 'jobId', v_job_id, 'fileId', v_file_id,
    'storagePath', v_storage_path,
    'consoleCreated', item.kind = 'match');
end;
$$;
revoke all on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text)
  to service_role;

comment on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text) is
  'Service-only (admin console). Any current administrator reconciles one stuck console item in one transaction: abandon (video job never taken by the vendor / file with no stats) removes the attempt, reservation and file or closes the job, reverts the match to manual and marks the item failed/abandoned; complete (file in processing with points + match_stats) marks the attempt completed. One console.submission_reconciled audit row either way. The return''s storagePath is the abandoned file''s match_files.storage_path (also under result->''abandoned''), null otherwise, for the caller to remove the object.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text := 'public.admin_reconcile_submission_item(uuid, uuid, uuid, text)';
begin
  if to_regprocedure(v_fn) is null then
    raise exception '%: function is missing', v_fn;
  end if;

  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '%: anon may execute it', v_fn;
  end if;

  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '%: authenticated may execute it', v_fn;
  end if;

  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: service_role may not execute it', v_fn;
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.prosecdef
  ) then
    raise exception '%: must be security definer', v_fn;
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception '%: search_path is not pinned empty', v_fn;
  end if;

  -- The anchor proving the replacement landed and T21's body did not survive.
  if strpos(pg_get_functiondef(v_fn::regprocedure), '''storagePath''') = 0 then
    raise exception '%: the body does not return storagePath (replacement did not land)', v_fn;
  end if;
end
$$;
