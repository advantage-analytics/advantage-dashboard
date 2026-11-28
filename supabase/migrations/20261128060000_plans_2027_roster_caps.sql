-- 2027 pricing · roster caps: a team's seats follow its college plan (Starter 25, Program 25, Elite 35)
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it AFTER
-- 20261127060000_plans_2027_final_pricing (it replaces that migration's
-- `admin_set_program_plan`; the first block below refuses to run without what
-- that body stands on; it also replaces the plan-model migration's
-- `admin_clear_program_plan`), and BEFORE the first team is put on Elite: see
-- "Teams already on a plan" below.
--
-- PROVENANCE. Read from the LIVE database on 2026-11-27 (`pg_get_functiondef`,
-- `information_schema.columns`, `pg_constraint`), not from this folder:
--   - `admin_set_program_plan` is byte-for-byte the final-pricing body;
--   - `admin_clear_program_plan` is byte-for-byte the body of
--     20261126060000_plans_2027_plan_model (no later migration replaced it):
--     security definer, `search_path = ''`, gated on `is_admin()`, executable
--     by `authenticated` and `service_role` and not by `anon`;
--   - `programs.seats` is `integer not null default 25`, checked `seats >= 1`.
--     All 1,958 programs hold 25. Only `service_role` and the owner may write
--     the column: NO function writes it, so no admin screen changes seats
--     today, and `program_audit_log` holds no `seats.changed` row;
--   - `program_plans` holds no rows;
--   - a seat is counted by `program_seat_counts`: `used` is every live
--     `program_players` row (not archived, not merged; with or without an
--     account), `pending` every open, unexpired PLAYER invitation that does
--     not target an existing roster row. Coaches and staff hold no seat;
--   - a full team is refused by `add_program_player`,
--     `add_self_as_program_player`, `restore_program_player`,
--     `create_program_invite` (errcode 54000) and `accept_program_join_link`
--     (status `no_seats`), each as `used + pending + 1 > seats`. None of them
--     removes anyone: seats below what a team already uses keeps every
--     player and refuses only the next one.
--
-- What it does:
--
--   admin_set_program_plan
--           The final-pricing body with one addition: saving a plan sets
--           `programs.seats`, in the same transaction and under the row lock
--           the function already takes.
--
--           THE RULE. On a save, seats become the new plan's cap, EXCEPT
--           when the team's current seats are not the cap of the plan it was
--           on before this save. Seats that differ from what the team's plan
--           gave it were set by hand (a negotiated exception), and are left
--           alone. A team with no plan before this save is measured against
--           the column default instead: seats at 25 take the cap, any other
--           number is kept. So:
--             no plan, seats 25           -> the cap
--             no plan, seats hand-set     -> kept
--             on a plan, seats at its cap -> the new cap (25 -> 35 going to
--                                            Elite, 35 -> 25 coming off it)
--             on a plan, seats hand-set   -> kept
--           The cap is applied even when the team already has more players
--           than it: nobody is removed, and only new adds are refused, which
--           is what seats below usage already mean everywhere else.
--
--           The change is recorded on the save's own `plan.set` audit row as
--           `details.seats = {from, to}`, present only when seats moved (the
--           way `details.pilot_ends_on` already rides on that row). No
--           `seats.changed` row is written.
--
--   admin_clear_program_plan
--           The plan-model body with one addition: clearing a plan takes back
--           the seats that plan gave, in the same transaction and under the
--           row lock the function already takes.
--
--           THE RULE. When the team's seats EQUAL the cap of the plan being
--           cleared, they go back to the column default, 25. Seats that
--           differ from that cap were set by hand and are left alone. So:
--             Elite, seats 35             -> 25
--             Elite, seats hand-set to 40 -> kept
--             Starter or Program, seats 25 -> 25 (nothing moves)
--           Without this a team that came off Elite kept 35 seats with no
--           plan, and the next save, measuring 35 against the default 25,
--           read them as hand-set and kept them: Starter with 35 seats for
--           good. As on a save, nobody is removed: a team with more players
--           than 25 keeps them all and only the next add is refused.
--
--           The change is recorded on the clear's own `plan.cleared` audit
--           row as `details.seats = {from, to}`, present only when seats
--           moved. No `seats.changed` row is written.
--
--   Nothing else. A pilot team, and a team with no plan, keeps its seats
--   until a plan is saved for it.
--
-- TEAMS ALREADY ON A PLAN. This migration moves no row. A team put on Elite
-- BEFORE it is applied sits on Elite with 25 seats, which the rule reads as
-- hand-set and keeps. Live has no plan rows today; if one exists by the time
-- this is applied, set that team's seats once by hand.
--
-- RE-RUNNABLE. Two `create or replace`, idempotent grants, and assertions
-- that only read. No DROP.

-- ── this stands on the final-pricing migration and the seat model ──────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'program_plans'
       and column_name = 'hours_from'
  ) then
    raise exception 'plans_2027_roster_caps: program_plans.hours_from is missing. Apply 20261126110000_plans_2027_followups and 20261127060000_plans_2027_final_pricing first.';
  end if;

  -- The rule reads "never set by hand" off the column default, as 25.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'programs'
       and column_name = 'seats'
       and column_default = '25'
  ) then
    raise exception 'plans_2027_roster_caps: programs.seats is missing or its default is no longer 25';
  end if;
end;
$$;

-- ── admin_set_program_plan: seats follow the plan ──────────────────────────
--
-- The body of 20261127060000_plans_2027_final_pricing, plus the roster cap:
-- three declarations, `p.seats` in the locked read, the cap lookup and rule,
-- `details.seats`, and the last UPDATE.

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
  v_cap            integer;
  v_prev_cap       integer;
  v_seats          integer;
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

  -- The figures src/lib/billing/plans.ts holds as `rushIncluded`: no plan
  -- includes Rush. tests/billing-plans.spec.ts fails when the two disagree.
  v_rush := case p_plan_id
              when 'starter' then 0
              when 'program' then 0
              when 'elite'   then 0
            end;

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.pilot_ends_on, p.pilot_ended_at, p.seats
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

  -- The roster caps src/lib/billing/plans.ts holds as `rosterCap`.
  -- tests/billing-plans.spec.ts fails when the two disagree.
  -- `v_cap` is the plan being saved; `v_prev_cap` is the plan the team is on
  -- now, or the `programs.seats` column default (25) when it has none.
  select max(c.cap) filter (where c.plan_id = p_plan_id),
         coalesce(max(c.cap) filter (where v_has_plan and c.plan_id = v_cur.plan_id), 25)
    into v_cap, v_prev_cap
    from (values ('starter', 25), ('program', 25), ('elite', 35)) as c (plan_id, cap);

  -- Seats follow the plan unless somebody set them by hand: seats that are
  -- not what the team's plan (or the default) gave it are left alone.
  v_seats := case when v_program.seats = v_prev_cap then v_cap else v_program.seats end;

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

  if v_seats <> v_program.seats then
    v_details := v_details || jsonb_build_object(
      'seats',
      jsonb_build_object('from', v_program.seats, 'to', v_seats)
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

  -- Nobody is removed: a team already over the cap keeps everyone, and only
  -- the next add, invite or join is refused, as with any full team.
  if v_seats <> v_program.seats then
    update public.programs
       set seats      = v_seats,
           updated_at = now()
     where id = p_program_id;
  end if;
end;
$function$;

-- ── admin_clear_program_plan: seats the plan gave go back ──────────────────
--
-- The body of 20261126060000_plans_2027_plan_model (as live holds it), plus
-- the roster cap: three declarations, `p.seats` read in the lock the function
-- already took (was `perform 1`), the cap lookup and rule, `details.seats`,
-- and the last UPDATE.

create or replace function public.admin_clear_program_plan(
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cur     record;
  v_details jsonb;
  v_cap     integer;
  v_seats   integer;
  v_to      integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  select p.seats
    into v_seats
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  select pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on,
         pp.rush_included, pp.note
    into v_cur
    from public.program_plans pp
   where pp.program_id = p_program_id;

  if not found then
    return;
  end if;

  -- The roster caps src/lib/billing/plans.ts holds as `rosterCap`, the list
  -- `admin_set_program_plan` carries. tests/billing-plans.spec.ts fails when
  -- either disagrees with the module.
  select max(c.cap) filter (where c.plan_id = v_cur.plan_id)
    into v_cap
    from (values ('starter', 25), ('program', 25), ('elite', 35)) as c (plan_id, cap);

  -- Seats the plan gave go back to the `programs.seats` column default (25).
  -- Seats that are not the cleared plan's cap were set by hand: left alone.
  v_to := case when v_seats = v_cap then 25 else v_seats end;

  v_details := jsonb_build_object(
    'from', jsonb_build_object(
      'plan_id',       v_cur.plan_id,
      'term',          v_cur.plan_term,
      'starts_on',     v_cur.starts_on,
      'ends_on',       v_cur.ends_on,
      'rush_included', v_cur.rush_included,
      'note',          v_cur.note
    ),
    'to',       null,
    'by_admin', true
  );

  if v_to <> v_seats then
    v_details := v_details || jsonb_build_object(
      'seats',
      jsonb_build_object('from', v_seats, 'to', v_to)
    );
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, (select auth.uid()), 'plan.cleared', null, v_details);

  delete from public.program_plans pp where pp.program_id = p_program_id;

  -- Nobody is removed: a team with more players than the default keeps
  -- everyone, and only the next add, invite or join is refused.
  if v_to <> v_seats then
    update public.programs
       set seats      = v_to,
           updated_at = now()
     where id = p_program_id;
  end if;
end;
$function$;

-- ── grants ─────────────────────────────────────────────────────────────────
--
-- `create or replace` keeps the grants each function has; they are spelled
-- again so this file is right on its own.

revoke execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) from public, anon;
grant  execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) to authenticated, service_role;

revoke execute on function public.admin_clear_program_plan(uuid) from public, anon;
grant  execute on function public.admin_clear_program_plan(uuid) to authenticated, service_role;

-- ── Assertions: fail the migration rather than leave it half true ──────────

do $$
declare
  v_fn  text := 'public.admin_set_program_plan(uuid, text, text, date, date, text)';
  v_src text;
  v_clear     text := 'public.admin_clear_program_plan(uuid)';
  v_clear_src text;
  v_clear_def boolean;
  v_clear_cfg text[];
begin
  select p.prosrc into v_src from pg_proc p where p.oid = v_fn::regprocedure;

  -- Still the final-pricing body: hours_from stamped, no plan includes Rush.
  if strpos(v_src, 'hours_from') = 0
     or strpos(v_src, 'when ''elite''   then 0') = 0 then
    raise exception 'plans_2027_roster_caps: admin_set_program_plan is not the final-pricing body';
  end if;

  -- And it carries the three caps and writes seats.
  if strpos(v_src, '(''starter'', 25), (''program'', 25), (''elite'', 35)') = 0
     or strpos(v_src, 'set seats      = v_seats') = 0 then
    raise exception 'plans_2027_roster_caps: admin_set_program_plan does not set seats from the plan';
  end if;

  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception '% is executable signed out', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception '% is not executable by a signed-in admin', v_fn;
  end if;

  -- admin_clear_program_plan: the same caps, the same default, seats written,
  -- and the security model live has (definer, empty search_path, admin gate).
  select p.prosrc, p.prosecdef, p.proconfig
    into v_clear_src, v_clear_def, v_clear_cfg
    from pg_proc p where p.oid = v_clear::regprocedure;

  if strpos(v_clear_src, '(''starter'', 25), (''program'', 25), (''elite'', 35)') = 0
     or strpos(v_clear_src, 'case when v_seats = v_cap then 25 else v_seats end') = 0
     or strpos(v_clear_src, 'set seats      = v_to') = 0 then
    raise exception 'plans_2027_roster_caps: admin_clear_program_plan does not take back the plan''s seats';
  end if;

  if not v_clear_def
     or v_clear_cfg is distinct from array['search_path=""']
     or strpos(v_clear_src, 'if not public.is_admin() then') = 0 then
    raise exception 'plans_2027_roster_caps: admin_clear_program_plan lost its security model';
  end if;

  if has_function_privilege('anon', v_clear, 'EXECUTE') then
    raise exception '% is executable signed out', v_clear;
  end if;
  if not has_function_privilege('authenticated', v_clear, 'EXECUTE')
     or not has_function_privilege('service_role', v_clear, 'EXECUTE') then
    raise exception '% is not executable by a signed-in admin', v_clear;
  end if;
end;
$$;
