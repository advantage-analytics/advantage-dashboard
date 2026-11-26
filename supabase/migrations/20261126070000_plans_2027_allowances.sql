-- 2027 pricing, stage B · allowances
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it after
-- 20261126060000_plans_2027_plan_model (it reads `program_plans`) and BEFORE
-- January 1, 2027 (UTC): from that instant the app reserves video hours
-- through the functions below and refuses every upload if they are missing.
-- Decisions cited are in docs/plans/2027-pricing.md.
--
-- PROVENANCE. Every function mirrored or rewritten here was read from the
-- LIVE database on 2026-11-25 (`pg_get_functiondef`, `pg_proc.proacl`), not
-- from this folder, which runs behind the live ledger.
--
-- What changes on January 1 is decided in the app
-- (`allowanceFor()` in src/lib/services/splitstep/allowance.ts): which cap a
-- workspace draws and over which WINDOW. Until then nothing calls the new
-- functions and every existing one keeps its body, its grants and its
-- callers. Nothing is dropped or replaced except `admin_set_pilot_end`, which
-- gains one check.
--
--   reserve_plan_personal_quota      `reserve_personal_quota`, summing the
--                                    ledger over a window instead of a
--                                    calendar month.
--   reserve_plan_program_quota       `reserve_processing_quota` for a team,
--                                    the same way.
--   admin_reserve_plan_video_quota   `admin_reserve_video_quota`, routed
--                                    through the two above.
--   program_usage_total_between      the three meter reads, by window.
--   program_usage_pending_between
--   program_usage_by_member_between
--   admin_set_pilot_end              refuses a date after 2027-05-31.
--
-- THE WINDOW. A personal plan's hours cover a month-long slice anchored on
-- the subscription (`users.plan_period_start` plus whole months), a team's
-- season plan covers `program_plans.starts_on` to `ends_on`, and a pilot or
-- an admin's override keeps the calendar month. The caller works the window
-- out once and hands it in as `[p_window_start, p_window_end)`, exactly as
-- the month-keyed functions are handed `p_billing_month` and the cap. Usage
-- is whatever un-released ledger rows were CREATED inside the window, so an
-- upgrade's new period starts with fresh hours while the old period's rows
-- stay in the ledger, and hours never roll over. The row a reservation
-- writes still carries the calendar `billing_month` (the table's check wants
-- a first-of-month date, and month-keyed history keeps reading it).
--
-- LOCKS. Each reserve function takes an account-wide advisory lock first,
-- because two reservations in one window can fall in different calendar
-- months, then the account+month lock the function it mirrors takes, so a
-- month-keyed reservation for the same account still serializes with it,
-- then (personal only) the `video_credits:` lock and row locks, unchanged.
-- The month-keyed functions never take the account-wide lock, so the order
-- cannot invert.
--
-- SECURITY, mirrored from the live functions one for one:
--   reserve_* and admin_reserve_*   SECURITY DEFINER, `search_path = ''`,
--                                   EXECUTE for `service_role` only.
--   program_usage_*_between         SECURITY DEFINER, `search_path = ''`,
--                                   EXECUTE for `authenticated` and
--                                   `service_role`; each carries the same
--                                   membership test as its month sibling.
--   Nothing here is executable signed out; the last block fails the
--   migration if that stops being true.
--
-- `individual_tier_usage`, `individual_pool_usage`, `reserve_individual_quota`
-- and `reserve_individual_pool_quota` (the open-beta band and pool) are left
-- exactly as they are. The app no longer calls them and nothing here does: no
-- shared limit sits in front of paid hours.
--
-- RE-RUNNABLE. Functions are `create or replace`, the index is
-- `if not exists`, and grants are idempotent.

create index if not exists processing_usage_account_created_idx
  on public.processing_usage (account_id, created_at)
  where released = false;

-- ── reserve: a personal workspace ──────────────────────────────────────────

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

  select u.video_hours_override into v_override
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
    select vc.id, vc.remaining_seconds
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
  end loop;

  if v_need > 0 then
    raise exception 'reserve_plan_personal_quota: credits fell short by % seconds', v_need;
  end if;

  return query select true, v_used + v_from_free, p_cap_seconds,
                      v_credits - (p_seconds - v_from_free),
                      p_seconds - v_from_free;
end;
$function$;

comment on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) is
  'reserve_personal_quota over a window: plan hours used inside [p_window_start, p_window_end) first, then the player''s credits soonest-expiring first, atomically. Service role only.';

-- ── reserve: a team workspace ──────────────────────────────────────────────

create or replace function public.reserve_plan_program_quota(
  p_job_id uuid,
  p_account_id uuid,
  p_created_by uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_seconds integer,
  p_cap_seconds integer
)
returns table (ok boolean, used_seconds integer, cap_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used integer;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_plan_program_quota: p_seconds must be positive, got %', p_seconds;
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'reserve_plan_program_quota: bad window % to %', p_window_start, p_window_end;
  end if;
  if p_cap_seconds is null or p_cap_seconds < 0 then
    raise exception 'reserve_plan_program_quota: bad p_cap_seconds %', p_cap_seconds;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_account_id::text || ':plan'));
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text || ':' || v_month::text)
  );

  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_account_id
     and u.created_at >= p_window_start
     and u.created_at < p_window_end
     and u.released = false;

  if v_used + p_seconds > p_cap_seconds then
    return query select false, v_used, p_cap_seconds;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_account_id, 'program', v_month, p_job_id, p_created_by, p_seconds);

  return query select true, v_used + p_seconds, p_cap_seconds;
end;
$function$;

comment on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) is
  'reserve_processing_quota for a team over a window: one pool for a season, or a pilot''s calendar month. Service role only.';

-- ── reserve: the admin console ─────────────────────────────────────────────
--
-- `admin_reserve_video_quota` with its checks unchanged. It took two caps
-- and picked one with `org_type = 'college' or pilot_eligible`; from January
-- 1 a college is not entitled by being a college, so this takes the one cap
-- and window the app resolved for the target workspace and, for a team,
-- keeps the database's own say: a team with neither a season containing
-- today nor a running pilot reserves against zero, whatever it was handed.

create or replace function public.admin_reserve_plan_video_quota(
  p_actor_id uuid,
  p_job_id uuid,
  p_seconds integer,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_cap_seconds integer
)
returns table (ok boolean, used_seconds integer, cap_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  access jsonb;
  j public.processing_jobs;
  p public.programs;
  v_today date := (now() at time zone 'utc')::date;
  v_entitled boolean;
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_admin) then raise exception 'admin-required' using errcode='42501'; end if;
  access := public.admin_video_access(p_actor_id,null,p_job_id,'read');
  if access is null then raise exception 'video-operation-required' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id for update;
  if j.status is distinct from 'submitting' or j.external_job_id is not null
    or p_seconds is distinct from ceil(j.end_time_seconds-j.start_time_seconds)::integer
    or p_seconds is null or p_seconds<=0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
  if exists(select 1 from public.processing_usage where job_id=p_job_id) then raise exception 'video-quota-already-reserved' using errcode='22023'; end if;
  if access->>'personalUserId' is not null then
    if access->>'billing'='free' then
      -- What an admin's own upload writes: their own uncapped individual row.
      return query select r.ok, r.used_seconds, r.cap_seconds from public.reserve_processing_quota(
        p_job_id,p_actor_id,'individual',p_actor_id,
        (date_trunc('month', now() at time zone 'utc'))::date,p_seconds,2147483647) r;
    elsif access->>'billing'='player' then
      if p_cap_seconds is null or p_cap_seconds<0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
      return query select r.ok, r.used_seconds, r.cap_seconds from public.reserve_plan_personal_quota(
        p_job_id,(access->>'personalUserId')::uuid,p_window_start,p_window_end,p_seconds,p_cap_seconds) r;
    else
      raise exception 'billing-invalid' using errcode='22023';
    end if;
    return;
  end if;
  if p_cap_seconds is null or p_cap_seconds<0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
  select * into p from public.programs where id=(access->>'programId')::uuid for share;
  v_entitled := exists(
      select 1 from public.program_plans pp
       where pp.program_id = p.id
         and v_today between pp.starts_on and pp.ends_on)
    or coalesce(
      p.pilot_eligible
        and p.pilot_ended_at is null
        and p.pilot_ends_on is not null
        and least(p.pilot_ends_on, date '2027-05-31') >= v_today,
      false);
  return query select * from public.reserve_plan_program_quota(p_job_id,p.id,p_actor_id,p_window_start,p_window_end,p_seconds,
    case when v_entitled then p_cap_seconds else 0 end);
end;
$function$;

comment on function public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer) is
  'admin_reserve_video_quota from January 1, 2027: the same checks, reserving over the window the app resolved. A team with no current season and no running pilot reserves against zero. Service role only.';

-- ── meter reads, by window ─────────────────────────────────────────────────

create or replace function public.program_usage_total_between(
  p_program_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select case
           when p_program_id in (select public.user_program_ids())
           then coalesce((
             select sum(coalesce(pu.actual_seconds, pu.reserved_seconds))
               from public.processing_usage pu
              where pu.account_id = p_program_id
                and pu.account_type = 'program'
                and pu.created_at >= p_window_start
                and pu.created_at < p_window_end
                and not pu.released
           ), 0)
           else 0
         end;
$function$;

create or replace function public.program_usage_pending_between(
  p_program_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select case
           when p_program_id in (select public.user_program_ids())
           then coalesce((
             select sum(pu.reserved_seconds)
               from public.processing_usage pu
              where pu.account_id = p_program_id
                and pu.account_type = 'program'
                and pu.created_at >= p_window_start
                and pu.created_at < p_window_end
                and pu.actual_seconds is null
                and not pu.released
           ), 0)
           else 0
         end;
$function$;

create or replace function public.program_usage_by_member_between(
  p_program_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns table (user_id uuid, display_name text, used_seconds bigint, match_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select pu.created_by,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         coalesce(sum(coalesce(pu.actual_seconds, pu.reserved_seconds)), 0),
         count(distinct pj.match_id)
    from public.processing_usage pu
    join public.users u on u.id = pu.created_by
    left join public.processing_jobs pj on pj.id = pu.job_id
   where pu.account_id = p_program_id
     and pu.account_type = 'program'
     and pu.created_at >= p_window_start
     and pu.created_at < p_window_end
     and not pu.released
     and (
       (select public.is_program_staff(p_program_id))
       or pu.created_by = (select auth.uid())
     )
   group by pu.created_by, u.first_name, u.last_name
   order by 3 desc;
$function$;

-- ── pilots end by May 31, 2027 ─────────────────────────────────────────────
--
-- The live body, plus the one check after "end date is required".

create or replace function public.admin_set_pilot_end(p_program_id uuid, p_ends_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ends_on  date;
  v_ended_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_ends_on is null then
    raise exception 'Pilot end date is required.' using errcode = '22023';
  end if;

  if p_ends_on > date '2027-05-31' then
    raise exception 'A pilot cannot end after May 31, 2027.' using errcode = '22023';
  end if;

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.pilot_ends_on, p.pilot_ended_at
    into v_ends_on, v_ended_at
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  -- Same date and not ended early: nothing to change, nothing to log.
  if v_ends_on is not distinct from p_ends_on and v_ended_at is null then
    return;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'pilot.end_changed',
    null,
    jsonb_build_object(
      'from',              v_ends_on,
      'to',                p_ends_on,
      'cleared_ended_at',  v_ended_at,
      'by_admin',          true
    )
  );

  update public.programs
     set pilot_ends_on  = p_ends_on,
         pilot_ended_at = null,
         updated_at     = now()
   where id = p_program_id;
end;
$function$;

-- ── grants ─────────────────────────────────────────────────────────────────

revoke all on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant  execute on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant  execute on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant  execute on function public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer) to service_role;

revoke all on function public.program_usage_total_between(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.program_usage_total_between(uuid, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.program_usage_pending_between(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.program_usage_pending_between(uuid, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.program_usage_by_member_between(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.program_usage_by_member_between(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- `admin_set_pilot_end` keeps the grants it has (`create or replace` does not
-- reset them): authenticated and service_role, gated inside by `is_admin()`.
revoke all on function public.admin_set_pilot_end(uuid, date) from public, anon;
grant  execute on function public.admin_set_pilot_end(uuid, date) to authenticated, service_role;

-- ── Assertions ─────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer)',
    'public.program_usage_total_between(uuid, timestamptz, timestamptz)',
    'public.program_usage_pending_between(uuid, timestamptz, timestamptz)',
    'public.program_usage_by_member_between(uuid, timestamptz, timestamptz)',
    'public.admin_set_pilot_end(uuid, date)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '% is executable signed out', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% is executable by a signed-in client', v_fn;
    end if;
  end loop;
end;
$$;
