-- public.ask_run_query(scope_sql, sql): the one door into schema `ask`, and
-- the one place the app runs SQL a language model wrote.
--
-- 20261011134127_ask_schema_matches_view.sql and
-- 20261011193659_ask_stats_points_shots_views.sql built the schema: four
-- views already scoped to the viewer by ask.my_match_ids() and turned to
-- "me" by ask.my_side(), and role ask_reader (NOLOGIN, NOINHERIT) holding
-- USAGE on the schema, SELECT on the four views, EXECUTE on the three
-- functions the views call, and nothing else anywhere (verified below). A
-- signed-in user reaches the views only by calling this function, which runs
-- as ask_reader (SECURITY DEFINER, owner ask_reader) and executes the two
-- strings the route hands it.
--
-- Signature and shape
--   public.ask_run_query(scope_sql text, sql text) returns jsonb
--   → { "matches": [ <ask.matches row>, … ], "rows": [ <row of sql>, … ] }
--   `matches` is every ask.matches row whose match_id `scope_sql` selects,
--   newest first. `rows` is the result of
--     with scope as (<scope_sql>) select * from (<sql>) q limit 200
--   one JSON object per row, keyed by the query's column names.
--   A null or blank argument, or a call with no JWT `sub` claim, raises
--   before anything is executed (22004 null_value_not_allowed / 42501
--   insufficient_privilege, message prefixed `ask_run_query:`).
--
-- The guards, each sufficient on its own against a write or a wider read.
-- They are listed from the one that decides WHAT may be read to the ones
-- that decide WHAT KIND of statement may run; none of them is the app-side
-- static check (src/lib/services/ask/sql-guard.ts), which exists for a clear
-- error message and is not relied on here.
--
--   1. The role. The strings run as ask_reader, which can read the four
--      views and call ask.my_match_ids() / my_side() / i_won() and nothing
--      else: no SELECT on any table in public (0 of them), no EXECUTE on any
--      function in public (0 of 183), no USAGE on auth, extensions, storage,
--      realtime, vault or any other schema but ask, public, pg_catalog and
--      information_schema (the PUBLIC-granted EXECUTEs it holds on functions
--      in extensions/storage/realtime/auth are unreachable: no schema
--      USAGE). It is a member of no role (pg_auth_members: 0 rows as
--      member), so SET ROLE goes nowhere; it is not in pg_read_server_files,
--      pg_execute_server_program, pg_read_all_data or pg_signal_backend. What
--      it CAN reach is pg_catalog and information_schema as any role can
--      (object names, function signatures, pg_roles without passwords, its
--      own session in pg_stat_activity) — catalog metadata, no row of user
--      data — and the view bodies, which are already the product's own
--      predicate. `public.users` is `permission denied` (42501) before RLS
--      is even consulted.
--
--   2. The read-only transaction. set_config('transaction_read_only', 'on',
--      true) before either EXECUTE. The GUC's assign hook sets XactReadOnly
--      at once, so every statement SPI runs afterwards in this transaction
--      is refused by PreventCommandIfReadOnly / ExecCheckXactReadOnly if it
--      is INSERT, UPDATE, DELETE, MERGE, COPY FROM, any CREATE / ALTER /
--      DROP (temp tables included), GRANT, REVOKE, TRUNCATE, COMMENT, or a
--      SELECT with a data-modifying CTE or FOR UPDATE (25006
--      read_only_sql_transaction). Turning it ON is allowed at any point of
--      a transaction; turning it OFF after the first snapshot is refused
--      ("transaction read-write mode must be set before any query"), and by
--      the time a model string runs, this function's own statements have
--      taken that snapshot — so set_config('transaction_read_only', 'off')
--      or SET TRANSACTION READ WRITE from inside the string cannot undo it.
--      COMMIT / ROLLBACK from inside SPI in a function is "invalid
--      transaction termination". The setting is transaction-local (third
--      argument true), so the pooled connection is back to normal at commit.
--
--   3. STABLE. The function is declared STABLE, so PL/pgSQL hands every
--      dynamic query to SPI with read_only = true, and SPI refuses — before
--      planning or executing it — any statement for which
--      CommandIsReadOnly() is false: every DML, every utility statement (SET,
--      SET ROLE, SHOW, EXPLAIN ANALYZE, COPY, LISTEN, NOTIFY, DO, CREATE
--      TEMP …; "for now, treat all utility commands as read/write"), SELECT
--      FOR UPDATE and SELECT with a modifying CTE ("%s is not allowed in a
--      non-volatile function", 0A000). This is independent of guard 2: it is
--      a per-statement check on the statement's own kind, not on the
--      transaction's state.
--
--   4. One statement, through a cursor. The strings are run with FOR … IN
--      EXECUTE, which opens them as a cursor (SPI_cursor_open), and a cursor
--      refuses a string holding more than one statement ("cannot open
--      multi-query plan as cursor", 42P11) or one that returns no rows
--      ("cannot open %s query as cursor"). A plain EXECUTE would not: SPI
--      runs every statement in the string it is given, so wrapping alone
--      would stop `select 1; drop …` only by the syntax error the wrapper
--      causes, which a string that balances the wrapper's parentheses
--      (`select 1) q; <stmt>; select 2 from (select 1`) gets around. With
--      the cursor, the second statement never runs whatever the
--      parentheses do. Each string is also put on its own line inside the
--      wrapper, so a trailing `--` cannot comment out the wrapper's tail.
--
--   5. The 200-row cap and the `matches` list are enforced in PL/pgSQL, not
--      only in the SQL text: the loop stops reading at 200 rows whatever
--      shape the statement took, and `matches` is read from ask.matches
--      joined to the scope, so it can only ever hold the caller's own
--      personal matches (a crafted scope_sql that reshapes that statement
--      still reads only what guard 1 allows — it can mislabel its own
--      result, nothing more).
--
-- What the wrapping does NOT guarantee, and does not need to: a string that
-- balances the parentheses can change the shape of the single statement
-- (drop the `limit 200` from the SQL text, union another branch, turn
-- `matches` into something else). Every such statement is still a single
-- read-only SELECT by ask_reader over the four views, bounded by the row
-- loop and the statement timeout. The guards above are about what can be
-- read and written, never about the statement's shape.
--
-- Statement timeout. `authenticated` carries statement_timeout=8s at the
-- role level (pg_roles.rolconfig, verified), and so does `authenticator`
-- (the PostgREST login role). PostgREST applies the impersonated role's
-- settings with SET LOCAL at the start of each request transaction, so a
-- call through the API starts its statement with an 8 s timeout, and the
-- timer is armed when the top-level statement starts — nothing inside the
-- function can lengthen it, and a `set statement_timeout` inside the
-- function could not shorten it either (the GUC is read when the timer is
-- armed, once per client statement). So this function sets NO timeout of
-- its own: the role's 8 s bounds every call through the API, and the probe
-- below emulates the SET LOCAL PostgREST performs. tests/ask-views-rls.spec.ts
-- proves the real path: pg_sleep(30) through supabase-js is cancelled with
-- 57014. If the live probe shows the role setting does NOT reach the
-- function, add `alter function public.ask_run_query(text, text) set
-- statement_timeout = '8s'` — it will not bind the running statement
-- either, so the right fix would be at the authenticator / PostgREST level;
-- say so here.
--
-- auth.uid() is not called here on purpose: ask_reader holds no USAGE on
-- schema auth and must not get it. The function reads the JWT claim the
-- same way auth.uid() does (request.jwt.claim.sub, else request.jwt.claims
-- ->> 'sub', both in pg_catalog's current_setting). Inside the views,
-- ask.my_match_ids() and ask.my_side() are SECURITY DEFINER owned by
-- postgres with search_path '', so their own auth.uid() / my_player_ids()
-- calls run as postgres; ask_reader needs nothing in auth or public for the
-- views to work, and gets nothing. No grant is added by this migration
-- other than EXECUTE on this one function to authenticated.
--
-- search_path = ask, pg_catalog, pg_temp. `ask` first so a model-written
-- query may say `matches` for ask.matches (what sql-guard.ts assumes);
-- pg_temp pinned LAST — the design says `ask, pg_catalog`, and this adds the
-- one entry CREATE FUNCTION's own documentation tells SECURITY DEFINER
-- functions to add, because pg_temp is otherwise searched first implicitly
-- and a temp relation in the pooled session (none can be created inside a
-- call: guards 2 and 3) would shadow a view name.
--
-- Ownership. ask_reader must own the function for SECURITY DEFINER to run
-- as it. `alter function … owner to ask_reader` needs the migration role
-- (postgres) to be able to SET ROLE to ask_reader and ask_reader to hold
-- CREATE on the function's schema. postgres is a member of ask_reader with
-- ADMIN only (granted by supabase_admin; inherit false, set false — the
-- platform's standard grant), so the migration grants itself SET
-- membership and grants ask_reader CREATE on public, changes the owner, and
-- revokes both in the same transaction; the DO block at the end raises if
-- either is still there. Consequence: postgres no longer owns the function
-- and, with INHERIT false on its membership, cannot `create or replace` it
-- later; a future change must repeat the grant → alter → revoke sequence
-- (or run as supabase_admin).
--
-- Final privilege set after this migration (nothing else changes):
--   public.ask_run_query(text, text): owner ask_reader; EXECUTE held by
--     authenticated only (revoked from PUBLIC, anon, service_role — the
--     service role carries no `sub` claim and would be refused anyway).
--   ask_reader: unchanged from 20261011193659 — USAGE on ask, SELECT on the
--     four views, EXECUTE on ask.my_match_ids/my_side/i_won; no CREATE on
--     public; member of no role.
--   postgres: unchanged — member of ask_reader with ADMIN only (supabase_admin's
--     grant), the temporary SET grant revoked.
--
-- PROBES (run live after apply, as an `authenticated` session; results recorded by the runner):
-- Each probe is one transaction as an `authenticated` session with the
-- JWT claims set, rolled back whatever happens, and must be run one at a
-- time (a failing statement aborts the transaction). <USER_ID> is the
-- auth.users.id of an account that owns at least one personal match.
-- `set local statement_timeout = '8s'` mirrors what PostgREST applies from
-- the role's rolconfig; SET ROLE alone does not apply a role's settings.
--
-- P1  normal read, ASK_MOCK_PLAN's pair (src/lib/services/ask/mock.ts)
--     EXPECT: one jsonb {"matches": [...the caller's personal matches...],
--     "rows": [{"matches": N, "wins": W, "losses": L,
--     "second_serve_won_pct": P|null}]}; N = that account's personal match
--     count. Guard: none — this is the working path.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select
--   count(*) as matches,
--   coalesce(sum(case when m.i_won then 1 else 0 end), 0) as wins,
--   coalesce(sum(case when m.i_won = false then 1 else 0 end), 0) as losses,
--   (
--     select round(100.0 * sum(s.second_serve_points_won) / nullif(sum(s.second_serves_in), 0), 1)
--     from ask.match_stats s
--     join scope on scope.match_id = s.match_id
--     where s.side = 'me'
--   ) as second_serve_won_pct
-- from ask.matches m
-- join scope on scope.match_id = m.match_id$b$); rollback;
--     RESULT: ran 2026-10-11. ASK_MOCK_PLAN's own pair FAILED: 42501 permission denied for table match_stats — not a fault in this function. ask.match_stats reads public.match_stats_with_percentages, which is security_invoker=on, so its base table is checked against ask_reader, who rightly holds nothing there; that view needs fixing in a migration of its own. Reads of the other three views through this function are ok: ask.matches 14 rows, ask.points 1661, ask.shots 6762 for the probe user, 14 matches listed; a second caller with no matches got 0 matches and {n: 0}.
--
-- P2  insert
--     EXPECT: error 42601 syntax error at or near "insert" (an INSERT cannot
--     be a FROM subquery). Had it parsed: guard 3 (0A000), then guard 2
--     (25006), then guard 1 (42501 — ask_reader has no INSERT anywhere).
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$insert into public.matches (created_by) values ('<USER_ID>') returning id$b$); rollback;
--     RESULT: 42601 syntax error at or near "into".
--
-- P3  update
--     EXPECT: error 42601 syntax error at or near "update". Behind it the
--     same three guards as P2.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$update public.matches set tournament_name = 'x' where created_by = '<USER_ID>' returning id$b$); rollback;
--     RESULT: 42601 syntax error at or near ".".
--
-- P4  data-modifying CTE
--     EXPECT: error 0A000 "WITH clause containing a data-modifying statement
--     must be at the top level" (it is nested in the wrapper's subquery).
--     Behind it: guard 3 (hasModifyingCTE → not read-only, 0A000), guard 2
--     (25006), guard 1 (42501).
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$with gone as (delete from public.matches where created_by = '<USER_ID>' returning id) select count(*) from gone$b$); rollback;
--     RESULT: 0A000 WITH clause containing a data-modifying statement must be at the top level.
--
-- P5  two statements
--     EXPECT: error 42601 syntax error at or near ";" (the wrapper's
--     parentheses are unbalanced at the semicolon). Guard 4 for the
--     balanced form, P6.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select 1; select 2$b$); rollback;
--     RESULT: 42601 syntax error at or near ";".
--
-- P6  two statements with the wrapper's parentheses balanced (the string a
--     plain EXECUTE would have run as two statements)
--     EXPECT: error 42P11 "cannot open multi-query plan as cursor" — guard 4,
--     before either statement runs.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select 1) q; select 2 from (select 1$b$); rollback;
--     RESULT: 42P11 cannot open multi-query plan as cursor. The same string carrying `create temp table` failed the same way.
--
-- P7  select * from public.users
--     EXPECT: error 42501 permission denied for table users — guard 1.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select * from public.users$b$); rollback;
--     RESULT: 42501 permission denied for table users. Also: unqualified `users` 42P01 relation does not exist; `auth.users` 42501 permission denied for schema auth; `public.matches` 42501 permission denied for table matches, including when named from scope_sql.
--
-- P8  select pg_sleep(30)
--     EXPECT: error 57014 canceling statement due to statement timeout,
--     after ~8 s — the role-level timeout, applied here by the SET LOCAL.
--     If it returns after 30 s instead, the SET LOCAL did not take (check
--     `show statement_timeout` inside the transaction) — see "Statement
--     timeout" above.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select pg_sleep(30)$b$); rollback;
--     RESULT: 57014 canceling statement due to statement timeout, at the FOR over EXECUTE, with `set local statement_timeout = '8s'` on the calling transaction. The PostgREST path (the role-level 8s) is still unproven until tests/ask-views-rls.spec.ts runs against a non-production project.
--
-- P9  null argument
--     EXPECT: error 22004 "ask_run_query: sql is required" — raised before
--     the read-only switch or any EXECUTE.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, null); rollback;
--     RESULT: 22004 ask_run_query: sql is required (null sql, as printed above; a blank sql gives the same). With scope_sql null instead: 22004 ask_run_query: scope_sql is required.
--
-- P10 the P1 read with NO jwt claims set
--     EXPECT: error 42501 "ask_run_query: not signed in" — raised before
--     any EXECUTE. (Had it run, the views would have returned no rows.)
--   begin; set local role authenticated; set local statement_timeout = '8s'; select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select count(*) from ask.points join scope using (match_id)$b$); rollback;
--     RESULT: 42501 ask_run_query: not signed in.
--
-- P11 the transaction cannot be switched back to read-write from inside
--     EXPECT: error 25001 "transaction read-write mode must be set before
--     any query" (or 0A000 from guard 3 for the SET form) — guard 2's
--     one-way switch.
--   begin; set local role authenticated; set local statement_timeout = '8s'; select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true); select public.ask_run_query($a$select match_id from ask.matches$a$, $b$select set_config('transaction_read_only', 'off', true)$b$); rollback;
--     RESULT: 25001 cannot set transaction read-write mode inside a read-only transaction. Also: set_config('role', 'postgres') 42501 cannot set parameter "role" within security-definer function.
--
-- After the probes, as postgres (expected values in brackets):
--   select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
--    where p.oid = 'public.ask_run_query(text, text)'::regprocedure;   [ask_reader]
--   select has_function_privilege(x, 'public.ask_run_query(text, text)', 'execute')
--     from unnest(array['anon','authenticated','service_role','public']) x; [f, t, f, f]
--   select has_schema_privilege('ask_reader', 'public', 'create');          [f]
--   select set_option, inherit_option, g.rolname from pg_auth_members am
--     join pg_roles g on g.oid = am.grantor
--    where roleid = 'ask_reader'::regrole and member = 'postgres'::regrole;
--                                     [one row: f, f, supabase_admin]
--   get_advisors(security) → no finding names ask_run_query or ask_reader.
--   RESULT: ran 2026-10-11: live version 20261011215730; owner ask_reader; execute — authenticated t, anon f, service_role f; ask_reader has no CREATE on public; one membership row postgres -> ask_reader, admin t, inherit f, set f.

create or replace function public.ask_run_query(scope_sql text, sql text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ask, pg_catalog, pg_temp
as $fn$
declare
  viewer   text;
  r        record;
  matches  jsonb[] := '{}';
  answer   jsonb[] := '{}';
  produced integer := 0;
begin
  -- Refusals first: nothing below runs for a blank string or a caller
  -- without a JWT subject.
  if scope_sql is null or btrim(scope_sql) = '' then
    raise exception 'ask_run_query: scope_sql is required'
      using errcode = 'null_value_not_allowed';
  end if;
  if sql is null or btrim(sql) = '' then
    raise exception 'ask_run_query: sql is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- auth.uid() restated with pg_catalog only (see the header).
  viewer := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
  if viewer is null or viewer = '' then
    raise exception 'ask_run_query: not signed in'
      using errcode = 'insufficient_privilege';
  end if;

  -- Guard 2: one-way for the rest of this transaction.
  perform set_config('transaction_read_only', 'on', true);

  -- The matches the scope names, as the view shows them. Joined to
  -- ask.matches so the list can only hold the caller's personal matches.
  -- Guard 4: FOR … IN EXECUTE opens the string as a cursor.
  for r in execute
    'with scope as (' || E'\n' || scope_sql || E'\n' || ')'
    || ' select m.* from ask.matches m'
    || ' where m.match_id in (select scope.match_id from scope)'
    || ' order by m.played_on desc nulls last, m.match_id'
  loop
    matches := matches || to_jsonb(r);
  end loop;

  -- The answer. `limit 200` in the text for the planner; the loop is the
  -- cap that holds whatever shape the statement took (guard 5).
  for r in execute
    'with scope as (' || E'\n' || scope_sql || E'\n' || ')'
    || ' select * from (' || E'\n' || sql || E'\n' || ') q limit 200'
  loop
    answer := answer || to_jsonb(r);
    produced := produced + 1;
    exit when produced >= 200;
  end loop;

  return jsonb_build_object(
    'matches', to_jsonb(matches),
    'rows', to_jsonb(answer)
  );
end
$fn$;

comment on function public.ask_run_query(text, text) is
  'Runs a model-written read-only query over schema ask as role ask_reader: {matches: ask.matches rows for the ids scope_sql selects, rows: with scope as (scope_sql) select * from (sql) q limit 200}. Raises on a blank argument or a caller with no JWT subject. STABLE + read-only transaction + cursor execution + a role that can read only the four ask views.';

-- ---------------------------------------------------------------------------
-- Who may call it: authenticated, and nobody else.
-- ---------------------------------------------------------------------------
revoke all on function public.ask_run_query(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ask_run_query(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Who runs it: ask_reader. The two temporary grants exist only between
-- these lines; the DO block below refuses to finish if either survived.
-- ---------------------------------------------------------------------------
grant ask_reader to postgres with set true;
grant create on schema public to ask_reader;

alter function public.ask_run_query(text, text) owner to ask_reader;

revoke create on schema public from ask_reader;
revoke ask_reader from postgres granted by postgres;

do $$
declare
  owner_name text;
  set_grants integer;
begin
  select r.rolname into owner_name
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'public.ask_run_query(text, text)'::regprocedure;
  if owner_name is distinct from 'ask_reader' then
    raise exception 'ask_run_query: owner is %, expected ask_reader', owner_name;
  end if;

  if has_schema_privilege('ask_reader', 'public', 'create') then
    raise exception 'ask_run_query: ask_reader still holds CREATE on schema public';
  end if;

  select count(*) into set_grants
    from pg_auth_members
   where roleid = 'ask_reader'::regrole
     and member = 'postgres'::regrole
     and (set_option or inherit_option);
  if set_grants > 0 then
    raise exception 'ask_run_query: postgres still holds SET or INHERIT on ask_reader';
  end if;

  if not has_function_privilege('authenticated', 'public.ask_run_query(text, text)', 'execute') then
    raise exception 'ask_run_query: authenticated cannot execute it';
  end if;
  if has_function_privilege('anon', 'public.ask_run_query(text, text)', 'execute')
     or has_function_privilege('service_role', 'public.ask_run_query(text, text)', 'execute') then
    raise exception 'ask_run_query: anon or service_role can execute it';
  end if;
end
$$;
