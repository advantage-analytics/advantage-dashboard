-- Local baseline for database-level specs — RECONSTRUCTED, NOT A DUMP.
--
-- Why this exists: `supabase/migrations/` runs roughly 100 migrations behind
-- the live project and cannot bootstrap a database (its first file alters a
-- function over tables it never creates), while AGENTS.md makes the live
-- database the only schema source of truth. A spec that must prove a NEW
-- migration applies and behaves as written therefore needs a local database
-- that carries the live objects the migration touches. This file is that
-- baseline: the tables, constraints, functions, triggers and policies that
-- guard `matches`, `processing_jobs` and `match_files` writes, read from the
-- live database on 2026-09-11 via `pg_get_functiondef` / `pg_policies` /
-- `information_schema` and transcribed here. Function bodies, trigger
-- definitions and policy expressions are verbatim. Column lists are complete
-- for the tables the guards read; `public.users` carries only the columns
-- anything here references.
--
-- What it does NOT reproduce, so a green run here is NOT a production proof:
--   - RLS policies on programs / program_members / program_players /
--     program_event_* / users (RLS is enabled with no policies, which denies
--     clients — stricter than live; the guards are SECURITY DEFINER and never
--     depend on them, and the specs touch those tables only as service role).
--   - Every other table, view, function and trigger in the live schema.
--   - Live data. Fixture rows are created and deleted by each spec.
-- Re-read the live definitions before trusting this file for anything beyond
-- the specs that name it; it is a snapshot and will drift as live moves.
--
-- Loaded by `supabase start` / `supabase db reset` through
-- `[db.seed].sql_paths` in `supabase/config.toml`.

create schema if not exists schedule_private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  id                  uuid primary key default gen_random_uuid()
                        constraint fk_users_auth references auth.users(id) on delete cascade,
  email               text not null constraint users_email_key unique,
  first_name          text,
  last_name           text,
  class               text,
  role                text,
  is_admin            boolean not null default false,
  plan                text not null default 'free'
                        constraint users_plan_check check (plan in ('free', 'pro')),
  onboarded_at        timestamptz,
  created_at          timestamptz default now()
);
alter table public.users enable row level security;

create table public.programs (
  id                        uuid primary key default gen_random_uuid(),
  program_key               text constraint programs_program_key_key unique,
  school_group              text,
  school_name               text not null,
  school_abbrev             text,
  team                      text
                              constraint programs_team_check check (team is null or team in ('mens', 'womens')),
  division                  text
                              constraint programs_division_check check (division is null or division in ('D1', 'D2', 'D3', 'NAIA', 'JUCO')),
  conference                text,
  city                      text,
  state                     text,
  athletics_url             text,
  staff_page_url            text,
  primary_domain            text,
  primary_domain_inferred   boolean not null default false,
  athletics_domains         text[] not null default '{}',
  domain_match_skips_review boolean not null default false,
  review_reasons            text,
  contact_count             integer not null default 0,
  domain_evidence_count     integer not null default 0,
  domain_shared_with_schools integer not null default 0,
  status                    text not null default 'unclaimed'
                              constraint programs_status_check check (status in ('unclaimed', 'claim_pending', 'active', 'suspended')),
  owner_user_id             uuid references public.users(id) on delete set null,
  claimed_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  home_venue                text,
  default_surface           text
                              constraint programs_default_surface_check check (default_surface is null or default_surface in ('hard', 'clay', 'grass', 'carpet')),
  season                    text,
  players_can_upload        boolean not null default true,
  seats                     integer not null default 25 constraint programs_seats_check check (seats >= 1),
  roster_public             boolean not null default true,
  time_zone                 text not null default 'UTC',
  org_type                  text not null default 'college'
                              constraint programs_org_type_check check (org_type in ('college', 'club', 'high_school', 'academy', 'other')),
  crest_path                text,
  upload_policy             text not null default 'everyone'
                              constraint programs_upload_policy_check check (upload_policy in ('owner', 'owner_coaches', 'staff', 'everyone')),
  constraint programs_college_fields_check check (
    case when org_type = 'college'
         then program_key is not null and school_group is not null and team is not null
         else program_key is null end)
);
create unique index programs_group_team_key on public.programs (school_group, team);
alter table public.programs enable row level security;

create table public.program_members (
  id                        uuid primary key default gen_random_uuid(),
  program_id                uuid not null references public.programs(id) on delete cascade,
  user_id                   uuid not null references public.users(id) on delete cascade,
  role                      text not null
                              constraint program_members_role_check check (role in ('owner', 'coach', 'staff', 'player')),
  upload_enabled            boolean not null default true,
  monthly_minutes_allocated integer
                              constraint program_members_allocation_check check (monthly_minutes_allocated is null or monthly_minutes_allocated >= 0),
  invited_by                uuid references public.users(id) on delete set null,
  joined_at                 timestamptz not null default now(),
  ladder_position           integer
                              constraint program_members_ladder_check check (ladder_position is null or ladder_position > 0),
  constraint program_members_program_user_key unique (program_id, user_id)
);
create unique index programs_one_owner on public.program_members (program_id) where role = 'owner';
create index program_members_user_idx on public.program_members (user_id);
alter table public.program_members enable row level security;

create table public.program_players (
  id                        uuid primary key default gen_random_uuid(),
  program_id                uuid not null references public.programs(id) on delete cascade,
  first_name                text not null,
  last_name                 text not null,
  class_year                text,
  lineup_spot               integer
                              constraint program_players_lineup_check check (lineup_spot is null or lineup_spot > 0),
  email                     text
                              constraint program_players_email_shape check (email is null or email like '%_@_%.__%'),
  claimed_by_user_id        uuid references public.users(id) on delete set null,
  claimed_at                timestamptz,
  archived_at               timestamptz,
  merged_into_id            uuid references public.program_players(id) on delete set null,
  merged_at                 timestamptz,
  created_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  contributed_by_program_id uuid references public.programs(id) on delete set null,
  constraint program_players_claim_check check ((claimed_by_user_id is null) = (claimed_at is null)),
  constraint program_players_merge_check check (((merged_into_id is null) = (merged_at is null)) and merged_into_id is distinct from id),
  constraint program_players_name_check check (btrim(first_name) <> '' and btrim(last_name) <> ''),
  constraint program_players_contributor_check check (contributed_by_program_id is distinct from program_id),
  constraint program_players_contributed_no_email check (contributed_by_program_id is null or email is null)
);
create unique index program_players_claimed_key on public.program_players (program_id, claimed_by_user_id) where claimed_by_user_id is not null;
create index program_players_program_idx on public.program_players (program_id) where merged_into_id is null;
alter table public.program_players enable row level security;

create table public.program_events (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  kind        text not null constraint program_events_kind_check check (kind in ('dual', 'tournament')),
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  site        text not null constraint program_events_site_check check (site in ('home', 'away', 'neutral')),
  surface     text,
  host        text,
  format      jsonb not null default '{}',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint program_events_span_check check (ends_on >= starts_on),
  constraint program_events_outcome_scope_key unique (id, program_id, kind)
);
alter table public.program_events enable row level security;

create table public.program_event_entries (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.program_events(id) on delete cascade,
  program_id          uuid not null references public.programs(id) on delete cascade,
  discipline          text not null constraint program_event_entries_discipline_check check (discipline in ('singles', 'doubles')),
  slot                text,
  position            integer not null default 0,
  draw                text,
  seed                integer constraint program_event_entries_seed_check check (seed is null or seed > 0),
  player_user_ids     uuid[] not null default '{}',
  player_labels       text[] not null default '{}',
  opponent_labels     text[] not null default '{}',
  opponent_school     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  opponent_program_id uuid references public.programs(id) on delete set null,
  forfeit             text constraint program_event_entries_forfeit_check check (forfeit is null or forfeit in ('ours', 'theirs')),
  constraint program_event_entries_opponent_check check (opponent_program_id is distinct from program_id),
  constraint program_event_entries_outcome_scope_key unique (id, event_id, program_id)
);
create unique index program_event_entries_slot_key on public.program_event_entries (event_id, slot) where slot is not null;
alter table public.program_event_entries enable row level security;

create table public.program_event_outcomes (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null,
  event_id      uuid not null,
  program_id    uuid not null,
  event_kind    text not null,
  round         text,
  kind          text not null constraint program_event_outcomes_kind_check check (kind in ('forfeit', 'default', 'withdrawal')),
  side          text not null constraint program_event_outcomes_side_check check (side in ('ours', 'theirs')),
  actor_user_id uuid not null default auth.uid(),
  recorded_at   timestamptz not null default now(),
  constraint program_event_outcomes_entry_scope_fkey foreign key (entry_id, event_id, program_id)
    references public.program_event_entries(id, event_id, program_id) on update restrict on delete restrict,
  constraint program_event_outcomes_event_scope_fkey foreign key (event_id, program_id, event_kind)
    references public.program_events(id, program_id, kind) on update restrict on delete restrict
);
create unique index program_event_outcomes_dual_key on public.program_event_outcomes (entry_id) where round is null;
create unique index program_event_outcomes_round_key on public.program_event_outcomes (entry_id, round) where round is not null;
alter table public.program_event_outcomes enable row level security;

create table public.matches (
  id                            uuid primary key default gen_random_uuid(),
  player1_name                  text not null,
  player2_name                  text not null,
  date                          timestamptz not null,
  round                         text,
  score                         jsonb constraint score_jsonb_check check (score is null or jsonb_typeof(score) = 'object'),
  tournament_name               text,
  private                       boolean,
  player1_id                    uuid,
  player2_id                    uuid,
  format                        jsonb,
  status                        text,
  result                        text,
  created_by                    uuid references public.users(id),
  source_provider               text,
  analysis_method               text,
  match_type                    text,
  court_type                    text,
  verified                      boolean default false,
  duration                      bigint,
  key_moments                   text[],
  insights                      jsonb,
  opponent_hand                 text,
  opponent_backhand             text,
  player_hand                   text,
  player_backhand               text,
  fixed_camera                  boolean,
  initial_top_player_is_player1 boolean,
  program_id                    uuid references public.programs(id) on delete set null,
  event_entry_id                uuid references public.program_event_entries(id) on delete set null,
  opponent_player_id            uuid references public.program_players(id) on delete set null
);
alter table public.matches enable row level security;

create table public.processing_jobs (
  id                            uuid primary key default gen_random_uuid(),
  match_id                      uuid not null references public.matches(id) on delete cascade,
  created_by                    uuid references public.users(id),
  provider                      text not null default 'splitstep',
  external_job_id               text,
  status                        text not null default 'pending'
                                  constraint processing_jobs_status_check check (status in ('pending', 'uploading', 'uploaded', 'submitting', 'queued', 'processing', 'deriving', 'completed', 'failed', 'derivation_failed')),
  priority                      text not null default 'standard'
                                  constraint processing_jobs_priority_check check (priority in ('standard', 'express')),
  start_time_seconds            numeric,
  end_time_seconds              numeric,
  billable_seconds              integer,
  video_object_key              text,
  video_url_expires_at          timestamptz,
  results_object_key            text,
  sas_url                       text,
  sas_expires_at                timestamptz,
  trimmed_video_url             text,
  submitted_at                  timestamptz,
  queued_ack_at                 timestamptz,
  completed_at                  timestamptz,
  attempt_count                 integer not null default 0,
  error_message                 text,
  raw_webhook_payload           jsonb not null default '[]',
  derivation_version            text,
  derivation_confidence         text
                                  constraint processing_jobs_confidence_check check (derivation_confidence is null or derivation_confidence in ('high', 'medium', 'low')),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  video_access_token            text,
  video_token_issued_at         timestamptz,
  video_token_revoked_at        timestamptz,
  vendor_first_downloaded_at    timestamptz,
  vendor_last_downloaded_at     timestamptz,
  vendor_request_count          integer not null default 0,
  initial_top_player_is_player1 boolean,
  ad_scoring                    boolean,
  fixed_camera                  boolean,
  upload_progress_percent       smallint
                                  constraint processing_jobs_upload_progress_check check (upload_progress_percent is null or (upload_progress_percent between 0 and 100)),
  trimmed_object_key            text,
  derivation_quality            jsonb,
  error_code                    text,
  error_category                text,
  error_step                    text,
  resubmitted_from_job_id       uuid references public.processing_jobs(id) on delete set null,
  auto_resubmitted              boolean not null default false,
  last_polled_at                timestamptz,
  players_url                   text,
  trajectories_url              text,
  players_object_key            text,
  trajectories_object_key       text,
  constraint processing_jobs_trim_check check (start_time_seconds is null or end_time_seconds is null or end_time_seconds > start_time_seconds)
);
create unique index processing_jobs_one_live_per_match on public.processing_jobs (match_id)
  where status not in ('failed', 'completed', 'derivation_failed');
create unique index processing_jobs_external_job_id_key on public.processing_jobs (external_job_id) where external_job_id is not null;
create index processing_jobs_match_id_idx on public.processing_jobs (match_id);
create index processing_jobs_created_by_idx on public.processing_jobs (created_by);
alter table public.processing_jobs enable row level security;

create table public.match_files (
  id              uuid primary key default gen_random_uuid(),
  provider_id     text not null,
  file_name       text,
  uploaded_by     uuid references public.users(id) on update cascade on delete set null,
  uploaded_at     timestamptz default now(),
  utr_id          integer,
  match_id        uuid references public.matches(id) on update cascade on delete cascade,
  storage_path    text,
  file_size       bigint,
  status          text default 'uploaded',
  video_file_name text,
  video_path      text
);
alter table public.match_files enable row level security;

-- Live grants every privilege on these tables to the three API roles.
grant all on all tables in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Functions — verbatim from live (pg_get_functiondef, 2026-09-11).
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_full_name text;
  v_first     text;
  v_last      text;
begin
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if v_full_name is not null then
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := nullif(trim(substr(v_full_name, length(v_first) + 1)), '');
  end if;

  insert into public.users (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.user_program_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select pm.program_id from public.program_members pm
   where pm.user_id = (select auth.uid());
$function$;

create or replace function public.user_program_role(p_program_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select pm.role from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = (select auth.uid());
$function$;

create or replace function public.is_program_staff(p_program_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    public.user_program_role(p_program_id) in ('owner', 'coach', 'staff'), false);
$function$;

create or replace function public.my_player_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- The login itself. Guarded so a signed-out caller yields an empty set
  -- rather than a row containing NULL.
  select (select auth.uid())
   where (select auth.uid()) is not null
  union
  select pp.id
    from public.program_players pp
   where pp.claimed_by_user_id = (select auth.uid())
     and pp.merged_into_id is null;
$function$;

create or replace function public.set_processing_jobs_updated_at()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- The client-write guard the migration under test extends. Live body,
-- verbatim; identical to supabase/migrations/20260824211820_matches_bound_program_attribution.sql.
create or replace function public.matches_block_client_regraft()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.is_program_staff(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    if new.program_id is not null
       and new.player1_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player1_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player1_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that player is not on this program''s roster, so the match cannot be filed under it'
        using errcode = '42501';
    end if;

    return new;
  end if;

  -- UPDATE: neither column may move at all. Where a match is filed is decided
  -- when it is created.
  if new.program_id is distinct from old.program_id
     or new.event_entry_id is distinct from old.event_entry_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  -- UPDATE: attribution may move, but only within the same roster. Guarded on
  -- an actual change so a write that restates the current value never fails.
  if new.player1_id is distinct from old.player1_id
     and new.program_id is not null
     and new.player1_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player1_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player1_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'a match can only be re-attributed to someone on the same program''s roster'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create trigger matches_block_client_regraft
  before insert or update of program_id, event_entry_id, player1_id
  on public.matches
  for each row execute function public.matches_block_client_regraft();

create or replace function schedule_private.guard_schedule_result()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  target_entry uuid;
  legacy text;
  target_kind text;
begin
  if tg_table_name = 'program_event_outcomes' then
    -- BEFORE triggers precede RLS WITH CHECK. Refuse unauthorized sessions
    -- before disclosing whether another program has a legacy result.
    if auth.uid() is not null and not exists (
      select 1 from public.program_members m where m.program_id = new.program_id
        and m.user_id = auth.uid() and m.role in ('owner','coach','staff')
    ) then
      raise exception 'Only program staff can change outcomes.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      raise exception 'Clear the saved outcome before changing it.' using errcode = '23514';
    end if;
    target_entry := new.entry_id;
    -- Let the existing composite foreign keys report a forged/missing scope.
    if not exists (
      select 1 from public.program_event_entries l
      join public.program_events e on e.id = l.event_id
      where l.id = new.entry_id and l.event_id = new.event_id
        and l.program_id = new.program_id and e.kind = new.event_kind
    ) then return new; end if;
  else
    target_entry := new.event_entry_id;
  end if;
  if target_entry is null then return new; end if;

  update public.program_event_entries set id = id where id = target_entry
    returning forfeit into legacy;
  select e.kind into target_kind from public.program_events e
    join public.program_event_entries l on l.event_id = e.id
    where l.id = target_entry;

  if tg_table_name = 'program_event_outcomes' then
    if legacy is not null then
      raise exception 'Clear the legacy forfeit before saving an outcome.' using errcode = '23514';
    end if;
    if exists (select 1 from public.matches m where m.event_entry_id = target_entry
      and (target_kind = 'dual' or m.round is not distinct from new.round)) then
      raise exception 'This line or round already has a match. Remove the match before saving an outcome.' using errcode = '23514';
    end if;
  else
    if legacy is not null or exists (
      select 1 from public.program_event_outcomes o where o.entry_id = target_entry
      and (target_kind = 'dual' or o.round is not distinct from new.round)
    ) then
      raise exception 'Clear the saved outcome or forfeit before adding a score or match.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create trigger guard_schedule_match
  before insert or update of event_entry_id, round, score
  on public.matches
  for each row execute function schedule_private.guard_schedule_result();

create or replace function schedule_private.guard_legacy_forfeit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.forfeit is null then return new; end if;
  if tg_op = 'UPDATE' and old.forfeit is not null and new.forfeit <> old.forfeit then
    raise exception 'Clear the saved forfeit before changing its side.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.forfeit is not distinct from old.forfeit then return new; end if;
  if exists (select 1 from public.matches where event_entry_id = new.id)
    or exists (select 1 from public.program_event_outcomes where entry_id = new.id) then
    raise exception 'This line already has a match or outcome. Clear it before forfeiting.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger guard_legacy_forfeit
  before insert or update of forfeit
  on public.program_event_entries
  for each row execute function schedule_private.guard_legacy_forfeit();

create trigger processing_jobs_set_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_processing_jobs_updated_at();

-- ---------------------------------------------------------------------------
-- Policies — verbatim from pg_policies (2026-09-11), on the three tables the
-- specs write to as a signed-in client.
-- ---------------------------------------------------------------------------

create policy "Users can read matches they created or played in" on public.matches
  for select using (
    ((select auth.uid()) = created_by)
    or (player1_id in (select public.my_player_ids()))
    or (player2_id in (select public.my_player_ids()))
    or (program_id is not null and public.user_program_role(program_id) is not null)
  );
create policy "Users can insert own matches" on public.matches
  for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Users can update own matches" on public.matches
  for update using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Users can delete own matches" on public.matches
  for delete using ((select auth.uid()) = created_by);

create policy "Users can view own processing jobs" on public.processing_jobs
  for select to authenticated using ((select auth.uid()) = created_by);
create policy "Users can insert own processing jobs" on public.processing_jobs
  for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Users can update own processing jobs" on public.processing_jobs
  for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Users can delete own processing jobs" on public.processing_jobs
  for delete to authenticated using ((select auth.uid()) = created_by);

create policy "Users can view own files" on public.match_files
  for select using ((select auth.uid()) = uploaded_by);
create policy "Users can upload files" on public.match_files
  for insert with check ((select auth.uid()) = uploaded_by);
create policy "Users can update own files" on public.match_files
  for update using ((select auth.uid()) = uploaded_by) with check ((select auth.uid()) = uploaded_by);
create policy "Users can delete own files" on public.match_files
  for delete using ((select auth.uid()) = uploaded_by);
