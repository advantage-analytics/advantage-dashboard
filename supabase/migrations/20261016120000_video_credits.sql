-- Video credits: stage 1 of player pricing (docs/plans/2027-player-pricing.md).
--
-- A personal player's hours are their monthly free hours (2h, 10h for a pilot
-- player) and then credits they bought, oldest-expiring first. No shared
-- house-wide band sits in front of either: the 20h open-beta ceiling and the
-- pilot pool are gone from the reservation the app calls (Cj, 2026-10-16).
--
-- Ledger shape. `processing_usage` keeps meaning "free hours this month": a
-- personal job's row holds only the part its free hours paid for, which can be
-- 0. The part credits paid for lives in `video_credit_spends`, one row per
-- credit lot it drew from. So every existing reader of `processing_usage` —
-- the wizard meter, Settings › Usage, the admin pages — still sums free hours
-- correctly without changing, and nothing a user can reach writes a credit.
--
-- `reserve_individual_quota`, `individual_tier_usage` and
-- `individual_pool_usage` stay until the app that stops calling them is
-- deployed; a later migration drops them.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.video_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  seconds integer not null check (seconds > 0),
  remaining_seconds integer not null
    check (remaining_seconds >= 0 and remaining_seconds <= seconds),
  expires_at timestamptz not null,
  source text not null check (source in ('purchase', 'grant')),
  -- Which pack was bought; null for a grant.
  pack text check (pack in ('1h', '5h')),
  -- One row per completed Checkout Session: the webhook's idempotency key.
  -- A redelivered event, or `async_payment_succeeded` after `completed`,
  -- names the same session and inserts nothing.
  stripe_checkout_session text unique,
  stripe_payment_intent text unique,
  stripe_event_id text unique,
  amount_cents integer check (amount_cents >= 0),
  currency text,
  created_at timestamptz not null default now(),
  check (source <> 'purchase' or stripe_checkout_session is not null)
);

create index video_credits_user_expiry_idx
  on public.video_credits (user_id, expires_at)
  where remaining_seconds > 0;

create table public.video_credit_spends (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.video_credits(id) on delete cascade,
  -- Denormalised from the credit, so the owner-read policy needs no join.
  user_id uuid not null references public.users(id) on delete cascade,
  -- Set null, not cascade: deleting a match must not erase what was spent,
  -- and it refunds nothing (the vendor was paid).
  job_id uuid references public.processing_jobs(id) on delete set null,
  -- What the reservation took. Never changes; reconcile recomputes from it,
  -- which is what makes a redelivered reconcile a no-op.
  reserved_seconds integer not null check (reserved_seconds > 0),
  -- What this spend currently costs the credit, after reconcile.
  seconds integer not null check (seconds >= 0 and seconds <= reserved_seconds),
  released boolean not null default false,
  created_at timestamptz not null default now()
);

create index video_credit_spends_job_idx on public.video_credit_spends (job_id);
create index video_credit_spends_credit_idx on public.video_credit_spends (credit_id);
create index video_credit_spends_user_idx on public.video_credit_spends (user_id);

-- ── Access: the owner reads, only the service role writes ──────────────────

alter table public.video_credits enable row level security;
alter table public.video_credit_spends enable row level security;

revoke all on public.video_credits from anon, authenticated;
revoke all on public.video_credit_spends from anon, authenticated;
grant select on public.video_credits to authenticated;
grant select on public.video_credit_spends to authenticated;
grant all on public.video_credits to service_role;
grant all on public.video_credit_spends to service_role;

create policy "Owners read their credits"
  on public.video_credits for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners read their credit spends"
  on public.video_credit_spends for select to authenticated
  using ((select auth.uid()) = user_id);

-- ── Reserve: free hours, then credits, in one transaction ──────────────────

-- For a PERSONAL workspace only: the account is the user, and so are the
-- credits. Team workspaces keep reserve_processing_quota and never touch a
-- credit (credits are personal).
create or replace function public.reserve_personal_quota(
  p_job_id uuid,
  p_user_id uuid,
  p_billing_month date,
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
set search_path to ''
as $function$
declare
  v_used integer;
  v_free_left integer;
  v_from_free integer;
  v_need integer;
  v_credits integer;
  v_take integer;
  c record;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_personal_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- The same lock reserve_processing_quota takes for this account+month, so
  -- the two can never interleave on one personal ledger.
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_billing_month::text)
  );

  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_user_id
     and u.billing_month = p_billing_month
     and u.released = false;

  -- Credits are the user's across months, so the account+month lock above
  -- does not cover them: two reservations either side of a month boundary
  -- would otherwise race for the same lots.
  perform pg_advisory_xact_lock(hashtext('video_credits:' || p_user_id::text));

  -- Lock order everywhere: usage row, then spends, then credits by id.
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

  -- Unreachable while the locks above hold; if it ever is, nothing commits.
  if v_need > 0 then
    raise exception 'reserve_personal_quota: credits fell short by % seconds', v_need;
  end if;

  return query select true, v_used + v_from_free, p_cap_seconds,
                      v_credits - (p_seconds - v_from_free),
                      p_seconds - v_from_free;
end;
$function$;

-- ── Release: hand back free hours AND the same credit rows ─────────────────

-- The spend rows' released flag is the gate: only the call that flips them
-- refunds, so two overlapping releases (a redelivered webhook racing a cancel)
-- cannot mint credits. Lock order: usage row, spends, credits by id — the
-- same as reconcile, so the two never deadlock.
create or replace function public.release_processing_quota(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

-- ── Reconcile: the vendor's billed seconds replace the estimate ────────────

-- Recomputed from the reservation every time, so a redelivery is a no-op.
--   * Billed less than reserved: the difference goes back to credits first
--     (newest-expiring spend first — the last bucket filled empties first),
--     then to free hours.
--   * Billed more: the extra lands on free hours, never on a paid credit —
--     the player agreed to the trimmed length, not the vendor's rounding.
create or replace function public.reconcile_processing_quota(
  p_job_id uuid,
  p_actual_seconds integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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
    -- New cost of this spend is reserved - take; move the credit by the
    -- change from what it costs now.
    update public.video_credits
       set remaining_seconds = remaining_seconds + (s.seconds - (s.reserved_seconds - v_take))
     where id = s.credit_id;
    update public.video_credit_spends
       set seconds = s.reserved_seconds - v_take
     where id = s.id;
    v_credit_cost := v_credit_cost + (s.reserved_seconds - v_take);
  end loop;

  -- Free hours carry whatever the credits no longer do. Works out to the
  -- free reservation less any refund past the credits, or plus any overage.
  update public.processing_usage
     set actual_seconds = greatest(0, p_actual_seconds - v_credit_cost)
   where job_id = p_job_id
     and released = false;
end;
$function$;

-- ── processing_usage: no direct writes by signed-in users ──────────────────

-- Free hours now sit in front of paid credits, so a row a player can delete,
-- release or zero is a row that hands back hours someone paid the vendor for.
-- Every writer is a SECURITY DEFINER function above or the service role
-- (account deletion uses the admin client); the owner keeps SELECT for the
-- wizard's meter.
revoke insert, update, delete on public.processing_usage from authenticated;
drop policy if exists "Users can insert own processing usage" on public.processing_usage;
drop policy if exists "Users can update own processing usage" on public.processing_usage;
drop policy if exists "Users can delete own processing usage" on public.processing_usage;

-- ── Grants: service role only, like every other quota function ─────────────

revoke execute on function public.reserve_personal_quota(uuid, uuid, date, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_personal_quota(uuid, uuid, date, integer, integer)
  to service_role;

revoke execute on function public.release_processing_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.release_processing_quota(uuid) to service_role;

revoke execute on function public.reconcile_processing_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_processing_quota(uuid, integer)
  to service_role;
