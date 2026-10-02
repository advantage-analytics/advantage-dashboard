-- T6: server-validated SwingVision submissions. Apply with the process-match
-- claim integration. No client may assert that arbitrary bytes were validated.
create table public.admin_file_attempts (
  operation_id uuid not null,
  item_id uuid not null,
  match_id uuid not null unique references public.matches(id),
  file_id uuid not null unique references public.match_files(id),
  request jsonb not null,
  state text not null default 'queued' check (state in ('queued','processing','completed','failed')),
  claim_token uuid,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  primary key (operation_id,item_id),
  foreign key (operation_id,item_id) references public.admin_upload_submission_items(operation_id,item_id)
);
alter table public.admin_file_attempts enable row level security;
revoke all on public.admin_file_attempts from public, anon, authenticated, service_role;
grant select on public.admin_file_attempts to authenticated;
create policy admin_file_attempts_read on public.admin_file_attempts for select to authenticated using ((select public.is_admin()));

-- Only this server RPC can admit a validated file. The actor parameter is
-- supplied by requireAdmin(), never by the browser. Recheck privileges here.
create function public.admin_submit_match_file(
  p_actor_id uuid, p_operation_id uuid, p_item_id uuid, p_program_id uuid,
  p_match_id uuid, p_fingerprint text, p_request jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item public.admin_upload_submission_items;
  attempt public.admin_file_attempts;
  reservation public.admin_analysis_reservations;
  target uuid;
  file_id uuid;
  snapshot jsonb;
  parsed jsonb := p_request->'parsed';
  player uuid := (p_request->>'playerId')::uuid;
  player_name text;
  program_status text;
  previous_actor text := current_setting('request.jwt.claim.sub',true);
begin
  if not exists (select 1 from public.users where id=p_actor_id and is_admin) then
    raise exception 'admin-required' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  item := public.admin_begin_upload_item(p_operation_id,p_item_id,p_program_id,
    case when p_match_id is null then 'file' else 'analysis_attachment' end,
    case when p_match_id is null then 'match' else 'analysis_attachment' end,
    case when p_match_id is null then p_request else jsonb_build_object('match_id',p_match_id,'fingerprint',p_fingerprint) end);
  select * into attempt from public.admin_file_attempts where operation_id=p_operation_id and item_id=p_item_id for update;
  if found then
    if attempt.request is distinct from p_request then raise exception 'file-identity-conflict' using errcode='22023'; end if;
    perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
    return to_jsonb(attempt);
  end if;
  if item.status='succeeded' then raise exception 'item-already-used' using errcode='22023'; end if;
  if p_request->>'sha256' !~ '^[a-f0-9]{64}$' or p_request->>'storagePath' is distinct from
    '_admin-console/'||p_operation_id::text||'/'||p_item_id::text||'/'||(p_request->>'sha256')||'.xlsx'
    or parsed is null or jsonb_typeof(parsed->'score') is distinct from 'object' then
    raise exception 'invalid-file-request' using errcode='22023';
  end if;
  select status into program_status from public.programs where id=p_program_id for share;
  if not found then raise exception 'program-not-found' using errcode='22023'; end if;
  if p_match_id is not null then
    -- Match lock is acquired by the same guard used at preparation. Recheck all
    -- recorded context BEFORE adding a file/provider or producing any stats.
    snapshot := admin_uploads_private.attachment_snapshot(p_program_id,p_match_id);
    select * into reservation from public.admin_analysis_reservations where match_id=p_match_id for update;
    if not found or reservation.operation_id is distinct from p_operation_id or reservation.item_id is distinct from p_item_id then
      raise exception 'attachment-not-prepared' using errcode='22023';
    end if;
    if reservation.snapshot is distinct from snapshot or reservation.fingerprint is distinct from p_fingerprint then
      raise exception 'stale-target' using errcode='22023';
    end if;
    if lower(trim(snapshot->'match'->>'player1_name')) is distinct from lower(trim(parsed->>'player1_name'))
      or lower(trim(snapshot->'match'->>'player2_name')) is distinct from lower(trim(parsed->>'player2_name')) then
      raise exception 'player-mismatch' using errcode='22023';
    end if;
    if snapshot->'match'->'score'->'player1' is distinct from parsed->'score'->'player1'
      or snapshot->'match'->'score'->'player2' is distinct from parsed->'score'->'player2'
      or exists (
        select 1 from generate_series(0,jsonb_array_length(parsed->'score'->'player1')-1) n
        cross join (values ('player1_tiebreaks'),('player2_tiebreaks')) k(key)
        where coalesce(snapshot->'match'->'score'->k.key->n,'null'::jsonb) is distinct from coalesce(parsed->'score'->k.key->n,'null'::jsonb)
      )
      -- Coach-entered played results use 'Final Score', imports use '<name>
      -- Wins'. Both are compatible with the same completed scores. XLSX has
      -- no authoritative retired/defaulted ending, so fail closed for those.
      or (case when coalesce(snapshot->'match'->>'result','') in ('','Final Score')
        then parsed->>'winner' is null
        else snapshot->'match'->>'result' is distinct from parsed->>'result' end)
      or (snapshot->'match'->'score' ? 'winner' and snapshot->'match'->'score'->>'winner' is distinct from parsed->>'winner') then
      raise exception 'score-mismatch' using errcode='22023';
    end if;
    target := p_match_id;
    update public.matches set source_provider='swing-vision',analysis_method='elc' where id=target;
  else
    if program_status not in ('active','claim_pending') then raise exception 'program-inactive' using errcode='22023'; end if;
    -- Prefer the roster profile and do not resurrect an archived claimed row
    -- through its membership fallback. A staff seat alone is not an athlete.
    select trim(first_name||' '||last_name) into player_name from public.program_players pp
      where pp.program_id=p_program_id and pp.id=player
      and pp.archived_at is null and pp.merged_into_id is null
      and (pp.claimed_by_user_id=p_actor_id or not exists (select 1 from public.program_members pm where pm.program_id=p_program_id and pm.user_id=pp.claimed_by_user_id and pm.role<>'player'))
      order by pp.id limit 1 for share;
    if player_name is null and not exists (select 1 from public.program_players where program_id=p_program_id and claimed_by_user_id=player and merged_into_id is null) then
      select trim(coalesce(u.first_name,'')||' '||coalesce(u.last_name,'')) into player_name
        from public.users u join public.program_members pm on pm.user_id=u.id
        where u.id=player and pm.program_id=p_program_id and pm.role='player' for share of u,pm;
    end if;
    if player_name is null then raise exception 'athlete-ineligible' using errcode='22023'; end if;
    if lower(player_name) is distinct from lower(trim(parsed->>'player1_name')) then raise exception 'player-mismatch' using errcode='22023'; end if;
    insert into public.matches(created_by,program_id,player1_id,player1_name,player2_name,score,result,date,match_type,court_type,format,source_provider,analysis_method,private)
      values(p_actor_id,p_program_id,player,parsed->>'player1_name',parsed->>'player2_name',parsed->'score',parsed->>'result',
        (p_request->>'date')::timestamptz,p_request->>'matchType',p_request->>'courtType',parsed->'format','swing-vision','elc',false)
      returning id into target;
  end if;
  insert into public.match_files(match_id,uploaded_by,provider_id,file_name,file_size,storage_path,status)
    values(target,p_actor_id,'swing-vision',p_request->>'fileName',(p_request->>'fileSize')::bigint,p_request->>'storagePath','uploaded') returning id into file_id;
  insert into public.admin_file_attempts(operation_id,item_id,match_id,file_id,request)
    values(p_operation_id,p_item_id,target,file_id,p_request) returning * into attempt;
  perform admin_uploads_private.finish_item(p_operation_id,p_item_id,
    jsonb_build_object('matchId',target,'operationId',p_operation_id,'itemId',p_item_id),target,null,null,file_id);
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return to_jsonb(attempt);
end;
$$;
revoke all on function public.admin_submit_match_file(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_submit_match_file(uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;

-- Consulted for EVERY process-match call, so omitting console identifiers does
-- not bypass the durable claim. Caller auth is checked at the Edge boundary.
create function public.admin_claim_match_file(p_match_id uuid,p_actor_id uuid,p_service boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.admin_file_attempts; owner_id uuid;
begin
  select * into attempt from public.admin_file_attempts where match_id=p_match_id for update;
  if not found then return null; end if;
  select actor_user_id into owner_id from public.admin_upload_submissions where operation_id=attempt.operation_id;
  if not p_service and (p_actor_id is distinct from owner_id or not exists(select 1 from public.users where id=p_actor_id and is_admin)) then
    raise exception 'admin-required' using errcode='42501';
  end if;
  if attempt.state<>'queued' then return jsonb_build_object('claimed',false,'state',attempt.state,'operationId',attempt.operation_id,'itemId',attempt.item_id); end if;
  update public.admin_file_attempts set state='processing',claim_token=gen_random_uuid(),started_at=now()
    where match_id=p_match_id returning * into attempt;
  return to_jsonb(attempt)||jsonb_build_object('claimed',true,'actorId',owner_id);
end;
$$;
revoke all on function public.admin_claim_match_file(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_claim_match_file(uuid,uuid,boolean) to service_role;

create function public.admin_finish_match_file(p_match_id uuid,p_claim_token uuid,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.admin_file_attempts set state=case when p_error is null then 'completed' else 'failed' end,error_code=p_error,completed_at=now()
    where match_id=p_match_id and claim_token=p_claim_token and state='processing';
  if not found then raise exception 'invalid-file-claim' using errcode='22023'; end if;
end;
$$;
revoke all on function public.admin_finish_match_file(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_finish_match_file(uuid,uuid,text) to service_role;

-- Defense through asynchronous processing: only analysis fields may change on
-- an attached result while its attempt is queued/processing. After completion,
-- ordinary authorized result editing and account/roster repair remain possible.
create function admin_uploads_private.preserve_file_attachment()
returns trigger language plpgsql security definer set search_path='' as $$
declare protected text[] := array['id','created_by','program_id','event_entry_id','player1_id','player2_id','opponent_player_id','player1_name','player2_name','score','result','round','tournament_name','date','match_type','format','court_type','source_provider','analysis_method']; field text;
begin
  if exists(select 1 from public.admin_file_attempts a
    where a.match_id=old.id and a.state in ('queued','processing')) then
    foreach field in array protected loop
      if to_jsonb(old)->field is distinct from to_jsonb(new)->field then raise exception 'recorded-result-protected' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.preserve_file_attachment() from public,anon,authenticated,service_role;
create trigger preserve_admin_file_attachment before update on public.matches for each row execute function admin_uploads_private.preserve_file_attachment();

-- Existing permissive user-folder policies must never admit console storage.
create policy admin_file_storage_namespace on storage.objects as restrictive
  for all to authenticated,anon
  using (bucket_id <> 'match-data' or name not like '\_admin-console/%' escape '\')
  with check (bucket_id <> 'match-data' or name not like '\_admin-console/%' escape '\');

-- Serialize competing ordinary upload writers on the same parent match too.
create function admin_uploads_private.prevent_competing_file_analysis()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.matches where id=new.match_id for update;
  if exists(select 1 from public.admin_file_attempts where match_id=new.match_id) then
    raise exception 'analysis-already-submitted' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.prevent_competing_file_analysis() from public,anon,authenticated,service_role;
create trigger prevent_competing_admin_file before insert or update of match_id,storage_path on public.match_files for each row execute function admin_uploads_private.prevent_competing_file_analysis();
create trigger prevent_competing_admin_job before insert or update of match_id,status on public.processing_jobs for each row execute function admin_uploads_private.prevent_competing_file_analysis();
