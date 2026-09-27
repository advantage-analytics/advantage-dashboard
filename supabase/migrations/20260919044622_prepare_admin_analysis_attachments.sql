-- Preparation is an intent reservation, not an analysis upload or a quota charge.
-- A match can have only one console attachment reservation, even across actors
-- and operations. Later submission must lock it and revalidate its snapshot.
create table public.admin_analysis_reservations (
  match_id uuid primary key references public.matches(id),
  operation_id uuid not null,
  item_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (operation_id, item_id),
  foreign key (operation_id, item_id) references public.admin_upload_submission_items(operation_id, item_id)
);
alter table public.admin_analysis_reservations enable row level security;
revoke all on public.admin_analysis_reservations from public, anon, authenticated, service_role;
grant select on public.admin_analysis_reservations to authenticated;
create policy admin_analysis_reservations_read on public.admin_analysis_reservations
  for select to authenticated using ((select public.is_admin()));

-- Private reusable mutation-time guard. It never updates the match or entry.
-- Full row snapshots deliberately fail closed when any recorded context changes.
create function admin_uploads_private.attachment_snapshot(p_program_id uuid, p_match_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.matches;
  program public.programs;
  entry public.program_event_entries;
  entry_json jsonb := 'null';
  outcomes jsonb := '[]';
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  select * into program from public.programs where id = p_program_id for share;
  if not found then raise exception 'program-not-found' using errcode = '22023'; end if;
  if program.status is distinct from 'active' then
    raise exception 'program-inactive' using errcode = '22023';
  end if;
  select * into target from public.matches where id = p_match_id for update;
  if not found then raise exception 'match-not-found' using errcode = '22023'; end if;
  if target.program_id is distinct from p_program_id then
    raise exception 'wrong-program' using errcode = '22023';
  end if;
  if exists (select 1 from public.processing_jobs where match_id = p_match_id and status not in ('failed','completed','derivation_failed')) then
    raise exception 'processing-in-flight' using errcode = '22023';
  end if;
  if target.source_provider is not null or target.analysis_method is distinct from 'manual'
    or exists (select 1 from public.processing_jobs where match_id = p_match_id and
      (status in ('completed','derivation_failed') or results_object_key is not null or derivation_version is not null))
    or exists (select 1 from public.match_files where match_id = p_match_id)
    or exists (select 1 from public.match_stats where match_id = p_match_id)
    or exists (select 1 from public.points where match_id = p_match_id)
    or exists (select 1 from public.shots where match_id = p_match_id) then
    raise exception 'existing-analysis' using errcode = '22023';
  end if;
  if (target.match_type is null or target.match_type not in ('Singles','Doubles')) or target.score is null
    or target.created_by is null or target.player1_name = '' or target.player2_name = '' then
    raise exception 'match-ineligible' using errcode = '22023';
  end if;
  -- Same athlete identity alternatives as upload_eligibility_refusal; admin
  -- replaces only the uploader membership/role gate, never the target roster.
  if target.player1_id is not null and not (
    exists (select 1 from public.program_players where program_id = p_program_id
      and (id = target.player1_id or claimed_by_user_id = target.player1_id)
      and archived_at is null and merged_into_id is null)
    or exists (select 1 from public.program_members where program_id = p_program_id
      and user_id = target.player1_id and role = 'player')
  ) then raise exception 'athlete-ineligible' using errcode = '22023'; end if;
  if target.event_entry_id is not null then
    select * into entry from public.program_event_entries where id = target.event_entry_id for update;
    if not found or entry.program_id is distinct from p_program_id or entry.discipline is distinct from lower(target.match_type) then
      raise exception 'entry-ineligible' using errcode = '22023';
    end if;
    entry_json := to_jsonb(entry);
    select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb) into outcomes
      from public.program_event_outcomes o where o.entry_id = entry.id;
    if entry.forfeit is not null or exists (select 1 from public.program_event_outcomes o
      where o.entry_id = entry.id and o.round is not distinct from target.round) then
      raise exception 'entry-ineligible' using errcode = '22023';
    end if;
  end if;
  return jsonb_build_object('match',to_jsonb(target),'entry',entry_json,'outcomes',outcomes,
    'program',jsonb_build_object('id',program.id,'status',program.status,'org_type',program.org_type));
end;
$$;
revoke all on function admin_uploads_private.attachment_snapshot(uuid,uuid) from public, anon, authenticated, service_role;

-- Read-only intent preview. The fingerprint is an optimistic concurrency token,
-- never authorization or a caller-supplied replacement for protected fields.
create function public.admin_get_analysis_attachment(p_program_id uuid, p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  snapshot := admin_uploads_private.attachment_snapshot(p_program_id, p_match_id);
  return jsonb_build_object('fingerprint',md5(snapshot::text),'match',snapshot->'match');
end;
$$;
revoke all on function public.admin_get_analysis_attachment(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_get_analysis_attachment(uuid,uuid) to authenticated;

create function public.admin_prepare_analysis_attachment(
  p_operation_id uuid, p_item_id uuid, p_program_id uuid, p_match_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  reservation public.admin_analysis_reservations;
  item public.admin_upload_submission_items;
begin
  -- Keep the operation->item->match lock order used by later mutation RPCs.
  item := public.admin_begin_upload_item(p_operation_id,p_item_id,p_program_id,
    'analysis_attachment','analysis_attachment',jsonb_build_object('match_id',p_match_id,'fingerprint',p_fingerprint));
  snapshot := admin_uploads_private.attachment_snapshot(p_program_id,p_match_id);
  if p_fingerprint is null or p_fingerprint is distinct from md5(snapshot::text) then
    raise exception 'stale-target' using errcode = '22023';
  end if;
  select * into reservation from public.admin_analysis_reservations where match_id = p_match_id;
  if found then
    if reservation.operation_id is distinct from p_operation_id or reservation.item_id is distinct from p_item_id then
      raise exception 'attachment-reserved' using errcode = '22023';
    end if;
    if reservation.snapshot is distinct from snapshot then
      raise exception 'stale-target' using errcode = '22023';
    end if;
  else
    insert into public.admin_analysis_reservations(match_id,operation_id,item_id,snapshot,fingerprint)
      values (p_match_id,p_operation_id,p_item_id,snapshot,p_fingerprint);
  end if;
  -- Pending remains pending: finish_item/audit belong to actual file/job linkage.
  return jsonb_build_object('matchId',p_match_id,'operationId',p_operation_id,
    'itemId',p_item_id,'fingerprint',p_fingerprint,'status','prepared');
end;
$$;
revoke all on function public.admin_prepare_analysis_attachment(uuid,uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_prepare_analysis_attachment(uuid,uuid,uuid,uuid,text) to authenticated;
