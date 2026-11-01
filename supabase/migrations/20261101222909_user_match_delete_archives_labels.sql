-- A user may delete any match they created, including one the admin console
-- recorded or analysed and one with hand labels (product decision, 2026-11-01).
-- The labels outlive it in an admin-only archive; the match, its statistics,
-- video and files go.
--
-- Only the match delete route gets this. It claims through
-- admin_claim_match_delete, which never refuses; the trigger below acts only
-- on a claimed match. admin_claim_match_storage_purge still refuses for
-- account deletion and the console's abandon, so it never claims a match with
-- these references, and a delete with no claim (SQL, a script) still meets
-- label_sessions' ON DELETE RESTRICT and the console tables' foreign keys.

create table public.label_archive (
  id uuid primary key default gen_random_uuid(),
  -- No foreign keys: this row exists because the match no longer does.
  match_id uuid not null,
  session_id uuid not null unique,
  -- The match's shape, not its people: no player names.
  match_context jsonb not null,
  session jsonb not null,
  points jsonb not null,
  shots jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.label_archive enable row level security;
revoke all on public.label_archive from public, anon, authenticated, service_role;
grant select on public.label_archive to service_role;
create policy label_archive_service_read on public.label_archive
  for select to service_role using (true);

create function public.admin_claim_match_delete(p_match_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform 1 from public.matches where id = any(p_match_ids) order by id for update;
  insert into public.match_storage_purge_claims(match_id)
    select id from public.matches where id = any(p_match_ids)
    on conflict (match_id) do nothing;
  return true;
end;
$function$;
revoke all on function public.admin_claim_match_delete(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.admin_claim_match_delete(uuid[]) to service_role;

-- A succeeded item keeps its row as the console's history after its match is
-- gone, so its match link may now be empty. An outcome's rule is unchanged.
alter table public.admin_upload_submission_items
  drop constraint admin_upload_submission_items_check1,
  add constraint admin_upload_submission_items_check1 check (
    status <> 'succeeded'
    or (kind = 'outcome' and outcome_id is not null and match_id is null)
    or (kind <> 'outcome' and outcome_id is null)
  );

create function public.matches_archive_labels_and_console()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.match_storage_purge_claims where match_id = old.id
  ) then
    return old;
  end if;

  insert into public.label_archive (match_id, session_id, match_context, session, points, shots)
  select
    old.id,
    s.id,
    jsonb_build_object(
      'score', old.score,
      'format', old.format,
      'match_type', old.match_type,
      'court_type', old.court_type
    ),
    to_jsonb(s),
    coalesce((
      select jsonb_agg(to_jsonb(p) order by p.point_index)
      from public.label_points p where p.session_id = s.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
      from public.label_shots x where x.session_id = s.id
    ), '[]'::jsonb)
  from public.label_sessions s
  where s.match_id = old.id and s.kind = 'analyst';

  delete from public.label_sessions
   where match_id = old.id and kind = 'analyst';

  -- A target would hold its schedule slot against any later result.
  delete from public.admin_schedule_result_targets t
   using public.admin_upload_submission_items i
   where i.operation_id = t.operation_id
     and i.item_id = t.item_id
     and i.match_id = old.id;
  delete from public.admin_analysis_reservations where match_id = old.id;
  delete from public.admin_file_attempts where match_id = old.id;
  -- Before the job cascade: guard_video_job refuses a job with an attempt.
  delete from public.admin_video_attempts where match_id = old.id;
  update public.admin_upload_submission_items
     set match_id = null, processing_job_id = null, match_file_id = null, updated_at = now()
   where match_id = old.id;

  return old;
end;
$function$;
revoke all on function public.matches_archive_labels_and_console() from public, anon, authenticated, service_role;

create trigger matches_archive_labels_and_console
  before delete on public.matches
  for each row execute function public.matches_archive_labels_and_console();
