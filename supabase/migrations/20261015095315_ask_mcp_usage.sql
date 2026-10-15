-- The hard daily cap on /api/mcp tool calls (docs/ask-mcp-connector.md,
-- "Limits"; src/lib/services/mcp/rate-limit.ts).
--
-- The Ask MCP connector lets a player's own Claude call four tools over
-- their match data. A model can loop, and the in-memory window the route
-- keeps is per server instance, so the hard limit lives here: one row per
-- user per UTC day, incremented by ask_mcp_count_call() on every tool call
-- and compared with the app's cap (500 a day). The function runs as the
-- signed-in user — auth.uid() names the row, which is why a bearer token
-- from Supabase Auth's OAuth server is enough and the service role is not
-- involved. A personal-access-token path (no auth.uid()) would need an
-- `_as` form, as ask_on_arrival_functions added for the arrival path.
--
-- The table is readable by its owner only (RLS, select) and written by
-- the function alone: authenticated holds SELECT and nothing else, anon
-- nothing, per 20261008035936_table_grants_sweep_no_anon.
--
-- Applied to the live database on 2026-10-15 as version 20261015095315
-- (`ask_mcp_usage`) through the Supabase MCP. The first attempt was
-- declined whole for its `drop policy if exists`, so the policy is created
-- under a DO-block existence check instead. VERIFIED: see the end of this
-- file.

create table if not exists public.ask_mcp_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  calls      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.ask_mcp_usage is
  'Tool calls made through the Ask MCP connector (/api/mcp), one row per user per UTC day. Incremented by ask_mcp_count_call(); the app refuses past its daily cap.';

alter table public.ask_mcp_usage enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ask_mcp_usage'
       and policyname = 'ask_mcp_usage_select_own'
  ) then
    create policy "ask_mcp_usage_select_own"
      on public.ask_mcp_usage
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;
end
$$;

revoke all on table public.ask_mcp_usage from public, anon, authenticated;
grant select on table public.ask_mcp_usage to authenticated;
grant all on table public.ask_mcp_usage to service_role;

create or replace function public.ask_mcp_count_call()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_calls integer;
begin
  if v_user is null then
    raise exception 'ask_mcp_count_call: sign in first'
      using errcode = '42501';
  end if;

  insert into public.ask_mcp_usage as u (user_id, day, calls)
  values (v_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set calls = u.calls + 1,
        updated_at = now()
  returning u.calls into v_calls;

  return v_calls;
end
$$;

comment on function public.ask_mcp_count_call() is
  'Adds one to the signed-in user''s MCP call count for today (UTC) and answers the new count. The app compares it with its daily cap.';

revoke all on function public.ask_mcp_count_call() from public, anon;
grant execute on function public.ask_mcp_count_call() to authenticated, service_role;

-- VERIFIED (live, 2026-10-15, after apply_migration recorded version
-- 20261015095315):
--   select proname, proacl from pg_proc where proname = 'ask_mcp_count_call'
--     {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   select relname, relacl, relrowsecurity from pg_class where relname = 'ask_mcp_usage'
--     {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}  rls = true
--   select policyname, roles, qual from pg_policies where tablename = 'ask_mcp_usage'
--     ask_mcp_usage_select_own  {authenticated}  (user_id = ( SELECT auth.uid() AS uid))
--   so anon can neither read the table nor call the function, and a
--   signed-in user reads their own rows and writes only through it.
