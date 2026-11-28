-- 2027 pricing · billing follow-ups: the season pool starts when the plan is saved
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it after
-- 20261126060000_plans_2027_plan_model (it alters `program_plans` and two of
-- that migration's functions). The app tolerates it being missing: every
-- reader of `program_plans` asks for `hours_from` and, on 42703, again
-- without it (`withHoursFrom()` in src/lib/billing/plan-fields.ts), and the
-- season then counts from `starts_on` as it did before.
--
-- THE DECISION. A team's season pool counted everything analysed since the
-- plan's `starts_on`, including video analysed BEFORE an admin saved the
-- plan (a plan saved on February 10 with a January 1 start found January's
-- hours already drawn from it). From here the hours count from the LATER of
-- the plan's start date and the moment the plan was first saved.
--
--   program_plans.hours_from   timestamptz, set once when the row is
--                              inserted. Readable by the team's members like
--                              the table's other public columns; written only
--                              by `admin_set_program_plan`.
--   admin_set_program_plan     the plan-model body, changed in one place: the
--                              INSERT names `hours_from`. The UPDATE half of
--                              the upsert does not, so replacing a plan (new
--                              tier, dates or note) keeps it. Removing a plan
--                              deletes the row, so adding one again stamps a
--                              new `hours_from` — intended; `plan.cleared` and
--                              `plan.set` are both in the audit log.
--   admin_get_program_plan     returns `hours_from` too.
--
-- NOT CHANGED: `admin_reserve_plan_video_quota`, `reserve_plan_program_quota`
-- and the three `program_usage_*_between` reads
-- (20261126070000_plans_2027_allowances). Each takes its window from the app
-- as `[p_window_start, p_window_end)`, and the app now starts a season's
-- window at max(starts_on 00:00Z, hours_from) — `allowanceFor()` in
-- src/lib/services/splitstep/allowance.ts. The admin function's own
-- entitlement test (`today between starts_on and ends_on`) is about whether
-- the team has a season at all and is right as it is.
--
-- EXISTING ROWS take `set_at`, the nearest thing the table holds to "when it
-- was saved" (it is the LAST save, so never earlier than the first: the pool
-- can only start later than it should have, in the team's favour).
--
-- RE-RUNNABLE. The column is `if not exists`, the backfill touches only rows
-- with no value, `set default` / `set not null` are idempotent, the functions
-- are `create or replace`, and grants are idempotent. One function changes
-- its result columns, which `create or replace` cannot do: it is dropped
-- first, inside a block that runs only while the old shape is the one
-- present, and its grants are restated straight after (a drop resets them).

-- ── program_plans.hours_from ───────────────────────────────────────────────

alter table public.program_plans
  add column if not exists hours_from timestamptz;

update public.program_plans
   set hours_from = set_at
 where hours_from is null;

alter table public.program_plans
  alter column hours_from set default now(),
  alter column hours_from set not null;

comment on column public.program_plans.hours_from is
  'When the plan was first saved. The season''s hours are counted from the later of this and starts_on, so video analysed before the team had the plan is not drawn from it. Set on insert by admin_set_program_plan and never changed by an update; clearing the plan and setting one again starts a new one.';

-- Members read it like the table's other public columns (the table's grants
-- are column lists, so a new column is in nobody's until it is named).
grant select (hours_from) on public.program_plans to authenticated;

-- ── admin_set_program_plan ─────────────────────────────────────────────────
--
-- The body of 20261126060000_plans_2027_plan_model, with one change: the
-- INSERT names `hours_from`.

create or replace function public.admin_set_program_plan(
  p_program_id uuid,
  p_plan_id    text,
  p_term       text,
  p_starts_on  date,
  p_ends_on    date,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program        record;
  v_cur            record;
  v_has_plan       boolean;
  v_note           text := nullif(btrim(coalesce(p_note, '')), '');
  v_rush           integer;
  v_pilot_ends_on  date;
  v_details        jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_plan_id is null or p_plan_id not in ('starter', 'program', 'elite') then
    raise exception 'unknown plan %', coalesce(p_plan_id, '(null)')
      using errcode = '22023';
  end if;

  if p_term is null or p_term not in ('spring', 'full_year') then
    raise exception 'unknown term %', coalesce(p_term, '(null)')
      using errcode = '22023';
  end if;

  if p_starts_on is null or p_ends_on is null then
    raise exception 'Plan start and end dates are required.' using errcode = '22023';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'The plan cannot end before it starts.' using errcode = '22023';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'The note is limited to 500 characters.' using errcode = '22023';
  end if;

  -- The figures src/lib/billing/plans.ts holds as `rushIncluded`;
  -- tests/billing-plans.spec.ts fails when the two disagree.
  v_rush := case p_plan_id
              when 'starter' then 0
              when 'program' then 3
              when 'elite'   then 6
            end;

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.pilot_ends_on, p.pilot_ended_at
    into v_program
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  select pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on, pp.note
    into v_cur
    from public.program_plans pp
   where pp.program_id = p_program_id;
  v_has_plan := found;

  if v_program.pilot_ends_on is not null
     and v_program.pilot_ended_at is null
     and v_program.pilot_ends_on >= p_starts_on then
    v_pilot_ends_on := p_starts_on - 1;
  end if;

  -- Same plan and no pilot to move: nothing to change, nothing to log.
  if v_has_plan
     and v_cur.plan_id = p_plan_id
     and v_cur.plan_term = p_term
     and v_cur.starts_on = p_starts_on
     and v_cur.ends_on = p_ends_on
     and v_cur.note is not distinct from v_note
     and v_pilot_ends_on is null then
    return;
  end if;

  v_details := jsonb_build_object(
    'from', case when not v_has_plan then null else jsonb_build_object(
      'plan_id',   v_cur.plan_id,
      'term',      v_cur.plan_term,
      'starts_on', v_cur.starts_on,
      'ends_on',   v_cur.ends_on,
      'note',      v_cur.note
    ) end,
    'to', jsonb_build_object(
      'plan_id',   p_plan_id,
      'term',      p_term,
      'starts_on', p_starts_on,
      'ends_on',   p_ends_on,
      'note',      v_note
    ),
    'rush_included', v_rush,
    'by_admin',      true
  );

  if v_pilot_ends_on is not null then
    v_details := v_details || jsonb_build_object(
      'pilot_ends_on',
      jsonb_build_object('from', v_program.pilot_ends_on, 'to', v_pilot_ends_on)
    );
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, (select auth.uid()), 'plan.set', null, v_details);

  -- `hours_from` is named in the INSERT and in no SET below: a new row is
  -- stamped now, and replacing a plan keeps the stamp its first save wrote.
  insert into public.program_plans as pp (
    program_id, plan_id, plan_term, starts_on, ends_on,
    rush_included, set_by, set_at, note, hours_from
  ) values (
    p_program_id, p_plan_id, p_term, p_starts_on, p_ends_on,
    v_rush, (select auth.uid()), now(), v_note, now()
  )
  on conflict (program_id) do update
     set plan_id       = excluded.plan_id,
         plan_term     = excluded.plan_term,
         starts_on     = excluded.starts_on,
         ends_on       = excluded.ends_on,
         rush_included = excluded.rush_included,
         set_by        = excluded.set_by,
         set_at        = excluded.set_at,
         note          = excluded.note;

  if v_pilot_ends_on is not null then
    update public.programs
       set pilot_ends_on = v_pilot_ends_on,
           updated_at    = now()
     where id = p_program_id;
  end if;
end;
$function$;

revoke execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) from public, anon;
grant  execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) to authenticated, service_role;

revoke execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) from public, anon;
grant  execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) to authenticated, service_role;

-- ── admin_get_program_plan ─────────────────────────────────────────────────
--
-- The plan-model body with `hours_from` as a last result column. A function's
-- result columns cannot be changed in place, so the old shape is dropped —
-- only while it is the one present, which makes a second run a no-op here.

do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'admin_get_program_plan'
       and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid'
       and not ('hours_from' = any (coalesce(p.proargnames, '{}'::text[])))
  ) then
    drop function public.admin_get_program_plan(uuid);
  end if;
end;
$$;

create or replace function public.admin_get_program_plan(
  p_program_id uuid
)
returns table (
  program_id    uuid,
  plan_id       text,
  plan_term     text,
  starts_on     date,
  ends_on       date,
  rush_included integer,
  note          text,
  set_by        uuid,
  set_at        timestamptz,
  set_by_name   text,
  hours_from    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select pp.program_id, pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on,
         pp.rush_included, pp.note, pp.set_by, pp.set_at,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''),
         pp.hours_from
    from public.program_plans pp
    left join public.users u on u.id = pp.set_by
   where pp.program_id = p_program_id;
end;
$function$;

revoke execute on function public.admin_get_program_plan(uuid) from public, anon;
grant  execute on function public.admin_get_program_plan(uuid) to authenticated, service_role;

revoke execute on function public.admin_get_program_plan(uuid) from public, anon;
grant  execute on function public.admin_get_program_plan(uuid) to authenticated, service_role;

-- ── Assertions ─────────────────────────────────────────────────────────────

do $$
declare
  v_role text;
  v_fn   text;
begin
  if exists (select 1 from public.program_plans where hours_from is null) then
    raise exception 'program_plans.hours_from is null on a row';
  end if;

  if not has_column_privilege('authenticated', 'public.program_plans', 'hours_from', 'SELECT') then
    raise exception 'program_plans.hours_from is not readable by members';
  end if;

  -- Still nothing signed out, and still neither the note nor who set it.
  if has_any_column_privilege('anon', 'public.program_plans', 'SELECT') then
    raise exception 'program_plans is readable signed out';
  end if;
  if has_column_privilege('authenticated', 'public.program_plans', 'note', 'SELECT')
     or has_column_privilege('authenticated', 'public.program_plans', 'set_by', 'SELECT') then
    raise exception 'program_plans.note or set_by is readable by clients';
  end if;

  -- No client writes it, by table or by column.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_role, 'public.program_plans', 'hours_from', 'INSERT')
       or has_column_privilege(v_role, 'public.program_plans', 'hours_from', 'UPDATE') then
      raise exception 'program_plans.hours_from is writable by %', v_role;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.admin_set_program_plan(uuid, text, text, date, date, text)',
    'public.admin_get_program_plan(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '% is executable signed out', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% is not executable by a signed-in admin', v_fn;
    end if;
  end loop;
end;
$$;
