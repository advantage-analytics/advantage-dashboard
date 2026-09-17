-- T11: singles tournament results, immutable setup and exact entry/round claims.
create table public.admin_tournament_batches (
  operation_id uuid primary key references public.admin_upload_submissions(operation_id),
  request jsonb not null check(jsonb_typeof(request)='object'),
  event_snapshot jsonb not null check(jsonb_typeof(event_snapshot)='object')
);
alter table public.admin_tournament_batches enable row level security;
revoke all on public.admin_tournament_batches from public,anon,authenticated,service_role;
grant select on public.admin_tournament_batches to authenticated;
create policy admin_tournament_batches_read on public.admin_tournament_batches for select to authenticated using ((select public.is_admin()));

create function public.admin_get_tournament_result_context(p_actor_id uuid,p_program_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.program_events; entries jsonb; snapshot jsonb;
begin
 if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
 select * into e from public.program_events where id=p_event_id and program_id=p_program_id and kind='tournament';
 if not found then raise exception 'tournament-not-found' using errcode='22023'; end if;
 snapshot:=to_jsonb(e)-'updated_at';
 select coalesce(jsonb_agg((to_jsonb(l)-'updated_at')||jsonb_build_object('fingerprint',md5((to_jsonb(l)-'updated_at')::text)) order by l.position,l.id),'[]') into entries from public.program_event_entries l where event_id=e.id and program_id=p_program_id;
 return jsonb_build_object('event',snapshot,'fingerprint',md5(snapshot::text),'entries',entries);
end;
$$;
revoke all on function public.admin_get_tournament_result_context(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_get_tournament_result_context(uuid,uuid,uuid) to service_role;

create function public.admin_tournament_result_status(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.admin_upload_submissions; result jsonb; entry uuid;
begin
 select * into s from public.admin_upload_submissions where operation_id=p_operation_id;
 if not found or s.actor_user_id is distinct from p_actor_id or s.kind<>'tournament' or not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'operation-unavailable' using errcode='42501'; end if;
 select jsonb_build_object('itemId',i.item_id,'round',t.round_key,'status',i.status,'matchId',i.match_id,'outcomeId',i.outcome_id,'error',i.error_code),t.entry_id into result,entry
 from public.admin_upload_submission_items i join public.admin_schedule_result_targets t using(operation_id,item_id) where i.operation_id=p_operation_id;
 return jsonb_build_object('operationId',p_operation_id,'eventId',s.event_id,'entryId',entry,'item',result);
end;
$$;
revoke all on function public.admin_tournament_result_status(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_tournament_result_status(uuid,uuid) to service_role;

-- A claimed roster profile and its user ID are the same athlete identity.
create function admin_uploads_private.tournament_player_key(p_program_id uuid,p_player_id uuid)
returns uuid language sql stable security invoker set search_path='' as $$
 select coalesce((select pp.id from public.program_players pp where pp.program_id=p_program_id and (pp.id=p_player_id or pp.claimed_by_user_id=p_player_id) and pp.merged_into_id is null order by (pp.id=p_player_id) desc,pp.id limit 1),p_player_id);
$$;
revoke all on function admin_uploads_private.tournament_player_key(uuid,uuid) from public,anon,authenticated,service_role;

-- Every tournament-entry INSERT participates in the same event advisory lock.
-- Uniqueness refusal applies only when the existing identity is console-backed;
-- ordinary entry inserts otherwise retain their existing behavior.
create function admin_uploads_private.guard_console_tournament_entry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true) in ('authenticated','anon') and not exists(select 1 from public.program_members where program_id=new.program_id and user_id=auth.uid() and role in ('owner','coach','staff')) then return new; end if;
 if not exists(select 1 from public.program_events where id=new.event_id and program_id=new.program_id and kind='tournament') then return new; end if;
 perform pg_advisory_xact_lock(hashtext('admin-tournament-entry:'||new.event_id::text));
 if new.discipline='singles' and exists(select 1 from public.program_event_entries l
   where l.event_id=new.event_id and l.program_id=new.program_id and l.discipline='singles' and cardinality(new.player_user_ids)=1 and cardinality(l.player_user_ids)=1 and admin_uploads_private.tournament_player_key(new.program_id,l.player_user_ids[1])=admin_uploads_private.tournament_player_key(new.program_id,new.player_user_ids[1])
   and exists(select 1 from public.admin_schedule_result_targets t join public.admin_upload_submissions s using(operation_id) where t.entry_id=l.id and s.kind='tournament')) then
   raise exception 'console-entry-already-exists' using errcode='40001';
 end if;
 return new;
end;
$$;
revoke all on function admin_uploads_private.guard_console_tournament_entry() from public,anon,authenticated,service_role;
create trigger admin_console_tournament_entry before insert on public.program_event_entries for each row execute function admin_uploads_private.guard_console_tournament_entry();

create function public.admin_prepare_tournament_result(p_actor_id uuid,p_operation_id uuid,p_program_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.admin_upload_submissions; saved public.admin_tournament_batches; e public.program_events; entry public.program_event_entries;
 event_id uuid; entry_id uuid; item_id uuid; player_id uuid; player_name text; round_key text;
 d jsonb:=p_request->'event'->'tournament'; l jsonb:=p_request->'entry'; result jsonb:=p_request->'result';
 previous_actor text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('admin-tournament:'||p_operation_id::text));
 select * into s from public.admin_upload_submissions where operation_id=p_operation_id for update;
 if found and (s.actor_user_id is distinct from p_actor_id or s.program_id is distinct from p_program_id or s.kind<>'tournament') then raise exception 'operation-identity-conflict' using errcode='22023'; end if;
 select * into saved from public.admin_tournament_batches where operation_id=p_operation_id;
 if found then
   if saved.request is distinct from p_request then raise exception 'setup-identity-conflict' using errcode='22023'; end if;
   return public.admin_tournament_result_status(p_actor_id,p_operation_id);
 end if;
 if s.operation_id is not null then raise exception 'operation-already-used' using errcode='22023'; end if;
 perform 1 from public.programs where id=p_program_id and status in ('active','claim_pending') for share;
 if not found then raise exception 'program-inactive' using errcode='22023'; end if;
 if p_request->>'operationId' is distinct from p_operation_id::text or p_request->>'programId' is distinct from p_program_id::text then raise exception 'invalid-request' using errcode='22023'; end if;
 item_id:=(p_request->>'itemId')::uuid;player_id:=(l->>'playerId')::uuid;round_key:=p_request->>'round';
 if item_id is null or player_id is null or coalesce(round_key,'') not in ('Q1','Q2','Q3','R128','R64','R32','R16','QF','SF','F','C1','C2','C3') then raise exception 'invalid-result-target' using errcode='22023'; end if;
 player_name:=admin_uploads_private.dual_roster_name(p_program_id,player_id,p_actor_id);
 if p_request->'event'->>'kind'='existing' then
   event_id:=(p_request->'event'->>'eventId')::uuid;
   -- Lock order for entry creation: advisory event, event row, then entry.
   if l->>'kind'='new' then perform pg_advisory_xact_lock(hashtext('admin-tournament-entry:'||event_id::text)); end if;
   select * into e from public.program_events where id=event_id and program_id=p_program_id and kind='tournament' for share;
   if not found then raise exception 'tournament-not-found' using errcode='22023'; end if;
   if md5((to_jsonb(e)-'updated_at')::text) is distinct from p_request->'event'->>'fingerprint' then raise exception 'stale-tournament' using errcode='22023'; end if;
   if coalesce(e.format->>'best_of','') not in ('1','3','5') or coalesce(jsonb_typeof(e.format->'ad_scoring'),'') not in ('boolean','null') then raise exception 'invalid-format' using errcode='22023'; end if;
 elsif p_request->'event'->>'kind'='new' then
   if l->>'kind' is distinct from 'new' then raise exception 'invalid-entry' using errcode='22023'; end if;
   if jsonb_typeof(d->'name') is distinct from 'string' or coalesce(trim(d->>'name'),'')=''
     or jsonb_typeof(d->'surface') is distinct from 'string' or length(d->>'surface')>50 or coalesce(jsonb_typeof(d->'host'),'') not in ('string','null') or coalesce(d->>'startsOn','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(d->>'endsOn','') !~ '^\d{4}-\d{2}-\d{2}$'
     or (d->>'endsOn')::date<(d->>'startsOn')::date or coalesce(d->>'site','') not in ('home','away','neutral')
     or coalesce(d->>'bestOf','') not in ('1','3','5') or jsonb_typeof(d->'bestOf') is distinct from 'number' or jsonb_typeof(d->'adScoring') is distinct from 'boolean' then raise exception 'invalid-tournament' using errcode='22023'; end if;
 else raise exception 'invalid-tournament' using errcode='22023'; end if;
 if l->>'kind'='existing' then
   entry_id:=(l->>'entryId')::uuid;
   select * into entry from public.program_event_entries where id=entry_id and program_id=p_program_id and program_event_entries.event_id=e.id for update;
   if not found or entry.discipline<>'singles' or cardinality(entry.player_user_ids) is distinct from 1 or admin_uploads_private.tournament_player_key(p_program_id,entry.player_user_ids[1]) is distinct from admin_uploads_private.tournament_player_key(p_program_id,player_id) or cardinality(entry.player_labels) is distinct from 1 or coalesce(trim(entry.player_labels[1]),'')='' then raise exception 'participant-mismatch' using errcode='22023'; end if;
   if md5((to_jsonb(entry)-'updated_at')::text) is distinct from l->>'fingerprint' then raise exception 'stale-entry' using errcode='22023'; end if;
 elsif l->>'kind'='new' then
   if lower(trim(l->>'playerLabel')) is distinct from lower(player_name) or coalesce(jsonb_typeof(l->'draw'),'') not in ('string','null') or coalesce(jsonb_typeof(l->'seed'),'') not in ('number','null') then raise exception 'invalid-entry' using errcode='22023'; end if;
   if l->>'seed' is not null and ((l->>'seed') !~ '^\d+$' or (l->>'seed')::numeric not between 1 and 2147483647) then raise exception 'invalid-seed' using errcode='22023'; end if;
   if exists(select 1 from public.program_event_entries x where x.event_id=e.id and x.program_id=p_program_id and x.discipline='singles' and exists(select 1 from unnest(x.player_user_ids) p where admin_uploads_private.tournament_player_key(p_program_id,p)=admin_uploads_private.tournament_player_key(p_program_id,player_id))) then raise exception 'entry-already-exists' using errcode='22023'; end if;
 else raise exception 'invalid-entry' using errcode='22023'; end if;
    if result->>'kind'='score' then
      if jsonb_typeof(result->'ourGames') is distinct from 'array' or jsonb_typeof(result->'theirGames') is distinct from 'array'
        or jsonb_array_length(result->'ourGames') not between 1 and 5 or jsonb_array_length(result->'ourGames')<>jsonb_array_length(result->'theirGames')
        or jsonb_typeof(result->'ourTiebreaks') is distinct from 'array' or jsonb_typeof(result->'theirTiebreaks') is distinct from 'array'
        or jsonb_array_length(result->'ourTiebreaks') not in (0,jsonb_array_length(result->'ourGames')) or jsonb_array_length(result->'theirTiebreaks') not in (0,jsonb_array_length(result->'ourGames'))
        or jsonb_typeof(result->'opponentLabels') is distinct from 'array' or jsonb_array_length(result->'opponentLabels')<>1 then raise exception 'invalid-score' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements((result->'ourGames')||(result->'theirGames')) v where jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>99)
        or exists(select 1 from jsonb_array_elements((result->'ourTiebreaks')||(result->'theirTiebreaks')) v where v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>999))
        or exists(select 1 from jsonb_array_elements(result->'opponentLabels') v where jsonb_typeof(v)<>'string' or coalesce(trim(v#>>'{}'),'')='') then raise exception 'invalid-score' using errcode='22023'; end if;
      if result->'ending' is distinct from 'null'::jsonb and (coalesce(result->'ending'->>'kind','') not in ('retired','defaulted') or coalesce(result->'ending'->>'side','') not in ('ours','theirs') or jsonb_typeof(result->'ending') is distinct from 'object') then raise exception 'invalid-ending' using errcode='22023'; end if;
    elsif result->>'kind'='outcome' then
      if coalesce(result->>'outcome','') not in ('forfeit','default','withdrawal') or coalesce(result->>'side','') not in ('ours','theirs') then raise exception 'invalid-outcome' using errcode='22023'; end if;
    else raise exception 'invalid-result' using errcode='22023'; end if;

 -- All participant, event, entry, round, format and score validation is complete.
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 insert into public.admin_upload_submissions(operation_id,actor_user_id,program_id,kind) values(p_operation_id,p_actor_id,p_program_id,'tournament');
 if event_id is null then
   insert into public.program_events(program_id,kind,name,starts_on,ends_on,site,surface,host,format,created_by)
   values(p_program_id,'tournament',trim(d->>'name'),(d->>'startsOn')::date,(d->>'endsOn')::date,d->>'site',nullif(d->>'surface',''),nullif(d->>'host',''),jsonb_build_object('best_of',d->'bestOf','ad_scoring',d->'adScoring'),p_actor_id) returning * into e;
   event_id:=e.id;
 end if;
 if entry_id is null then
   insert into public.program_event_entries(event_id,program_id,discipline,slot,position,draw,seed,player_user_ids,player_labels)
   values(event_id,p_program_id,'singles',null,coalesce((select max(x.position)+1 from public.program_event_entries x where x.event_id=e.id),0),nullif(trim(l->>'draw'),''),(l->>'seed')::integer,array[player_id],array[player_name]) returning * into entry;
   entry_id:=entry.id;
 end if;
 insert into public.admin_tournament_batches values(p_operation_id,p_request,to_jsonb(e)-'updated_at');
 perform admin_uploads_private.link_event(p_operation_id,event_id,jsonb_build_object('eventId',event_id,'entryId',entry_id));
 perform public.admin_begin_upload_item(p_operation_id,item_id,p_program_id,'tournament',case when result->>'kind'='score' then 'match' else 'outcome' end,p_request);
 insert into public.admin_schedule_result_targets values(p_operation_id,item_id,entry_id,round_key,to_jsonb(entry)-'updated_at');
 perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
 return public.admin_tournament_result_status(p_actor_id,p_operation_id);
end;
$$;
revoke all on function public.admin_prepare_tournament_result(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_prepare_tournament_result(uuid,uuid,uuid,jsonb) to service_role;

create function public.admin_apply_tournament_result(p_actor_id uuid,p_operation_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.admin_upload_submissions; item public.admin_upload_submission_items; target public.admin_schedule_result_targets;
  batch public.admin_tournament_batches; entry public.program_event_entries; e public.program_events;
  result jsonb; score jsonb; format jsonb; match_id uuid; outcome_id uuid; err text;
  previous_actor text:=current_setting('request.jwt.claim.sub',true);
  previous_claims text:=current_setting('request.jwt.claims',true);
  previous_operation text:=current_setting('admin_uploads.operation',true);
  previous_item text:=current_setting('admin_uploads.item',true);
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  select * into s from public.admin_upload_submissions where operation_id=p_operation_id for update;
  if not found or s.actor_user_id is distinct from p_actor_id or s.kind<>'tournament' then raise exception 'operation-unavailable' using errcode='42501'; end if;
  select * into strict item from public.admin_upload_submission_items where operation_id=p_operation_id and item_id=p_item_id for update;
  if item.status='succeeded' then return public.admin_tournament_result_status(p_actor_id,p_operation_id); end if;
  select * into strict target from public.admin_schedule_result_targets where operation_id=p_operation_id and item_id=p_item_id;
  select * into strict batch from public.admin_tournament_batches where operation_id=p_operation_id;
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
    if entry.forfeit is not null or exists(select 1 from public.matches where event_entry_id=entry.id and round=target.round_key) or exists(select 1 from public.program_event_outcomes where entry_id=entry.id and round=target.round_key) then raise exception 'result-already-recorded' using errcode='22023'; end if;
    perform admin_uploads_private.dual_roster_name(s.program_id,entry.player_user_ids[1],p_actor_id);
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
        values(entry.id,e.id,s.program_id,'tournament',target.round_key,result->>'outcome',result->>'side',p_actor_id) returning id into outcome_id;
      perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
      perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
    else
      score:=jsonb_build_object('player1',result->'ourGames','player2',result->'theirGames','player1_tiebreaks',result->'ourTiebreaks','player2_tiebreaks',result->'theirTiebreaks');
      if result->'ending' is distinct from 'null'::jsonb then score:=score||jsonb_build_object('winner',case when result->'ending'->>'side'='ours' then 'player2' else 'player1' end); end if;
      format:=jsonb_build_object('best_of',e.format->'best_of','ad_scoring',e.format->'ad_scoring','play_on_lets',false);
      insert into public.matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,tournament_name,round,date,match_type,court_type,format,score,result,source_provider,analysis_method,private)
        values(p_actor_id,s.program_id,entry.id,entry.player_user_ids[1],
          array_to_string(entry.player_labels,' / '),(select string_agg(v,' / ' order by n) from jsonb_array_elements_text(result->'opponentLabels') with ordinality a(v,n)),e.name,target.round_key,
          (e.starts_on::text||'T12:00:00')::timestamptz,'Singles',e.surface,format,score,
          case result->'ending'->>'kind' when 'retired' then 'Retired' when 'defaulted' then 'Defaulted' else 'Final Score' end,null,'manual',false) returning id into match_id;
    end if;
    perform admin_uploads_private.finish_item(p_operation_id,p_item_id,jsonb_build_object('matchId',match_id,'outcomeId',outcome_id,'round',target.round_key),match_id,outcome_id);
  exception when others then
    get stacked diagnostics err=message_text;
    -- SET LOCAL values in the failed subtransaction have rolled back; restore
    -- explicitly as well so neither audit attribution nor the caller leaks.
    perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
    perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
    perform admin_uploads_private.finish_item(p_operation_id,p_item_id,jsonb_build_object('round',item.request->>'round'),null,null,null,null,err);
  end;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('admin_uploads.operation',coalesce(previous_operation,''),true);
  perform set_config('admin_uploads.item',coalesce(previous_item,''),true);
  return public.admin_tournament_result_status(p_actor_id,p_operation_id);
end;
$$;
revoke all on function public.admin_apply_tournament_result(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_apply_tournament_result(uuid,uuid,uuid) to service_role;
