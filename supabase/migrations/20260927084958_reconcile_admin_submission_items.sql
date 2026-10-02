-- T21: administrator reconciliation for a console attempt that is stuck.
--
-- The console admits a video (admin_submit_match_video) or a SwingVision file
-- (admin_submit_match_file) durably: the item is `succeeded`, an attempt row
-- exists, and every guard trigger then protects the match for as long as that
-- attempt is live. That is the point of the design — and it is also why a
-- browser that closed mid-upload, a vendor that never answered, or a
-- process-match run that died after inserting stats leaves a match nobody can
-- touch: the attempt row blocks a fresh console attempt (`match_id unique`),
-- `attachment-reserved` blocks a fresh preparation, `preserve_admin_*` refuses
-- every result edit, and `admin_claim_match_storage_purge` returns false so the
-- match cannot even be deleted. Until now the way back was hand-run SQL.
--
-- `admin_reconcile_submission_item(p_actor_id, p_operation_id, p_item_id,
-- p_mode)` is the one server-only path back, in one transaction:
--
--   abandon (video or file) — the attempt is over and nothing it did is kept.
--     Deletes the attempt row and any reservation for the item, rewrites the
--     item to failed/`abandoned` with the old ids preserved under
--     result->'abandoned', closes the video job (status='failed') or deletes
--     the file row, reverts the match to source_provider=null /
--     analysis_method='manual', and writes one `console.submission_reconciled`
--     audit row naming who did it. A video is abandonable only while the
--     vendor never took it: job status in pending/uploading/uploaded/failed,
--     external_job_id null (`attempt-active` otherwise) and no unreleased
--     processing_usage row (`quota-held` — release the reservation first). A
--     file is abandonable in queued/processing/failed only while the match
--     has no points and no match_stats (`analysis-present` — the stats landed,
--     so complete it instead).
--   complete (file only) — process-match wrote points + match_stats and then
--     died before admin_finish_match_file. Accepted for state='processing'
--     only (`attempt-not-processing`), requires at least one points row and a
--     match_stats row (`analysis-missing`), sets state='completed',
--     completed_at=now(), leaves the item `succeeded` and writes the same
--     audit action. A video item refuses it with `mode-unsupported`: its
--     completion is the vendor webhook's.
--
-- A `completed` file attempt refuses both modes (`attempt-completed`); a
-- dual/tournament submission or an outcome item refuses with
-- `kind-unsupported`; an item with no attempt row (never admitted, or already
-- reconciled) is `attempt-missing`. Any CURRENT administrator may reconcile,
-- not only the operation's actor — the original actor may be gone — and the
-- audit row names who. EXECUTE is service_role only: the route supplies the
-- verified session actor, never a body field (T22).
--
-- Write order, and why (every trigger below read live on 2026-09-27):
--   1. delete the attempt, then the reservation. `guard_admin_video_job`
--      forbids DELETE of a job with an attempt row and `admin_video_outcome`
--      would overwrite the item's error_code on the job write;
--      `prevent_competing_admin_job` fires on the status write and looks for
--      OTHER attempts on the match; `preserve_admin_file_attachment` and
--      `preserve_admin_video_result` protect the match while an attempt is
--      live. With the attempt gone, all four let the rest through.
--   2. rewrite the item — BEFORE the match_files delete, because the item's
--      match_file_id FK would otherwise block it. `reject_purging_match`
--      (UPDATE OF match_id) returns early for the null match_id written here.
--   3. close the job with status='failed', NOT delete: the blob is purged when
--      the match is deleted (T22), and a member admin's `uploaded` job with
--      no attempt row would otherwise fall through authorizeAdminVideo → null
--      into the ordinary eligibility path. error_message is kept when set,
--      else 'abandoned'. For a file, delete the match_files row instead.
--   4. revert the match. `matches_block_client_regraft` skips non-client
--      roles, so the definer write passes.
--   5. insert exactly one audit row.
-- The attempt's `match_id unique` is why no `abandoned` state is added to
-- admin_file_attempts: the row must go so a fresh console attempt can land.
--
-- program_audit_log_action_check is re-created with every one of the 28
-- actions the live constraint carried on 2026-09-27 (identical to the list in
-- 20260926192327_audit_crest_upload_toggle_revoke.sql) plus
-- `console.submission_reconciled`. Widening a CHECK re-validates the existing
-- rows against a strictly larger set and writes none.
--
-- Live on 2026-09-27 08:40 UTC, immediately before apply (Supabase MCP,
-- SELECT only): 0 rows in admin_upload_submissions,
-- admin_upload_submission_items, admin_video_attempts, admin_file_attempts and
-- admin_analysis_reservations; 0 program_audit_log rows with a console.*
-- action; to_regprocedure('public.admin_reconcile_submission_item(uuid,uuid,
-- uuid,text)') is null. Applying this reads and writes no existing row.
--
-- Applied to the live database via the Supabase MCP as
-- `reconcile_admin_submission_items`; this file carries the version the live
-- project recorded on apply.

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed',
    'member.upload_changed', 'program.crest_changed',
    'console.submission_reconciled'
  ]));

create function public.admin_reconcile_submission_item(
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
    -- Item before the file delete: match_file_id references match_files.
    update public.admin_upload_submission_items
      set status = 'failed', error_code = 'abandoned', audit_id = null,
          match_id = null, processing_job_id = null, match_file_id = null,
          result = result || jsonb_build_object('abandoned', jsonb_build_object(
            'matchId', v_match_id, 'jobId', v_job_id, 'fileId', v_file_id,
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
    'consoleCreated', item.kind = 'match');
end;
$$;
revoke all on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text)
  to service_role;

comment on function public.admin_reconcile_submission_item(uuid, uuid, uuid, text) is
  'Service-only (admin console). Any current administrator reconciles one stuck console item in one transaction: abandon (video job never taken by the vendor / file with no stats) removes the attempt, reservation and file or closes the job, reverts the match to manual and marks the item failed/abandoned; complete (file in processing with points + match_stats) marks the attempt completed. One console.submission_reconciled audit row either way.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text := 'public.admin_reconcile_submission_item(uuid, uuid, uuid, text)';
  v_def text;
  v_action text;
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

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.program_audit_log'::regclass
     and c.conname = 'program_audit_log_action_check';
  if v_def is null then
    raise exception 'program_audit_log_action_check is missing';
  end if;
  foreach v_action in array array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed',
    'member.upload_changed', 'program.crest_changed',
    'console.submission_reconciled'
  ] loop
    if v_def not like '%''' || v_action || '''%' then
      raise exception 'program_audit_log_action_check does not accept %', v_action;
    end if;
  end loop;
end
$$;
