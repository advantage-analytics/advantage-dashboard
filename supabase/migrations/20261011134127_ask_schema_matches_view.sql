-- The `ask` schema: what the Ask page's model may read, and the two rules it
-- must never rediscover on its own.
--
-- A model writing SQL against public.matches has to work out, per match, which
-- side is "me" and who won. Both are silent-failure rules: a wrong guess yields
-- plausible numbers that belong to the opponent (docs/ui-revamp-guardrails.md
-- §4), and matches.result is free text ("Cj Gimena Wins", "Final Score",
-- "won") that says nothing reliable. So this schema states each rule once, in
-- SQL, named for the TypeScript function it restates, and a live parity spec
-- (tests/ask-views-parity.spec.ts) holds the two in step.
--
-- Access. The schema is NOT in PostgREST's exposed list (supabase/config.toml
-- api.schemas) and anon/authenticated/PUBLIC get nothing here. The view runs
-- as its owner (security_invoker off) and so bypasses RLS on public.matches —
-- which means ask.my_match_ids() in the view body IS the access rule, not a
-- convenience: it is the personal Matches list's own predicate. The one reader
-- is role ask_reader (NOLOGIN): USAGE on the schema, SELECT on the view, and
-- EXECUTE on the three functions the view body calls, because a view's caller
-- must be allowed to call the functions it uses. Nothing in public. A later
-- migration adds public.ask_run_query(), SECURITY DEFINER and owned by
-- ask_reader, as the only way a signed-in user reaches this schema.
--
-- Verified after apply on 2026-10-11 (version 20261011134127), as postgres:
--   select table_schema, table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'ask_reader' order by 1, 2, 3;
--   → [["ask","matches","SELECT"]]                      (the one row)
--   select p.proname, has_function_privilege('ask_reader', p.oid, 'execute')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'ask' order by 1;
--   → i_won t, my_match_ids t, my_side t
--   has_schema_privilege(r, 'ask', 'usage') and
--   has_table_privilege(r, 'ask.matches', 'select') for
--   r in (anon, authenticated, public) → all f; ask_reader → t, t
--   has_function_privilege(r, <each ask function>, 'execute')
--   for r in (anon, authenticated, public) → all f
--   pg_roles for ask_reader → rolcanlogin f, rolsuper f, rolinherit f,
--   rolbypassrls f. pg_auth_members shows one member, postgres, granted by
--   supabase_admin with admin_option only (inherit f, set f) — the platform
--   adds that to every role postgres creates so it can administer it; it
--   does not let postgres SET ROLE to it or inherit its privileges.
--   get_advisors(security) → no finding names schema ask or ask_reader.

create schema if not exists ask;
revoke all on schema ask from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Whose matches: getPersonalMatches() in src/lib/data/personal-matches-server.ts
-- (`created_by = me and program_id is null`) — the personal Matches list's set,
-- so every match the model counts is one the player can open from the personal
-- workspace. SECURITY DEFINER because the view's caller (ask_reader) holds no
-- privilege on public.matches; auth.uid() still reads the request's JWT.
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
   where m.created_by = (select auth.uid())
     and m.program_id is null;
$$;

comment on function ask.my_match_ids() is
  'Restates getPersonalMatches() (src/lib/data/personal-matches-server.ts): the viewer''s personal matches, created_by = auth.uid() and program_id is null.';

-- ---------------------------------------------------------------------------
-- My side: playerSide() in src/lib/data/player-identity-server.ts, the three
-- steps in the same order. An id, when there is one, always wins; the
-- creator-only clause is for legacy personal matches uploaded before player
-- ids were populated. Null means "not mine" — never "player 2".
-- ---------------------------------------------------------------------------
create or replace function ask.my_side(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
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
  'Restates playerSide() (src/lib/data/player-identity-server.ts): player1 if player1_id is one of my_player_ids(), else player2 if player2_id is, else player1 for a legacy match with both ids null that I created, else null.';

-- ---------------------------------------------------------------------------
-- Who won: scoreWinner() / matchOutcome() in src/lib/data/match-utils.ts.
-- The stored score.winner when present (a retirement or default — the side
-- that stopped can lead on sets), otherwise the set count from the game
-- arrays, otherwise null (no score, or level sets). Then turned to the given
-- side's yes/no; null when the side is unknown.
-- ---------------------------------------------------------------------------
create or replace function ask.i_won(score jsonb, side text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with winner as (
    select case
      when score->>'winner' in ('player1', 'player2') then score->>'winner'
      when jsonb_typeof(score->'player1') = 'array'
       and jsonb_typeof(score->'player2') = 'array'
       and jsonb_array_length(score->'player1') > 0
       and jsonb_array_length(score->'player2') > 0 then (
        select case
          when count(*) filter (where p1 > p2) > count(*) filter (where p2 > p1) then 'player1'
          when count(*) filter (where p2 > p1) > count(*) filter (where p1 > p2) then 'player2'
          else null
        end
          from (
            select (s.v #>> '{}')::numeric as p1,
                   coalesce((score->'player2'->(s.i::int - 1) #>> '{}')::numeric, 0) as p2
              from jsonb_array_elements(score->'player1') with ordinality as s(v, i)
          ) as sets
      )
      else null
    end as who
  )
  select case
    when side not in ('player1', 'player2') then null
    when who is null then null
    else who = side
  end
    from winner;
$$;

comment on function ask.i_won(jsonb, text) is
  'Restates scoreWinner() and matchOutcome() (src/lib/data/match-utils.ts): score.winner when stored, else the side with more sets by games, else null; turned to the given side''s outcome.';

-- ---------------------------------------------------------------------------
-- One row per personal match, already turned to me / opponent.
-- security_invoker is deliberately off: the view reads public.matches and
-- public.match_stats as its owner, and ask.my_match_ids() is the filter.
-- opponent_hand / opponent_backhand are creator-relative on the row already
-- (match-detail-server.ts: "player_*" tracks the creator, "opponent_*" the
-- other side), and every row here is the creator's, so they pass through.
-- Left out on purpose: every id but match_id, matches.result (free text),
-- key_moments, insights, video and storage columns.
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
  ) as has_stats
from public.matches m
where m.id in (select ask.my_match_ids());

comment on view ask.matches is
  'The viewer''s own personal matches (ask.my_match_ids()), one row each, oriented to the viewer by ask.my_side() with the outcome from ask.i_won().';
comment on column ask.matches.match_id is 'The match''s id; the only id in this schema.';
comment on column ask.matches.played_on is 'The calendar date the match was played (UTC).';
comment on column ask.matches.opponent_name is 'The other player''s name; null when the viewer''s side cannot be determined.';
comment on column ask.matches.opponent_hand is 'The opponent''s playing hand as recorded at upload, e.g. right or left; null when unknown.';
comment on column ask.matches.opponent_backhand is 'The opponent''s backhand as recorded at upload, e.g. one-handed or two-handed; null when unknown.';
comment on column ask.matches.tournament is 'Tournament or event name; null for an untitled match.';
comment on column ask.matches.round is 'Round within the tournament, free text; null when not recorded.';
comment on column ask.matches.court_type is 'Court surface or setting as entered, e.g. Outdoor Hard Court, Clay Court; null when not recorded.';
comment on column ask.matches.match_type is 'Practice, Tournament or Dual Match; null when not recorded.';
comment on column ask.matches.i_won is 'True if the viewer won, false if they lost, null when the score cannot say (no score, level sets, or unknown side).';
comment on column ask.matches.score_text is 'Per-set games from the viewer''s seat, e.g. 6-4, 3-6, 7-5 (viewer first); tiebreak points omitted; null when there is no score.';
comment on column ask.matches.source is 'Where the match data came from: video (Advantage Intelligence analysis), swingvision (SwingVision import), or null when entered by hand.';
comment on column ask.matches.duration_seconds is 'Length of the match in seconds; null when not recorded.';
comment on column ask.matches.has_stats is 'True when computed statistics exist for this match (serve, return, rally counters).';

revoke all on all tables in schema ask from public, anon, authenticated;
revoke execute on function
  ask.my_match_ids(), ask.my_side(public.matches), ask.i_won(jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The reader. NOLOGIN: nothing connects as it; a later SECURITY DEFINER
-- function owned by it is the only way in. No membership is granted to any
-- role, so nobody can SET ROLE to it either.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ask_reader') then
    create role ask_reader
      nologin nosuperuser noinherit nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$$;

grant usage on schema ask to ask_reader;
grant select on ask.matches to ask_reader;
grant execute on function
  ask.my_match_ids(), ask.my_side(public.matches), ask.i_won(jsonb, text)
  to ask_reader;
