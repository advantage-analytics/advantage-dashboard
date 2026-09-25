-- The individual tier's SHARED allowance with the vendor, through December:
-- at most 20 players on the individual figure, sending under 10 hours a month
-- between them. The 2h/user cap `reserve_processing_quota` enforces is per
-- account; nothing summed ACROSS accounts, so 20 players at 2h each could draw
-- 40h against a 10h allocation.
--
-- The 20 are HAND-PICKED (owner decision, 2026-09-25): a person may send video
-- on the individual figure only while they are in `individual_pilot_players`.
-- The table holds at most 20 rows; nothing in the app writes it. Add or remove
-- someone from the SQL editor:
--
--   select public.add_individual_pilot_player('player@example.com');
--   delete from public.individual_pilot_players
--    where user_id = (select id from auth.users where email = 'player@example.com');
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

-- ── The pilot list ───────────────────────────────────────────────────────────

create table if not exists public.individual_pilot_players (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Service role and the SQL editor only: no policy, so RLS refuses everyone else.
alter table public.individual_pilot_players enable row level security;

create or replace function public.individual_pilot_players_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize adds so two at once cannot both see 19.
  perform pg_advisory_xact_lock(hashtext('individual_pilot_players'));
  if not exists (select 1 from public.individual_pilot_players
                  where user_id = new.user_id)
     and (select count(*) from public.individual_pilot_players) >= 20 then
    raise exception 'the individual pilot is full: at most 20 players'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists individual_pilot_players_limit on public.individual_pilot_players;
create trigger individual_pilot_players_limit
  before insert on public.individual_pilot_players
  for each row execute function public.individual_pilot_players_limit();

create or replace function public.add_individual_pilot_player(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'no account with email %', p_email using errcode = 'P0002';
  end if;
  insert into public.individual_pilot_players (user_id) values (v_id)
  on conflict (user_id) do nothing;
  return v_id;
end;
$$;

-- ── Pool usage ───────────────────────────────────────────────────────────────

create or replace function public.individual_pool_usage(
  p_billing_month date,
  p_created_by    uuid
)
returns table(pool_used_seconds integer, is_player boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(coalesce(u.actual_seconds, u.reserved_seconds))
                from public.processing_usage u
               where u.billing_month = p_billing_month
                 and u.released = false
                 and (u.account_type = 'individual'
                      or (u.account_type = 'program'
                          and exists (select 1
                                        from public.programs p
                                       where p.id = u.account_id
                                         and p.org_type <> 'college')))), 0)::integer,
    exists (select 1
              from public.individual_pilot_players pp
             where pp.user_id = p_created_by);
$$;

-- Same contract as reserve_processing_quota, plus the pool. `refusal` names
-- which limit said no: 'account', 'pool_hours' or 'pool_players' (null on ok).
create or replace function public.reserve_individual_pool_quota(
  p_job_id           uuid,
  p_account_id       uuid,
  p_account_type     text,
  p_created_by       uuid,
  p_billing_month    date,
  p_seconds          integer,
  p_cap_seconds      integer,
  p_pool_cap_seconds integer
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
  v_used      integer;
  v_pool_used integer;
  v_is_player boolean;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_individual_pool_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- Pool first, then the account — the same account key
  -- reserve_processing_quota takes, so the two functions still serialize on
  -- one account. Nothing takes these in the other order, so no deadlock.
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

  select s.pool_used_seconds, s.is_player
    into v_pool_used, v_is_player
    from public.individual_pool_usage(p_billing_month, p_created_by) s;

  if not v_is_player then
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
revoke all on function public.add_individual_pilot_player(text) from public, anon, authenticated;
revoke all on function public.individual_pool_usage(date, uuid) from public, anon, authenticated;
revoke all on function public.reserve_individual_pool_quota(uuid, uuid, text, uuid, date, integer, integer, integer) from public, anon, authenticated;
