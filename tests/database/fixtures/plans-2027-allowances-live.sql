create role anon;
create role authenticated;
create role service_role bypassrls;

alter default privileges revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.users (
  id uuid primary key references auth.users (id),
  first_name text,
  last_name text,
  is_admin boolean not null default false,
  individual_pilot boolean not null default false,
  video_hours_override numeric,
  plan text default 'free',
  plan_period_start timestamptz
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  school_name text,
  org_type text not null default 'college',
  pilot_eligible boolean not null default false,
  pilot_ends_on date,
  pilot_approved_by uuid,
  pilot_approved_at timestamptz,
  pilot_ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.program_members (
  program_id uuid not null references public.programs (id),
  user_id uuid not null references public.users (id),
  role text not null,
  primary key (program_id, user_id)
);

create table public.program_plans (
  program_id uuid primary key references public.programs (id) on delete cascade,
  plan_id text not null check (plan_id in ('starter', 'program', 'elite')),
  plan_term text not null check (plan_term in ('spring', 'full_year')),
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on)
);

create table public.program_audit_log (
  id bigint generated always as identity primary key,
  program_id uuid,
  actor_user_id uuid,
  action text not null,
  subject_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid,
  status text not null default 'submitting',
  external_job_id text,
  start_time_seconds numeric not null default 0,
  end_time_seconds numeric not null default 0
);

create table public.processing_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  account_type text not null default 'individual'
    constraint processing_usage_account_type_check
    check (account_type = any (array['individual'::text, 'program'::text])),
  billing_month date not null
    constraint processing_usage_billing_month_check
    check (billing_month = (date_trunc('month'::text, (billing_month)::timestamp with time zone))::date),
  job_id uuid references public.processing_jobs (id) on delete set null,
  created_by uuid references public.users (id),
  reserved_seconds integer not null,
  actual_seconds integer,
  released boolean not null default false,
  created_at timestamp with time zone not null default now()
);
create index processing_usage_account_month_all_idx on public.processing_usage using btree (account_id, account_type, billing_month);
create index processing_usage_account_month_idx on public.processing_usage using btree (account_id, account_type, billing_month) where (released = false);
create unique index processing_usage_job_id_key on public.processing_usage using btree (job_id) where (job_id is not null);
alter table public.processing_usage enable row level security;
create policy "Users can view own processing usage" on public.processing_usage
  for select using ((select auth.uid()) = created_by);
revoke all on public.processing_usage from authenticated;
grant select on public.processing_usage to authenticated;

create table public.video_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  seconds integer not null constraint video_credits_seconds_check check (seconds > 0),
  remaining_seconds integer not null,
  expires_at timestamp with time zone not null,
  source text not null
    constraint video_credits_source_check
    check (source = any (array['purchase'::text, 'grant'::text])),
  created_at timestamp with time zone not null default now(),
  constraint video_credits_check check ((remaining_seconds >= 0) and (remaining_seconds <= seconds))
);
create index video_credits_user_expiry_idx on public.video_credits using btree (user_id, expires_at) where (remaining_seconds > 0);
alter table public.video_credits enable row level security;
revoke all on public.video_credits from authenticated;
grant select on public.video_credits to authenticated;

create table public.video_credit_spends (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.video_credits (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  job_id uuid references public.processing_jobs (id) on delete set null,
  reserved_seconds integer not null
    constraint video_credit_spends_reserved_seconds_check check (reserved_seconds > 0),
  seconds integer not null,
  released boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint video_credit_spends_check check ((seconds >= 0) and (seconds <= reserved_seconds))
);
alter table public.video_credit_spends enable row level security;
revoke all on public.video_credit_spends from authenticated;
grant select on public.video_credit_spends to authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select u.is_admin from public.users u where u.id = (select auth.uid())), false);
$function$;

CREATE OR REPLACE FUNCTION public.user_program_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pm.program_id from public.program_members pm
   where pm.user_id = (select auth.uid());
$function$;

create function public.user_program_role(p_program_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select pm.role from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.is_program_staff(p_program_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    public.user_program_role(p_program_id) in ('owner', 'coach', 'staff'), false);
$function$;

create table public.test_video_access (
  job_id uuid primary key,
  access jsonb not null
);
create function public.admin_video_access(p_actor_id uuid, p_match_id uuid, p_job_id uuid, p_action text, p_blob_name text default null)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select t.access from public.test_video_access t where t.job_id = p_job_id;
$function$;
revoke all on function public.admin_video_access(uuid, uuid, uuid, text, text) from authenticated;

CREATE OR REPLACE FUNCTION public.reserve_processing_quota(p_job_id uuid, p_account_id uuid, p_account_type text, p_created_by uuid, p_billing_month date, p_seconds integer, p_cap_seconds integer)
 RETURNS TABLE(ok boolean, used_seconds integer, cap_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_used integer;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_processing_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- Serialize every reservation for this account+month. Transaction-scoped, so
  -- it releases on commit or rollback without any cleanup path.
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text || ':' || p_billing_month::text)
  );

  -- A released row is a refund and must not count. Where a job has finished,
  -- actual_seconds is the truth; until then the reservation stands in for it.
  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_account_id
     and u.billing_month = p_billing_month
     and u.released = false;

  if v_used + p_seconds > p_cap_seconds then
    return query select false, v_used, p_cap_seconds;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_account_id, p_account_type, p_billing_month, p_job_id, p_created_by, p_seconds);

  return query select true, v_used + p_seconds, p_cap_seconds;
end;
$function$;
revoke all on function public.reserve_processing_quota(uuid, uuid, text, uuid, date, integer, integer) from authenticated;

CREATE OR REPLACE FUNCTION public.reserve_personal_quota(p_job_id uuid, p_user_id uuid, p_billing_month date, p_seconds integer, p_cap_seconds integer)
 RETURNS TABLE(ok boolean, used_seconds integer, cap_seconds integer, credit_seconds integer, credit_spent_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
revoke all on function public.reserve_personal_quota(uuid, uuid, date, integer, integer) from authenticated;

CREATE OR REPLACE FUNCTION public.release_processing_quota(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.processing_usage u
   where u.job_id = p_job_id
     for update;

  perform 1 from public.video_credits vc
   where vc.id in (select sp.credit_id from public.video_credit_spends sp
                    where sp.job_id = p_job_id and sp.released = false)
   order by vc.id
     for update;

  with flipped as (
    update public.video_credit_spends sp
       set released = true
     where sp.job_id = p_job_id
       and sp.released = false
    returning sp.credit_id, sp.seconds
  )
  update public.video_credits vc
     set remaining_seconds = vc.remaining_seconds + f.total
    from (select credit_id, sum(seconds)::integer as total
            from flipped group by credit_id) f
   where vc.id = f.credit_id;

  update public.processing_usage
     set released = true
   where job_id = p_job_id
     and released = false;
end;
$function$;
revoke all on function public.release_processing_quota(uuid) from authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_processing_quota(p_job_id uuid, p_actual_seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_free_reserved integer;
  v_credit_reserved integer;
  v_refund integer;
  v_take integer;
  v_credit_cost integer := 0;
  s record;
begin
  select u.reserved_seconds into v_free_reserved
    from public.processing_usage u
   where u.job_id = p_job_id and u.released = false
   for update;
  if not found then return; end if;

  perform 1 from public.video_credit_spends sp
   where sp.job_id = p_job_id and sp.released = false
   order by sp.id
     for update;

  perform 1 from public.video_credits vc
   where vc.id in (select sp.credit_id from public.video_credit_spends sp
                    where sp.job_id = p_job_id and sp.released = false)
   order by vc.id
     for update;

  if p_actual_seconds is null or p_actual_seconds < 0 then
    raise exception 'reconcile_processing_quota: bad p_actual_seconds %', p_actual_seconds;
  end if;

  select coalesce(sum(sp.reserved_seconds), 0) into v_credit_reserved
    from public.video_credit_spends sp
   where sp.job_id = p_job_id and sp.released = false;

  v_refund := greatest(0, v_free_reserved + v_credit_reserved - p_actual_seconds);

  for s in
    select sp.id, sp.credit_id, sp.reserved_seconds, sp.seconds
      from public.video_credit_spends sp
      join public.video_credits vc on vc.id = sp.credit_id
     where sp.job_id = p_job_id and sp.released = false
     order by vc.expires_at desc, vc.created_at desc, vc.id desc
  loop
    v_take := least(v_refund, s.reserved_seconds);
    v_refund := v_refund - v_take;
    update public.video_credits
       set remaining_seconds = remaining_seconds + (s.seconds - (s.reserved_seconds - v_take))
     where id = s.credit_id;
    update public.video_credit_spends
       set seconds = s.reserved_seconds - v_take
     where id = s.id;
    v_credit_cost := v_credit_cost + (s.reserved_seconds - v_take);
  end loop;

  update public.processing_usage
     set actual_seconds = greatest(0, p_actual_seconds - v_credit_cost)
   where job_id = p_job_id
     and released = false;
end;
$function$;
revoke all on function public.reconcile_processing_quota(uuid, integer) from authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_pilot_end(p_program_id uuid, p_ends_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
