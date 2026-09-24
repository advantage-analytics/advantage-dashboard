-- The individual tier's SHARED allowance with the vendor: through December,
-- at most 20 players on the individual figure, sending under 10 hours a month
-- between them. The 2h/user cap `reserve_processing_quota` enforces is per
-- account; nothing summed ACROSS accounts, so 20 players at 2h each could draw
-- 40h against a 10h allocation.
--
-- ADDITIVE ON PURPOSE. `reserve_processing_quota` is untouched and collegiate
-- programs keep calling it, so applying this before the code that calls it
-- changes nothing live. The code (`splitstep/quota.ts`) must NOT deploy before
-- this is applied: every individual reservation calls the new function and
-- would fail without it.
--
-- Who is in the pool is `quotaTierFor() === 'individual'`: every personal
-- workspace (account_type 'individual') and every self-serve custom org, which
-- files under the program ledger but draws the individual figure. In SQL that
-- is "not a college program's ledger", read from `programs.org_type`.
--
-- A "player" is a person who has sent video (`created_by`), counted over rows
-- whose billing month is on or after `p_players_since`. Released rows COUNT for
-- the player limit — a player whose first job failed keeps their place — and
-- never for hours. The caller picks the window (whole pilot or this month), so
-- which reading holds is a code change, not a migration.

create or replace function public.individual_pool_usage(
  p_billing_month date,
  p_players_since date,
  p_created_by    uuid
)
returns table(pool_used_seconds integer, player_count integer, is_player boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with pool as (
    select u.*
      from public.processing_usage u
     where u.account_type = 'individual'
        or (u.account_type = 'program'
            and exists (select 1
                          from public.programs p
                         where p.id = u.account_id
                           and p.org_type <> 'college'))
  )
  select
    coalesce((select sum(coalesce(actual_seconds, reserved_seconds))
                from pool
               where billing_month = p_billing_month
                 and released = false), 0)::integer,
    (select count(distinct created_by)
       from pool
      where billing_month >= p_players_since)::integer,
    exists (select 1
              from pool
             where billing_month >= p_players_since
               and created_by = p_created_by);
$$;

-- Same contract as reserve_processing_quota, plus the pool. `refusal` names
-- which limit said no: 'account', 'pool_hours' or 'pool_players' (null on ok).
create or replace function public.reserve_individual_pool_quota(
  p_job_id            uuid,
  p_account_id        uuid,
  p_account_type      text,
  p_created_by        uuid,
  p_billing_month     date,
  p_seconds           integer,
  p_cap_seconds       integer,
  p_pool_cap_seconds  integer,
  p_pool_player_limit integer,
  p_players_since     date
)
returns table(
  ok                boolean,
  refusal           text,
  used_seconds      integer,
  cap_seconds       integer,
  pool_used_seconds integer,
  pool_cap_seconds  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used        integer;
  v_pool_used   integer;
  v_players     integer;
  v_is_player   boolean;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_individual_pool_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- Pool first, then the account — the same account key
  -- reserve_processing_quota takes, so the two functions still serialize on
  -- one account. Nothing takes these in the other order, so no deadlock. The
  -- pool key is not per month: the player count can span months.
  perform pg_advisory_xact_lock(hashtext('individual_pool'));
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text || ':' || p_billing_month::text)
  );

  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_account_id
     and u.billing_month = p_billing_month
     and u.released = false;

  select s.pool_used_seconds, s.player_count, s.is_player
    into v_pool_used, v_players, v_is_player
    from public.individual_pool_usage(p_billing_month, p_players_since, p_created_by) s;

  if not v_is_player and v_players >= p_pool_player_limit then
    return query select false, 'pool_players'::text, v_used, p_cap_seconds, v_pool_used, p_pool_cap_seconds;
    return;
  end if;

  if v_used + p_seconds > p_cap_seconds then
    return query select false, 'account'::text, v_used, p_cap_seconds, v_pool_used, p_pool_cap_seconds;
    return;
  end if;

  if v_pool_used + p_seconds > p_pool_cap_seconds then
    return query select false, 'pool_hours'::text, v_used, p_cap_seconds, v_pool_used, p_pool_cap_seconds;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_account_id, p_account_type, p_billing_month, p_job_id, p_created_by, p_seconds);

  return query select true, null::text, v_used + p_seconds, p_cap_seconds,
                      v_pool_used + p_seconds, p_pool_cap_seconds;
end;
$$;

-- Service role only, like reserve_processing_quota: the pool is everyone's rows.
revoke all on function public.individual_pool_usage(date, date, uuid) from public, anon, authenticated;
revoke all on function public.reserve_individual_pool_quota(uuid, uuid, text, uuid, date, integer, integer, integer, integer, date) from public, anon, authenticated;
