-- Store a schedule event's surface in the Court field's spelling.
--
-- matches.court_type holds the upload wizard's values ("Outdoor Hard Court",
-- "Indoor Hard Court", "Clay Court", "Grass Court" — COURT_OPTIONS in
-- src/components/dashboard/matches/new-match-wizard/court-options.ts), while
-- program_events.surface holds a bare one ("hard"). Three functions copied the
-- bare value straight onto a match, so attaching a wizard upload to a line on a
-- hard-court event overwrote "Outdoor Hard Court" with "hard", and an admin
-- dual or tournament result wrote "hard" outright.
--
-- court_type_for_surface() is the SQL twin of surfaceToCourtType() in that
-- file: the same substring rules in the same order, and any other value comes
-- back as given. One difference: an empty surface is NULL here, so the attach
-- keeps the match's own court_type rather than wiping it with ''.
--
-- The three functions below are their live definitions verbatim except for the
-- court_type expression. CREATE OR REPLACE keeps their grants. No existing row
-- is rewritten.

create or replace function public.court_type_for_surface(p_surface text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(p_surface), '') is null then null
    when lower(p_surface) like '%indoor%' then 'Indoor Hard Court'
    when lower(p_surface) like '%clay%' then 'Clay Court'
    when lower(p_surface) like '%grass%' then 'Grass Court'
    when lower(p_surface) like '%hard%' then 'Outdoor Hard Court'
    else p_surface
  end
$$;

CREATE OR REPLACE FUNCTION public.attach_match_to_event_line(p_match_id uuid, p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_match record;
  v_entry record;
  v_event record;
  v_round text;
  v_date timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to add a match to an event.' using errcode = '42501';
  end if;

  select id, program_id, event_entry_id, created_by, round, date, court_type
    into v_match
    from public.matches
   where id = p_match_id
   for update;
  if not found or v_match.created_by is distinct from v_uid then
    raise exception 'Only the person who added this match can add it to an event.'
      using errcode = '42501';
  end if;
  if v_match.program_id is null then
    raise exception 'Only a team match can be added to an event.' using errcode = '23514';
  end if;
  if v_match.event_entry_id is not null then
    raise exception 'This match is already on an event.' using errcode = '23514';
  end if;
  if not public.can_manage_program_schedule(v_match.program_id) then
    raise exception 'Only people who run the schedule can add a match to an event.'
      using errcode = '42501';
  end if;

  select id, event_id, program_id, discipline, slot, forfeit
    into v_entry
    from public.program_event_entries
   where id = p_entry_id
   for update;
  if not found or v_entry.program_id is distinct from v_match.program_id then
    raise exception 'That line is not on this team''s schedule.' using errcode = '42501';
  end if;
  if v_entry.discipline <> 'singles' then
    raise exception 'A singles match can only go on a singles line.' using errcode = '23514';
  end if;
  if v_entry.forfeit is not null then
    raise exception 'That line was forfeited.' using errcode = '23514';
  end if;

  select id, kind, name, starts_on, ends_on, surface
    into v_event
    from public.program_events
   where id = v_entry.event_id;

  if v_event.kind = 'dual' then
    if exists (select 1 from public.matches m where m.event_entry_id = v_entry.id) then
      raise exception 'That line already has a result.' using errcode = '23514';
    end if;
    v_round := v_entry.slot;
    v_date := (v_event.starts_on + time '12:00') at time zone 'UTC';
  else
    v_round := nullif(btrim(coalesce(v_match.round, '')), '');
    if v_round is null then
      raise exception 'Set the round before adding this match to a tournament.'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.matches m
       where m.event_entry_id = v_entry.id and m.round is not distinct from v_round
    ) then
      raise exception 'That round already has a result.' using errcode = '23514';
    end if;
    v_date := case
      when (v_match.date at time zone 'UTC')::date between v_event.starts_on and v_event.ends_on
        then v_match.date
      else (v_event.starts_on + time '12:00') at time zone 'UTC'
    end;
  end if;

  perform set_config('advantage.attach_match_id', v_match.id::text, true);
  update public.matches
     set event_entry_id = v_entry.id,
         tournament_name = v_event.name,
         round = v_round,
         date = v_date,
         match_type = case when v_event.kind = 'dual' then 'Dual Match' else 'Tournament' end,
         court_type = coalesce(public.court_type_for_surface(v_event.surface), v_match.court_type)
   where id = v_match.id;
  perform set_config('advantage.attach_match_id', '', true);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_match.program_id, v_uid, 'match.attached', v_match.id,
    jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id,
      'slot', v_entry.slot,
      'round', v_round
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'entry_id', v_entry.id,
    'event_id', v_event.id,
    'event_name', v_event.name,
    'event_kind', v_event.kind,
    'slot', v_entry.slot,
    'round', v_round
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_apply_dual_result(p_actor_id uuid, p_operation_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if item.status='succeeded' or item.error_code='abandoned' then return public.admin_dual_result_status(p_actor_id,p_operation_id); end if;
  select * into strict target from public.admin_schedule_result_targets where operation_id=p_operation_id and item_id=p_item_id;
  select * into strict batch from public.admin_dual_batches where operation_id=p_operation_id;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  -- Each item is its own transaction. A caught refusal persists only failure
  -- state; the subtransaction rolls back its match/outcome/audit together.
  begin
    perform 1 from public.programs where id=s.program_id and status<>'suspended' for share;
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
          (e.starts_on::text||'T12:00:00')::timestamptz,case when entry.discipline='doubles' then 'Doubles' else 'Singles' end,public.court_type_for_surface(e.surface),format,score,
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_apply_tournament_result(p_actor_id uuid, p_operation_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if item.status='succeeded' or item.error_code='abandoned' then return public.admin_tournament_result_status(p_actor_id,p_operation_id); end if;
  select * into strict target from public.admin_schedule_result_targets where operation_id=p_operation_id and item_id=p_item_id;
  select * into strict batch from public.admin_tournament_batches where operation_id=p_operation_id;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  -- Each item is its own transaction. A caught refusal persists only failure
  -- state; the subtransaction rolls back its match/outcome/audit together.
  begin
    perform 1 from public.programs where id=s.program_id and status<>'suspended' for share;
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
          (e.starts_on::text||'T12:00:00')::timestamptz,'Singles',public.court_type_for_surface(e.surface),format,score,
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
$function$
;
