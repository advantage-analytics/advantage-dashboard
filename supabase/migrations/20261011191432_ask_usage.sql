-- The Ask page's question limit (design: work/personal-ask-page/02_design/
-- output/design.md, "The question limit"): 20 questions per calendar month,
-- resetting on the 1st, the same for every account. One row per reserved
-- question; `billing_month` is keyed the way `processing_usage.billing_month`
-- is — `YYYY-MM-01` of the UTC month, as `currentBillingMonth()` in
-- src/lib/services/splitstep/config.ts computes it.
--
-- Clients never write the table. `ask_reserve_question()` inserts the row
-- under a per-user advisory lock, so two questions sent at 19 used cannot both
-- pass; `ask_release_question()` refunds a reservation whose question never
-- got an answer; `ask_quota()` reads the count without writing. The cap is a
-- constant inside the functions, not a parameter: Pro is not enforced anywhere
-- and a tier plan is pending, so one number changes in one place when tiers
-- arrive.

-- ── The ledger ───────────────────────────────────────────────────────────────

create table public.ask_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  billing_month date not null,
  created_at timestamptz not null default now()
);

comment on table public.ask_usage is
  'One row per Ask question reserved against the monthly limit. Written only by ask_reserve_question / ask_release_question; the owner may read their rows.';
comment on column public.ask_usage.billing_month is
  'First day of the UTC calendar month the question counts against (YYYY-MM-01), keyed like processing_usage.billing_month.';

create index ask_usage_user_month_idx
  on public.ask_usage (user_id, billing_month);

alter table public.ask_usage enable row level security;

-- The owner reads their own rows; nobody writes through the API. Only SELECT
-- is granted, so an insert or delete as `authenticated` is a permission error
-- (42501) rather than an RLS miss that silently touches zero rows.
revoke all on public.ask_usage from public, anon, authenticated;
grant select on public.ask_usage to authenticated;

create policy ask_usage_select_own on public.ask_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Reserve ──────────────────────────────────────────────────────────────────

-- Counts the caller's rows for the current UTC month under a per-user
-- advisory lock, refuses the 21st with errcode 54000 (program_limit_exceeded)
-- and a message starting `ask_limit_reached`, otherwise inserts one row and
-- answers { usage_id, used, cap, resets_on }. The cap must match ask_quota().
create or replace function public.ask_reserve_question()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap   constant integer := 20;
  v_user  uuid := auth.uid();
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used  integer;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('ask_usage:' || v_user::text));

  select count(*)
    into v_used
    from public.ask_usage
   where user_id = v_user
     and billing_month = v_month;

  if v_used >= v_cap then
    raise exception 'ask_limit_reached: % questions this month, resets on %',
      v_cap, (v_month + interval '1 month')::date
      using errcode = '54000';
  end if;

  insert into public.ask_usage (user_id, billing_month)
  values (v_user, v_month)
  returning id into v_id;

  return jsonb_build_object(
    'usage_id',  v_id,
    'used',      v_used + 1,
    'cap',       v_cap,
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$$;

-- ── Release ──────────────────────────────────────────────────────────────────

-- Deletes the reservation only when it belongs to the caller; true when a row
-- went, false otherwise (someone else's id, an unknown id, or already gone).
create or replace function public.ask_release_question(usage_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if usage_id is null then
    raise exception 'usage_id is required' using errcode = '22023';
  end if;

  delete from public.ask_usage
   where id = usage_id
     and user_id = v_user;

  return found;
end;
$$;

-- ── Read ─────────────────────────────────────────────────────────────────────

-- { used, cap, resets_on } for the caller's current UTC month; writes nothing.
create or replace function public.ask_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap   constant integer := 20;
  v_user  uuid := auth.uid();
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used  integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*)
    into v_used
    from public.ask_usage
   where user_id = v_user
     and billing_month = v_month;

  return jsonb_build_object(
    'used',      v_used,
    'cap',       v_cap,
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

-- Signed-in callers and the server; never anon (functions in public are not
-- executable signed out by default since 20261001184305, restated here).
revoke execute on function public.ask_reserve_question() from public, anon;
revoke execute on function public.ask_release_question(uuid) from public, anon;
revoke execute on function public.ask_quota() from public, anon;
grant execute on function public.ask_reserve_question() to authenticated, service_role;
grant execute on function public.ask_release_question(uuid) to authenticated, service_role;
grant execute on function public.ask_quota() to authenticated, service_role;
