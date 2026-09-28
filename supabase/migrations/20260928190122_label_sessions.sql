-- Hand-labelling ground truth for Advantage Intelligence (/admin/labels).
--
-- An admin re-watches one processed match and records what really happened,
-- seeded from the vendor's raw strokes JSON (Storage `match-results` at
-- processing_jobs.results_object_key). An offline script then scores every
-- derivation flag and candidate fix rule against these labels, joined on the
-- vendor stroke `event_id` (shots.id is recreated on every re-derive, so it
-- can never be the key).
--
-- These tables are write-only ground truth: nothing here alters or writes
-- points, shots, matches or processing_jobs. Admin-only; no athlete ever reads
-- them. Player sides are 'p1'/'p2' (p1 = matches.player1_id). Coordinates use
-- the `shots` frame: metres, near baseline at y = 0.

-- One labelling run over one job's results file. results_object_key and
-- derivation_version pin the exact file and code the labels were seeded from,
-- so a comparison is reproducible.
create table public.label_sessions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  results_object_key text not null,
  derivation_version text not null,
  labeller uuid default auth.uid() references public.users(id) on delete set null,
  -- 'labelling' keeps derivation flags hidden in the console so they cannot
  -- anchor the labeller; 'complete' freezes the run for scoring.
  status text not null default 'labelling' check (status in ('labelling', 'complete')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Match-level truth as seen on the video; null until the labeller sets it.
  final_score jsonb check (final_score is null or jsonb_typeof(final_score) = 'array'),
  video_starts_mid_match boolean,
  video_ends_early boolean,
  first_server text check (first_server in ('p1', 'p2')),
  ad_scoring boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'complete') = (completed_at is not null))
);

-- One row per real point. vendor_rally_ids records which vendor rallies the
-- point was built from, which is what lets a label split or merge rallies.
-- winner is labelled directly, never computed from the labelled score.
-- Deleted points stay as tombstones; only checked points are scored.
create table public.label_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.label_sessions(id) on delete cascade,
  point_index integer not null,
  vendor_rally_ids integer[] not null default '{}',
  set_number integer,
  game_number integer,
  server text check (server in ('p1', 'p2')),
  serve_side text check (serve_side in ('deuce', 'ad')),
  winner text check (winner in ('p1', 'p2')),
  ending text check (ending in (
    'ace', 'service_winner', 'double_fault', 'winner', 'error', 'let_replayed', 'not_a_point'
  )),
  -- Who struck the last ball.
  ended_by text check (ended_by in ('p1', 'p2')),
  status text not null default 'unchanged' check (status in ('unchanged', 'edited', 'added', 'deleted')),
  -- The status a tombstone had before it was deleted, so Undo puts back
  -- exactly that: `edited` cannot be re-derived once a seeded value has been
  -- overwritten. Set on delete, cleared on restore.
  status_before_delete text check (status_before_delete in ('unchanged', 'edited', 'added')),
  checked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'deleted') = (status_before_delete is not null))
);

-- One row per vendor stroke, plus any stroke the labeller added. event_id is
-- the vendor stroke id (null = added by the labeller, placed after
-- after_event_id). vendor is a frozen copy of the stroke as seeded, for
-- diffing and audit. Deleted shots stay as tombstones with a reason. Fields
-- the video cannot settle are listed in `unclear` and excluded from scoring.
create table public.label_shots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.label_sessions(id) on delete cascade,
  label_point_id uuid not null references public.label_points(id) on delete cascade,
  event_id integer,
  after_event_id integer,
  vendor jsonb check (vendor is null or jsonb_typeof(vendor) = 'object'),
  -- 'edited' = a labelled value differs from the vendor snapshot.
  status text not null default 'kept' check (status in ('kept', 'edited', 'added', 'deleted')),
  -- What Undo restores: see label_points.status_before_delete. `added` could
  -- be read off a null event_id, but `kept` vs `edited` cannot.
  status_before_delete text check (status_before_delete in ('kept', 'edited', 'added')),
  delete_reason text check (delete_reason in (
    'dead_ball_after_fault', 'dead_ball_after_point', 'not_a_stroke', 'duplicate', 'other'
  )),
  hitter text check (hitter in ('p1', 'p2')),
  stroke text check (stroke in (
    'first_serve', 'second_serve', 'forehand', 'backhand', 'forehand_volley', 'backhand_volley', 'overhead'
  )),
  result text check (result in ('in', 'out', 'net')),
  contact_x double precision,
  contact_y double precision,
  landing_x double precision,
  landing_y double precision,
  video_time real,
  unclear text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only a labeller-added shot lacks a vendor id; a vendor shot is never 'added'.
  check (status <> 'added' or event_id is null),
  check (event_id is not null or status in ('added', 'deleted')),
  check (status <> 'deleted' or delete_reason is not null),
  check ((status = 'deleted') = (status_before_delete is not null))
);

-- The comparison joins on event_id: one label row per vendor stroke per session.
create unique index label_shots_session_event_key
  on public.label_shots (session_id, event_id) where event_id is not null;
-- Seeding returns the open session instead of starting a second one.
create unique index label_sessions_one_open_per_job
  on public.label_sessions (job_id) where status = 'labelling';
create index label_sessions_match on public.label_sessions (match_id);
create index label_sessions_labeller on public.label_sessions (labeller);
create index label_points_session_index on public.label_points (session_id, point_index);
create index label_shots_point on public.label_shots (label_point_id);

create function public.set_label_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_label_updated_at() from public, anon, authenticated;

create trigger label_sessions_touch_updated_at
  before update on public.label_sessions
  for each row execute function public.set_label_updated_at();
create trigger label_points_touch_updated_at
  before update on public.label_points
  for each row execute function public.set_label_updated_at();
create trigger label_shots_touch_updated_at
  before update on public.label_shots
  for each row execute function public.set_label_updated_at();

-- Admin-only. The console writes as the signed-in admin through RLS; the
-- offline scoring script reads with the service role.
alter table public.label_sessions enable row level security;
alter table public.label_points enable row level security;
alter table public.label_shots enable row level security;

revoke all on public.label_sessions, public.label_points, public.label_shots from public, anon, authenticated;
grant select, insert, update, delete on public.label_sessions, public.label_points, public.label_shots to authenticated;
grant all on public.label_sessions, public.label_points, public.label_shots to service_role;

create policy label_sessions_admin_select on public.label_sessions
  for select to authenticated using ((select public.is_admin()));
create policy label_sessions_admin_insert on public.label_sessions
  for insert to authenticated with check ((select public.is_admin()));
create policy label_sessions_admin_update on public.label_sessions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy label_sessions_admin_delete on public.label_sessions
  for delete to authenticated using ((select public.is_admin()));

create policy label_points_admin_select on public.label_points
  for select to authenticated using ((select public.is_admin()));
create policy label_points_admin_insert on public.label_points
  for insert to authenticated with check ((select public.is_admin()));
create policy label_points_admin_update on public.label_points
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy label_points_admin_delete on public.label_points
  for delete to authenticated using ((select public.is_admin()));

create policy label_shots_admin_select on public.label_shots
  for select to authenticated using ((select public.is_admin()));
create policy label_shots_admin_insert on public.label_shots
  for insert to authenticated with check ((select public.is_admin()));
create policy label_shots_admin_update on public.label_shots
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy label_shots_admin_delete on public.label_shots
  for delete to authenticated using ((select public.is_admin()));
