-- Ask: the query functions and the reservation release are the server's.
--
-- WHY. public.ask_run_query and public.ask_run_team_query execute SQL they
-- are handed, and until now any signed-in user could call them from the
-- browser with any SELECT. 20261013051323 closed the way that let such SQL
-- read another user's rows, and a second review could not break it. But the
-- same review named what is left for as long as the door is public: the SQL
-- runs as ask_reader, which can call everything in pg_catalog that PUBLIC
-- can — session-level set_config (a setting left behind on a pooled
-- connection), session advisory locks sharing a key space with the app's
-- own, pg_notify — and each of those needs its own patch. The static check
-- that would refuse them (src/lib/services/ask/sql-guard.ts, a parser with
-- a function allow-list) runs in the route, and a caller who goes straight
-- to the function never meets it.
--
-- So the door moves behind the route. The three functions below take the
-- viewer as an argument and are executable by service_role alone; the Ask
-- route calls them with the service key and the id it read from its own
-- session check (src/lib/services/ask/database.ts — the one place Ask uses
-- the service role, for these calls and no table). A signed-in user can now
-- reach schema ask only with SQL the model wrote and the guard passed.
-- Everything from the earlier migrations stays underneath as the second
-- layer: the pinned and signed viewer, the role that can read four views,
-- the read-only transaction, the cursor, the row cap.
--
--   public.ask_run_query(p_viewer, scope_sql, sql)
--   public.ask_run_team_query(p_viewer, p_program_id, scope_sql, sql)
--       as before, with the viewer given rather than read from the JWT. The
--       two-/three-argument forms are dropped.
--   public.ask_release_question(p_user_id, usage_id)
--       the reservation of a question that failed, given back. It was
--       executable by the user it belongs to, who could therefore give back
--       the reservation of a question that was being answered, or had been,
--       and never reach the limit. 20261013051323 tried to refuse that by
--       looking for an answer saved after the reservation; that was unsound
--       both ways (a release during the model call still worked, and a
--       failed question could be charged when another was in flight). The
--       condition is removed and the function is the server's: the route is
--       the only thing that knows a question failed.
--
-- Unchanged, still called as the signed-in user: ask_reserve_question(),
-- ask_quota(), ask_save_exchange(), ask_delete_conversation().
--
-- The statement timeout. `authenticated` carries statement_timeout=8s and so
-- does `authenticator`, the role PostgREST logs in as; `service_role` has
-- none of its own, so a call made with the service key runs under the
-- session's — authenticator's 8s. That is a property of the platform's role
-- settings, not of this function (which cannot bind the statement that is
-- already running): V5 below is the check.
--
-- VERIFIED live after apply (2026-10-12, version 20261013055928):
--   V1 as `authenticated` with JWT claims: ask_run_query, ask_run_team_query
--      and ask_release_question → 42501 each. Through the API with the anon
--      key → 42501.
--   V2 as service_role: p_viewer = a user with 18 personal matches → 18; a
--      user with 1 → 1; a user with none → 0; null → 22004.
--   V3 as service_role: (a member, their program) → 10 matches, 3 players;
--      (a non-member, that program) → 0.
--   V4 through the new door, as a viewer with no matches: claims forged to
--      another user → 0; ask.viewer overwritten → 0; the door called again
--      from inside the query → 42501 permission denied for function
--      ask_run_query.
--   V5 through the API with the service key: a normal count returned in
--      0.5 s; `select pg_sleep(20)` was cancelled with 57014 after 8.1 s —
--      the first time the timeout has been seen on the request path rather
--      than emulated.
--   V6 (rolled back) a user reserved a question as themselves (14 rows →
--      15); as service_role, release naming ANOTHER user → false, 15 rows;
--      naming the owner → true, 14 rows.

drop function if exists public.ask_run_query(text, text);
drop function if exists public.ask_run_team_query(uuid, text, text);
drop function if exists public.ask_release_question(uuid);

create or replace function public.ask_run_query(
  p_viewer uuid,
  scope_sql text,
  sql text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_viewer is null then
    raise exception 'ask_run_query: viewer is required'
      using errcode = 'null_value_not_allowed';
  end if;

  perform pg_catalog.set_config('ask.viewer', p_viewer::text, true);
  perform pg_catalog.set_config('ask.viewer_sig', ask_private.sign(p_viewer), true);
  -- A personal question: no program is selected, whatever the transaction
  -- carried in.
  perform pg_catalog.set_config('ask.program_id', '', true);

  return ask.exec_query(scope_sql, sql);
end
$fn$;

comment on function public.ask_run_query(uuid, text, text) is
  'Server only (service_role). Pins and signs the given viewer and runs a model-written read-only query over schema ask as role ask_reader through ask.exec_query(): {matches, rows}. The route passes the id from its own session check, after the SQL guard.';

create or replace function public.ask_run_team_query(
  p_viewer uuid,
  p_program_id uuid,
  scope_sql text,
  sql text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_viewer is null then
    raise exception 'ask_run_team_query: viewer is required'
      using errcode = 'null_value_not_allowed';
  end if;
  if p_program_id is null then
    raise exception 'ask_run_team_query: program is required'
      using errcode = 'null_value_not_allowed';
  end if;

  perform pg_catalog.set_config('ask.viewer', p_viewer::text, true);
  perform pg_catalog.set_config('ask.viewer_sig', ask_private.sign(p_viewer), true);
  perform pg_catalog.set_config('ask.program_id', p_program_id::text, true);

  return ask.exec_query(scope_sql, sql);
end
$fn$;

comment on function public.ask_run_team_query(uuid, uuid, text, text) is
  'Server only (service_role). ask_run_query for a program: pins the given viewer, selects the program, runs the same guarded read. Membership is tested by ask.my_match_ids() against the pinned viewer; a non-member reads no rows.';

create or replace function public.ask_release_question(
  p_user_id uuid,
  usage_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or usage_id is null then
    raise exception 'ask_release_question: user and usage_id are required'
      using errcode = '22023';
  end if;

  delete from public.ask_usage u
   where u.id = usage_id
     and u.user_id = p_user_id;

  return found;
end;
$$;

comment on function public.ask_release_question(uuid, uuid) is
  'Server only (service_role). Gives back the reservation of a question that failed. The route calls it; a user cannot, or the limit would be theirs to reset.';

-- New functions in public are executable by authenticated and service_role
-- by default (20261001184305): take that back, then grant the one role.
revoke all on function public.ask_run_query(uuid, text, text)
  from public, anon, authenticated, service_role, ask_reader;
revoke all on function public.ask_run_team_query(uuid, uuid, text, text)
  from public, anon, authenticated, service_role, ask_reader;
revoke all on function public.ask_release_question(uuid, uuid)
  from public, anon, authenticated, service_role, ask_reader;

grant execute on function public.ask_run_query(uuid, text, text) to service_role;
grant execute on function public.ask_run_team_query(uuid, uuid, text, text) to service_role;
grant execute on function public.ask_release_question(uuid, uuid) to service_role;

do $$
declare
  fn text;
  who text;
begin
  foreach fn in array array[
    'public.ask_run_query(uuid, text, text)',
    'public.ask_run_team_query(uuid, uuid, text, text)',
    'public.ask_release_question(uuid, uuid)'
  ] loop
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception '% is not executable by service_role', fn;
    end if;
    foreach who in array array['anon', 'authenticated', 'ask_reader'] loop
      if has_function_privilege(who, fn, 'execute') then
        raise exception '% is executable by %', fn, who;
      end if;
    end loop;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
         where p.oid = fn::regprocedure) is distinct from 'postgres' then
      raise exception '% is not owned by postgres', fn;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('ask_run_query', 'ask_run_team_query', 'ask_release_question')
       and p.oid not in (
         'public.ask_run_query(uuid, text, text)'::regprocedure,
         'public.ask_run_team_query(uuid, uuid, text, text)'::regprocedure,
         'public.ask_release_question(uuid, uuid)'::regprocedure
       )
  ) then
    raise exception 'an old signature of an ask function is still there';
  end if;
end
$$;
