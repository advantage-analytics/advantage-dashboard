-- T10: immutable dual setup and independent atomic result items. No member
-- policy/grant changes; live guard_schedule_result is deliberately preserved.
create table public.admin_dual_batches (
  operation_id uuid primary key references public.admin_upload_submissions(operation_id),
  request jsonb not null check(jsonb_typeof(request)='object'),
  event_snapshot jsonb not null check(jsonb_typeof(event_snapshot)='object')
);
create table public.admin_schedule_result_targets (
  operation_id uuid not null,
  item_id uuid not null,
  entry_id uuid not null references public.program_event_entries(id),
  round_key text not null default '',
  entry_snapshot jsonb not null check(jsonb_typeof(entry_snapshot)='object'),
  primary key(operation_id,item_id),
  foreign key(operation_id,item_id) references public.admin_upload_submission_items(operation_id,item_id)
);
create index admin_schedule_result_targets_entry on public.admin_schedule_result_targets(entry_id,round_key);
alter table public.admin_dual_batches enable row level security;
alter table public.admin_schedule_result_targets enable row level security;
revoke all on public.admin_dual_batches,public.admin_schedule_result_targets from public,anon,authenticated,service_role;
grant select on public.admin_dual_batches,public.admin_schedule_result_targets to authenticated;
create policy admin_dual_batches_read on public.admin_dual_batches for select to authenticated using ((select public.is_admin()));
create policy admin_schedule_result_targets_read on public.admin_schedule_result_targets for select to authenticated using ((select public.is_admin()));

create function admin_uploads_private.dual_snapshot(p_program_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.program_events; entries jsonb;
begin
  select * into e from public.program_events where id=p_event_id and program_id=p_program_id;
  if not found or e.kind<>'dual' then raise exception 'dual-not-found' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(l)-'updated_at' order by l.slot,l.id),'[]') into entries from public.program_event_entries l where event_id=e.id and program_id=p_program_id;
  return jsonb_build_object('event',to_jsonb(e)-'updated_at','entries',entries);
end;
$$;
revoke all on function admin_uploads_private.dual_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create function admin_uploads_private.dual_roster_name(p_program_id uuid,p_player_id uuid,p_actor_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare name text;
begin
  select trim(pp.first_name||' '||pp.last_name) into name from public.program_players pp
    where pp.program_id=p_program_id and (pp.id=p_player_id or pp.claimed_by_user_id=p_player_id)
    and pp.archived_at is null and pp.merged_into_id is null
    and (pp.claimed_by_user_id=p_actor_id or not exists(select 1 from public.program_members pm where pm.program_id=p_program_id and pm.user_id=pp.claimed_by_user_id and pm.role<>'player'))
    order by (pp.id=p_player_id) desc,pp.id limit 1 for share;
  if name is null and not exists(select 1 from public.program_players where program_id=p_program_id and claimed_by_user_id=p_player_id and merged_into_id is null) then
    select trim(coalesce(u.first_name,'')||' '||coalesce(u.last_name,'')) into name from public.users u join public.program_members pm on pm.user_id=u.id
      where pm.program_id=p_program_id and pm.user_id=p_player_id and pm.role='player' for share of u,pm;
  end if;
  if name is null or name='' then raise exception 'athlete-ineligible' using errcode='22023'; end if;
  return name;
end;
$$;
revoke all on function admin_uploads_private.dual_roster_name(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.admin_get_dual_result_context(p_actor_id uuid,p_program_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  snapshot:=admin_uploads_private.dual_snapshot(p_program_id,p_event_id);
  return snapshot||jsonb_build_object('fingerprint',md5(snapshot::text));
end;
$$;
revoke all on function public.admin_get_dual_result_context(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_get_dual_result_context(uuid,uuid,uuid) to service_role;

create function public.admin_dual_result_status(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.admin_upload_submissions; items jsonb;
begin
  select * into s from public.admin_upload_submissions where operation_id=p_operation_id;
  if not found or s.actor_user_id is distinct from p_actor_id or s.kind<>'dual' or not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'operation-unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'slot',i.request->>'slot','status',i.status,'matchId',i.match_id,'outcomeId',i.outcome_id,'error',i.error_code) order by i.request->>'slot'),'[]') into items
    from public.admin_upload_submission_items i where operation_id=p_operation_id;
  return jsonb_build_object('operationId',p_operation_id,'eventId',s.event_id,'items',items);
end;
$$;
revoke all on function public.admin_dual_result_status(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_dual_result_status(uuid,uuid) to service_role;

create function public.admin_prepare_dual_results(p_actor_id uuid,p_operation_id uuid,p_program_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  saved public.admin_dual_batches; submission public.admin_upload_submissions;
  v_event_id uuid; e public.program_events; entry public.program_event_entries;
  snapshot jsonb; line jsonb; item jsonb; result jsonb; d jsonb:=p_request->'event'->'dual';
  player text; expected_name text; i integer; count_players integer; opponent uuid;
  previous_actor text:=current_setting('request.jwt.claim.sub',true);
  slots text[]:=array['S1','S2','S3','S4','S5','S6','D1','D2','D3'];
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  -- No setup writes precede validation. Advisory lock handles an absent op row.
  perform pg_advisory_xact_lock(hashtext('admin-dual:'||p_operation_id::text));
  select * into submission from public.admin_upload_submissions where operation_id=p_operation_id for update;
  if found and (submission.actor_user_id is distinct from p_actor_id or submission.program_id is distinct from p_program_id or submission.kind<>'dual') then raise exception 'operation-identity-conflict' using errcode='22023'; end if;
  select * into saved from public.admin_dual_batches where operation_id=p_operation_id;
  if found then
    if saved.request is distinct from p_request then raise exception 'setup-identity-conflict' using errcode='22023'; end if;
    return public.admin_dual_result_status(p_actor_id,p_operation_id);
  end if;
  if submission.operation_id is not null then raise exception 'operation-already-used' using errcode='22023'; end if;
  perform 1 from public.programs where id=p_program_id and status in ('active','claim_pending') for share;
  if not found then raise exception 'program-inactive' using errcode='22023'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' or p_request->>'operationId' is distinct from p_operation_id::text or p_request->>'programId' is distinct from p_program_id::text
    or jsonb_typeof(p_request->'items') is distinct from 'array' or jsonb_array_length(p_request->'items') not between 1 and 9 then raise exception 'invalid-dual-request' using errcode='22023'; end if;
  if (select count(distinct v->>'itemId') from jsonb_array_elements(p_request->'items') v)<>jsonb_array_length(p_request->'items')
    or (select count(distinct v->>'slot') from jsonb_array_elements(p_request->'items') v)<>jsonb_array_length(p_request->'items') then raise exception 'duplicate-items' using errcode='22023'; end if;
  if p_request->'event'->>'kind'='existing' then
    v_event_id:=(p_request->'event'->>'eventId')::uuid;
    select * into e from public.program_events where id=v_event_id and program_id=p_program_id for share;
    if not found or e.kind<>'dual' then raise exception 'dual-not-found' using errcode='22023'; end if;
    perform 1 from public.program_event_entries where event_id=e.id order by id for update;
    snapshot:=admin_uploads_private.dual_snapshot(p_program_id,v_event_id);
    if p_request->'event'->>'fingerprint' is distinct from md5(snapshot::text) then raise exception 'stale-dual' using errcode='22023'; end if;
  elsif p_request->'event'->>'kind'='new' then
    if jsonb_typeof(d->'lines') is distinct from 'array' or jsonb_array_length(d->'lines')<>9 or coalesce(trim(d->>'opponent'),'')='' or coalesce(d->>'site','') not in ('home','away','neutral')
      or coalesce((d->>'bestOf')::integer,0) not in (1,3,5) or coalesce((d->>'doublesGamesTo')::integer,0) not in (6,8) or jsonb_typeof(d->'doublesAdScoring') is distinct from 'boolean'
      or (coalesce(jsonb_typeof(d->'adScoring'),'') not in ('boolean','null')) then raise exception 'invalid-dual-setup' using errcode='22023'; end if;
    if coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid-date' using errcode='22023'; end if;
    perform (d->>'date')::date;
    if d->>'startsAtTime' is not null then perform (d->>'startsAtTime')::time; end if;
    if (select count(distinct v->>'slot') from jsonb_array_elements(d->'lines') v)<>9 then raise exception 'invalid-lineup' using errcode='22023'; end if;
    for line in select value from jsonb_array_elements(d->'lines') loop
      count_players:=case when left(line->>'slot',1)='D' then 2 else 1 end;
      if not (coalesce(line->>'slot','')=any(slots)) or line->>'discipline' is distinct from (case when count_players=2 then 'doubles' else 'singles' end)
        or jsonb_typeof(line->'playerUserIds') is distinct from 'array' or jsonb_typeof(line->'playerLabels') is distinct from 'array' or jsonb_typeof(line->'opponentLabels') is distinct from 'array'
        or coalesce(line->>'position','') !~ '^\d+$'
        or jsonb_array_length(line->'opponentLabels') not in (0,count_players)
        or exists(select 1 from jsonb_array_elements(line->'opponentLabels') v where jsonb_typeof(v)<>'string' or trim(v#>>'{}')='')
        or jsonb_array_length(line->'playerUserIds')<>jsonb_array_length(line->'playerLabels')
        or jsonb_array_length(line->'playerUserIds')<>(case when coalesce((line->>'noPlayer')::boolean,false) then 0 else count_players end) then raise exception 'invalid-lineup' using errcode='22023'; end if;
      for i in 0..jsonb_array_length(line->'playerUserIds')-1 loop
        expected_name:=admin_uploads_private.dual_roster_name(p_program_id,(line->'playerUserIds'->>i)::uuid,p_actor_id);
        if lower(trim(line->'playerLabels'->>i)) is distinct from lower(expected_name) then raise exception 'player-mismatch' using errcode='22023'; end if;
      end loop;
      if coalesce((line->>'noPlayer')::boolean,false) or coalesce((line->>'opponentNoPlayer')::boolean,false) then
        if coalesce((line->>'noPlayer')::boolean,false) and coalesce((line->>'opponentNoPlayer')::boolean,false) then raise exception 'invalid-lineup' using errcode='22023'; end if;
        if coalesce((line->>'opponentNoPlayer')::boolean,false) and jsonb_array_length(line->'opponentLabels')<>0 then raise exception 'invalid-lineup' using errcode='22023'; end if;
        if not exists(select 1 from jsonb_array_elements(p_request->'items') v where v->>'slot'=line->>'slot' and v->'result'->>'kind'='outcome' and v->'result'->>'outcome'='forfeit' and v->'result'->>'side'=case when coalesce((line->>'noPlayer')::boolean,false) then 'ours' else 'theirs' end) then raise exception 'missing-lineup-forfeit' using errcode='22023'; end if;
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(d->'lines') l cross join lateral jsonb_array_elements_text(l->'playerUserIds') p group by l->>'discipline',p having count(*)>1) then raise exception 'duplicate-lineup-athlete' using errcode='22023'; end if;
    if d->>'opponentProgramKey' is not null then
      select id into opponent from public.programs where program_key=d->>'opponentProgramKey';
      if opponent=p_program_id then opponent:=null; end if;
    end if;
  else raise exception 'invalid-dual-setup' using errcode='22023'; end if;
  -- Validate every submitted result before creating any event, provenance or item.
  for item in select value from jsonb_array_elements(p_request->'items') loop
    perform (item->>'itemId')::uuid;
    if item->>'itemId' is null or not (coalesce(item->>'slot','')=any(slots)) then raise exception 'invalid-result-target' using errcode='22023'; end if;
    if v_event_id is not null then
      select * into entry from public.program_event_entries where event_id=e.id and program_id=p_program_id and slot=item->>'slot';
      if not found then raise exception 'entry-not-found' using errcode='22023'; end if;
      line:=jsonb_build_object('playerUserIds',entry.player_user_ids,'playerLabels',entry.player_labels,'opponentLabels',entry.opponent_labels,'noPlayer',false,'opponentNoPlayer',false);
    else select value into line from jsonb_array_elements(d->'lines') where value->>'slot'=item->>'slot'; end if;
    result:=item->'result';
    count_players:=case when left(item->>'slot',1)='D' then 2 else 1 end;
    if result->>'kind'='score' then
      if jsonb_typeof(result->'ourGames') is distinct from 'array' or jsonb_typeof(result->'theirGames') is distinct from 'array'
        or jsonb_array_length(result->'ourGames') not between 1 and 5 or jsonb_array_length(result->'ourGames')<>jsonb_array_length(result->'theirGames')
        or jsonb_typeof(result->'ourTiebreaks') is distinct from 'array' or jsonb_typeof(result->'theirTiebreaks') is distinct from 'array'
        or jsonb_array_length(result->'ourTiebreaks') not in (0,jsonb_array_length(result->'ourGames')) or jsonb_array_length(result->'theirTiebreaks') not in (0,jsonb_array_length(result->'ourGames'))
        or jsonb_array_length(line->'playerUserIds')<>count_players or jsonb_array_length(line->'playerLabels')<>count_players
        or jsonb_typeof(result->'opponentLabels') is distinct from 'array' or jsonb_array_length(result->'opponentLabels')<>count_players then raise exception 'invalid-score' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements((result->'ourGames')||(result->'theirGames')) v where jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>99)
        or exists(select 1 from jsonb_array_elements((result->'ourTiebreaks')||(result->'theirTiebreaks')) v where v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>999))
        or exists(select 1 from jsonb_array_elements_text(result->'opponentLabels') v where trim(v)='') then raise exception 'invalid-score' using errcode='22023'; end if;
      if result->'ending' is distinct from 'null'::jsonb and (coalesce(result->'ending'->>'kind','') not in ('retired','defaulted') or coalesce(result->'ending'->>'side','') not in ('ours','theirs') or jsonb_typeof(result->'ending') is distinct from 'object') then raise exception 'invalid-ending' using errcode='22023'; end if;
      for player in select value from jsonb_array_elements_text(line->'playerUserIds') loop perform admin_uploads_private.dual_roster_name(p_program_id,player::uuid,p_actor_id); end loop;
      -- Known participant labels cannot be silently replaced by console input.
      if jsonb_array_length(line->'opponentLabels')>0 and line->'opponentLabels' is distinct from result->'opponentLabels' then raise exception 'opponent-mismatch' using errcode='22023'; end if;
    elsif result->>'kind'='outcome' then
      if coalesce(result->>'outcome','') not in ('forfeit','default','withdrawal') or coalesce(result->>'side','') not in ('ours','theirs') then raise exception 'invalid-outcome' using errcode='22023'; end if;
    else raise exception 'invalid-result' using errcode='22023'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  insert into public.admin_upload_submissions(operation_id,actor_user_id,program_id,kind) values(p_operation_id,p_actor_id,p_program_id,'dual');
  if v_event_id is null then
    insert into public.program_events(program_id,kind,name,starts_on,ends_on,starts_at_time,site,surface,format,created_by)
      values(p_program_id,'dual',trim(d->>'opponent'),(d->>'date')::date,(d->>'date')::date,(d->>'startsAtTime')::time,d->>'site',nullif(d->>'surface',''),
        jsonb_build_object('best_of',d->'bestOf','ad_scoring',d->'adScoring','doubles',jsonb_build_object('games_to',d->'doublesGamesTo','ad_scoring',d->'doublesAdScoring')),p_actor_id) returning id into v_event_id;
    for line in select value from jsonb_array_elements(d->'lines') loop
      insert into public.program_event_entries(event_id,program_id,discipline,slot,position,player_user_ids,player_labels,opponent_labels,opponent_program_id)
        values(v_event_id,p_program_id,line->>'discipline',line->>'slot',(line->>'position')::integer,
          array(select v::uuid from jsonb_array_elements_text(line->'playerUserIds') v),array(select trim(v) from jsonb_array_elements_text(line->'playerLabels') v),array(select trim(v) from jsonb_array_elements_text(line->'opponentLabels') v),opponent);
    end loop;
  end if;
  snapshot:=admin_uploads_private.dual_snapshot(p_program_id,v_event_id);
  insert into public.admin_dual_batches values(p_operation_id,p_request,snapshot->'event');
  perform admin_uploads_private.link_event(p_operation_id,v_event_id,jsonb_build_object('eventId',v_event_id));
  for item in select value from jsonb_array_elements(p_request->'items') loop
    select * into entry from public.program_event_entries l where l.event_id=v_event_id and l.program_id=p_program_id and l.slot=item->>'slot';
    perform public.admin_begin_upload_item(p_operation_id,(item->>'itemId')::uuid,p_program_id,'dual',case when item->'result'->>'kind'='score' then 'match' else 'outcome' end,item);
    insert into public.admin_schedule_result_targets values(p_operation_id,(item->>'itemId')::uuid,entry.id,'',to_jsonb(entry)-'updated_at');
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return public.admin_dual_result_status(p_actor_id,p_operation_id);
end;
$$;
revoke all on function public.admin_prepare_dual_results(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_prepare_dual_results(uuid,uuid,uuid,jsonb) to service_role;

-- Entry version locks mirror live guard_schedule_result's UPDATE id=id. At
-- READ COMMITTED a waiter observes the winning target/result; repeatable-read
-- conflicts abort rather than silently writing from an obsolete snapshot.
create function admin_uploads_private.guard_reserved_schedule_result()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_entry uuid; grain text; authorized boolean;
begin
  if tg_table_name='matches' then
    target_entry:=new.event_entry_id;
    if tg_op='UPDATE' and new.event_entry_id is not distinct from old.event_entry_id and new.round is not distinct from old.round then return new; end if;
  else target_entry:=new.entry_id; end if;
  if target_entry is null then return new; end if;
  -- Do not reveal another program's intent to an unauthorized session.
  if current_setting('role',true) in ('authenticated','anon') and not exists(select 1 from public.program_event_entries l join public.program_members m on m.program_id=l.program_id where l.id=target_entry and m.user_id=auth.uid()) then return new; end if;
  update public.program_event_entries set id=id where id=target_entry;
  select case when e.kind='dual' then '' else coalesce(new.round,'') end into grain from public.program_events e join public.program_event_entries l on l.event_id=e.id where l.id=target_entry;
  authorized:=current_setting('role',true)='service_role'
    and exists(select 1 from public.admin_schedule_result_targets t join public.admin_upload_submissions s using(operation_id) join public.admin_upload_submission_items i using(operation_id,item_id)
      where t.entry_id=target_entry and t.round_key=grain and i.status<>'succeeded'
      and t.operation_id::text=current_setting('admin_uploads.operation',true) and t.item_id::text=current_setting('admin_uploads.item',true)
      and s.program_id=new.program_id and exists(select 1 from public.users where id=s.actor_user_id and is_admin));
  if not coalesce(authorized,false) and exists(select 1 from public.admin_schedule_result_targets t join public.admin_upload_submission_items i using(operation_id,item_id)
      where t.entry_id=target_entry and t.round_key=grain and i.status in ('pending','succeeded')) then raise exception 'console-result-reserved' using errcode='40001'; end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.guard_reserved_schedule_result() from public,anon,authenticated,service_role;
create trigger admin_reserved_match_result before insert or update of event_entry_id,round on public.matches for each row execute function admin_uploads_private.guard_reserved_schedule_result();
create trigger admin_reserved_outcome_result before insert on public.program_event_outcomes for each row execute function admin_uploads_private.guard_reserved_schedule_result();

create function public.admin_apply_dual_result(p_actor_id uuid,p_operation_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.admin_upload_submissions; item public.admin_upload_submission_items; target public.admin_schedule_result_targets;
  batch public.admin_dual_batches; entry public.program_event_entries; e public.program_events;
  result jsonb; score jsonb; format jsonb; match_id uuid; outcome_id uuid; player uuid; err text;
  previous_actor text:=current_setting('request.jwt.claim.sub',true);
  previous_claims text:=current_setting('request.jwt.claims',true);
  previous_operation text:=current_setting('admin_uploads.operation',true);
  previous_item text:=current_setting('admin_uploads.item',true);
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  select * into s from public.admin_upload_submissions where operation_id=p_operation_id for update;
  if not found or s.actor_user_id is distinct from p_actor_id or s.kind<>'dual' then raise exception 'operation-unavailable' using errcode='42501'; end if;
  select * into strict item from public.admin_upload_submission_items where operation_id=p_operation_id and item_id=p_item_id for update;
  if item.status='succeeded' then return public.admin_dual_result_status(p_actor_id,p_operation_id); end if;
  select * into strict target from public.admin_schedule_result_targets where operation_id=p_operation_id and item_id=p_item_id;
  select * into strict batch from public.admin_dual_batches where operation_id=p_operation_id;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  -- Each item is its own transaction. A caught refusal persists only failure
  -- state; the subtransaction rolls back its match/outcome/audit together.
  begin
    perform 1 from public.programs where id=s.program_id and status in ('active','claim_pending') for share;
    if not found then raise exception 'program-inactive' using errcode='22023'; end if;
    select * into e from public.program_events where id=s.event_id and program_id=s.program_id for share;
    if not found or (to_jsonb(e)-'updated_at') is distinct from batch.event_snapshot then raise exception 'stale-event' using errcode='22023'; end if;
    update public.program_event_entries set id=id where id=target.entry_id and program_id=s.program_id returning * into entry;
    if not found or (to_jsonb(entry)-'updated_at') is distinct from target.entry_snapshot then raise exception 'stale-entry' using errcode='22023'; end if;
    if entry.forfeit is not null or exists(select 1 from public.matches where event_entry_id=entry.id) or exists(select 1 from public.program_event_outcomes where entry_id=entry.id) then raise exception 'result-already-recorded' using errcode='22023'; end if;
    result:=item.request->'result';
    perform set_config('admin_uploads.operation',p_operation_id::text,true);
    perform set_config('admin_uploads.item',p_item_id::text,true);
    if item.kind='outcome' then
      -- The verified live guard has a deliberate no-session service branch.
      -- Keep it intact: remove only the temporary actor claim for this INSERT,
      -- supply actor_user_id explicitly, restore BEFORE provenance/audit.
      perform set_config('request.jwt.claim.sub','',true);
      perform set_config('request.jwt.claims',(coalesce(nullif(previous_claims,''),'{}')::jsonb-'sub')::text,true);
      insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side,actor_user_id)
        values(entry.id,e.id,s.program_id,'dual',null,result->>'outcome',result->>'side',p_actor_id) returning id into outcome_id;
      perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
      perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
    else
      foreach player in array entry.player_user_ids loop perform admin_uploads_private.dual_roster_name(s.program_id,player,p_actor_id); end loop;
      score:=jsonb_build_object('player1',result->'ourGames','player2',result->'theirGames','player1_tiebreaks',result->'ourTiebreaks','player2_tiebreaks',result->'theirTiebreaks');
      if result->'ending' is distinct from 'null'::jsonb then score:=score||jsonb_build_object('winner',case when result->'ending'->>'side'='ours' then 'player2' else 'player1' end); end if;
      format:=case when entry.discipline='doubles' then jsonb_build_object('best_of',1,'ad_scoring',case when e.format->'doubles' is not null then coalesce(e.format->'doubles'->'ad_scoring','null'::jsonb) else coalesce(e.format->'ad_scoring','null'::jsonb) end,'games_to',case when e.format->'doubles'->>'games_to'='8' then 8 else 6 end,'play_on_lets',false)
        else jsonb_build_object('best_of',coalesce(e.format->'best_of','3'::jsonb),'ad_scoring',coalesce(e.format->'ad_scoring','null'::jsonb),'play_on_lets',false) end;
      insert into public.matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,tournament_name,round,date,match_type,court_type,format,score,result,source_provider,analysis_method,private)
        values(p_actor_id,s.program_id,entry.id,case when entry.discipline='doubles' then null else entry.player_user_ids[1] end,
          array_to_string(entry.player_labels,' / '),(select string_agg(v,' / ' order by n) from jsonb_array_elements_text(result->'opponentLabels') with ordinality a(v,n)),e.name,entry.slot,
          (e.starts_on::text||'T12:00:00')::timestamptz,case when entry.discipline='doubles' then 'Doubles' else 'Singles' end,e.surface,format,score,
          case result->'ending'->>'kind' when 'retired' then 'Retired' when 'defaulted' then 'Defaulted' else 'Final Score' end,null,'manual',false) returning id into match_id;
    end if;
    perform admin_uploads_private.finish_item(p_operation_id,p_item_id,jsonb_build_object('matchId',match_id,'outcomeId',outcome_id,'slot',entry.slot),match_id,outcome_id);
  exception when others then
    get stacked diagnostics err=message_text;
    -- SET LOCAL values in the failed subtransaction have rolled back; restore
    -- explicitly as well so neither audit attribution nor the caller leaks.
    perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
    perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
    perform admin_uploads_private.finish_item(p_operation_id,p_item_id,jsonb_build_object('slot',item.request->>'slot'),null,null,null,null,err);
  end;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('admin_uploads.operation',coalesce(previous_operation,''),true);
  perform set_config('admin_uploads.item',coalesce(previous_item,''),true);
  return public.admin_dual_result_status(p_actor_id,p_operation_id);
end;
$$;
revoke all on function public.admin_apply_dual_result(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_apply_dual_result(uuid,uuid,uuid) to service_role;
