-- Labeller role: a user who cleans vendor matches in the label console without
-- being an operator. Sessions are assigned to one labeller, the labeller
-- submits (status 'submitted'), and an admin's Mark complete publishes. Every
-- read and write of label_* stays service-role behind the app guard; this
-- migration deliberately adds NO labeller policies on any label_* table and
-- NO client grant on `users.is_labeller`.
--
-- Verified against the live DB (Supabase MCP, 2026-11-03) before writing —
-- the migrations folder is ~100 behind, so nothing here is taken from an old
-- file:
--
--   public.label_sessions, 22 live columns: id, match_id, job_id, kind,
--   labeller, status, started_at, completed_at, created_at, updated_at,
--   first_server, start_score, final_score, ad_scoring, marks_enabled,
--   results_object_key, derivation_version, publishing_since, open_counts,
--   open_counts_at, video_starts_mid_match, video_ends_early.
--   Touched here: status (CHECK), completed_at (CHECK kept), plus the three
--   new columns assigned_to, assigned_at, submitted_at. 45 rows live:
--   25 'labelling', 20 'complete' — every row satisfies the new CHECKs.
--
--   public.label_sessions CHECK constraints by live name (pg_constraint):
--     label_sessions_status_check      status in ('labelling','complete')  ← dropped + re-added
--     label_sessions_check             (status = 'complete') = (completed_at is not null)  ← kept
--     label_sessions_kind_check, label_sessions_first_server_check,
--     label_sessions_start_score_check, label_sessions_final_score_check,
--     label_sessions_analyst_source, label_sessions_open_counts_shape  ← untouched
--
--   label_sessions_one_open_per_job (pg_indexes), live:
--     CREATE UNIQUE INDEX ... ON public.label_sessions USING btree (job_id)
--       WHERE (status = 'labelling'::text)
--
--   public.claim_label_publish_lease(p_session_id uuid), live: LANGUAGE sql,
--   SET search_path TO '', not SECURITY DEFINER; `update ... set
--   publishing_since = now() where id = p_session_id and status = 'labelling'
--   and (publishing_since is null or publishing_since <= now() - interval
--   '5 minutes') returning publishing_since`. proacl: postgres=X,
--   service_role=X — EXECUTE to service_role only. `create or replace` keeps
--   that ACL; the grants are re-stated below anyway.
--   undo_label_op / redo_label_op: both lock the session `for update` with
--   `status = 'labelling'` and raise 'This session is not open for labelling.'
--   They are left alone — a submitted session takes no edits.
--
--   public.users, 39 live columns (every one listed in information_schema):
--   id, email, phone, dob, state, country, role, created_at, utr_id,
--   first_name, last_name, nationality, weight, height, hand, backhand, class,
--   atp_id, wta_id, school_name, onboarded_at, junior_player_name,
--   junior_class_year, guardian_consent_at, avatar_path, plan, is_admin,
--   individual_pilot, individual_pilot_at, video_hours_override,
--   recording_source, acquisition_source, acquisition_source_detail,
--   sample_tour_done_at, first_report_seen_at, first_report_tour_done_at,
--   workspace_hint_done_at, activity_hint_done_at, first_match_feedback_done_at.
--   Touched here: is_admin (trigger widened), is_labeller (new).
--
--   public.users privileges, live (pg_class.relacl / pg_attribute.attacl):
--     relacl: postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r
--     anon: nothing (table or column)
--     authenticated UPDATE: column-scoped only — attacl `authenticated=w` on
--       35 columns; none on is_admin, plan, individual_pilot,
--       individual_pilot_at, video_hours_override (video_hours_override
--       carries a redundant column-level `authenticated=r`).
--   information_schema.table_privileges shows a table-level SELECT for
--   authenticated, and column_privileges lists SELECT on all 39 columns only
--   because it expands that table grant. So SELECT on public.users is
--   TABLE-WIDE, not column-scoped: a new column is readable by authenticated
--   (own row, per RLS) the moment it exists and needs no `grant select (col)`.
--   None is issued below. UPDATE is column-scoped and no UPDATE grant is given
--   on is_labeller — an authenticated grant would let any user self-promote
--   exactly as 20260914100000 closed for is_admin (deviation from the dictated
--   intent, author-approved 2026-11-03). The column is written service-role by
--   the admin assign action only.
--
--   public.users_block_admin_self_update(), live: LANGUAGE plpgsql, SET
--   search_path TO '', not SECURITY DEFINER; raises 42501 when is_admin is
--   set on INSERT or changed on UPDATE and request.jwt.claims->>'role' is
--   'authenticated' or 'anon'. Its trigger is
--   `BEFORE INSERT OR UPDATE OF is_admin ON public.users FOR EACH ROW`.
--   Widened below to is_labeller with the same role test: service_role has
--   role 'service_role' in its claims and a migration or psql session has no
--   claims at all, so both pass; every client role is refused.
--
--   label_* tables all have RLS enabled. label_sessions / label_points /
--   label_shots carry four admin policies each (to authenticated, is_admin());
--   label_row_history / label_redo_history / label_transcript_cache have none
--   and no anon/authenticated grant — the two new tables follow that pattern.
--
-- Rollback (reverse order), at the end of this file.

-- ── users.is_labeller ──────────────────────────────────────────────────────

alter table public.users
  add column if not exists is_labeller boolean not null default false;

comment on column public.users.is_labeller is
  'Labeller flag: may open the label console for sessions assigned to them. Written only by the service role (admin assign action) or a migration; users_block_admin_self_update blocks client writes and authenticated holds no UPDATE privilege on this column.';

-- Operator-managed flags share one guard. Same role test as the live
-- function: a client JWT (authenticated / anon) may not touch either column.
create or replace function public.users_block_admin_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.is_admin is true)
       or (tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin) then
      v_col := 'is_admin';
    elsif (tg_op = 'INSERT' and new.is_labeller is true)
       or (tg_op = 'UPDATE' and new.is_labeller is distinct from old.is_labeller) then
      v_col := 'is_labeller';
    end if;
    if v_col is not null then
      raise exception '% is managed by operators and cannot be changed by clients', v_col
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_block_admin_self_update on public.users;

create trigger users_block_admin_self_update
  before insert or update of is_admin, is_labeller on public.users
  for each row
  execute function public.users_block_admin_self_update();

-- Labellers are a handful of rows; mirrors users_admins_idx (20260914100000).
create index if not exists users_labellers_idx on public.users (id) where is_labeller;

-- ── label_sessions: assignment + submitted status ──────────────────────────

alter table public.label_sessions
  add column if not exists assigned_to uuid references public.users (id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists submitted_at timestamptz;

comment on column public.label_sessions.assigned_to is
  'The labeller this session is assigned to (users.is_labeller). Null = unassigned; admins work any session.';
comment on column public.label_sessions.assigned_at is
  'When assigned_to was last set.';
comment on column public.label_sessions.submitted_at is
  'When the labeller submitted. Set exactly when status = ''submitted''.';

-- The labeller's queue filters on this foreign key.
create index if not exists label_sessions_assigned_to
  on public.label_sessions (assigned_to);

-- labelling → submitted → complete. Dropped by its live name and re-added.
alter table public.label_sessions
  drop constraint label_sessions_status_check;
alter table public.label_sessions
  add constraint label_sessions_status_check
    check (status in ('labelling', 'submitted', 'complete'));

-- label_sessions_check ((status = 'complete') = (completed_at is not null))
-- is kept as it stands; submitted gets the same shape.
alter table public.label_sessions
  add constraint label_sessions_submitted_check
    check ((status = 'submitted') = (submitted_at is not null));

-- A submitted session still holds the job: no second session may open on it
-- until Mark complete closes this one. One transaction, so drop + create.
drop index if exists public.label_sessions_one_open_per_job;
create unique index label_sessions_one_open_per_job
  on public.label_sessions (job_id)
  where status in ('labelling', 'submitted');

-- Mark complete publishes a submitted session, so the lease must be claimable
-- on one. Everything else as live. `create or replace` keeps the ACL; the
-- grants are re-stated so the file says what is true.
create or replace function public.claim_label_publish_lease(p_session_id uuid)
returns timestamptz
language sql
set search_path = ''
as $$
  update public.label_sessions
     set publishing_since = now()
   where id = p_session_id
     and status in ('labelling', 'submitted')
     and (publishing_since is null or publishing_since <= now() - interval '5 minutes')
  returning publishing_since;
$$;

revoke all on function public.claim_label_publish_lease(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_label_publish_lease(uuid) to service_role;

-- ── label_work_beats: one row per labeller per session per minute ──────────

-- The console posts a beat while a labeller is working; hours = count(*) / 60.
create table public.label_work_beats (
  session_id uuid not null references public.label_sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  minute timestamptz not null,
  primary key (session_id, user_id, minute)
);

-- "Hours this labeller worked" reads by user; the primary key covers by session.
create index label_work_beats_user_idx
  on public.label_work_beats (user_id, minute);

-- Service role only: no policy, and no grant to the API roles.
alter table public.label_work_beats enable row level security;
revoke all on public.label_work_beats from anon, authenticated;

-- ── label_submissions: what the labeller handed in ─────────────────────────

create table public.label_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.label_sessions (id) on delete cascade,
  submitted_by uuid references public.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  -- The session's label rows as submitted, for review and diffing.
  rows jsonb not null
);

create index label_submissions_session_idx
  on public.label_submissions (session_id);

-- Service role only: no policy, and no grant to the API roles.
alter table public.label_submissions enable row level security;
revoke all on public.label_submissions from anon, authenticated;

-- Rollback (reverse order):
--   drop table if exists public.label_submissions;
--   drop table if exists public.label_work_beats;
--   create or replace function public.claim_label_publish_lease(p_session_id uuid)
--   returns timestamptz language sql set search_path = '' as $$
--     update public.label_sessions set publishing_since = now()
--      where id = p_session_id and status = 'labelling'
--        and (publishing_since is null or publishing_since <= now() - interval '5 minutes')
--     returning publishing_since; $$;
--   revoke all on function public.claim_label_publish_lease(uuid) from public, anon, authenticated;
--   grant execute on function public.claim_label_publish_lease(uuid) to service_role;
--   drop index if exists public.label_sessions_one_open_per_job;
--   create unique index label_sessions_one_open_per_job
--     on public.label_sessions (job_id) where status = 'labelling';
--   alter table public.label_sessions drop constraint label_sessions_submitted_check;
--   -- (set any 'submitted' rows back to 'labelling' with submitted_at = null first)
--   alter table public.label_sessions drop constraint label_sessions_status_check;
--   alter table public.label_sessions add constraint label_sessions_status_check
--     check (status in ('labelling', 'complete'));
--   drop index if exists public.label_sessions_assigned_to;
--   alter table public.label_sessions
--     drop column if exists submitted_at,
--     drop column if exists assigned_at,
--     drop column if exists assigned_to;
--   drop index if exists public.users_labellers_idx;
--   drop trigger if exists users_block_admin_self_update on public.users;
--   create or replace function public.users_block_admin_self_update()
--   returns trigger language plpgsql set search_path = '' as $$
--   begin
--     if ((tg_op = 'INSERT' and new.is_admin is true)
--         or (tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin))
--        and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
--            in ('authenticated', 'anon') then
--       raise exception 'is_admin is managed by operators and cannot be changed by clients'
--         using errcode = '42501';
--     end if;
--     return new;
--   end; $$;
--   create trigger users_block_admin_self_update
--     before insert or update of is_admin on public.users
--     for each row execute function public.users_block_admin_self_update();
--   alter table public.users drop column if exists is_labeller;
