-- SplitStep ingest — Phase 1 schema (job lifecycle + processing quota ledger).
--
-- Additive only. Nothing here touches the SwingVision path: `match_files`,
-- `points`, `shots` and `calculate_match_stats` are deliberately untouched.
--
-- `match_files` is NOT extended to carry the new lifecycle. Its `status` column
-- has no CHECK constraint today, so "extending" it would mean adding one to a
-- live column with unaudited values. `processing_jobs` owns job state instead —
-- it also needs states (`derivation_failed`) that are meaningless for a file row.

-- ---------------------------------------------------------------------------
-- matches — camera context needed to build a SplitStep job request
-- ---------------------------------------------------------------------------

-- Whether the camera was stationary for the whole recording. Maps to the
-- vendor's `FixedCamera` request field.
alter table public.matches
  add column if not exists fixed_camera boolean;

-- Which of our two players stood at the TOP of frame at the START of the video.
-- Top/bottom is camera-relative, not player1/player2 — players change ends every
-- odd game. This flag is the only way to map the vendor's per-player predictions
-- back onto player1/player2. Getting it backwards silently attributes every
-- statistic to the wrong person.
alter table public.matches
  add column if not exists initial_top_player_is_player1 boolean;

comment on column public.matches.initial_top_player_is_player1 is
  'True when player1 was at the top of frame at video start. Camera-relative; used to map vendor pred_player_id back to player1/player2.';

-- ---------------------------------------------------------------------------
-- processing_jobs — one row per video sent for external analysis
-- ---------------------------------------------------------------------------

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  created_by uuid not null references public.users (id),

  provider text not null default 'splitstep',
  external_job_id text,

  status text not null default 'pending',

  -- Turnaround tier. Not sent to the vendor yet (no documented queue-priority
  -- parameter — TODO(splitstep-q6)). The column exists so tiers become a UI
  -- change later rather than a migration.
  priority text not null default 'standard',

  -- Trim window, in seconds relative to the ORIGINAL video. The vendor reports
  -- stroke times relative to the TRIMMED video, so start_time_seconds is the
  -- offset the derivation engine adds back to land in original-video time.
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

  -- Every webhook payload received, appended. During the pilot this is the only
  -- forensic record we have.
  raw_webhook_payload jsonb not null default '[]'::jsonb,

  derivation_version text,
  derivation_confidence text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- pending → uploading → uploaded → submitting → queued → processing → completed
  --                                      ↓           ↓          ↓
  --                                   failed      failed     failed
  --                                                             ↓
  --                                                     derivation_failed
  --
  -- `derivation_failed` is distinct from `failed`: the vendor succeeded and our
  -- engine did not. Different handling, different alerting.
  constraint processing_jobs_status_check check (
    status in (
      'pending', 'uploading', 'uploaded', 'submitting',
      'queued', 'processing', 'completed',
      'failed', 'derivation_failed'
    )
  ),
  constraint processing_jobs_priority_check check (
    priority in ('standard', 'express')
  ),
  constraint processing_jobs_confidence_check check (
    derivation_confidence is null
    or derivation_confidence in ('high', 'medium', 'low')
  ),
  constraint processing_jobs_trim_check check (
    start_time_seconds is null
    or end_time_seconds is null
    or end_time_seconds > start_time_seconds
  )
);

create index if not exists processing_jobs_match_id_idx
  on public.processing_jobs (match_id);
create index if not exists processing_jobs_created_by_idx
  on public.processing_jobs (created_by);
create index if not exists processing_jobs_status_idx
  on public.processing_jobs (status);

-- Webhook deliveries are idempotent on (external_job_id, status); this makes the
-- lookup cheap and guards against two jobs claiming the same vendor id.
create unique index if not exists processing_jobs_external_job_id_key
  on public.processing_jobs (external_job_id)
  where external_job_id is not null;

-- ---------------------------------------------------------------------------
-- processing_usage — quota ledger (one row per reservation, not a counter)
-- ---------------------------------------------------------------------------
--
-- There is no `programs` table yet. For now every row is account_type
-- 'individual' with account_id = user id. Cap lookup lives behind a single
-- function in src/lib/services/splitstep/config.ts so the collegiate tier can be
-- added without touching callers.

create table if not exists public.processing_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  account_type text not null default 'individual',
  billing_month date not null,
  job_id uuid not null references public.processing_jobs (id) on delete cascade,
  created_by uuid not null references public.users (id),

  reserved_seconds integer not null,
  actual_seconds integer,
  released boolean not null default false,

  created_at timestamptz not null default now(),

  constraint processing_usage_account_type_check check (
    account_type in ('individual', 'program')
  ),
  -- billing_month is always the first of the month, UTC.
  constraint processing_usage_billing_month_check check (
    billing_month = date_trunc('month', billing_month)::date
  )
);

create index if not exists processing_usage_account_month_idx
  on public.processing_usage (account_id, account_type, billing_month)
  where released = false;
create index if not exists processing_usage_job_id_idx
  on public.processing_usage (job_id);

-- ---------------------------------------------------------------------------
-- RLS — matches the existing convention on matches/match_files exactly
-- ---------------------------------------------------------------------------

alter table public.processing_jobs enable row level security;
alter table public.processing_usage enable row level security;

drop policy if exists "Users can view own processing jobs" on public.processing_jobs;
create policy "Users can view own processing jobs"
  on public.processing_jobs for select
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can insert own processing jobs" on public.processing_jobs;
create policy "Users can insert own processing jobs"
  on public.processing_jobs for insert
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can update own processing jobs" on public.processing_jobs;
create policy "Users can update own processing jobs"
  on public.processing_jobs for update
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can delete own processing jobs" on public.processing_jobs;
create policy "Users can delete own processing jobs"
  on public.processing_jobs for delete
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can view own processing usage" on public.processing_usage;
create policy "Users can view own processing usage"
  on public.processing_usage for select
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can insert own processing usage" on public.processing_usage;
create policy "Users can insert own processing usage"
  on public.processing_usage for insert
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can update own processing usage" on public.processing_usage;
create policy "Users can update own processing usage"
  on public.processing_usage for update
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can delete own processing usage" on public.processing_usage;
create policy "Users can delete own processing usage"
  on public.processing_usage for delete
  using ((select auth.uid()) = created_by);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_processing_jobs_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists processing_jobs_set_updated_at on public.processing_jobs;
create trigger processing_jobs_set_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_processing_jobs_updated_at();
