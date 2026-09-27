-- T7: durable server-authorized video admission. Apply before deploying routes.
create table public.admin_video_attempts (
  operation_id uuid not null,
  item_id uuid not null,
  match_id uuid not null unique references public.matches(id),
  job_id uuid not null unique references public.processing_jobs(id),
  request jsonb not null,
  primary key(operation_id,item_id),
  foreign key(operation_id,item_id) references public.admin_upload_submission_items(operation_id,item_id)
);
alter table public.admin_video_attempts enable row level security;
revoke all on public.admin_video_attempts from public,anon,authenticated,service_role;
grant select on public.admin_video_attempts to authenticated,service_role;
create policy admin_video_attempts_read on public.admin_video_attempts for select to authenticated using ((select public.is_admin()));

create function public.admin_submit_match_video(
  p_actor_id uuid,p_operation_id uuid,p_item_id uuid,p_program_id uuid,
  p_match_id uuid,p_fingerprint text,p_request jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item public.admin_upload_submission_items;
  attempt public.admin_video_attempts;
  reservation public.admin_analysis_reservations;
  snapshot jsonb;
  target uuid;
  job uuid;
  player uuid := (p_request->>'playerId')::uuid;
  player_name text;
  previous_actor text := current_setting('request.jwt.claim.sub',true);
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  item := public.admin_begin_upload_item(p_operation_id,p_item_id,p_program_id,
    case when p_match_id is null then 'video' else 'analysis_attachment' end,
    case when p_match_id is null then 'match' else 'analysis_attachment' end,
    case when p_match_id is null then p_request else jsonb_build_object('match_id',p_match_id,'fingerprint',p_fingerprint) end);
  select * into attempt from public.admin_video_attempts where operation_id=p_operation_id and item_id=p_item_id for update;
  if found then
    if attempt.request is distinct from p_request then raise exception 'video-identity-conflict' using errcode='22023'; end if;
    perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
    return to_jsonb(attempt);
  end if;
  if item.status='succeeded' then raise exception 'item-already-used' using errcode='22023'; end if;
  perform 1 from public.programs where id=p_program_id and status='active' for share;
  if not found then raise exception 'program-inactive' using errcode='22023'; end if;
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
$$;
revoke all on function public.admin_submit_match_video(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_submit_match_video(uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;

-- Mandatory discovery by match/job, regardless of client-supplied identifiers.
-- A service route supplies the verified session actor, never a body actor.
create function public.admin_video_access(p_actor_id uuid,p_match_id uuid,p_job_id uuid,p_action text,p_blob_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  perform 1 from public.programs where id=s.program_id and status='active' for share;
  if not found then raise exception 'program-inactive' using errcode='22023'; end if;
  if m.player1_id is null or not (
    exists(select 1 from public.program_players pp where pp.program_id=s.program_id and (pp.id=m.player1_id or pp.claimed_by_user_id=m.player1_id) and pp.archived_at is null and pp.merged_into_id is null
      and (pp.claimed_by_user_id=p_actor_id or not exists(select 1 from public.program_members pm where pm.program_id=s.program_id and pm.user_id=pp.claimed_by_user_id and pm.role<>'player')))
    or (not exists(select 1 from public.program_players where program_id=s.program_id and claimed_by_user_id=m.player1_id and merged_into_id is null)
      and exists(select 1 from public.program_members where program_id=s.program_id and user_id=m.player1_id and role='player'))
  ) then raise exception 'athlete-ineligible' using errcode='22023'; end if;
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
  return jsonb_build_object('operationId',a.operation_id,'itemId',a.item_id,'programId',s.program_id,'matchId',m.id,'jobId',j.id,'status',j.status);
end;
$$;
revoke all on function public.admin_video_access(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_video_access(uuid,uuid,uuid,text,text) to service_role;

-- Keep T6's file exclusion and add video exclusion; ordinary writers serialize
-- on the parent too. Updates of the one reserved video job remain valid.
create or replace function admin_uploads_private.prevent_competing_file_analysis()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.matches where id=new.match_id for update;
  if exists(select 1 from public.admin_file_attempts where match_id=new.match_id)
    or exists(select 1 from public.admin_video_attempts where match_id=new.match_id and (tg_table_name<>'processing_jobs' or job_id<>new.id)) then
    raise exception 'analysis-already-submitted' using errcode='22023';
  end if;
  return new;
end;
$$;

-- Permit only the existing uploader's heartbeat, remux, terminal transfer and
-- error writes through RLS. Neither owner nor admin may forge vendor state or
-- move the durable job. No broad matches UPDATE policy is introduced.
create function admin_uploads_private.guard_video_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.admin_video_attempts;
begin
  select * into a from public.admin_video_attempts where job_id=old.id;
  if not found then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then raise exception 'video-job-protected' using errcode='22023'; end if;
  if new.id is distinct from old.id or new.match_id is distinct from old.match_id or new.created_by is distinct from old.created_by
    or new.provider is distinct from old.provider or new.initial_top_player_is_player1 is distinct from old.initial_top_player_is_player1
    or new.ad_scoring is distinct from old.ad_scoring or new.fixed_camera is distinct from old.fixed_camera then raise exception 'video-job-protected' using errcode='22023'; end if;
  if current_setting('request.jwt.claim.role',true) in ('authenticated','anon') or current_setting('role',true) in ('authenticated','anon') then
    if auth.uid() is distinct from old.created_by or not public.is_admin() then raise exception 'admin-required' using errcode='42501'; end if;
    if (to_jsonb(new)-array['status','upload_progress_percent','updated_at','error_message','start_time_seconds','end_time_seconds','billable_seconds'])
      is distinct from (to_jsonb(old)-array['status','upload_progress_percent','updated_at','error_message','start_time_seconds','end_time_seconds','billable_seconds']) then raise exception 'video-job-protected' using errcode='22023'; end if;
    if old.status not in ('pending','uploading','uploaded') or (new.status is distinct from old.status and (old.status='uploaded' or new.status not in ('uploading','uploaded','failed'))) then raise exception 'video-state-protected' using errcode='22023'; end if;
    if new.start_time_seconds is distinct from old.start_time_seconds or new.end_time_seconds is distinct from old.end_time_seconds or new.billable_seconds is distinct from old.billable_seconds then
      if old.status not in ('pending','uploading') or new.start_time_seconds<>0 or new.end_time_seconds<=0
        or new.end_time_seconds>(a.request->>'endSeconds')::numeric-(a.request->>'startSeconds')::numeric+1
        or new.billable_seconds is distinct from ceil(new.end_time_seconds)::integer then raise exception 'invalid-remux-window' using errcode='22023'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.guard_video_job() from public,anon,authenticated,service_role;
create trigger guard_admin_video_job before update or delete on public.processing_jobs for each row execute function admin_uploads_private.guard_video_job();

create function admin_uploads_private.preserve_video_result()
returns trigger language plpgsql security definer set search_path='' as $$
declare field text;
begin
  if exists(select 1 from public.admin_video_attempts a join public.processing_jobs j on j.id=a.job_id where a.match_id=old.id and (j.status not in ('failed','completed','derivation_failed') or (j.status='completed' and j.derivation_version is null))) then
    foreach field in array array['id','created_by','program_id','event_entry_id','player1_id','player2_id','opponent_player_id','player1_name','player2_name','score','result','round','tournament_name','date','match_type','format','court_type','source_provider','analysis_method'] loop
      if to_jsonb(old)->field is distinct from to_jsonb(new)->field then raise exception 'recorded-result-protected' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.preserve_video_result() from public,anon,authenticated,service_role;
create trigger preserve_admin_video_result before update on public.matches for each row execute function admin_uploads_private.preserve_video_result();

-- Linkage/audit succeeds once at admission; result.state follows asynchronous
-- processing without claiming that vendor completion already contains stats.
create function admin_uploads_private.video_outcome()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.admin_upload_submission_items i set result=i.result||jsonb_build_object('state',
    case when new.status='completed' and new.derivation_version is null then 'stats_pending' else new.status end),
    error_code=new.error_message,updated_at=now()
    from public.admin_video_attempts a where a.job_id=new.id and i.operation_id=a.operation_id and i.item_id=a.item_id;
  return new;
end;
$$;
revoke all on function admin_uploads_private.video_outcome() from public,anon,authenticated,service_role;
create trigger admin_video_outcome after update on public.processing_jobs for each row execute function admin_uploads_private.video_outcome();

-- Actual spend revalidates the target in the same transaction as the existing
-- quota function. Caps are server configuration; program identity/tier are DB
-- facts and cannot be supplied by the browser or active-workspace cookie.
create function public.admin_reserve_video_quota(p_actor_id uuid,p_job_id uuid,p_seconds integer,p_billing_month date,p_program_cap integer,p_individual_cap integer)
returns table(ok boolean,used_seconds integer,cap_seconds integer)
language plpgsql security definer set search_path='' as $$
declare access jsonb; j public.processing_jobs; p public.programs;
begin
  access := public.admin_video_access(p_actor_id,null,p_job_id,'read');
  if access is null then raise exception 'video-operation-required' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id for update;
  select * into p from public.programs where id=(access->>'programId')::uuid for share;
  if j.status is distinct from 'submitting' or j.external_job_id is not null
    or p_seconds is distinct from ceil(j.end_time_seconds-j.start_time_seconds)::integer
    or p_seconds is null or p_seconds<=0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
  if exists(select 1 from public.processing_usage where job_id=p_job_id) then raise exception 'video-quota-already-reserved' using errcode='22023'; end if;
  return query select * from public.reserve_processing_quota(p_job_id,p.id,'program',p_actor_id,p_billing_month,p_seconds,
    case when p.org_type='college' then p_program_cap else p_individual_cap end);
end;
$$;
revoke all on function public.admin_reserve_video_quota(uuid,uuid,integer,date,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_reserve_video_quota(uuid,uuid,integer,date,integer,integer) to service_role;

create function admin_uploads_private.preserve_video_entry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.admin_video_attempts a join public.matches m on m.id=a.match_id join public.processing_jobs j on j.id=a.job_id
    where m.event_entry_id=old.id and (j.status not in ('failed','completed','derivation_failed') or (j.status='completed' and j.derivation_version is null))) then
    if tg_op='DELETE' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'recorded-entry-protected' using errcode='22023'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.preserve_video_entry() from public,anon,authenticated,service_role;
create trigger preserve_admin_video_entry before update or delete on public.program_event_entries for each row execute function admin_uploads_private.preserve_video_entry();
