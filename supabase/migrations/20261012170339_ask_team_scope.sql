-- Team Ask: the same four `ask` views, read for a program instead of for one
-- player.
--
-- The personal Ask page reads schema `ask` through two rules, each stated
-- once: ask.my_match_ids() (whose matches) and ask.my_side() (which side is
-- "me"). Every view hangs off those two functions. This migration gives both
-- a second branch, chosen by a transaction-local setting, `ask.program_id`:
--
--   unset           → exactly what they returned before: the caller's
--                     personal matches, turned to the caller.
--   a program's id  → that program's matches, turned to the program's own
--                     player — and ONLY when the caller is a member of that
--                     program (public.user_program_role() is not null), the
--                     same test the `matches` RLS policy and
--                     public.visible_match_ids() apply.
--
-- THE SETTING IS A SELECTOR, NOT A PERMISSION. Any SQL that runs through
-- public.ask_run_query can call set_config('ask.program_id', …) itself — a
-- signed-in user can call that function with any string — so nothing trusts
-- the value. The membership test is inside ask.my_match_ids(), evaluated
-- against auth.uid() when the rows are read: naming a program the caller does
-- not belong to returns no rows, and naming one they do belong to returns
-- what RLS already lets them read from public.matches. A value that is not a
-- uuid is treated as unset.
--
-- So the views, their grants and role ask_reader are unchanged. What is new:
--
--   ask.scope_program_id()        the setting as a uuid, or null.
--   ask.my_match_ids()            replaced: the two branches above.
--   ask.on_roster(program, id)   rosterMatchIds(): a roster profile of the
--                                 program or a member's login.
--   ask.my_side(public.matches)   replaced: in a program scope, programSide()
--                                 from team-home-server.ts — the seat holding
--                                 a roster id, else player 1 for a match hung
--                                 on a schedule entry; never the caller's own
--                                 seat. Null when neither applies — the match then has no
--                                 row in match_stats / points / shots, as for
--                                 a personal match whose side is unknown.
--   ask.side_player_name(m)       the name of the player the rows are turned
--                                 to: the roster's first and last name in a
--                                 program scope (one spelling per player,
--                                 whatever was typed at upload), else the
--                                 name on the match.
--   ask.matches.player_name       new last column, from the function above.
--                                 A coach's question is usually about one
--                                 player; this is the column that says whose
--                                 match a row is. (create or replace view may
--                                 only append columns, which is why it is
--                                 last.)
--   public.ask_run_team_query(p_program_id, scope_sql, sql)
--                                 sets `ask.program_id` for the transaction
--                                 and returns public.ask_run_query(scope_sql,
--                                 sql). SECURITY DEFINER, owned by ask_reader
--                                 like the function it calls, EXECUTE to
--                                 authenticated only. It refuses a caller who
--                                 is not signed in or a null program; it does
--                                 not test membership (it cannot — ask_reader
--                                 may call nothing in public or auth), and
--                                 does not need to: see above.
--
-- Who may ask about a program: any member, whatever their role. That is not a
-- new decision — a `player` member can already read every match of their
-- program (matches policy "Users can read matches they created or played
-- in"). The page may narrow it further; the database does not widen it.
--
-- opponent_hand / opponent_backhand stay as stored. On a program match they
-- describe the side that is not the uploader's player, which on every program
-- match in the live database (29 of 29, 2026-10-12) is player 2, the
-- opponent, with the roster player as player 1.
--
-- VERIFIED live after apply (2026-10-12, version 20261012170339), through the
-- two functions as `authenticated` sessions with the JWT claims set, rolled
-- back:
--   T1 a program's owner, team scope: ask_run_team_query(<program>, 'select
--      match_id from ask.matches', 'select player_name, count(*) … group by
--      1') → 10 matches, the same as public.matches where program_id = it,
--      grouped under three roster names (6, 3 and 1); all 10 has_stats.
--   T2 the same caller, personal scope (ask_run_query, setting cleared) →
--      their 1 personal match, none of the program's.
--   T3 a non-member, team scope → {"matches": [], "rows": [{"n": 0}]}.
--   T4 the member calling with their program, sql = select set_config(
--      'ask.program_id', '<another program with matches>', true), (select
--      count(*) from ask.matches) → n = 0: switching the selector reads
--      nothing of a program the caller is not in.
--   T6 ask.match_stats in team scope: 10 rows side = 'me', 10 side =
--      'opponent'; ask.points 1183 rows, ask.shots 7995.
--   As postgres: ask_run_team_query owner ask_reader; EXECUTE authenticated
--   t, anon f, service_role f; ask_save_exchange(uuid, jsonb, jsonb, uuid)
--   authenticated t, anon f; ask_reader has no CREATE on public; postgres
--   holds neither SET nor INHERIT on ask_reader; no function in schema ask is
--   executable by authenticated or anon.
--   NOT run: T5 — ask_run_team_query(null, …) → 22004, and no JWT → 42501.

-- ---------------------------------------------------------------------------
-- The selector. Plain SQL over pg_catalog; no privilege of its own.
-- ---------------------------------------------------------------------------
create or replace function ask.scope_program_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when pg_catalog.current_setting('ask.program_id', true)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then pg_catalog.current_setting('ask.program_id', true)::uuid
    else null
  end;
$$;

comment on function ask.scope_program_id() is
  'The program a team Ask question is scoped to: the transaction-local setting ask.program_id as a uuid, or null for a personal question. A selector only — ask.my_match_ids() tests membership.';

-- ---------------------------------------------------------------------------
-- Whose matches. Personal: getPersonalMatches(). Program: the matches of the
-- selected program, for a member of it.
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
   where case
     when (select ask.scope_program_id()) is null then
       m.created_by = (select auth.uid())
       and m.program_id is null
     else
       m.program_id = (select ask.scope_program_id())
       and (select public.user_program_role((select ask.scope_program_id()))) is not null
   end;
$$;

comment on function ask.my_match_ids() is
  'Personal scope: restates getPersonalMatches() (created_by = auth.uid() and program_id is null). Program scope (ask.scope_program_id() set): that program''s matches, only when the caller is a member of it (user_program_role is not null).';

-- ---------------------------------------------------------------------------
-- A roster id: rosterMatchIds() in src/lib/data/roster-ids.ts. matches.
-- player1_id holds two id spaces (a program_players.id or an auth user id),
-- so both count: a roster profile of the program, or a member's own login —
-- staff included, because a coach uploading without a schedule preset lands
-- their own user id in player1_id and that is still the program's side.
-- ---------------------------------------------------------------------------
create or replace function ask.on_roster(p_program_id uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.program_players pp
            where pp.program_id = p_program_id and pp.id = p_id
         )
      or exists (
           select 1 from public.program_members pm
            where pm.program_id = p_program_id and pm.user_id = p_id
         );
$$;

comment on function ask.on_roster(uuid, uuid) is
  'Restates rosterMatchIds() (src/lib/data/roster-ids.ts): true when the id is a roster profile of the program or the login of one of its members.';

revoke all on function ask.on_roster(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Which side the rows are turned to. Personal: playerSide(). Program: the
-- seat held by one of the program's roster players.
-- ---------------------------------------------------------------------------
create or replace function ask.my_side(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select ask.scope_program_id()) is not null then
      case
        when m.program_id is distinct from (select ask.scope_program_id()) then null
        when m.player1_id is not null and ask.on_roster(m.program_id, m.player1_id) then 'player1'
        when m.player2_id is not null and ask.on_roster(m.program_id, m.player2_id) then 'player2'
        when m.event_entry_id is not null then 'player1'
        else null
      end
    when m.player1_id is not null
     and m.player1_id in (select public.my_player_ids()) then 'player1'
    when m.player2_id is not null
     and m.player2_id in (select public.my_player_ids()) then 'player2'
    when m.player1_id is null
     and m.player2_id is null
     and m.created_by = (select auth.uid()) then 'player1'
    else null
  end;
$$;

comment on function ask.my_side(public.matches) is
  'Personal scope: restates playerSide() (src/lib/data/player-identity-server.ts). Program scope: restates programSide() (src/lib/data/team-home-server.ts): player1 if player1_id is a roster id, else player2 if player2_id is, else player1 for a match hung on a schedule entry, else null.';

-- ---------------------------------------------------------------------------
-- The name of the player the rows are turned to.
-- ---------------------------------------------------------------------------
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
      -- The roster profile the seat names, directly or through the login
      -- that claimed it. Doubles (no id in the seat) falls to the stored
      -- label, which names both partners.
      select nullif(btrim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '')
        from public.program_players pp
       where (select ask.scope_program_id()) is not null
         and pp.program_id = m.program_id
         and pp.merged_into_id is null
         and (pp.id = seat.id or pp.claimed_by_user_id = seat.id)
       order by (pp.id = seat.id) desc
       limit 1
    ),
    seat.stored_name
  )
  from seat;
$$;

comment on function ask.side_player_name(public.matches) is
  'The name of the player a match''s rows are turned to: the roster name in a program scope, else the name stored on the match; null when the side is unknown.';

revoke all on function ask.scope_program_id() from public, anon, authenticated;
revoke all on function ask.side_player_name(public.matches) from public, anon, authenticated;
grant execute on function ask.scope_program_id() to ask_reader;
grant execute on function ask.side_player_name(public.matches) to ask_reader;

-- ---------------------------------------------------------------------------
-- ask.matches gains player_name as its last column. The body is otherwise
-- 20261011134127's, unchanged.
-- ---------------------------------------------------------------------------
create or replace view ask.matches as
select
  m.id as match_id,
  (m.date at time zone 'utc')::date as played_on,
  case ask.my_side(m)
    when 'player1' then m.player2_name
    when 'player2' then m.player1_name
    else null
  end as opponent_name,
  m.opponent_hand,
  m.opponent_backhand,
  m.tournament_name as tournament,
  m.round,
  m.court_type,
  m.match_type,
  ask.i_won(m.score, ask.my_side(m)) as i_won,
  case
    when jsonb_typeof(m.score->'player1') = 'array'
     and jsonb_typeof(m.score->'player2') = 'array'
     and jsonb_array_length(m.score->'player1') > 0
     and jsonb_array_length(m.score->'player2') > 0 then (
      select string_agg(
               case ask.my_side(m)
                 when 'player2' then coalesce(m.score->'player2'->(s.i::int - 1) #>> '{}', '0')
                                     || '-' || (s.v #>> '{}')
                 else (s.v #>> '{}') || '-'
                      || coalesce(m.score->'player2'->(s.i::int - 1) #>> '{}', '0')
               end,
               ', ' order by s.i)
        from jsonb_array_elements(m.score->'player1') with ordinality as s(v, i)
    )
    else null
  end as score_text,
  case m.source_provider
    when 'splitstep' then 'video'
    when 'swing-vision' then 'swingvision'
    else m.source_provider
  end as source,
  case
    when m.duration is null then null
    else round(m.duration / 1000.0)::integer
  end as duration_seconds,
  exists (
    select 1 from public.match_stats s where s.match_id = m.id
  ) as has_stats,
  ask.side_player_name(m) as player_name
from public.matches m
where m.id in (select ask.my_match_ids());

comment on column ask.matches.player_name is
  'The player this match is turned to ("me" in the other views): in a program scope the roster player''s name, one spelling per player; in a personal scope the viewer''s name as stored on the match.';

revoke all on all tables in schema ask from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The team door: select the program, then run the same function.
-- ---------------------------------------------------------------------------
create or replace function public.ask_run_team_query(
  p_program_id uuid,
  scope_sql text,
  sql text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ask, pg_catalog, pg_temp
as $fn$
declare
  viewer text;
begin
  if p_program_id is null then
    raise exception 'ask_run_team_query: program is required'
      using errcode = 'null_value_not_allowed';
  end if;

  viewer := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
  if viewer is null or viewer = '' then
    raise exception 'ask_run_team_query: not signed in'
      using errcode = 'insufficient_privilege';
  end if;

  -- Transaction-local: gone at commit, so the pooled connection carries
  -- nothing into the next request.
  perform set_config('ask.program_id', p_program_id::text, true);

  return public.ask_run_query(scope_sql, sql);
end
$fn$;

comment on function public.ask_run_team_query(uuid, text, text) is
  'ask_run_query for a program: sets the transaction-local ask.program_id, then runs the same guarded read. Membership is tested by ask.my_match_ids(), not here; a non-member reads no rows.';

revoke all on function public.ask_run_team_query(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ask_run_team_query(uuid, text, text) to authenticated;

-- Owned by ask_reader, by the same temporary grants as 20261011215730.
grant ask_reader to postgres with set true;
grant create on schema public to ask_reader;

alter function public.ask_run_team_query(uuid, text, text) owner to ask_reader;

revoke create on schema public from ask_reader;
revoke ask_reader from postgres granted by postgres;

do $$
declare
  owner_name text;
  set_grants integer;
begin
  select r.rolname into owner_name
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'public.ask_run_team_query(uuid, text, text)'::regprocedure;
  if owner_name is distinct from 'ask_reader' then
    raise exception 'ask_run_team_query: owner is %, expected ask_reader', owner_name;
  end if;
  if has_schema_privilege('ask_reader', 'public', 'create') then
    raise exception 'ask_run_team_query: ask_reader still holds CREATE on schema public';
  end if;
  select count(*) into set_grants
    from pg_auth_members
   where roleid = 'ask_reader'::regrole
     and member = 'postgres'::regrole
     and (set_option or inherit_option);
  if set_grants > 0 then
    raise exception 'ask_run_team_query: postgres still holds SET or INHERIT on ask_reader';
  end if;
  if has_function_privilege('anon', 'public.ask_run_team_query(uuid, text, text)', 'execute')
     or has_function_privilege('service_role', 'public.ask_run_team_query(uuid, text, text)', 'execute') then
    raise exception 'ask_run_team_query: anon or service_role can execute it';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Conversations belong to a workspace. A null program_id is a personal
-- conversation (every row so far); a team conversation carries its program
-- and is still private to the member who asked.
-- ---------------------------------------------------------------------------
alter table public.ask_conversations
  add column if not exists program_id uuid references public.programs(id) on delete cascade;

comment on column public.ask_conversations.program_id is
  'The program a team Ask conversation was asked in; null for a personal conversation. Still readable only by the member who asked.';

create index if not exists ask_conversations_user_program_updated_idx
  on public.ask_conversations (user_id, program_id, updated_at desc);

drop function if exists public.ask_save_exchange(uuid, jsonb, jsonb);

create or replace function public.ask_save_exchange(
  p_conversation_id uuid,
  p_question jsonb,
  p_answer jsonb,
  p_program_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation_id uuid := p_conversation_id;
  v_title text;
begin
  if v_uid is null then
    raise exception 'ask_save_exchange: no signed-in user'
      using errcode = '42501';
  end if;
  if p_question is null or p_answer is null then
    raise exception 'ask_save_exchange: question and answer are required'
      using errcode = '22004';
  end if;
  if p_program_id is not null
     and public.user_program_role(p_program_id) is null then
    raise exception 'ask_save_exchange: not a member of that program'
      using errcode = '42501';
  end if;

  if v_conversation_id is null then
    -- The question's text, one line, cut to fit the title check.
    v_title := left(btrim(regexp_replace(
      coalesce(p_question->>'text', ''), '\s+', ' ', 'g')), 120);
    if v_title = '' then
      v_title := 'Untitled question';
    end if;

    insert into public.ask_conversations (user_id, title, program_id)
    values (v_uid, v_title, p_program_id)
    returning id into v_conversation_id;
  else
    -- Take the row lock so two follow-ups on one thread serialise, and refuse
    -- a conversation that is not the caller's, does not exist, or belongs to
    -- another workspace alike.
    perform 1
      from public.ask_conversations
     where id = v_conversation_id
       and user_id = v_uid
       and program_id is not distinct from p_program_id
       for update;
    if not found then
      raise exception 'ask_save_exchange: conversation is not yours'
        using errcode = '42501';
    end if;
  end if;

  insert into public.ask_messages (conversation_id, user_id, role, content)
  values
    (v_conversation_id, v_uid, 'user', p_question),
    (v_conversation_id, v_uid, 'assistant', p_answer);

  update public.ask_conversations
     set updated_at = now()
   where id = v_conversation_id;

  return v_conversation_id;
end;
$$;

comment on function public.ask_save_exchange(uuid, jsonb, jsonb, uuid) is
  'Saves one question and its answer to the caller''s Ask conversation, creating it when p_conversation_id is null. p_program_id marks a team conversation (the caller must be a member); a follow-up must name the workspace the conversation was started in.';

revoke execute on function public.ask_save_exchange(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.ask_save_exchange(uuid, jsonb, jsonb, uuid) to authenticated, service_role;
