-- T12 · Owner-gated conference minting, merge/set lock order, list rewrite
--
-- Every function below was copied from the LIVE body via pg_get_functiondef
-- on 2026-09-16 and then edited; `supabase/migrations/` is ~100 migrations
-- behind the database, so the two A1/A2 files are context, not the source.
--
-- WHAT CHANGES
--
-- 1. `programs_sync_conference` no longer mints a conference for any writer.
--    The text path passes
--      p_create => new.org_type = 'college'
--                  and (public.is_admin() or (select auth.role()) = 'service_role')
--    so only an admin session or the service-role client (the seed / test
--    fixture path) can create a `conferences` row by typing an unseen name.
--    A program OWNER saving "Owner Conference" in Settings keeps the text on
--    `programs.conference` with `conference_id` null — exactly the club path
--    A1 already had. This is the fix for the recurring `Owner Conference`
--    orphan: the Teams-management spec's owner wrote through
--    `update_program_settings`, the trigger inserted a conference nobody
--    pointed at after cleanup, and it kept reappearing.
--
--    RELAXED INVARIANT. A1's college invariant
--        (conference is null) = (conference_id is null)
--    no longer holds: a college row may now carry owner-typed text with a
--    null id. The check that replaces it, and that the closing DO block
--    asserts, is
--        conference_id is not null  ⇒  conference = label
--    i.e.  select count(*) from programs p
--          join conferences c on c.id = p.conference_id
--          where p.conference is distinct from c.label   = 0.
--
--    CAVEAT. A direct `postgres`-role write (MCP `execute_sql`, no JWT) has
--    `auth.uid()` and `auth.role()` both null, so it no longer creates
--    conferences either — the text is kept, the id stays null. The seed path
--    is the service-role client (`auth.role() = 'service_role'`), which
--    still creates. Admin RPCs (`admin_create_program`, `admin_upsert_conference`)
--    run under an admin JWT and still create.
--
-- 2. `conference_id_for`'s create path is `insert … on conflict do nothing
--    returning id into v_id`, then the same label/name re-lookup when
--    `v_id is null`. Two writers racing on the same unseen name used to make
--    one of them fail with 23505; now the loser resolves to the winner's row.
--    `on conflict` with no target covers both unique indexes
--    (`conferences_name_key` on lower(btrim(name)), `conferences_label_key`).
--
-- 3. `admin_merge_conferences` lock order. The FK `programs.conference_id →
--    conferences.id` takes a KEY SHARE lock on the target row for every
--    program that moves (and for every concurrent insert/update pointing at
--    it). KEY SHARE conflicts with FOR UPDATE but NOT with FOR KEY SHARE, so
--    locking the target `for update` (A2) could deadlock against a concurrent
--    program write. Now: source `for update` (it is deleted), target
--    `for key share` (it only needs to keep existing), taken in two explicit
--    statements in id order — lower id first — so two merges on the same pair
--    cannot deadlock either. The programs UPDATE and the audit INSERT are one
--    statement (`with moved as (update … returning id) insert … from moved`)
--    and the returned count comes from that CTE.
--
-- 4. `admin_set_program_conference` locks the program `for no key update`:
--    `conference_id` is not a key column, so the weaker lock is enough and
--    does not block concurrent KEY SHARE takers (FKs into `programs`).
--
-- 5. `admin_list_conferences` is a single `left join … group by c.id` instead
--    of `left join lateral` — one grouped pass over the partial index
--    `programs_conference_id_status_idx` rather than one aggregate per
--    conference. Same columns, same order, same output (md5 verified live).
--
-- Idempotent: `create or replace` throughout; grants restated; the closing
-- DO block re-verifies the relaxed invariant and the lock clauses.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conference_id_for — race-safe create path
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.conference_id_for(
  p_label    text,
  p_division text,
  p_create   boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text  text := nullif(btrim(p_label), '');
  v_id    uuid;
  v_m     text[];
  v_name  text;
  v_short text;
  v_div   text;
begin
  if v_text is null then
    return null;
  end if;

  select c.id into v_id
  from public.conferences c
  where lower(c.label) = lower(v_text)
  order by (c.label = v_text) desc, c.label collate "C"
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select c.id into v_id
  from public.conferences c
  where lower(btrim(c.name)) = lower(v_text)
  order by (btrim(c.name) = v_text) desc, c.label collate "C"
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if not coalesce(p_create, false) then
    return null;
  end if;

  v_m := regexp_match(v_text, '^(.*\S)\s*\(([^()]{1,12})\)$');
  if v_m is not null and v_m[1] || ' (' || v_m[2] || ')' = v_text then
    v_name  := v_m[1];
    v_short := v_m[2];
  else
    v_name  := v_text;
    v_short := null;
  end if;

  -- "Ivy League (IL)" while "Ivy League" exists: don't silently rename the
  -- writer's text to another conference; keep it whole.
  if v_short is not null and exists (
    select 1 from public.conferences c where lower(btrim(c.name)) = lower(v_name)
  ) then
    v_name  := v_text;
    v_short := null;
  end if;

  if length(btrim(v_name)) not between 2 and 120 then
    raise exception 'Conference name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  v_div := case
    when p_division in ('D1', 'D2', 'D3', 'NAIA', 'JUCO') then p_division
    else null
  end;

  -- Race-safe: a concurrent writer may have inserted the same name/label
  -- between the lookups above and this insert. `do nothing` swallows the
  -- 23505 and the re-lookup below resolves to the row that won.
  insert into public.conferences (name, short_name, division)
  values (v_name, v_short, v_div)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
    from public.conferences c
    where lower(c.label) = lower(v_text)
    order by (c.label = v_text) desc, c.label collate "C"
    limit 1;
  end if;

  if v_id is null then
    select c.id into v_id
    from public.conferences c
    where lower(btrim(c.name)) = lower(v_text)
    order by (btrim(c.name) = v_text) desc, c.label collate "C"
    limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.conference_id_for(text, text, boolean) from public, anon, authenticated;
grant execute on function public.conference_id_for(text, text, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. programs_sync_conference — only admins and the service role mint
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.programs_sync_conference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text  text;
  v_label text;
begin
  -- Id path: on UPDATE when the id moved, on INSERT whenever an id was given.
  if (tg_op = 'UPDATE' and new.conference_id is distinct from old.conference_id)
     or (tg_op = 'INSERT' and new.conference_id is not null) then
    if new.conference_id is null then
      new.conference := null;
      return new;
    end if;
    select c.label into v_label from public.conferences c where c.id = new.conference_id;
    if v_label is null then
      raise exception 'Unknown conference id %', new.conference_id
        using errcode = '23503';
    end if;
    new.conference := v_label;
    return new;
  end if;

  -- Text path.
  v_text := nullif(btrim(new.conference), '');

  if v_text is null then
    new.conference    := null;
    new.conference_id := null;
    return new;
  end if;

  if new.conference_id is not null then
    select c.label into v_label from public.conferences c where c.id = new.conference_id;
    if v_label = v_text then
      new.conference := v_label;
      return new;
    end if;
  end if;

  -- Resolve always; CREATE only for a college row written by an admin
  -- session or the service-role client. A program owner typing an unseen
  -- name keeps the text with no reference (see header).
  new.conference_id := public.conference_id_for(
    v_text,
    new.division,
    new.org_type = 'college'
      and (public.is_admin() or (select auth.role()) = 'service_role')
  );

  if new.conference_id is not null then
    select c.label into new.conference from public.conferences c where c.id = new.conference_id;
  else
    -- Unknown conference the writer may not mint: keep the text, no reference.
    new.conference := v_text;
  end if;

  return new;
end;
$$;

revoke all on function public.programs_sync_conference() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. admin_merge_conferences — source FOR UPDATE, target FOR KEY SHARE
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_moved integer;
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

  -- Lock in id order, lower id first. The source is deleted below, so it
  -- takes FOR UPDATE; the target only has to survive, so FOR KEY SHARE —
  -- the same lock the FK from programs.conference_id takes, which conflicts
  -- with FOR UPDATE but not with itself (see header).
  if p_source < p_target then
    perform 1 from public.conferences where id = p_source for update;
    if not found then
      raise exception 'Conference not found' using errcode = 'P0002';
    end if;
    perform 1 from public.conferences where id = p_target for key share;
    if not found then
      raise exception 'Conference not found' using errcode = 'P0002';
    end if;
  else
    perform 1 from public.conferences where id = p_target for key share;
    if not found then
      raise exception 'Conference not found' using errcode = 'P0002';
    end if;
    perform 1 from public.conferences where id = p_source for update;
    if not found then
      raise exception 'Conference not found' using errcode = 'P0002';
    end if;
  end if;

  -- Move and audit in one statement; one audit row per moved program, so
  -- the insert's row count is the moved count. `programs_sync_conference`
  -- rewrites the mirrored text on the same UPDATE.
  with moved as (
    update public.programs p
       set conference_id = p_target
     where p.conference_id = p_source
    returning p.id
  )
  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  select m.id,
         (select auth.uid()),
         'program.conference_changed',
         p_target,
         jsonb_build_object(
           'from',     p_source,
           'to',       p_target,
           'by_admin', true,
           'reason',   'merge'
         )
  from moved m;
  get diagnostics v_moved = row_count;

  delete from public.conferences where id = p_source;

  return v_moved;
end;
$$;

revoke all on function public.admin_merge_conferences(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_conferences(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_set_program_conference — FOR NO KEY UPDATE on the program
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- conference_id is not a key column, so the weaker lock suffices and does
  -- not block FKs into programs (which take KEY SHARE on this row).
  select p.conference_id into v_current
  from public.programs p
  where p.id = p_program_id
  for no key update;

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
-- 5. admin_list_conferences — one grouped pass, no lateral
-- ─────────────────────────────────────────────────────────────────────────────
-- `group by c.id` is enough for the other conference columns because `id` is
-- the primary key (functional dependency). `count(p.id)` not `count(*)`: a
-- conference with no programs must read 0, not 1, through the left join.

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
         count(p.id)::integer                                                    as teams,
         (count(p.id) filter (where p.status in ('active', 'claim_pending')))::integer as on_advantage,
         (count(p.id) filter (where p.status = 'active'))::integer               as pilot,
         count(distinct p.school_group)::integer                                 as schools,
         coalesce(bool_or(p.team = 'mens'), false)                               as has_mens,
         coalesce(bool_or(p.team = 'womens'), false)                             as has_womens,
         c.updated_at
  from public.conferences c
  left join public.programs p on p.conference_id = c.id
  group by c.id
  order by c.name, c.label;
end;
$$;

revoke all on function public.admin_list_conferences() from public, anon;
grant execute on function public.admin_list_conferences() to authenticated;

-- Unchanged bodies, grants restated so a re-run leaves the same ACLs.
revoke all on function public.admin_upsert_conference(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_upsert_conference(uuid, text, text, text, text) to authenticated;
revoke all on function public.admin_delete_conference(uuid) from public, anon;
grant execute on function public.admin_delete_conference(uuid) to authenticated;
revoke all on function public.conferences_mirror_label() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_bad integer;
  v_def text;
begin
  -- Relaxed invariant: conference_id is not null ⇒ conference = label.
  select count(*) into v_bad
  from public.programs p
  join public.conferences c on c.id = p.conference_id
  where p.conference is distinct from c.label;
  if v_bad > 0 then
    raise exception 'conferences: % programs whose text is not their conference''s label', v_bad;
  end if;

  select pg_get_functiondef('public.admin_merge_conferences(uuid, uuid)'::regprocedure) into v_def;
  if v_def not like '%for key share%' or v_def not like '%for update%' then
    raise exception 'admin_merge_conferences: expected lock clauses missing';
  end if;

  select pg_get_functiondef('public.admin_set_program_conference(uuid, uuid)'::regprocedure) into v_def;
  if v_def not like '%for no key update%' then
    raise exception 'admin_set_program_conference: expected lock clause missing';
  end if;

  select pg_get_functiondef('public.admin_list_conferences()'::regprocedure) into v_def;
  if v_def like '%lateral%' then
    raise exception 'admin_list_conferences: lateral join still present';
  end if;
end
$$;
