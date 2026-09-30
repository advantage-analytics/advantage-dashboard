-- Terminal `cancelled` status for Advantage Intelligence jobs, plus the
-- `cancel_processing_job` RPC the cancel route calls and a
-- `vendor_started_at` mark for when the vendor actually began work.
--
-- Until now a job that the athlete no longer wanted had only one exit: wait
-- for the vendor, or hope it failed. `cancelled` is a terminal status the
-- route sets AFTER the vendor DELETE succeeded — the vendor is the authority
-- on whether work stopped, which is why `processing` is in the accepted list
-- and not only `submitting`/`queued`. Nothing else ever moves a job out of
-- `cancelled`: `splitstep_status_rank` ranks it above every other status, so
-- a late webhook or poll can never overwrite it (the writers compare ranks
-- and drop lower-ranked transitions).
--
-- `cancel_processing_job` is one guarded update: it flips the row only when
-- the caller owns it and it is in a cancellable state, and only then releases
-- the month's quota reservation (the same write `release_processing_quota`
-- makes, inlined so the release and the status change share one transaction
-- and one predicate — a job that did not flip must not release). Returns the
-- new status, or null when nothing matched: the route distinguishes
-- "cancelled" from "not yours / already terminal" by that null, not by an
-- exception. Execute is service_role-only — the route runs on the admin
-- client after its own auth check, and no client should be able to release
-- quota by calling this directly.
--
-- The three admin console guards enumerate the terminal statuses so a match
-- with a live job cannot be re-attached or have its recorded result edited.
-- A cancelled job is terminal too, so each list gains `'cancelled'`. Bodies
-- are the live ones from `pg_get_functiondef` (read via the Supabase MCP on
-- 2026-09-29), changed only in those lists — `supabase/migrations/` is behind
-- the live database and is not the source for them.
--
-- Applied to the live database via the Supabase MCP as
-- `processing_jobs_cancelled`; this file carries the version the live project
-- recorded on apply.

-- ─────────────────────────────────────────────────────────────────────────────
-- Status constraint + column
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.processing_jobs'::regclass
     and conname = 'processing_jobs_status_check';

  if v_def is not null and v_def like '%''cancelled''%' then
    return;
  end if;

  if v_def is not null then
    alter table public.processing_jobs drop constraint processing_jobs_status_check;
  end if;

  alter table public.processing_jobs
    add constraint processing_jobs_status_check
    check (status in (
      'pending', 'uploading', 'uploaded', 'submitting', 'queued', 'processing',
      'deriving', 'completed', 'failed', 'derivation_failed', 'cancelled'
    ));
end
$$;

alter table public.processing_jobs
  add column if not exists vendor_started_at timestamptz;

comment on column public.processing_jobs.vendor_started_at is
  'When the vendor reported it had begun processing (first processing-status webhook or poll). Null until then; a job cancelled before this is set never cost vendor compute.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Status rank: cancelled sits above everything so no later write can undo it
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.splitstep_status_rank(p_status text)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select case p_status
    when 'pending'    then 0
    when 'uploading'  then 1
    when 'uploaded'   then 2
    when 'submitting' then 3
    when 'queued'     then 4
    when 'processing' then 5
    when 'completed'  then 6
    when 'failed'     then 6
    when 'deriving'          then 7
    when 'derivation_failed' then 8
    when 'cancelled'         then 9
    else -1
  end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- cancel_processing_job(p_job_id, p_user_id) → new status or null
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_processing_job(p_job_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  update public.processing_jobs
     set status = 'cancelled',
         completed_at = now(),
         error_code = 'CANCELLED'
   where id = p_job_id
     and created_by = p_user_id
     and status in ('submitting', 'queued', 'processing')
  returning status into v_status;

  if v_status is null then
    return null;
  end if;

  update public.processing_usage
     set released = true
   where job_id = p_job_id
     and released = false;

  return v_status;
end;
$function$;

revoke execute on function public.cancel_processing_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_processing_job(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin console guards: cancelled is terminal (live bodies, lists extended)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_uploads_private.attachment_snapshot(p_program_id uuid, p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if exists (select 1 from public.processing_jobs where match_id = p_match_id and status not in ('failed','completed','derivation_failed','cancelled')) then
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
$function$;

CREATE OR REPLACE FUNCTION admin_uploads_private.preserve_video_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(select 1 from public.admin_video_attempts a join public.matches m on m.id=a.match_id join public.processing_jobs j on j.id=a.job_id
    where m.event_entry_id=old.id and (j.status not in ('failed','completed','derivation_failed','cancelled') or (j.status='completed' and j.derivation_version is null))) then
    if tg_op='DELETE' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'recorded-entry-protected' using errcode='22023'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION admin_uploads_private.preserve_video_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare field text;
begin
  if exists(select 1 from public.admin_video_attempts a join public.processing_jobs j on j.id=a.job_id where a.match_id=old.id and (j.status not in ('failed','completed','derivation_failed','cancelled') or (j.status='completed' and j.derivation_version is null))) then
    foreach field in array array['id','created_by','program_id','event_entry_id','player1_id','player2_id','opponent_player_id','player1_name','player2_name','score','result','round','tournament_name','date','match_type','format','court_type','source_provider','analysis_method'] loop
      if to_jsonb(old)->field is distinct from to_jsonb(new)->field then raise exception 'recorded-result-protected' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.processing_jobs'::regclass
     and conname = 'processing_jobs_status_check';

  assert v_def is not null,
    'processing_jobs_status_check: constraint is missing';
  assert v_def like '%''cancelled''%',
    format('processing_jobs_status_check: does not admit cancelled (%s)', v_def);
end
$$;

do $$
begin
  assert public.splitstep_status_rank('cancelled') = 9,
    format('splitstep_status_rank(cancelled) = %s, expected 9', public.splitstep_status_rank('cancelled'));
  assert public.splitstep_status_rank('cancelled') > public.splitstep_status_rank('derivation_failed'),
    'splitstep_status_rank: cancelled must outrank every other status';
end
$$;

do $$
declare
  v_oid oid := 'public.cancel_processing_job(uuid, uuid)'::regprocedure;
begin
  assert has_function_privilege('service_role', v_oid, 'EXECUTE'),
    'cancel_processing_job: service_role cannot execute';
  assert not has_function_privilege('anon', v_oid, 'EXECUTE'),
    'cancel_processing_job: anon can execute';
  assert not has_function_privilege('authenticated', v_oid, 'EXECUTE'),
    'cancel_processing_job: authenticated can execute';
  -- proacl must be explicit (null would mean the default: PUBLIC may execute),
  -- and no aclitem may name PUBLIC (an empty grantee before the `=`).
  assert (select proacl is not null from pg_proc where oid = v_oid),
    'cancel_processing_job: proacl is null, so PUBLIC can execute';
  assert not exists (
    select 1 from pg_proc p, unnest(p.proacl) a
     where p.oid = v_oid and a::text like '=%'),
    'cancel_processing_job: PUBLIC can execute';
  assert exists (
    select 1 from pg_proc p, unnest(p.proacl) a
     where p.oid = v_oid and a::text like 'service_role=X/%'),
    'cancel_processing_job: no execute aclitem for service_role';
end
$$;
