-- LOCAL TEST FIXTURE ONLY. Apply to an EMPTY disposable Supabase stack before
-- 20260910120000_add_program_event_outcomes.sql; never a remote project.
-- This is NOT a production clone or migration history reconstruction.
-- Parent column types/checks/FK targets were read from live list_tables on
-- 2026-09-10. Unused columns, production triggers, and policies are omitted.
-- ASSUMPTION: members can SELECT their own membership; they cannot mutate it.
-- The remote policy catalog was inaccessible (Insufficient scope), so passing
-- here proves this migration against that contract, not production RLS parity.
-- FK deletion cascades below are fixture cleanup choices, not verified remote
-- delete rules. Analysis tables are reduced sentinels, not analysis schemas.
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
    'program_event_entries','matches','match_stats','points','shots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
grant select on public.program_members to authenticated;
create policy "LOCAL assumed own membership read" on public.program_members
  for select to authenticated using (user_id = (select auth.uid()));

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
insert into public.match_stats(id,match_id)
  values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004');
insert into public.points(id,match_id)
  values ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004');
insert into public.shots(id,point_id)
  values ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006');
commit;
