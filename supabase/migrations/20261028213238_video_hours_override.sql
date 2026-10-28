-- Any user, any number of monthly video hours (Admin › Pilots › Set hours).
--
-- `users.video_hours_override` is a per-user monthly cap for that user's
-- PERSONAL workspace, in hours, decimals allowed. Null means "the user's
-- normal cap" — the 2h individual figure, the pilot's 10h, or an admin's
-- unlimited allowance — exactly as before. A team workspace is never touched:
-- a program's budget is the program's.
--
-- Two places agree on it, so the UI and the database never disagree:
--
--   * `monthlyCapSecondsFor()` (src/lib/services/splitstep/quota.ts) reads it
--     through `Workspace.videoHoursOverride`, for every surface that SHOWS a
--     cap and for the figure `reserveQuota()` passes down;
--   * `reserve_personal_quota`, the one function that ENFORCES a personal
--     cap, re-reads it under its own lock and uses it in place of the cap the
--     caller passed. A stale caller (an old deploy, a workspace built before
--     the admin changed the number) therefore still spends against the
--     current figure.
--
-- The other cap-enforcing functions in the live database are program-only
-- (`reserve_processing_quota` is called for team workspaces only, and
-- `admin_reserve_video_quota` reserves against a program), or are no longer
-- called by the app (`reserve_individual_quota`,
-- `reserve_individual_pool_quota`): none of them bill a personal workspace.
--
-- Operator-owned like `individual_pilot`: `authenticated` gets no UPDATE on
-- the column (users UPDATE grants are column-scoped since
-- 20260914100000_users_block_admin_self_update), and the only writer is
-- `admin_set_video_hours`, which re-checks `is_admin()` and writes an audit
-- row in the same transaction.

alter table public.users
  add column if not exists video_hours_override numeric(7, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_video_hours_override_range'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_video_hours_override_range
      check (video_hours_override is null
             or (video_hours_override >= 0 and video_hours_override <= 10000));
  end if;
end $$;

comment on column public.users.video_hours_override is
  'Admin-set monthly video hours for this user''s personal workspace. Null = the normal plan cap. Written only by admin_set_video_hours.';

-- Readable by the signed-in owner (the workspace loader reads its own row);
-- users SELECT is table-wide today, this keeps it explicit if that narrows.
grant select (video_hours_override) on public.users to authenticated;

-- ── Audit ────────────────────────────────────────────────────────────────────
-- `program_audit_log` needs a program; an account-level change has none. A
-- sibling log for account-level admin actions, read only by the service role.

create table if not exists public.admin_account_audit_log (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references public.users (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null check (action in ('video_hours.changed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_account_audit_log_target_idx
  on public.admin_account_audit_log (target_user_id, created_at desc);

alter table public.admin_account_audit_log enable row level security;
revoke all on table public.admin_account_audit_log from anon, authenticated;
grant select on table public.admin_account_audit_log to service_role;

-- ── The writer ───────────────────────────────────────────────────────────────

create or replace function public.admin_set_video_hours(
  p_user_id uuid,
  p_hours numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old numeric;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  if p_hours is not null and (p_hours < 0 or p_hours > 10000) then
    raise exception 'Hours must be between 0 and 10000.' using errcode = '22023';
  end if;

  select u.video_hours_override
    into v_old
    from public.users u
   where u.id = p_user_id
     for no key update;

  if not found then
    raise exception 'User % not found', p_user_id using errcode = 'P0002';
  end if;

  if v_old is not distinct from round(p_hours, 2) then
    return;
  end if;

  insert into public.admin_account_audit_log (target_user_id, actor_user_id, action, details)
  values (
    p_user_id,
    (select auth.uid()),
    'video_hours.changed',
    jsonb_build_object('from', v_old, 'to', round(p_hours, 2))
  );

  update public.users
     set video_hours_override = round(p_hours, 2)
   where id = p_user_id;
end;
$function$;

revoke execute on function public.admin_set_video_hours(uuid, numeric) from public, anon;
grant execute on function public.admin_set_video_hours(uuid, numeric) to authenticated, service_role;

-- ── Enforcement ──────────────────────────────────────────────────────────────
-- `reserve_personal_quota` as live, plus the override read: when the user has
-- one, it replaces `p_cap_seconds` before anything is measured against it.

create or replace function public.reserve_personal_quota(
  p_job_id uuid,
  p_user_id uuid,
  p_billing_month date,
  p_seconds integer,
  p_cap_seconds integer
)
returns table(ok boolean, used_seconds integer, cap_seconds integer, credit_seconds integer, credit_spent_seconds integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
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
    raise exception 'reserve_personal_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_billing_month::text)
  );

  -- The admin-set allowance wins over whatever cap the caller computed.
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
     and u.billing_month = p_billing_month
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
    (p_user_id, 'individual', p_billing_month, p_job_id, p_user_id, v_from_free);

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
    raise exception 'reserve_personal_quota: credits fell short by % seconds', v_need;
  end if;

  return query select true, v_used + v_from_free, p_cap_seconds,
                      v_credits - (p_seconds - v_from_free),
                      p_seconds - v_from_free;
end;
$function$;
