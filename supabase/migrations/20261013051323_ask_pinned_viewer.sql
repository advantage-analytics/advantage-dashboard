-- Ask: the viewer is pinned and signed before any model-written SQL runs.
--
-- THE HOLE THIS CLOSES (found by the pre-merge access review, reproduced live
-- and rolled back on 2026-10-12). The four `ask` views decide whose rows to
-- show by calling auth.uid() — through ask.my_match_ids(), ask.my_side(),
-- public.my_player_ids() and public.user_program_role() — and auth.uid()
-- reads the settings request.jwt.claims / request.jwt.claim.sub every time it
-- is called. public.ask_run_query() checked that setting once, at entry, and
-- then executed the caller's SQL as ask_reader. That SQL can call
-- pg_catalog.set_config() (executable by PUBLIC; the read-only transaction,
-- STABLE and the cursor do not stop a function call inside a SELECT), so one
-- statement could overwrite request.jwt.claims with another user's id and
-- then read the views as that user:
--
--   select (select set_config('request.jwt.claims',
--                             '{"sub":"<victim>"}', true) is not null),
--          (select count(*) from ask.matches)
--
-- returned the victim's 18 personal matches to a caller who has none. With
-- ask.program_id set as well, the same reaches any program. The function is
-- callable directly by any signed-in user, so the route's static check was
-- never in the way. 20261011215730's header ("each guard sufficient on its
-- own against a wider read") and 20261012170339's ("membership is tested
-- against auth.uid()") were both wrong about this: the test was only as
-- strong as a setting the tested code could write.
--
-- THE FIX. Identity is read once, by a function the model's SQL cannot call,
-- and carried in a form it cannot forge.
--
--   public.ask_run_query / ask_run_team_query   now owned by postgres. They
--       read auth.uid() at entry — before any caller-supplied SQL exists in
--       the transaction — and pin it: ask.viewer = the id, ask.viewer_sig =
--       a keyed hash of the id, this backend's pid and this transaction's
--       start time, under a key only postgres-owned functions can read. Then
--       they hand the two strings to ask.exec_query().
--   ask.exec_query(scope_sql, sql)              the old body of
--       ask_run_query: owned by ask_reader, so the strings still run as the
--       role that can read four views and nothing else, read-only, through
--       a cursor, capped at 200 rows. Executable by postgres only.
--   ask.viewer()                                the pinned id, or null unless
--       the signature verifies. Every `ask` function that asked "who is
--       this?" now asks this, never auth.uid().
--
-- What the model's SQL can still do, and why it no longer matters: it can
-- overwrite request.jwt.claims (nothing in schema ask reads it any more); it
-- can overwrite ask.viewer and ask.viewer_sig (a changed id no longer matches
-- its signature, so ask.viewer() is null and every view is empty); it can
-- read its own signature (valid for its own id, in this transaction, on this
-- backend, and nothing else). It cannot produce a signature for another id:
-- ask_reader holds no privilege on schema ask_private, the key, or
-- ask_private.sign(). It cannot re-pin: ask_reader cannot execute the two
-- public functions, which are the only callers of the signer.
--
-- public.my_player_ids() and public.user_program_role() are NOT changed —
-- they serve RLS for the whole app, where auth.uid() is the right question.
-- The `ask` functions simply stop calling them and restate the two rules
-- against the pinned id.
--
-- Also here: public.ask_release_question() refused nothing but another
-- user's row, so a caller could release the reservation of a question that
-- had been answered and never run out. It now refuses once an answer has
-- been saved after the reservation was made. (A release raced against a
-- still-streaming answer is not closed by this; it would need the save and
-- the reservation tied together.)
--
-- VERIFIED live after apply (2026-10-12, version 20261013051323), each probe
-- rolled back, as `authenticated` sessions with the JWT claims set:
--   V1 the forgery, in both shapes that had returned the victim's 18
--      matches, as a user with no matches → matches seen 0 (the set_config
--      still succeeds; nothing reads what it wrote).
--   V2 claims forged to a member of a program AND ask.program_id pointed at
--      that program, by a non-member → 0.
--   V3 ask.viewer overwritten with another id, keeping the caller's own
--      signature → 0; with a made-up signature → 0; claims forged and the
--      public door called again from inside the query to re-pin → 42501
--      permission denied for function ask_run_query.
--   V4 unchanged: the victim reading their own → 18 matches, 18 'me'
--      statistics rows, 2310 points; a program owner's personal scope → 1;
--      their team scope → 10 matches under three roster names (1, 3, 6), 10
--      'me' and 10 'opponent' statistics rows, 1183 points, 7995 shots; a
--      member's direct ask.my_side() on a roster id → 'player1'; a
--      non-member's team scope → 0.
--   V5 ask_reader cannot execute public.ask_run_query,
--      public.ask_run_team_query or ask_private.sign, holds no USAGE on
--      ask_private and no SELECT on the key; authenticated cannot execute
--      ask.exec_query or ask.viewer and holds no USAGE on ask_private, and
--      can execute the two public functions; anon and service_role cannot;
--      owners postgres / postgres / ask_reader. No JWT → 42501; a null
--      program → 22004.
--   V6 ask_release_question on the row of an answered question → false, row
--      kept (12 before, 12 after); on a fresh reservation → true.
--
-- A note for the next change to these functions: the first attempt at this
-- migration failed and rolled back on `grant execute on ask.exec_query to
-- postgres` placed after the temporary membership was revoked — once the
-- function is ask_reader's, only its owner can grant on it. And a plain
-- `revoke … from authenticated` on a function ask_reader owns is a silent
-- no-op when run as postgres: take ownership first.

-- ---------------------------------------------------------------------------
-- The key. One row, random at creation, readable by its owner alone.
-- ---------------------------------------------------------------------------
create schema if not exists ask_private;
revoke all on schema ask_private from public, anon, authenticated, ask_reader;

create table if not exists ask_private.pin_key (
  only_row boolean primary key default true check (only_row),
  key bytea not null
);

alter table ask_private.pin_key enable row level security;
revoke all on ask_private.pin_key from public, anon, authenticated, ask_reader;

insert into ask_private.pin_key (key)
select sha256(
         convert_to(
           gen_random_uuid()::text || gen_random_uuid()::text
           || gen_random_uuid()::text || gen_random_uuid()::text,
           'utf8'))
on conflict (only_row) do nothing;

comment on table ask_private.pin_key is
  'The key ask_private.sign() hashes with. One row. No policy and no grant: read only by functions owned by postgres.';

-- ---------------------------------------------------------------------------
-- The signature: the id, bound to this backend and this transaction, so a
-- value seen in one request is worthless in another.
-- ---------------------------------------------------------------------------
create or replace function ask_private.sign(p_viewer uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
           pg_catalog.sha256(
             k.key
             || pg_catalog.convert_to(
                  p_viewer::text
                  || '|' || pg_catalog.pg_backend_pid()::text
                  || '|' || pg_catalog.transaction_timestamp()::text,
                  'utf8')
             || k.key),
           'hex')
    from ask_private.pin_key k;
$$;

revoke all on function ask_private.sign(uuid) from public, anon, authenticated, ask_reader;

-- ---------------------------------------------------------------------------
-- Who is asking: the pinned id, if its signature verifies.
-- ---------------------------------------------------------------------------
create or replace function ask.viewer()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when pg_catalog.current_setting('ask.viewer', true)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     and pg_catalog.current_setting('ask.viewer_sig', true)
         = ask_private.sign(pg_catalog.current_setting('ask.viewer', true)::uuid)
    then pg_catalog.current_setting('ask.viewer', true)::uuid
    else null
  end;
$$;

comment on function ask.viewer() is
  'The viewer pinned by public.ask_run_query / ask_run_team_query, or null unless ask.viewer_sig is ask_private.sign() of it. Schema ask asks this, never auth.uid(): the request''s JWT settings can be overwritten by the SQL the views are read from.';

revoke all on function ask.viewer() from public, anon, authenticated, ask_reader;

-- Membership of the selected program, by the pinned id.
create or replace function ask.viewer_is_member(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.program_members pm
     where pm.program_id = p_program_id
       and pm.user_id = (select ask.viewer())
  );
$$;

comment on function ask.viewer_is_member(uuid) is
  'public.user_program_role(p) is not null, restated for the pinned viewer.';

revoke all on function ask.viewer_is_member(uuid) from public, anon, authenticated, ask_reader;

-- The ids that are "me": public.my_player_ids(), restated for the pinned id.
create or replace function ask.viewer_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select ask.viewer())
   where (select ask.viewer()) is not null
  union
  select pp.id
    from public.program_players pp
   where pp.claimed_by_user_id = (select ask.viewer())
     and pp.merged_into_id is null;
$$;

comment on function ask.viewer_player_ids() is
  'public.my_player_ids() restated for the pinned viewer: the login, and every live roster profile it has claimed.';

revoke all on function ask.viewer_player_ids() from public, anon, authenticated, ask_reader;

-- ---------------------------------------------------------------------------
-- The three functions that asked auth.uid(), asking ask.viewer() instead.
-- Bodies otherwise as 20261012223023 left them.
-- ---------------------------------------------------------------------------
create or replace function ask.my_match_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.matches m
   where (select ask.viewer()) is not null
     and case
       when (select ask.scope_program_id()) is null then
         m.created_by = (select ask.viewer())
         and m.program_id is null
       else
         m.program_id = (select ask.scope_program_id())
         and (select ask.viewer_is_member((select ask.scope_program_id())))
     end;
$$;

comment on function ask.my_match_ids() is
  'For the pinned viewer (ask.viewer()). Personal scope: restates getPersonalMatches() (created_by = viewer and program_id is null). Program scope: that program''s matches, only when the viewer is a member of it. Empty when no viewer is pinned.';

create or replace function ask.my_side(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select ask.viewer()) is null then null
    when (select ask.scope_program_id()) is not null then
      case
        when not (select ask.viewer_is_member((select ask.scope_program_id()))) then null
        when m.program_id is distinct from (select ask.scope_program_id()) then null
        when m.player1_id is not null and ask.on_roster(m.program_id, m.player1_id) then 'player1'
        when m.player2_id is not null and ask.on_roster(m.program_id, m.player2_id) then 'player2'
        when m.event_entry_id is not null then 'player1'
        else null
      end
    when m.player1_id is not null
     and m.player1_id in (select ask.viewer_player_ids()) then 'player1'
    when m.player2_id is not null
     and m.player2_id in (select ask.viewer_player_ids()) then 'player2'
    when m.player1_id is null
     and m.player2_id is null
     and m.created_by = (select ask.viewer()) then 'player1'
    else null
  end;
$$;

comment on function ask.my_side(public.matches) is
  'For the pinned viewer. Personal scope: restates playerSide() (src/lib/data/player-identity-server.ts). Program scope, for a member only: restates programSide() (src/lib/data/program-side.ts). Null when no viewer is pinned or the viewer is not a member.';

create or replace function ask.side_player_name(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with seat as (
    select case ask.my_side(m)
             when 'player1' then m.player1_id
             when 'player2' then m.player2_id
           end as id,
           case ask.my_side(m)
             when 'player1' then m.player1_name
             when 'player2' then m.player2_name
           end as stored_name
  )
  select coalesce(
    (
      select nullif(btrim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '')
        from public.program_players pp
       where (select ask.scope_program_id()) is not null
         and (select ask.viewer_is_member((select ask.scope_program_id())))
         and pp.program_id = (select ask.scope_program_id())
         and pp.program_id = m.program_id
         and pp.merged_into_id is null
         and pp.archived_at is null
         and (pp.id = seat.id or pp.claimed_by_user_id = seat.id)
       order by (pp.id = seat.id) desc
       limit 1
    ),
    seat.stored_name
  )
  from seat;
$$;

-- ---------------------------------------------------------------------------
-- The executor: the old body of public.ask_run_query, with the JWT check
-- gone (the caller has already pinned the viewer) and nothing else changed.
-- ---------------------------------------------------------------------------
create or replace function ask.exec_query(scope_sql text, sql text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ask, pg_catalog, pg_temp
as $fn$
declare
  r        record;
  matches  jsonb[] := '{}';
  answer   jsonb[] := '{}';
  produced integer := 0;
begin
  if scope_sql is null or btrim(scope_sql) = '' then
    raise exception 'ask_run_query: scope_sql is required'
      using errcode = 'null_value_not_allowed';
  end if;
  if sql is null or btrim(sql) = '' then
    raise exception 'ask_run_query: sql is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- One-way for the rest of this transaction.
  perform set_config('transaction_read_only', 'on', true);

  for r in execute
    'with scope as (' || E'\n' || scope_sql || E'\n' || ')'
    || ' select m.* from ask.matches m'
    || ' where m.match_id in (select scope.match_id from scope)'
    || ' order by m.played_on desc nulls last, m.match_id'
  loop
    matches := matches || to_jsonb(r);
  end loop;

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

comment on function ask.exec_query(text, text) is
  'Runs two caller-supplied strings as ask_reader: read-only transaction, cursor execution, 200 rows. Called only by public.ask_run_query / ask_run_team_query, after they have pinned the viewer.';

revoke all on function ask.exec_query(text, text) from public, anon, authenticated;

-- Owned by ask_reader so the strings run as ask_reader; and the two public
-- functions taken back from ask_reader. The temporary grants exist only
-- between these lines; the DO block at the end refuses to finish otherwise.
grant ask_reader to postgres with set true, inherit true;
grant create on schema ask to ask_reader;

alter function ask.exec_query(text, text) owner to ask_reader;
alter function public.ask_run_query(text, text) owner to postgres;
alter function public.ask_run_team_query(uuid, text, text) owner to postgres;

-- While postgres still acts as ask_reader: once the function is ask_reader's,
-- only its owner can grant on it.
grant execute on function ask.exec_query(text, text) to postgres;

revoke create on schema ask from ask_reader;
revoke ask_reader from postgres granted by postgres;

-- ---------------------------------------------------------------------------
-- The two doors: read the caller once, pin, select the scope, execute.
-- ---------------------------------------------------------------------------
create or replace function public.ask_run_query(scope_sql text, sql text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    raise exception 'ask_run_query: not signed in'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.set_config('ask.viewer', viewer::text, true);
  perform pg_catalog.set_config('ask.viewer_sig', ask_private.sign(viewer), true);
  -- A personal question: no program is selected, whatever the transaction
  -- carried in.
  perform pg_catalog.set_config('ask.program_id', '', true);

  return ask.exec_query(scope_sql, sql);
end
$fn$;

comment on function public.ask_run_query(text, text) is
  'Pins the caller (auth.uid(), read once, signed) and runs a model-written read-only query over schema ask as role ask_reader through ask.exec_query(): {matches, rows}. Raises for a caller who is not signed in or a blank argument.';

create or replace function public.ask_run_team_query(
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
declare
  viewer uuid := (select auth.uid());
begin
  if p_program_id is null then
    raise exception 'ask_run_team_query: program is required'
      using errcode = 'null_value_not_allowed';
  end if;
  if viewer is null then
    raise exception 'ask_run_team_query: not signed in'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.set_config('ask.viewer', viewer::text, true);
  perform pg_catalog.set_config('ask.viewer_sig', ask_private.sign(viewer), true);
  perform pg_catalog.set_config('ask.program_id', p_program_id::text, true);

  return ask.exec_query(scope_sql, sql);
end
$fn$;

comment on function public.ask_run_team_query(uuid, text, text) is
  'ask_run_query for a program: pins the caller, selects the program, runs the same guarded read. Membership is tested by ask.my_match_ids() against the pinned viewer; a non-member reads no rows.';

revoke all on function public.ask_run_query(text, text)
  from public, anon, authenticated, service_role, ask_reader;
revoke all on function public.ask_run_team_query(uuid, text, text)
  from public, anon, authenticated, service_role, ask_reader;
grant execute on function public.ask_run_query(text, text) to authenticated;
grant execute on function public.ask_run_team_query(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A reservation can be given back until its question has been answered.
-- ---------------------------------------------------------------------------
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

  delete from public.ask_usage u
   where u.id = usage_id
     and u.user_id = v_user
     -- An answer saved since the reservation was made is that question's:
     -- it has been spent.
     and not exists (
       select 1 from public.ask_messages m
        where m.user_id = v_user
          and m.role = 'assistant'
          and m.created_at >= u.created_at
     );

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Two cascading foreign keys had no index leading on them: deleting a user or
-- a program would scan the whole table to find the rows to remove.
-- ---------------------------------------------------------------------------
create index if not exists ask_messages_user_idx
  on public.ask_messages (user_id);
create index if not exists ask_conversations_program_idx
  on public.ask_conversations (program_id)
  where program_id is not null;

-- ---------------------------------------------------------------------------
-- Refuse to finish in any state but the intended one.
-- ---------------------------------------------------------------------------
do $$
declare
  leftover integer;
begin
  if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
       where p.oid = 'ask.exec_query(text, text)'::regprocedure) is distinct from 'ask_reader' then
    raise exception 'ask.exec_query is not owned by ask_reader';
  end if;
  if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
       where p.oid = 'public.ask_run_query(text, text)'::regprocedure) is distinct from 'postgres'
     or (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
          where p.oid = 'public.ask_run_team_query(uuid, text, text)'::regprocedure) is distinct from 'postgres' then
    raise exception 'the public ask functions are not owned by postgres';
  end if;

  if has_function_privilege('ask_reader', 'public.ask_run_query(text, text)', 'execute')
     or has_function_privilege('ask_reader', 'public.ask_run_team_query(uuid, text, text)', 'execute')
     or has_function_privilege('ask_reader', 'ask_private.sign(uuid)', 'execute')
     or has_schema_privilege('ask_reader', 'ask_private', 'usage')
     or has_table_privilege('ask_reader', 'ask_private.pin_key', 'select') then
    raise exception 'ask_reader can reach the pin: it must not';
  end if;
  if has_function_privilege('authenticated', 'ask.exec_query(text, text)', 'execute')
     or has_function_privilege('anon', 'public.ask_run_query(text, text)', 'execute')
     or has_function_privilege('anon', 'public.ask_run_team_query(uuid, text, text)', 'execute')
     or has_schema_privilege('authenticated', 'ask_private', 'usage') then
    raise exception 'a client role can reach the executor or the key';
  end if;
  if not has_function_privilege('authenticated', 'public.ask_run_query(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.ask_run_team_query(uuid, text, text)', 'execute') then
    raise exception 'authenticated cannot call the public ask functions';
  end if;

  if has_schema_privilege('ask_reader', 'ask', 'create')
     or has_schema_privilege('ask_reader', 'public', 'create') then
    raise exception 'ask_reader still holds CREATE on a schema';
  end if;
  select count(*) into leftover
    from pg_auth_members
   where roleid = 'ask_reader'::regrole
     and member = 'postgres'::regrole
     and (set_option or inherit_option);
  if leftover > 0 then
    raise exception 'postgres still holds SET or INHERIT on ask_reader';
  end if;
  if (select count(*) from ask_private.pin_key) <> 1 then
    raise exception 'ask_private.pin_key does not hold exactly one row';
  end if;
end
$$;
