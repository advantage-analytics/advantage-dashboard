-- A1 · Conferences become a table; programs.conference stays as a mirror
--
-- Before this migration a conference was free text on `programs.conference`:
-- 1,942 programs, 137 distinct strings, 2 with none, every string in exactly
-- one division (verified live 2026-09-16). Every reader matches the exact
-- string — `getConferenceTable`, the dual-meet wizard, the Teams filter and
-- facets, `getConferenceOptions`, `search_programs` tiers 2–3.
--
-- Design (plan §A1, "Design decisions" 1):
--   * `public.conferences` owns the entity. `label` is a STORED generated
--     column — `name || ' (' || short_name || ')'`, or bare `name` when there
--     is no short name — so it is always exactly what the old text was.
--   * `programs.conference_id` is the real reference. `programs.conference`
--     is kept as a trigger-fed MIRROR of `conferences.label`, so the backfill
--     below changes zero bytes of existing text, every exact-string reader
--     keeps working, and renames/merges propagate through the mirror.
--   * The BEFORE trigger on `programs` accepts a write on either column:
--     id changed → text follows; text changed → resolved to an id, creating
--     the conference only when `org_type = 'college'`. Invariant for college
--     rows: `conference is null ⇔ conference_id is null`.
--
-- LIVE DATA THAT SHAPED THIS FILE (read on 2026-09-16, not assumed):
--   * `Northern Sun Intercollegiate Conference  (NSIC)` carries a double
--     space, so `name || ' (' || short || ')'` does not recompose to it. It is
--     stored as `(full string, null)` so the label is byte-identical.
--   * `Ivy League (IVY)` and `Ivy League (Ivy)` are BOTH live, 8 programs
--     each, and differ only in case. Zero-byte preservation plus 137 rows
--     means both must exist, which a `unique (lower(label))` index forbids.
--     So: the NAME index is case-insensitive as designed (it does the real
--     dedup work — two rows can never share a name in any case), while the
--     LABEL index is case-sensitive on `label` itself. `Ivy League (IVY)`
--     keeps its parsed form (`Ivy League` / `IVY`; C-collation tie-break on
--     equal program counts) and `Ivy League (Ivy)` is demoted to
--     `(full string, null)` so the two names differ. Collapsing the pair is
--     one `admin_merge_conferences` call once A2/A9 land — after which the
--     label index can be tightened to `lower(label)` in a follow-up.
--
-- Idempotent: every statement is guarded; re-running inserts nothing new and
-- the closing assertions re-verify the invariants.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conferences
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.conferences (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  division    text,
  website     text,
  label       text generated always as (
                case
                  when short_name is null then name
                  else name || ' (' || short_name || ')'
                end
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.conferences is
  'Collegiate conferences. `label` is what programs.conference mirrors; '
  'write name/short_name and the label (and every program''s text) follows.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conferences_name_check') then
    alter table public.conferences
      add constraint conferences_name_check
      check (length(btrim(name)) between 2 and 120);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'conferences_short_name_check') then
    alter table public.conferences
      add constraint conferences_short_name_check
      check (short_name is null
             or (length(short_name) between 1 and 12 and short_name !~ '[()]'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'conferences_division_check') then
    alter table public.conferences
      add constraint conferences_division_check
      check (division is null or division in ('D1', 'D2', 'D3', 'NAIA', 'JUCO'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'conferences_website_check') then
    alter table public.conferences
      add constraint conferences_website_check
      check (website is null or length(website) <= 200);
  end if;
end
$$;

-- Name: case-insensitive, whitespace-insensitive. This is the dedup that
-- matters — an admin typing "ivy league" finds the existing row.
create unique index if not exists conferences_name_key
  on public.conferences (lower(btrim(name)));

-- Label: case-SENSITIVE (see header — the live Ivy League pair). Still
-- guarantees `programs.conference` resolves to exactly one row.
create unique index if not exists conferences_label_key
  on public.conferences (label);

create or replace function public.set_conferences_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists conferences_touch_updated_at on public.conferences;
create trigger conferences_touch_updated_at
  before update on public.conferences
  for each row execute function public.set_conferences_updated_at();

-- Directory data, like `programs`: any signed-in user may read; nobody
-- writes directly. Writes go through security-definer RPCs (A2) and the
-- triggers below.
alter table public.conferences enable row level security;

drop policy if exists "conferences_select_authenticated" on public.conferences;
create policy "conferences_select_authenticated"
  on public.conferences
  for select
  to authenticated
  using (true);

revoke all on public.conferences from public, anon, authenticated;
grant select on public.conferences to authenticated;
grant all on public.conferences to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. programs.conference_id
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.programs
  add column if not exists conference_id uuid
  references public.conferences (id) on delete restrict;

comment on column public.programs.conference is
  'MIRROR of conferences.label for the row''s conference_id — maintained by '
  'trigger programs_sync_conference. Writing either column is fine; the '
  'other follows. Kept so exact-string readers and search_programs stay valid.';

-- Every grouped count in the admin list is (conference_id, status) over
-- placed programs; the WHERE matches the loader's `conference_id is not null`.
create index if not exists programs_conference_id_status_idx
  on public.programs (conference_id, status)
  where conference_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. conference_id_for — resolve text to an id, optionally creating
-- ─────────────────────────────────────────────────────────────────────────────
-- Resolution order: exact label → label case-insensitively → name
-- case-insensitively. Ties (the Ivy pair) prefer the exact-case match, then
-- C-collation order so the answer is stable. When `p_create` and nothing
-- matches, the text is parsed as "Name (SHORT)" and inserted; a parse whose
-- recomposition differs from the input, or whose name would collide with an
-- existing conference, is stored as `(full text, null)` so the label is the
-- input byte-for-byte.
--
-- SECURITY DEFINER so the trigger (which runs as the writer) can insert
-- into `conferences`, which no client role may write. Execute is revoked
-- from every client role: the only legitimate caller is the trigger function
-- below, itself security definer. Exposing this via PostgREST rpc would let
-- any user mint conferences.

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

  insert into public.conferences (name, short_name, division)
  values (v_name, v_short, v_div)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.conference_id_for(text, text, boolean) from public, anon, authenticated;
grant execute on function public.conference_id_for(text, text, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. programs_sync_conference — BEFORE trigger keeping the two columns agreed
-- ─────────────────────────────────────────────────────────────────────────────
-- * id changed (or set on insert)  → text := that conference's label
-- * text changed                   → nullif(btrim(text), ''); null clears the
--                                    id; otherwise resolve, creating only for
--                                    colleges, and take the resolved label
-- * early return when the text already equals the current id's label — this
--   is the path the mirror trigger's own update lands on, so there is no
--   second resolution and no recursion.

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

  new.conference_id := public.conference_id_for(v_text, new.division, new.org_type = 'college');

  if new.conference_id is not null then
    select c.label into new.conference from public.conferences c where c.id = new.conference_id;
  else
    -- Non-college with an unknown conference: keep the text, no reference.
    new.conference := v_text;
  end if;

  return new;
end;
$$;

revoke all on function public.programs_sync_conference() from public, anon, authenticated;

drop trigger if exists programs_sync_conference on public.programs;
create trigger programs_sync_conference
  before insert or update of conference, conference_id on public.programs
  for each row execute function public.programs_sync_conference();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. conferences_mirror_label — a rename rewrites every pointing program
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.conferences_mirror_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.programs p
     set conference = new.label
   where p.conference_id = new.id
     and p.conference is distinct from new.label;
  return null;
end;
$$;

revoke all on function public.conferences_mirror_label() from public, anon, authenticated;

drop trigger if exists conferences_mirror_label on public.conferences;
create trigger conferences_mirror_label
  after update of name, short_name on public.conferences
  for each row
  when (old.label is distinct from new.label)
  execute function public.conferences_mirror_label();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Backfill — one row per distinct string, zero bytes of text changed
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r      record;
  v_bad  integer;
  v_n    integer;
begin
  create temp table tmp_conf on commit drop as
  with d as (
    select btrim(p.conference)                                        as raw,
           count(*)::integer                                          as n,
           mode() within group (order by p.division)
             filter (where p.division is not null)                    as div,
           count(distinct p.division)                                 as ndiv
    from public.programs p
    where p.conference is not null
    group by 1
  ),
  parsed as (
    select d.raw, d.n, d.div, d.ndiv, m.m[1] as pname, m.m[2] as pshort
    from d
    left join lateral (
      select regexp_match(d.raw, '^(.*\S)\s*\(([^()]{1,12})\)$') as m
    ) m on true
  )
  select raw, n, div, ndiv,
         case when pname is not null and pname || ' (' || pshort || ')' = raw
              then pname else raw end as name,
         case when pname is not null and pname || ' (' || pshort || ')' = raw
              then pshort else null end as short_name
  from parsed;

  for r in select raw, ndiv from tmp_conf where ndiv > 1 loop
    raise notice 'conference % spans % divisions; taking the mode', r.raw, r.ndiv;
  end loop;

  -- Name collisions among the parsed set: the string carrying the most
  -- programs keeps its parse (C-collation order breaks ties), the rest are
  -- stored whole so their names differ. Also demote anything whose parsed
  -- name already exists as a conference under a different label (re-runs).
  update tmp_conf t
     set name = t.raw, short_name = null
   where t.short_name is not null
     and (
       exists (
         select 1 from tmp_conf o
         where o.raw <> t.raw
           and lower(o.name) = lower(t.name)
           and (o.n > t.n or (o.n = t.n and o.raw collate "C" < t.raw collate "C"))
       )
       or exists (
         select 1 from public.conferences c
         where lower(btrim(c.name)) = lower(t.name)
           and c.label <> t.raw
       )
     );

  select count(*) into v_bad
  from (select lower(name) from tmp_conf group by 1 having count(*) > 1) x;
  if v_bad > 0 then
    raise exception 'conferences backfill: % conference names still collide after fallback', v_bad;
  end if;

  insert into public.conferences (name, short_name, division)
  select t.name, t.short_name, t.div
  from tmp_conf t
  where not exists (select 1 from public.conferences c where c.label = t.raw);
  get diagnostics v_n = row_count;
  raise notice 'conferences backfill: inserted % conferences', v_n;

  select count(*) into v_bad
  from tmp_conf t
  where not exists (select 1 from public.conferences c where c.label = t.raw);
  if v_bad > 0 then
    raise exception 'conferences backfill: % labels do not reproduce their source string', v_bad;
  end if;

  -- Exact match on purpose (not lower()): labels were built to equal the
  -- text byte-for-byte, and a case-insensitive join would be ambiguous for
  -- the Ivy pair. The BEFORE trigger fires here and re-asserts the same text.
  update public.programs p
     set conference_id = c.id
    from public.conferences c
   where p.conference_id is null
     and p.conference is not null
     and c.label = btrim(p.conference);
  get diagnostics v_n = row_count;
  raise notice 'conferences backfill: linked % programs', v_n;

  select count(*) into v_bad
  from public.programs p
  where p.org_type = 'college'
    and (p.conference is null) <> (p.conference_id is null);
  if v_bad > 0 then
    raise exception 'conferences backfill: % college programs break conference ⇔ conference_id', v_bad;
  end if;

  select count(*) into v_bad
  from public.programs p
  where p.conference is distinct from
        (select c.label from public.conferences c where c.id = p.conference_id);
  if v_bad > 0 then
    raise exception 'conferences backfill: % programs whose text is not their conference''s label', v_bad;
  end if;
end
$$;
