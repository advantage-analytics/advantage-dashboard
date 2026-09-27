-- Shots belong to a match through points; preserve the existing attachment guard and grants.
create or replace function admin_uploads_private.attachment_snapshot(p_program_id uuid, p_match_id uuid)
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
    or exists (select 1 from public.shots s join public.points p on p.id = s.point_id where p.match_id = p_match_id) then
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
