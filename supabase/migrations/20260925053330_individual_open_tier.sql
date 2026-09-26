-- Applied live 2026-09-25 as version 20260925053330.
--
-- The individual tier's THIRD band: open beta.
--
-- The vendor terms as of 2026-09-25 (owner): collegiate programs 75h/month
-- each; 20 hand-picked players sharing 10h/month; EVERY OTHER individual 2h a
-- month. 20260925024406_individual_pool_quota refused video to anyone not on
-- the pilot list. This replaces that refusal with the open band: an unticked
-- player keeps their own 2h cap and draws from a separate house-wide monthly
-- ceiling, so a rush of signups cannot spend more than that ceiling. Setting
-- the ceiling to 0 in `splitstep/config.ts` pauses open video without touching
-- the pilot.
--
-- Which band a ledger row belongs to is read from its uploader's CURRENT
-- `users.individual_pilot`, so ticking or unticking someone mid-month moves
-- their month's rows with them. That is the simpler rule and the right one for
-- an owner fixing a mistake.
--
-- ADDITIVE ON PURPOSE, like the migration before it: new functions, nothing
-- dropped, so applying this before the code that calls it changes nothing
-- live. `individual_pool_usage` and `reserve_individual_pool_quota` stay until
-- nothing calls them.

-- Individual-figure rows for a month, split by band. "Individual figure" is
-- the same predicate `individual_pool_usage` uses: personal ledgers plus
-- self-serve (non-college) program ledgers.
create or replace function public.individual_tier_usage(
  p_billing_month date,
  p_created_by    uuid
)
returns table(pilot_used_seconds integer, open_used_seconds integer, is_player boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select coalesce(u.actual_seconds, u.reserved_seconds) as secs,
           coalesce(usr.individual_pilot, false) as pilot
      from public.processing_usage u
      left join public.users usr on usr.id = u.created_by
     where u.billing_month = p_billing_month
       and u.released = false
       and (u.account_type = 'individual'
            or (u.account_type = 'program'
                and exists (select 1
                              from public.programs p
                             where p.id = u.account_id
                               and p.org_type <> 'college')))
  )
  select
    coalesce((select sum(secs) from rows where pilot), 0)::integer,
    coalesce((select sum(secs) from rows where not pilot), 0)::integer,
    coalesce((select usr.individual_pilot
                from public.users usr
               where usr.id = p_created_by), false);
$$;

-- Same contract as reserve_individual_pool_quota, except nobody is refused
-- for being off the list: pilot players are checked against the pilot pool
-- (`pool_hours`), everyone else against the open ceiling (`open_hours`).
-- `band_used_seconds` / `band_cap_seconds` are the figures of whichever band
-- the uploader is in.
create or replace function public.reserve_individual_quota(
  p_job_id           uuid,
  p_account_id       uuid,
  p_account_type     text,
  p_created_by       uuid,
  p_billing_month    date,
  p_seconds          integer,
  p_cap_seconds      integer,
  p_pool_cap_seconds integer,
  p_open_cap_seconds integer
)
returns table(
  ok                boolean,
  refusal           text,
  used_seconds      integer,
  cap_seconds       integer,
  band_used_seconds integer,
  band_cap_seconds  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used      integer;
  v_pilot     integer;
  v_open      integer;
  v_is_player boolean;
  v_band_used integer;
  v_band_cap  integer;
  v_refusal   text;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_individual_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- The same two locks, in the same order, as reserve_individual_pool_quota,
  -- so the old and new functions serialize against each other while both
  -- exist.
  perform pg_advisory_xact_lock(
    hashtext('individual_pool:' || p_billing_month::text)
  );
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text || ':' || p_billing_month::text)
  );

  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_account_id
     and u.billing_month = p_billing_month
     and u.released = false;

  select s.pilot_used_seconds, s.open_used_seconds, s.is_player
    into v_pilot, v_open, v_is_player
    from public.individual_tier_usage(p_billing_month, p_created_by) s;

  if v_is_player then
    v_band_used := v_pilot;
    v_band_cap  := p_pool_cap_seconds;
    v_refusal   := 'pool_hours';
  else
    v_band_used := v_open;
    v_band_cap  := p_open_cap_seconds;
    v_refusal   := 'open_hours';
  end if;

  if v_used + p_seconds > p_cap_seconds then
    return query select false, 'account'::text, v_used, p_cap_seconds, v_band_used, v_band_cap;
    return;
  end if;

  if v_band_used + p_seconds > v_band_cap then
    return query select false, v_refusal, v_used, p_cap_seconds, v_band_used, v_band_cap;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_account_id, p_account_type, p_billing_month, p_job_id, p_created_by, p_seconds);

  return query select true, null::text, v_used + p_seconds, p_cap_seconds,
                      v_band_used + p_seconds, v_band_cap;
end;
$$;

-- Service role only, like the functions it replaces.
revoke all on function public.individual_tier_usage(date, uuid) from public, anon, authenticated;
revoke all on function public.reserve_individual_quota(uuid, uuid, text, uuid, date, integer, integer, integer, integer) from public, anon, authenticated;
