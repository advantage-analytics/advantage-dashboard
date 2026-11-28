-- 2027 pricing, stage D · gating: human review is for matches that were paid for
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it after
-- 20261126070000_plans_2027_allowances (it replaces two of that migration's
-- functions) and BEFORE January 1, 2027 (UTC): from that instant Admin ›
-- Labels offers a match for the labellers' To do only when
-- `label_review_eligibility` says so. Until this is applied the app offers
-- every match, as it does today.
-- Decisions cited are in docs/plans/2027-pricing.md (decision 5, stage D).
--
-- THE RULE. From `PLANS_BEGIN` a match is offered for human review ("Verified
-- by Advantage") only when it was PAID FOR: analysed on a Coach / Coach Pro
-- plan, on purchased extra hours (a Free player's included), on a team's
-- season plan, or on a team's pilot. A match sent for analysis before
-- `PLANS_BEGIN` stays eligible whatever it drew. SwingVision imports have no
-- job and never reach the queue.
--
-- WHY A MARKER. The ledger cannot say "paid" on its own. A personal
-- `processing_usage` row looks the same whether its seconds were plan hours,
-- an admin's hours override or an admin's own uncapped upload, and reading
-- `users.plan` when the queue is built is wrong for anyone who has since
-- cancelled. So the reservation writes down what it drew, once:
--
--   processing_usage.paid_basis   'plan' | 'extra_hours' | 'season' | 'pilot',
--                                 or NULL when nothing was paid.
--
-- Written only by the two window-keyed reserve functions below, which are
-- the only way a reservation is made from January 1 (and, for a personal
-- workspace already on a paid plan, from the day the plan starts, decision
-- 8). `admin_reserve_plan_video_quota` routes through them, so a console
-- upload billed to a player or a team is marked the same way; one an admin
-- bills to nobody goes through `reserve_processing_quota` and stays NULL.
--
--   plan          the uploader is on Coach or Coach Pro (`users.plan`) when
--                 the reservation is made. Every match on a plan is Verified,
--                 so this holds whichever hours the match drew.
--   extra_hours   not on a plan, and at least one second came from a
--                 PURCHASED credit (`video_credits.source = 'purchase'`). A
--                 granted credit is not a payment.
--   season        the team has a season plan containing today.
--   pilot         else the team's pilot is running (the predicate
--                 `admin_reserve_plan_video_quota` spells).
--   NULL          an admin's hours override on a Free account, an admin's own
--                 uncapped workspace, granted credits alone.
--
-- A RELEASED RESERVATION IS NOT A PAYMENT. `release_processing_quota` hands
-- the hours back when a job fails or is cancelled; a trigger clears the
-- marker on the same update, and `label_review_eligibility` reads un-released
-- rows only.
--
-- SECURITY.
--   reserve_plan_*              unchanged: SECURITY DEFINER, `search_path =
--                               ''`, EXECUTE for `service_role` only.
--   label_review_eligibility    SECURITY INVOKER, `search_path = ''`, EXECUTE
--                               for `service_role` only. The admin labels
--                               loader calls it with the service key after
--                               its own admin check; no player or labeller
--                               can ask what another account paid.
--   processing_usage.paid_basis readable where the row already is (the
--                               creator's own rows, by the table's policy).
--
-- RE-RUNNABLE. The column is `if not exists`, the check is guarded, and the
-- functions and the trigger are `create or replace`. Nothing is dropped.

-- ── the marker ─────────────────────────────────────────────────────────────

alter table public.processing_usage
  add column if not exists paid_basis text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'processing_usage_paid_basis_check'
       and conrelid = 'public.processing_usage'::regclass
  ) then
    alter table public.processing_usage
      add constraint processing_usage_paid_basis_check
      check (paid_basis in ('plan', 'extra_hours', 'season', 'pilot'));
  end if;
end;
$$;

comment on column public.processing_usage.paid_basis is
  'What paid for this reservation: plan, extra_hours, season or pilot. NULL when nothing did (beta hours, an admin override or an admin''s own upload) and once the reservation is released. Written by reserve_plan_personal_quota / reserve_plan_program_quota.';

-- ── a released reservation keeps no marker ─────────────────────────────────

create or replace function public.processing_usage_clear_paid_basis()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.paid_basis := null;
  return new;
end;
$function$;

revoke all on function public.processing_usage_clear_paid_basis() from public, anon, authenticated;

create or replace trigger processing_usage_clear_paid_basis
  before update of released on public.processing_usage
  for each row
  when (new.released and new.paid_basis is not null)
  execute function public.processing_usage_clear_paid_basis();

-- ── reserve: a personal workspace ──────────────────────────────────────────
--
-- The body of 20261126070000_plans_2027_allowances, plus: read `users.plan`
-- beside the override, note whether a purchased credit was drawn, and write
-- the marker on the row just inserted. Nothing else differs.

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
    when v_plan in ('coach', 'coach-pro') then 'plan'
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
  'reserve_personal_quota over a window: plan hours used inside [p_window_start, p_window_end) first, then the player''s credits soonest-expiring first, atomically. Writes processing_usage.paid_basis (plan, or extra_hours for a purchased credit off a plan). Service role only.';

-- ── reserve: a team workspace ──────────────────────────────────────────────
--
-- The body of 20261126070000_plans_2027_allowances, plus the marker on the
-- row it inserts: `season` when the team has a season containing today, else
-- `pilot` while its pilot runs, else NULL.

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
  v_today date := (now() at time zone 'utc')::date;
  v_used integer;
  v_basis text;
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

  -- What paid for it (stage D): the season first, else a running pilot.
  v_basis := case
    when exists (
      select 1 from public.program_plans pp
       where pp.program_id = p_account_id
         and v_today between pp.starts_on and pp.ends_on
    ) then 'season'
    when exists (
      select 1 from public.programs p
       where p.id = p_account_id
         and p.pilot_eligible
         and p.pilot_ended_at is null
         and p.pilot_ends_on is not null
         and least(p.pilot_ends_on, date '2027-05-31') >= v_today
    ) then 'pilot'
  end;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds, paid_basis)
  values
    (p_account_id, 'program', v_month, p_job_id, p_created_by, p_seconds, v_basis);

  return query select true, v_used + p_seconds, p_cap_seconds;
end;
$function$;

comment on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) is
  'reserve_processing_quota for a team over a window: one pool for a season, or a pilot''s calendar month. Writes processing_usage.paid_basis (season, else pilot). Service role only.';

-- ── who is offered for human review ────────────────────────────────────────
--
-- One row per job asked about. `eligible` is the gate Admin › Labels reads
-- before it offers a match for the labellers' To do, and again before it adds
-- one. It is a question about the MATCH, asked through a job: a re-run an
-- admin did for free does not take review away from a match that was paid
-- for, and a paid re-run earns it.
--
--   eligible   the match has a completed job that was sent for analysis
--              before `p_plans_begin` (analysed free, before the switch), or
--              any of its jobs holds an un-released reservation with a paid
--              marker.
--   paid_basis the newest such marker, NULL when there is none: what the
--              admin console can say about why.
--
-- `p_plans_begin` is `PLANS_BEGIN` from src/lib/billing/plans.ts. The date
-- lives in the plan module and is handed in, never written here.

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
        and u.paid_basis is not null
      order by u.created_at desc, u.id desc
      limit 1
   ) paid on true
   where j.id = any (p_job_ids);
$function$;

comment on function public.label_review_eligibility(uuid[], timestamptz) is
  'Whether each job''s match may be offered for human review: sent for analysis before p_plans_begin, or paid for (processing_usage.paid_basis on an un-released reservation of any of the match''s jobs). Service role only.';

-- ── grants ─────────────────────────────────────────────────────────────────
--
-- `create or replace` keeps the grants the two reserve functions have; they
-- are spelled again so this file is right on its own.

revoke all on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant  execute on function public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant  execute on function public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.label_review_eligibility(uuid[], timestamptz) from public, anon, authenticated;
grant  execute on function public.label_review_eligibility(uuid[], timestamptz) to service_role;

-- ── Assertions ─────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)',
    'public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer)',
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
end;
$$;
