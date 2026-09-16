-- A2 · Admin conference RPCs + audit action
--
-- The five security-definer entry points the admin Conferences page (A4–A9)
-- calls through PostgREST. `conferences` is read-only for every client role
-- (A1), so these are the only way a conference is created, renamed, merged,
-- deleted, or attached to a program from the app.
--
-- Pattern: `20260914100200_admin_program_rpcs.sql` (`admin_create_program`,
-- copied from the LIVE body via pg_get_functiondef on 2026-09-16). Every
-- function is `security definer`, `set search_path = ''`, opens with the
-- `public.is_admin()` gate raising `42501`, and is executable only by
-- `authenticated` (+ service_role) — never `anon` / PUBLIC.
--
-- Relies on A1's triggers:
--   * `programs_sync_conference`  — updating `programs.conference_id` rewrites
--                                   the mirrored `programs.conference` text.
--   * `conferences_mirror_label`  — renaming a conference rewrites every
--                                   pointing program's text.
-- So the RPCs below only ever write `conference_id`; the text follows.
--
-- Unique violations (`23505`, from `conferences_name_key` / `_label_key`) are
-- deliberately NOT caught in `admin_upsert_conference`; the TS caller (A4)
-- maps them to "A conference with that name already exists."
--
-- Idempotent: `create or replace` throughout; the CHECK constraint is dropped
-- and re-added by name.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. program_audit_log — new action
-- ─────────────────────────────────────────────────────────────────────────────
-- Live list copied from
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'program_audit_log_action_check';
-- on 2026-09-16, plus `program.conference_changed`.

alter table public.program_audit_log
  drop constraint if exists program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check
  check (action = any (array[
    'player.added',
    'player.updated',
    'player.archived',
    'player.claimed',
    'player.merged',
    'invite.created',
    'invite.revoked',
    'invite.accepted',
    'member.removed',
    'member.role_changed',
    'seats.changed',
    'member.account_deleted',
    'lineup.set',
    'ownership.transferred',
    'event.deleted',
    'player.restored',
    'match.attached',
    'member.left',
    'program.conference_changed'
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_upsert_conference
-- ─────────────────────────────────────────────────────────────────────────────
-- Insert when `p_id` is null, otherwise update that row. Trims and nullifs
-- every text input; validates division against `conferences_division_check`
-- so the caller gets `22023` with a readable message instead of a CHECK
-- violation. A rename fans out to programs via `conferences_mirror_label`.

create or replace function public.admin_upsert_conference(
  p_id         uuid,
  p_name       text,
  p_short_name text,
  p_division   text,
  p_website    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_short text := nullif(btrim(coalesce(p_short_name, '')), '');
  v_div   text := nullif(btrim(coalesce(p_division, '')), '');
  v_web   text := nullif(btrim(coalesce(p_website, '')), '');
  v_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Mirrors conferences_name_check.
  if length(v_name) not between 2 and 120 then
    raise exception 'Conference name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  -- Mirrors conferences_short_name_check.
  if v_short is not null
     and (length(v_short) > 12 or v_short ~ '[()]') then
    raise exception 'Short name must be 1–12 characters with no parentheses.'
      using errcode = '22023';
  end if;

  -- Mirrors conferences_division_check.
  if v_div is not null and v_div not in ('D1', 'D2', 'D3', 'NAIA', 'JUCO') then
    raise exception 'Unknown division %', v_div using errcode = '22023';
  end if;

  -- Mirrors conferences_website_check.
  if v_web is not null and length(v_web) > 200 then
    raise exception 'Website must be 200 characters or fewer.'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.conferences (name, short_name, division, website)
    values (v_name, v_short, v_div, v_web)
    returning id into v_id;
    return v_id;
  end if;

  update public.conferences
     set name       = v_name,
         short_name = v_short,
         division   = v_div,
         website    = v_web
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Conference % not found', p_id using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_upsert_conference(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_upsert_conference(uuid, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. admin_merge_conferences
-- ─────────────────────────────────────────────────────────────────────────────
-- Moves every program on `p_source` to `p_target`, deletes the source, and
-- returns how many programs moved. Both rows are locked `for update` in id
-- order so two concurrent merges touching the same pair cannot deadlock.
-- One audit row per moved program; `programs_sync_conference` rewrites the
-- mirrored text on the same UPDATE. The source delete cannot hit the FK
-- (`on delete restrict`) because nothing points at it any more.

create or replace function public.admin_merge_conferences(
  p_source uuid,
  p_target uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked integer;
  v_moved  integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_source is null or p_target is null then
    raise exception 'Both conferences are required.' using errcode = '22023';
  end if;

  if p_source = p_target then
    raise exception 'A conference cannot be merged into itself.'
      using errcode = '22023';
  end if;

  -- Lock both in a deterministic order; the count proves both exist.
  select count(*) into v_locked
  from (
    select c.id
    from public.conferences c
    where c.id in (p_source, p_target)
    order by c.id
    for update
  ) locked;

  if v_locked <> 2 then
    raise exception 'Conference not found' using errcode = 'P0002';
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  select p.id,
         (select auth.uid()),
         'program.conference_changed',
         p_target,
         jsonb_build_object(
           'from',     p_source,
           'to',       p_target,
           'by_admin', true,
           'reason',   'merge'
         )
  from public.programs p
  where p.conference_id = p_source;

  update public.programs p
     set conference_id = p_target
   where p.conference_id = p_source;
  get diagnostics v_moved = row_count;

  delete from public.conferences where id = p_source;

  return v_moved;
end;
$$;

revoke all on function public.admin_merge_conferences(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_conferences(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_delete_conference
-- ─────────────────────────────────────────────────────────────────────────────
-- Refuses while any program still points here — the admin merges first. The
-- FK would refuse too, but with a `23503` nobody can read; this gives the
-- page a sentence it can show verbatim.

create or replace function public.admin_delete_conference(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teams integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'Conference id is required.' using errcode = '22023';
  end if;

  perform 1 from public.conferences where id = p_id for update;
  if not found then
    raise exception 'Conference % not found', p_id using errcode = 'P0002';
  end if;

  select count(*) into v_teams
  from public.programs p
  where p.conference_id = p_id;

  if v_teams > 0 then
    raise exception
      'This conference still has % teams — merge it into another one first.',
      v_teams
      using errcode = 'P0001';
  end if;

  delete from public.conferences where id = p_id;
end;
$$;

revoke all on function public.admin_delete_conference(uuid) from public, anon;
grant execute on function public.admin_delete_conference(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_set_program_conference
-- ─────────────────────────────────────────────────────────────────────────────
-- Attaches one program to a conference (or detaches it — `p_conference_id`
-- null removes). Locks the program row, no-ops when nothing changes, writes
-- the same audit shape as a merge with `reason: 'set'`.

create or replace function public.admin_set_program_conference(
  p_program_id    uuid,
  p_conference_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  select p.conference_id into v_current
  from public.programs p
  where p.id = p_program_id
  for update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  if v_current is not distinct from p_conference_id then
    return;
  end if;

  if p_conference_id is not null
     and not exists (select 1 from public.conferences c where c.id = p_conference_id) then
    raise exception 'Conference % not found', p_conference_id using errcode = 'P0002';
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'program.conference_changed',
    p_conference_id,
    jsonb_build_object(
      'from',     v_current,
      'to',       p_conference_id,
      'by_admin', true,
      'reason',   'set'
    )
  );

  update public.programs
     set conference_id = p_conference_id
   where id = p_program_id;
end;
$$;

revoke all on function public.admin_set_program_conference(uuid, uuid) from public, anon;
grant execute on function public.admin_set_program_conference(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. admin_list_conferences
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per conference with the counts the admin table shows:
--   teams        every program with this conference_id
--   on_advantage status in ('active', 'claim_pending')
--   pilot        status = 'active'
--   schools      count(distinct school_group)
--   has_mens / has_womens
-- computed in one grouped lateral pass over `programs`, which the partial
-- index `programs_conference_id_status_idx` serves. Admin-only despite being
-- a read: the counts leak claim/pilot state that ordinary users don't see.

create or replace function public.admin_list_conferences()
returns table (
  id           uuid,
  name         text,
  short_name   text,
  division     text,
  website      text,
  label        text,
  teams        integer,
  on_advantage integer,
  pilot        integer,
  schools      integer,
  has_mens     boolean,
  has_womens   boolean,
  updated_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.short_name,
         c.division,
         c.website,
         c.label,
         coalesce(s.teams, 0)::integer,
         coalesce(s.on_advantage, 0)::integer,
         coalesce(s.pilot, 0)::integer,
         coalesce(s.schools, 0)::integer,
         coalesce(s.has_mens, false),
         coalesce(s.has_womens, false),
         c.updated_at
  from public.conferences c
  left join lateral (
    select count(*)                                                       as teams,
           count(*) filter (where p.status in ('active', 'claim_pending')) as on_advantage,
           count(*) filter (where p.status = 'active')                     as pilot,
           count(distinct p.school_group)                                  as schools,
           bool_or(p.team = 'mens')                                        as has_mens,
           bool_or(p.team = 'womens')                                      as has_womens
    from public.programs p
    where p.conference_id = c.id
  ) s on true
  order by c.name, c.label;
end;
$$;

revoke all on function public.admin_list_conferences() from public, anon;
grant execute on function public.admin_list_conferences() to authenticated;
