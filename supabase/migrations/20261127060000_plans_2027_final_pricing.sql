-- 2027 pricing · final pricing: Player / Player Pro, review on a paid plan only, no Rush in any plan
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it AFTER
-- 20261126110000_plans_2027_followups (it replaces that migration's
-- `admin_set_program_plan`, whose INSERT names `program_plans.hours_from`;
-- the first block below refuses to run without the column) and together with
-- the app build that writes the new plan ids, BEFORE plans go on sale. It may
-- run before or after 20261126080000_plans_2027_billing: see "users" below.
-- Decisions cited are in docs/plans/2027-pricing.md ("Final pricing").
--
-- PROVENANCE. Read from the LIVE database on 2026-11-27 (`pg_get_constraintdef`,
-- `pg_proc.prosrc`), not from this folder:
--   - `users_plan_check` is `plan = any (array['free', 'coach', 'coach-pro',
--     'pro'])`; 104 rows hold `free`, one holds `pro`, NONE holds `coach` or
--     `coach-pro`;
--   - the only function in `public` that names `coach` / `coach-pro` is
--     `reserve_plan_personal_quota`; its body, and `label_review_eligibility`'s,
--     are byte-for-byte those of 20261126090000_plans_2027_gating;
--   - `admin_set_program_plan` is still the plan-model body (the follow-ups
--     migration is not applied); `program_plans` holds no rows.
--
-- What it does:
--
--   users   The personal plans are renamed: `coach` becomes `player` and
--           `coach-pro` becomes `player-pro`. Any row holding an old id is
--           moved first, then the check is replaced: free | player |
--           player-pro, plus the legacy `pro` for as long as the check it
--           replaces still allows it (the billing migration is what retires
--           `pro`; this one neither retires it nor brings it back).
--
--   reserve_plan_personal_quota
--           The gating body with one change: the plan test that writes
--           `paid_basis = 'plan'` names `player` / `player-pro`. Nothing else
--           differs. It still writes `extra_hours` for a purchased credit
--           spent off a plan: that records how the match was paid for.
--
--   label_review_eligibility
--           The gating body with one change: only `plan`, `season` and
--           `pilot` earn human review ("Verified by Advantage"). A match a
--           Free player paid for with extra hours is analysed and is NOT
--           offered for review. A subscriber spending extra hours is marked
--           `plan` by the reservation, so they keep review. A match sent for
--           analysis before `p_plans_begin` stays eligible, as before.
--
--   admin_set_program_plan
--           The follow-ups body with one change: every plan stamps
--           `rush_included = 0`. Rush and Priority are not in any plan.
--           Rows already saved take 0 too.
--
-- RE-RUNNABLE. The updates match nothing the second time, the check is
-- replaced inside an existence-checked block (no bare DROP), the functions
-- are `create or replace`, and grants are idempotent.

-- ── this stands on the follow-ups migration ────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'program_plans'
       and column_name = 'hours_from'
  ) then
    raise exception 'plans_2027_final_pricing: program_plans.hours_from is missing. Apply 20261126110000_plans_2027_followups first.';
  end if;
end;
$$;

-- ── users: coach → player, coach-pro → player-pro ──────────────────────────
--
-- The check is replaced around the move: the old one refuses the new ids and
-- the new one refuses the old, so it is taken off, the rows are moved, and
-- the new one is put on, in one block. Runs as the migration role, which
-- `users_block_plan_self_update` lets through: the trigger refuses only a
-- client JWT (`authenticated` / `anon`).

do $$
declare
  v_keeps_pro boolean;
begin
  -- `pro` stays allowed only while it is allowed (or held) today.
  select coalesce(bool_or(pg_get_constraintdef(c.oid) like '%''pro''%'), false)
    into v_keeps_pro
    from pg_constraint c
   where c.conname = 'users_plan_check'
     and c.conrelid = 'public.users'::regclass;
  v_keeps_pro := v_keeps_pro
    or exists (select 1 from public.users where plan = 'pro');

  if exists (
    select 1 from pg_constraint
     where conname = 'users_plan_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_plan_check;
  end if;

  update public.users set plan = 'player'     where plan = 'coach';
  update public.users set plan = 'player-pro' where plan = 'coach-pro';

  if v_keeps_pro then
    alter table public.users
      add constraint users_plan_check
      check (plan = any (array['free', 'player', 'player-pro', 'pro']));
  else
    alter table public.users
      add constraint users_plan_check
      check (plan = any (array['free', 'player', 'player-pro']));
  end if;
end;
$$;

comment on column public.users.plan is
  'Paid entitlement: free | player | player-pro (and the legacy pro until plans_2027_billing retires it). Written only by the Stripe webhook via the service role; users_block_plan_self_update blocks client writes.';

-- ── reserve: a personal workspace ──────────────────────────────────────────
--
-- The body of 20261126090000_plans_2027_gating, with the plan ids renamed in
-- the one line that reads them.

create or replace function public.reserve_plan_personal_quota(
  p_job_id uuid,
  p_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_seconds integer,
  p_cap_seconds integer
)
returns table (
  ok boolean,
  used_seconds integer,
  cap_seconds integer,
  credit_seconds integer,
  credit_spent_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used integer;
  v_free_left integer;
  v_from_free integer;
  v_need integer;
  v_credits integer;
  v_take integer;
  v_override numeric;
  v_plan text;
  v_purchased boolean := false;
  v_basis text;
  c record;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_plan_personal_quota: p_seconds must be positive, got %', p_seconds;
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'reserve_plan_personal_quota: bad window % to %', p_window_start, p_window_end;
  end if;
  if p_cap_seconds is null or p_cap_seconds < 0 then
    raise exception 'reserve_plan_personal_quota: bad p_cap_seconds %', p_cap_seconds;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':plan'));
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || v_month::text)
  );

  select u.video_hours_override, u.plan into v_override, v_plan
    from public.users u
   where u.id = p_user_id;
  if v_override is not null then
    p_cap_seconds := round(v_override * 3600)::integer;
  end if;

  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_user_id
     and u.created_at >= p_window_start
     and u.created_at < p_window_end
     and u.released = false;

  perform pg_advisory_xact_lock(hashtext('video_credits:' || p_user_id::text));

  perform 1
     from public.video_credits vc
    where vc.user_id = p_user_id
      and vc.remaining_seconds > 0
      and vc.expires_at > now()
    order by vc.id
      for update;

  select coalesce(sum(vc.remaining_seconds), 0)
    into v_credits
    from public.video_credits vc
   where vc.user_id = p_user_id
     and vc.remaining_seconds > 0
     and vc.expires_at > now();

  v_free_left := greatest(0, p_cap_seconds - v_used);
  v_from_free := least(v_free_left, p_seconds);
  v_need := p_seconds - v_from_free;

  if v_need > v_credits then
    return query select false, v_used, p_cap_seconds, v_credits, 0;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_user_id, 'individual', v_month, p_job_id, p_user_id, v_from_free);

  for c in
    select vc.id, vc.remaining_seconds, vc.source
      from public.video_credits vc
     where vc.user_id = p_user_id
       and vc.remaining_seconds > 0
       and vc.expires_at > now()
     order by vc.expires_at, vc.created_at, vc.id
  loop
    exit when v_need <= 0;
    v_take := least(c.remaining_seconds, v_need);
    update public.video_credits
       set remaining_seconds = remaining_seconds - v_take
     where id = c.id;
    insert into public.video_credit_spends
      (credit_id, user_id, job_id, reserved_seconds, seconds)
    values (c.id, p_user_id, p_job_id, v_take, v_take);
    v_need := v_need - v_take;
    if c.source = 'purchase' then
      v_purchased := true;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'reserve_plan_personal_quota: credits fell short by % seconds', v_need;
  end if;

  -- What paid for it (stage D). A plan covers every match sent while on it;
  -- off a plan, only a purchased credit is a payment.
  v_basis := case
    when v_plan in ('player', 'player-pro') then 'plan'
    when v_purchased then 'extra_hours'
  end;
  if v_basis is not null then
    update public.processing_usage u
       set paid_basis = v_basis
     where u.job_id = p_job_id
       and u.released = false;
  end if;

  return query select true, v_used + v_from_free, p_cap_seconds,
                      v_credits - (p_seconds - v_from_free),
                      p_seconds - v_from_free;
end;
$function$;

comment on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) is
  'reserve_personal_quota over a window: plan hours used inside [p_window_start, p_window_end) first, then the player''s credits soonest-expiring first, atomically. Writes processing_usage.paid_basis (plan on Player or Player Pro, or extra_hours for a purchased credit off a plan). Service role only.';

-- ── who is offered for human review ────────────────────────────────────────
--
-- The body of 20261126090000_plans_2027_gating, with one change: the marker
-- has to be one a paid PLAN writes. `extra_hours` (a Free player's purchased
-- credit) no longer counts, and is never the `paid_basis` returned.

create or replace function public.label_review_eligibility(
  p_job_ids uuid[],
  p_plans_begin timestamptz
)
returns table (job_id uuid, eligible boolean, paid_basis text)
language sql
stable
set search_path = ''
as $function$
  select j.id,
         before.analysed or paid.basis is not null,
         paid.basis
    from public.processing_jobs j
   cross join lateral (
     select exists (
       select 1
         from public.processing_jobs o
        where o.match_id = j.match_id
          and o.status = 'completed'
          and o.created_at < p_plans_begin
     ) as analysed
   ) before
    left join lateral (
     select u.paid_basis as basis
       from public.processing_usage u
       join public.processing_jobs o on o.id = u.job_id
      where o.match_id = j.match_id
        and u.released = false
        and u.paid_basis in ('plan', 'season', 'pilot')
      order by u.created_at desc, u.id desc
      limit 1
   ) paid on true
   where j.id = any (p_job_ids);
$function$;

comment on function public.label_review_eligibility(uuid[], timestamptz) is
  'Whether each job''s match may be offered for human review: sent for analysis before p_plans_begin, or analysed on a paid plan (processing_usage.paid_basis of plan, season or pilot on an un-released reservation of any of the match''s jobs). extra_hours does not count. Service role only.';

-- ── admin_set_program_plan: no plan includes Rush ──────────────────────────
--
-- The body of 20261126110000_plans_2027_followups, with one change: the
-- `rush_included` every plan stamps is 0.

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

  -- The figures src/lib/billing/plans.ts holds as `rushIncluded`: no plan
  -- includes Rush. tests/billing-plans.spec.ts fails when the two disagree.
  v_rush := case p_plan_id
              when 'starter' then 0
              when 'program' then 0
              when 'elite'   then 0
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

update public.program_plans
   set rush_included = 0
 where rush_included <> 0;

comment on column public.program_plans.rush_included is
  'Rush jobs the plan includes a season. 0 for every plan: Rush and Priority are not in any plan, and every job is Standard.';

-- ── grants ─────────────────────────────────────────────────────────────────
--
-- `create or replace` keeps the grants these functions have; they are spelled
-- again so this file is right on its own.

revoke all on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant  execute on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.label_review_eligibility(uuid[], timestamptz) from public, anon, authenticated;
grant  execute on function public.label_review_eligibility(uuid[], timestamptz) to service_role;

revoke execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) from public, anon;
grant  execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) to authenticated, service_role;

-- ── Assertions: fail the migration rather than leave it half true ──────────

do $$
declare
  v_fn   text;
  v_role text;
  v_src  text;
begin
  if exists (select 1 from public.users where plan in ('coach', 'coach-pro')) then
    raise exception 'plans_2027_final_pricing: a users row still holds coach or coach-pro';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'users_plan_check'
       and conrelid = 'public.users'::regclass
       and pg_get_constraintdef(oid) like '%''player''%'
       and pg_get_constraintdef(oid) like '%''player-pro''%'
       and pg_get_constraintdef(oid) not like '%coach%'
  ) then
    raise exception 'plans_2027_final_pricing: users_plan_check does not name the new plan ids';
  end if;

  -- No function in `public` names an old plan id any more.
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc like '%''coach-pro''%';
  if v_fn is not null then
    raise exception 'plans_2027_final_pricing: still names coach-pro: %', v_fn;
  end if;

  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)'::regprocedure;
  if strpos(v_src, 'v_plan in (''player'', ''player-pro'')') = 0 then
    raise exception 'plans_2027_final_pricing: reserve_plan_personal_quota does not read the new plan ids';
  end if;

  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'public.label_review_eligibility(uuid[], timestamptz)'::regprocedure;
  -- strpos, not LIKE: `_` is a LIKE wildcard and would match `paid.basis`.
  if strpos(v_src, 'u.paid_basis is not null') > 0
     or strpos(v_src, 'extra_hours') > 0
     or strpos(v_src, 'u.paid_basis in (''plan'', ''season'', ''pilot'')') = 0 then
    raise exception 'plans_2027_final_pricing: label_review_eligibility still counts every marker';
  end if;

  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'public.admin_set_program_plan(uuid, text, text, date, date, text)'::regprocedure;
  if strpos(v_src, 'hours_from') = 0 or v_src ~ 'then [1-9]' then
    raise exception 'plans_2027_final_pricing: admin_set_program_plan is not the follow-ups body with no Rush';
  end if;

  if exists (select 1 from public.program_plans where rush_included <> 0) then
    raise exception 'plans_2027_final_pricing: a program_plans row still includes Rush jobs';
  end if;

  foreach v_fn in array array[
    'public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.label_review_eligibility(uuid[], timestamptz)'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception '% is executable by %', v_fn, v_role;
      end if;
    end loop;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '% is not executable by service_role', v_fn;
    end if;
  end loop;

  v_fn := 'public.admin_set_program_plan(uuid, text, text, date, date, text)';
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception '% is executable signed out', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception '% is not executable by a signed-in admin', v_fn;
  end if;
end;
$$;
