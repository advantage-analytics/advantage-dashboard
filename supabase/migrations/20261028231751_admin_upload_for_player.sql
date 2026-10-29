-- Admin console: upload a match video into a player's PERSONAL workspace.
--
-- Until now every console upload targeted a program. A submission now names
-- exactly one target: `program_id` (a team, as before) or `personal_user_id`
-- (a player's personal workspace). A personal submission also records how it
-- is billed, the administrator's choice at upload time:
--
--   free    billed to nobody: the usage row lands on the administrator's own
--           account, uncapped, exactly as an admin's own uploads do — the
--           player's allowance is untouched.
--   player  the player's allowance: their free monthly hours first (the
--           per-user `video_hours_override` wins, inside
--           `reserve_personal_quota`), then credits they bought.
--
-- The uploader is recorded where it always was: `actor_user_id` on the
-- submission and `created_by` on the processing job. The MATCH belongs to the
-- player (`created_by` = `player1_id` = the player, `program_id` null), because
-- that is what a personal workspace is (`scopeToWorkspace()`).
--
-- Only video is supported for a personal target, and only a new match (no
-- analysis attachment). Program uploads behave exactly as before.
--
-- No object is dropped: the constraint is added under an existence check and
-- every function is `create or replace` with an unchanged signature, so callers
-- keep resolving the same function. `program_id` loses NOT NULL only behind the
-- target check, so a row with neither target cannot exist.

alter table public.admin_upload_submissions
  add column if not exists personal_user_id uuid references public.users(id),
  add column if not exists billing text;

alter table public.admin_upload_submissions
  alter column program_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint
      where conrelid = 'public.admin_upload_submissions'::regclass
        and conname = 'admin_upload_submissions_target_check') then
    alter table public.admin_upload_submissions
      add constraint admin_upload_submissions_target_check check (
        (program_id is not null and personal_user_id is null and billing is null)
        or (program_id is null and personal_user_id is not null
            and kind = 'video' and billing in ('free', 'player'))
      );
  end if;
end $$;

create index if not exists admin_upload_submissions_personal_user_idx
  on public.admin_upload_submissions (personal_user_id)
  where personal_user_id is not null;

-- ── admin_submit_match_video ─────────────────────────────────────────────────
-- A personal target arrives as `p_program_id` null with `personalUserId` and
-- `billing` in the request (the request is the stored identity, so a replay
-- that changes either is the same conflict any other changed field is).
create or replace function public.admin_submit_match_video(p_actor_id uuid, p_operation_id uuid, p_item_id uuid, p_program_id uuid, p_match_id uuid, p_fingerprint text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  item public.admin_upload_submission_items;
  attempt public.admin_video_attempts;
  reservation public.admin_analysis_reservations;
  snapshot jsonb;
  target uuid;
  job uuid;
  player uuid := (p_request->>'playerId')::uuid;
  player_name text;
  v_personal uuid;
  v_billing text := p_request->>'billing';
  previous_actor text := current_setting('request.jwt.claim.sub',true);
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  if jsonb_typeof(p_request->'personalUserId')='string' then v_personal := (p_request->>'personalUserId')::uuid; end if;
  if (p_program_id is null) = (v_personal is null) then raise exception 'target-required' using errcode='22023'; end if;
  if v_personal is not null then
    if p_match_id is not null then raise exception 'personal-attachment-unsupported' using errcode='22023'; end if;
    if v_billing is null or v_billing not in ('free','player') then raise exception 'billing-invalid' using errcode='22023'; end if;
    if player is distinct from v_personal then raise exception 'athlete-ineligible' using errcode='22023'; end if;
    perform 1 from public.users where id=v_personal for share;
    if not found then raise exception 'player-not-found' using errcode='22023'; end if;
    -- The submission is created here, not by admin_begin_upload_item, because
    -- the target check needs the owner and billing in the same insert. Begin
    -- then finds it and checks actor, program (null = null) and kind.
    insert into public.admin_upload_submissions(operation_id, actor_user_id, program_id, kind, personal_user_id, billing)
      values (p_operation_id, p_actor_id, null, 'video', v_personal, v_billing)
      on conflict (operation_id) do nothing;
  elsif v_billing is not null or p_request ? 'personalUserId' then
    raise exception 'billing-invalid' using errcode='22023';
  end if;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  item := public.admin_begin_upload_item(p_operation_id,p_item_id,p_program_id,
    case when p_match_id is null then 'video' else 'analysis_attachment' end,
    case when p_match_id is null then 'match' else 'analysis_attachment' end,
    case when p_match_id is null then p_request else jsonb_build_object('match_id',p_match_id,'fingerprint',p_fingerprint) end);
  if v_personal is not null then
    perform 1 from public.admin_upload_submissions s where s.operation_id=p_operation_id
      and s.personal_user_id=v_personal and s.billing=v_billing;
    if not found then raise exception 'Operation identity conflict' using errcode='22023'; end if;
  end if;
  select * into attempt from public.admin_video_attempts where operation_id=p_operation_id and item_id=p_item_id for update;
  if found then
    if attempt.request is distinct from p_request then raise exception 'video-identity-conflict' using errcode='22023'; end if;
    perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
    return to_jsonb(attempt);
  end if;
  if item.status='succeeded' then raise exception 'item-already-used' using errcode='22023'; end if;
  if v_personal is null then
    perform 1 from public.programs where id=p_program_id and status<>'suspended' for share;
    if not found then raise exception 'program-inactive' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(p_request->'initialTopPlayerIsPlayer1') is distinct from 'boolean'
    or jsonb_typeof(p_request->'adScoring') is distinct from 'boolean'
    or jsonb_typeof(p_request->'fixedCamera') is distinct from 'boolean'
    or jsonb_typeof(p_request->'startSeconds') is distinct from 'number'
    or jsonb_typeof(p_request->'endSeconds') is distinct from 'number'
    or (p_request->>'startSeconds')::numeric < 0
    or (p_request->>'endSeconds')::numeric <= (p_request->>'startSeconds')::numeric then
    raise exception 'invalid-video-input' using errcode='22023';
  end if;
  if p_match_id is not null then
    snapshot := admin_uploads_private.attachment_snapshot(p_program_id,p_match_id);
    select * into reservation from public.admin_analysis_reservations where match_id=p_match_id for update;
    if not found or reservation.operation_id is distinct from p_operation_id or reservation.item_id is distinct from p_item_id then raise exception 'attachment-not-prepared' using errcode='22023'; end if;
    if reservation.snapshot is distinct from snapshot or reservation.fingerprint is distinct from p_fingerprint then raise exception 'stale-target' using errcode='22023'; end if;
    if snapshot->'match'->>'match_type' is distinct from 'Singles' then raise exception 'singles-required' using errcode='22023'; end if;
    -- Existing scoring semantics are authoritative when recorded; orientation
    -- and camera answers live on the job, never overwrite the coach's match.
    if jsonb_typeof(snapshot->'match'->'format'->'ad_scoring')='boolean'
      and snapshot->'match'->'format'->'ad_scoring' is distinct from p_request->'adScoring' then raise exception 'scoring-mismatch' using errcode='22023'; end if;
    target := p_match_id;
    update public.matches set source_provider='splitstep',analysis_method='ai' where id=target;
  elsif v_personal is not null then
    -- The player's own match: theirs to see and edit, filed in no
    -- program. The administrator stays on the job and the submission.
    select coalesce(nullif(trim(coalesce(u.first_name,'')||' '||coalesce(u.last_name,'')),''),split_part(coalesce(u.email,''),'@',1))
      into player_name from public.users u where u.id=v_personal;
    if coalesce(player_name,'')='' then raise exception 'athlete-ineligible' using errcode='22023'; end if;
    insert into public.matches(created_by,program_id,player1_id,player1_name,player2_name,score,result,date,match_type,court_type,format,source_provider,analysis_method,private)
      values(v_personal,null,v_personal,player_name,p_request->>'opponentName',p_request->'score','Final Score',(p_request->>'date')::timestamptz,'Singles',p_request->>'courtType',
        jsonb_build_object('ad_scoring',p_request->'adScoring','best_of',p_request->'bestOf'),'splitstep','ai',false) returning id into target;
  else
    select trim(first_name||' '||last_name) into player_name from public.program_players pp
      where pp.program_id=p_program_id and pp.id=player and pp.archived_at is null and pp.merged_into_id is null
      and (pp.claimed_by_user_id=p_actor_id or not exists(select 1 from public.program_members pm where pm.program_id=p_program_id and pm.user_id=pp.claimed_by_user_id and pm.role<>'player')) for share;
    if player_name is null and not exists(select 1 from public.program_players where program_id=p_program_id and claimed_by_user_id=player and merged_into_id is null) then
      select trim(coalesce(u.first_name,'')||' '||coalesce(u.last_name,'')) into player_name from public.users u join public.program_members pm on pm.user_id=u.id
        where u.id=player and pm.program_id=p_program_id and pm.role='player' for share of u,pm;
    end if;
    if player_name is null then raise exception 'athlete-ineligible' using errcode='22023'; end if;
    insert into public.matches(created_by,program_id,player1_id,player1_name,player2_name,score,result,date,match_type,court_type,format,source_provider,analysis_method,private)
      values(p_actor_id,p_program_id,player,player_name,p_request->>'opponentName',p_request->'score','Final Score',(p_request->>'date')::timestamptz,'Singles',p_request->>'courtType',
        jsonb_build_object('ad_scoring',p_request->'adScoring','best_of',p_request->'bestOf'),'splitstep','ai',false) returning id into target;
  end if;
  insert into public.processing_jobs(match_id,created_by,provider,status,start_time_seconds,end_time_seconds,billable_seconds,initial_top_player_is_player1,ad_scoring,fixed_camera)
    values(target,p_actor_id,'splitstep','uploading',(p_request->>'startSeconds')::numeric,(p_request->>'endSeconds')::numeric,
      ceil((p_request->>'endSeconds')::numeric-(p_request->>'startSeconds')::numeric),(p_request->>'initialTopPlayerIsPlayer1')::boolean,(p_request->>'adScoring')::boolean,(p_request->>'fixedCamera')::boolean) returning id into job;
  insert into public.admin_video_attempts values(p_operation_id,p_item_id,target,job,p_request) returning * into attempt;
  -- Reuse the stricter live roster check for both new and attached matches.
  perform public.admin_video_access(p_actor_id,target,job,'read');
  perform admin_uploads_private.finish_item(p_operation_id,p_item_id,jsonb_build_object('matchId',target,'jobId',job,'state','uploading'),target,null,job);
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return to_jsonb(attempt);
end;
$function$;

-- ── admin_video_access ───────────────────────────────────────────────────────
-- A personal submission is checked against its owner instead of a program and
-- roster: the match must be the owner's own, filed in no program. The answer
-- carries `personalUserId` and `billing` beside a null `programId`.
create or replace function public.admin_video_access(p_actor_id uuid, p_match_id uuid, p_job_id uuid, p_action text, p_blob_name text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare a public.admin_video_attempts; s public.admin_upload_submissions; j public.processing_jobs; m public.matches;
begin
  select * into a from public.admin_video_attempts where (p_job_id is not null and job_id=p_job_id) or (p_job_id is null and match_id=p_match_id);
  if not found then return null; end if;
  select * into s from public.admin_upload_submissions where operation_id=a.operation_id;
  if s.actor_user_id is distinct from p_actor_id or not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  select * into m from public.matches where id=a.match_id for update;
  select * into j from public.processing_jobs where id=a.job_id for update;
  if j.created_by is distinct from p_actor_id or j.match_id is distinct from a.match_id
    or m.program_id is distinct from s.program_id or (p_match_id is not null and p_match_id is distinct from m.id) then raise exception 'video-linkage-mismatch' using errcode='42501'; end if;
  if s.personal_user_id is not null then
    if m.program_id is not null or m.created_by is distinct from s.personal_user_id
      or m.player1_id is distinct from s.personal_user_id then raise exception 'video-linkage-mismatch' using errcode='42501'; end if;
  else
    perform 1 from public.programs where id=s.program_id and status<>'suspended' for share;
    if not found then raise exception 'program-inactive' using errcode='22023'; end if;
    if m.player1_id is null or not (
      exists(select 1 from public.program_players pp where pp.program_id=s.program_id and (pp.id=m.player1_id or pp.claimed_by_user_id=m.player1_id) and pp.archived_at is null and pp.merged_into_id is null
        and (pp.claimed_by_user_id=p_actor_id or not exists(select 1 from public.program_members pm where pm.program_id=s.program_id and pm.user_id=pp.claimed_by_user_id and pm.role<>'player')))
      or (not exists(select 1 from public.program_players where program_id=s.program_id and claimed_by_user_id=m.player1_id and merged_into_id is null)
        and exists(select 1 from public.program_members where program_id=s.program_id and user_id=m.player1_id and role='player'))
    ) then raise exception 'athlete-ineligible' using errcode='22023'; end if;
  end if;
  if p_action='upload' then
    if j.status not in ('pending','uploading') or j.external_job_id is not null then raise exception 'video-not-uploadable' using errcode='22023'; end if;
  elsif p_action='blob' then
    if j.status not in ('pending','uploading') or j.external_job_id is not null or p_blob_name is null then raise exception 'video-not-uploadable' using errcode='22023'; end if;
    if j.video_object_key is not null and j.video_object_key is distinct from p_blob_name then raise exception 'video-identity-conflict' using errcode='22023'; end if;
    update public.processing_jobs set video_object_key=p_blob_name where id=j.id;
  elsif p_action='claim' then
    if j.status<>'uploaded' or j.external_job_id is not null then raise exception 'video-already-claimed' using errcode='22023'; end if;
    update public.processing_jobs set status='submitting' where id=j.id;
  elsif p_action<>'read' then raise exception 'invalid-video-action' using errcode='22023'; end if;
  return jsonb_build_object('operationId',a.operation_id,'itemId',a.item_id,'programId',s.program_id,
    'personalUserId',s.personal_user_id,'billing',s.billing,'matchId',m.id,'jobId',j.id,'status',j.status);
end;
$function$;

-- ── admin_reserve_video_quota ────────────────────────────────────────────────
-- Billing is read from the submission, never from the caller. For a personal
-- `player` submission `p_individual_cap` is that player's own monthly figure
-- (`monthlyCapSecondsFor()` of their workspace); `reserve_personal_quota`
-- still lets their `video_hours_override` win and spends credits after it.
create or replace function public.admin_reserve_video_quota(p_actor_id uuid, p_job_id uuid, p_seconds integer, p_billing_month date, p_program_cap integer, p_individual_cap integer)
 returns table(ok boolean, used_seconds integer, cap_seconds integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare access jsonb; j public.processing_jobs; p public.programs;
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  access := public.admin_video_access(p_actor_id,null,p_job_id,'read');
  if access is null then raise exception 'video-operation-required' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id for update;
  if j.status is distinct from 'submitting' or j.external_job_id is not null
    or p_seconds is distinct from ceil(j.end_time_seconds-j.start_time_seconds)::integer
    or p_seconds is null or p_seconds<=0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
  if exists(select 1 from public.processing_usage where job_id=p_job_id) then raise exception 'video-quota-already-reserved' using errcode='22023'; end if;
  if access->>'personalUserId' is not null then
    if access->>'billing'='free' then
      -- What an admin's own upload writes: their own uncapped individual row.
      return query select r.ok, r.used_seconds, r.cap_seconds from public.reserve_processing_quota(
        p_job_id,p_actor_id,'individual',p_actor_id,p_billing_month,p_seconds,2147483647) r;
    elsif access->>'billing'='player' then
      if p_individual_cap is null or p_individual_cap<0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
      return query select r.ok, r.used_seconds, r.cap_seconds from public.reserve_personal_quota(
        p_job_id,(access->>'personalUserId')::uuid,p_billing_month,p_seconds,p_individual_cap) r;
    else
      raise exception 'billing-invalid' using errcode='22023';
    end if;
    return;
  end if;
  select * into p from public.programs where id=(access->>'programId')::uuid for share;
  return query select * from public.reserve_processing_quota(p_job_id,p.id,'program',p_actor_id,p_billing_month,p_seconds,
    case when p.org_type='college' or p.pilot_eligible then p_program_cap else p_individual_cap end);
end;
$function$;

-- ── finish_item ──────────────────────────────────────────────────────────────
-- Linkage for a personal submission is the owner's own program-less match. The
-- program audit log is per program, so a personal item writes none: the
-- submission row and its item are its record.
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
    if submission.program_id is not null then
      insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
        values (submission.program_id, submission.actor_user_id,
          case when item.kind = 'analysis_attachment' then 'console.analysis_attached' else 'console.result_added' end,
          coalesce(p_match_id, p_outcome_id), jsonb_build_object('origin', 'admin_console',
            'operation_id', p_operation_id, 'item_id', p_item_id, 'kind', item.kind,
            'match_id', p_match_id, 'outcome_id', p_outcome_id,
            'processing_job_id', p_processing_job_id, 'match_file_id', p_match_file_id)) returning id into audit;
    end if;
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

-- ── admin_reconcile_submission_item ──────────────────────────────────────────
-- Unchanged except that a personal submission (no program) writes no program
-- audit row, as in finish_item above.
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

  if submission.program_id is not null then
    insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
      values (submission.program_id, p_actor_id, 'console.submission_reconciled', v_match_id,
        jsonb_build_object('origin', 'admin_console', 'mode', p_mode, 'kind', v_kind,
          'item_kind', item.kind, 'operation_id', p_operation_id, 'item_id', p_item_id,
          'match_id', v_match_id, 'processing_job_id', v_job_id, 'match_file_id', v_file_id));
  end if;

  return jsonb_build_object('mode', p_mode, 'kind', v_kind,
    'operationId', p_operation_id, 'itemId', p_item_id, 'programId', submission.program_id,
    'personalUserId', submission.personal_user_id,
    'matchId', v_match_id, 'jobId', v_job_id, 'fileId', v_file_id,
    'storagePath', v_storage_path,
    'consoleCreated', item.kind = 'match');
end;
$function$;

-- Service role only, as before: the console's server calls these with the
-- service key after `checkAdmin()`, and each re-checks `is_admin` itself.
revoke all on function public.admin_submit_match_video(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_video_access(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_reserve_video_quota(uuid,uuid,integer,date,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_reconcile_submission_item(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_submit_match_video(uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.admin_video_access(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.admin_reserve_video_quota(uuid,uuid,integer,date,integer,integer) to service_role;
grant execute on function public.admin_reconcile_submission_item(uuid,uuid,uuid,text) to service_role;
