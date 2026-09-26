-- LOCAL TEST FIXTURE ONLY. Apply to an EMPTY disposable Supabase stack before
-- the three 20260910 Schedule migrations; never a remote project.
-- This is NOT a full production clone or migration history reconstruction.
-- Parent column types/checks/FK targets were read from live list_tables on
-- 2026-09-10. Unused parent columns, triggers, and policies are omitted.
-- ASSUMPTION: members can SELECT their own membership; they cannot mutate it.
-- The remote policy catalog was inaccessible (Insufficient scope), so passing
-- here proves the reduced parent fixture against that contract, not full parent
-- schema parity. This qualification does not apply to the processing_jobs and
-- Schedule outcome/action objects called out below, which are repository-sourced
-- and catalog-gated by schedule-outcomes-db.spec.ts.
-- FK deletion cascades below are fixture cleanup choices, not verified remote
-- delete rules. Analysis tables other than processing_jobs are reduced
-- sentinels, not analysis schemas.
--
-- processing_jobs is deliberately the exception: its complete column,
-- constraint, index, RLS-policy, grant, realtime-publication and
-- updated_at-trigger contract is reconstructed from the repository's
-- authoritative migration chain. Every migration mentioning processing_jobs
-- was reviewed; the ones below are the complete set that change its catalog,
-- and no migration or database trigger anywhere inserts a processing_jobs row:
--   20260802083544_splitstep_ingest.sql
--   20260802205902_splitstep_video_access.sql
--   20260802210852_splitstep_schema_hardening.sql
--   20260805005321_splitstep_derived_flags_and_deriving_status.sql
--   20260807072714_splitstep_persist_submission_metadata.sql
--   20260809002421_splitstep_upload_progress.sql
--   20260813063101_realtime_processing_jobs.sql
--   20260814024238_splitstep_capture_trimmed_video.sql
--   20260817000000_splitstep_derivation_quality.sql
--   20260829174158_splitstep_error_columns.sql
--   20260829174729_splitstep_resubmission_lineage.sql
--   20260829175224_splitstep_last_polled_at.sql
--   20260829184210_processing_jobs_one_live_per_match.sql
--   20260901225216_account_deletion_retains_program_data.sql
--   20260902200000_splitstep_players_trajectories.sql
-- The explicit authenticated/service_role table grants reproduce the DML
-- surface that 20260802083544's four authenticated policies require. That
-- migration predated the current local CLI default that no longer auto-exposes
-- new public tables; anon remains ungranted and has no applicable policy.
-- The default local Auth service is real; this trigger only mirrors profiles.
-- Run against the verified LOCAL container (CLI db query rejects this multi-statement file):
-- docker exec -i supabase_db_<verified-local-project-id> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/fixtures/schedule-outcomes-local.sql
-- Capture sentinel rows before migration, then compare after migration/tests.

begin;
-- Fail closed on an existing app schema; this fixture never drops/replaces it.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique
);
create function public.t1_fixture_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users(id, email) values (new.id, new.email);
  return new;
end;
$$;
revoke all on function public.t1_fixture_profile() from public;
create trigger t1_fixture_profile after insert on auth.users
  for each row execute function public.t1_fixture_profile();
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  program_key text, school_group text, school_name text not null,
  org_type text not null default 'college'
    check (org_type in ('college','club','high_school','academy','other'))
);
create table public.program_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','coach','staff','player'))
);
create table public.program_events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  kind text not null check (kind in ('dual','tournament')),
  name text not null, starts_on date not null, ends_on date not null,
  site text not null check (site in ('home','away','neutral'))
);
create table public.program_event_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.program_events(id),
  program_id uuid not null references public.programs(id),
  discipline text not null check (discipline in ('singles','doubles')),
  slot text,
  forfeit text check (forfeit in ('ours','theirs'))
);
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_entry_id uuid references public.program_event_entries(id),
  score jsonb,
  insights jsonb
);
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  created_by uuid references public.users(id),
  provider text not null default 'splitstep',
  external_job_id text,
  status text not null default 'pending',
  priority text not null default 'standard',
  start_time_seconds numeric,
  end_time_seconds numeric,
  billable_seconds integer,
  video_object_key text,
  video_url_expires_at timestamptz,
  results_object_key text,
  sas_url text,
  sas_expires_at timestamptz,
  trimmed_video_url text,
  submitted_at timestamptz,
  queued_ack_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  error_message text,
  raw_webhook_payload jsonb not null default '[]'::jsonb,
  derivation_version text,
  derivation_confidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  video_access_token text,
  video_token_issued_at timestamptz,
  video_token_revoked_at timestamptz,
  vendor_first_downloaded_at timestamptz,
  vendor_last_downloaded_at timestamptz,
  vendor_request_count integer not null default 0,
  initial_top_player_is_player1 boolean,
  ad_scoring boolean,
  fixed_camera boolean,
  upload_progress_percent smallint,
  trimmed_object_key text,
  derivation_quality jsonb,
  error_code text,
  error_category text,
  error_step text,
  resubmitted_from_job_id uuid references public.processing_jobs(id) on delete set null,
  auto_resubmitted boolean not null default false,
  last_polled_at timestamptz,
  players_url text,
  trajectories_url text,
  players_object_key text,
  trajectories_object_key text,
  constraint processing_jobs_status_check check (status in (
    'pending','uploading','uploaded','submitting','queued','processing',
    'deriving','completed','failed','derivation_failed'
  )),
  constraint processing_jobs_priority_check check (priority in ('standard','express')),
  constraint processing_jobs_confidence_check check (
    derivation_confidence is null or derivation_confidence in ('high','medium','low')
  ),
  constraint processing_jobs_trim_check check (
    start_time_seconds is null or end_time_seconds is null
      or end_time_seconds > start_time_seconds
  ),
  constraint processing_jobs_upload_progress_check check (
    upload_progress_percent is null
      or (upload_progress_percent >= 0 and upload_progress_percent <= 100)
  )
);
create index processing_jobs_match_id_idx on public.processing_jobs(match_id);
create index processing_jobs_created_by_idx on public.processing_jobs(created_by);
create index processing_jobs_status_idx on public.processing_jobs(status);
create unique index processing_jobs_external_job_id_key
  on public.processing_jobs(external_job_id) where external_job_id is not null;
create unique index processing_jobs_video_access_token_key
  on public.processing_jobs(video_access_token) where video_access_token is not null;
create index processing_jobs_awaiting_download_idx
  on public.processing_jobs(submitted_at) where vendor_first_downloaded_at is null;
create index processing_jobs_resubmitted_from_idx
  on public.processing_jobs(resubmitted_from_job_id)
  where resubmitted_from_job_id is not null;
create unique index processing_jobs_one_live_per_match
  on public.processing_jobs(match_id)
  where status not in ('failed','completed','derivation_failed');

create function public.set_processing_jobs_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_processing_jobs_updated_at()
  from public, anon, authenticated;
create trigger processing_jobs_set_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_processing_jobs_updated_at();
create table public.match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id)
);
create table public.points (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id)
);
create table public.shots (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.points(id)
);
-- No authenticated grants on fixture parents except the assumed membership
-- read contract. Admin sets up fixtures; signed-in users exercise outcomes.
do $$
declare t text;
begin
  foreach t in array array['users','programs','program_members','program_events',
    'program_event_entries','matches','processing_jobs','match_stats','points','shots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
grant select on public.program_members to authenticated;
create policy "LOCAL assumed own membership read" on public.program_members
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.processing_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.processing_jobs to authenticated;
grant all on public.processing_jobs to service_role;
create policy "Users can view own processing jobs" on public.processing_jobs
  for select to authenticated using ((select auth.uid()) = created_by);
create policy "Users can insert own processing jobs" on public.processing_jobs
  for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Users can update own processing jobs" on public.processing_jobs
  for update to authenticated using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);
create policy "Users can delete own processing jobs" on public.processing_jobs
  for delete to authenticated using ((select auth.uid()) = created_by);
-- 20260813063101 publishes the table for realtime; realtime still applies the
-- policies above, so this is catalog parity rather than a new read path.
alter publication supabase_realtime add table public.processing_jobs;

-- Pre-migration history, independent of each run's disposable UUIDs.
insert into public.programs(id, school_name, org_type)
  values ('00000000-0000-4000-8000-000000000001','Historical sentinel','club');
insert into public.program_events(id, program_id, kind, name, starts_on, ends_on, site)
  values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
    'dual','Historical sentinel','2020-01-01','2020-01-01','home');
insert into public.program_event_entries(id,event_id,program_id,discipline,forfeit)
  values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001','singles','theirs');
insert into public.matches(id,event_entry_id,score,insights)
  values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003',
    '{"sets":[[6,4],[6,2]]}','{"sentinel":"historical analysis"}');
insert into public.processing_jobs(id,match_id)
  values ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000004');
insert into public.match_stats(id,match_id)
  values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004');
insert into public.points(id,match_id)
  values ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004');
insert into public.shots(id,point_id)
  values ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006');
commit;
