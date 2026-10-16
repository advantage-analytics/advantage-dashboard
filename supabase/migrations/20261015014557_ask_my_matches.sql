-- ask.my_matches(): the viewer's matches, oriented, resolved ONCE per query.
--
-- Every ask view opened with the same CTE:
--
--   with mine as (
--     select m.id, ask.my_side(m.*) = 'player1'
--       from matches m
--      where m.id in (select ask.my_match_ids())
--        and ask.my_side(m.*) is not null)
--
-- Postgres planned that as a seq scan of ALL of public.matches with
-- `ask.my_side(m.*) is not null` as the scan filter and the my_match_ids()
-- join after it, so my_side ran once per row in the table, not once per row
-- of the viewer's. my_side is SECURITY DEFINER with an empty search_path, so
-- the planner cannot inline it, and each call re-reads the pinned viewer
-- (ask.viewer(), a sha256 signature) and ask.viewer_player_ids() (a query on
-- program_players): about 1 ms a call. Measured on 2026-10-14 for the viewer
-- with the most personal matches (18 of the table's 93): the CTE alone took
-- 90 ms, a shots query 145 ms, a points query 91 ms, `select * from
-- ask.matches` 96 ms. The cost grew with the whole table, so a few thousand
-- matches would have put every question over the 8 s statement timeout
-- (docs/ask-improvement-roadmap.md, 2.1).
--
-- This migration resolves the viewer once per query in a set-returning
-- function and has every view join it:
--
--   ask.my_matches() → (match_id, me_is_player1)
--
-- The rules are ask.my_match_ids()'s and ask.my_side()'s, restated as one
-- pass with the viewer, the viewer's seat ids and (team scope) the roster
-- resolved up front. Those functions are kept, unchanged: they remain the
-- statement of the rule that tests/ask-views-parity.spec.ts holds to the
-- TypeScript originals, and the parity check below holds this function to
-- them. me_is_player1 is null when the side cannot be determined;
-- ask.matches keeps such rows (as before: null opponent and outcome) and the
-- other three views drop them (as before).
--
-- ask.matches no longer calls my_side four times per row (opponent_name,
-- i_won, score_text, side_player_name): it reads the side from my_matches
-- and restates side_player_name's roster lookup inline, with the membership
-- and program checks that lookup repeated already satisfied by my_matches.
--
-- Columns, their order, comments and grants are unchanged. `create or
-- replace view` keeps each view's oid, so every column comment survives;
-- the grants are re-asserted at the end anyway.
--
-- Applied to the live database on 2026-10-15 as version 20261015014557
-- (`ask_my_matches`). VERIFIED: see the end of this file.

create or replace function ask.my_matches()
returns table (match_id uuid, me_is_player1 boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as materialized (
    -- The pinned viewer and the selected program, read once.
    select ask.viewer() as uid,
           ask.scope_program_id() as program_id,
           ask.viewer_is_member(ask.scope_program_id()) as is_member
  ),
  seats as materialized (
    -- Personal scope: the viewer's login id and every roster profile it
    -- claimed (ask.viewer_player_ids()).
    select ask.viewer_player_ids() as id
  ),
  roster as materialized (
    -- Team scope: every id ask.on_roster(program, id) accepts, as one set.
    -- Arm 1: a live roster profile, by its id or the login that claimed it.
    select pp.id
      from public.program_players pp, viewer v
     where pp.program_id = v.program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
    union
    select pp.claimed_by_user_id
      from public.program_players pp, viewer v
     where pp.program_id = v.program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
       and pp.claimed_by_user_id is not null
    union
    -- Arms 2 and 3: a staff member's login; a player-role member's login
    -- only when no live profile is claimed by it.
    select pm.user_id
      from public.program_members pm, viewer v
     where pm.program_id = v.program_id
       and (
         pm.role <> 'player'
         or not exists (
           select 1 from public.program_players pp
            where pp.program_id = pm.program_id
              and pp.claimed_by_user_id = pm.user_id
              and pp.merged_into_id is null
         )
       )
  )
  select m.id as match_id,
         case
           when v.program_id is null then
             -- ask.my_side(), personal arm.
             case
               when m.player1_id is not null
                and m.player1_id in (select id from seats) then true
               when m.player2_id is not null
                and m.player2_id in (select id from seats) then false
               when m.player1_id is null
                and m.player2_id is null
                and m.created_by = v.uid then true
               else null
             end
           else
             -- ask.my_side(), program arm.
             case
               when m.player1_id is not null
                and m.player1_id in (select id from roster) then true
               when m.player2_id is not null
                and m.player2_id in (select id from roster) then false
               when m.event_entry_id is not null then true
               else null
             end
         end as me_is_player1
    from public.matches m, viewer v
   where v.uid is not null
     and case
           -- ask.my_match_ids(), both arms.
           when v.program_id is null then
             m.created_by = v.uid and m.program_id is null
           else
             m.program_id = v.program_id and v.is_member
         end;
$$;

comment on function ask.my_matches() is
  'The viewer''s matches (ask.my_match_ids()) with which seat is the viewer (ask.my_side() = player1), both rules restated as one pass that resolves the viewer, their seat ids and the roster once per query. me_is_player1 is null when the side cannot be determined.';

revoke all on function ask.my_matches() from public, anon, authenticated;
grant execute on function ask.my_matches() to ask_reader;

-- ── ask.matches ──────────────────────────────────────────────────────────────

create or replace view ask.matches as
with mine as (
  select mm.match_id,
         mm.me_is_player1,
         case
           when mm.me_is_player1 then 'player1'
           when not mm.me_is_player1 then 'player2'
         end as side
    from ask.my_matches() mm
)
select m.id as match_id,
       (m.date at time zone 'utc')::date as played_on,
       case mine.side
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
       ask.i_won(m.score, mine.side) as i_won,
       case
         when jsonb_typeof(m.score -> 'player1') = 'array'
          and jsonb_typeof(m.score -> 'player2') = 'array'
          and jsonb_array_length(m.score -> 'player1') > 0
          and jsonb_array_length(m.score -> 'player2') > 0 then (
           select string_agg(
                    case mine.side
                      when 'player2' then
                        coalesce((m.score -> 'player2' -> (s.i::integer - 1)) #>> '{}', '0')
                        || '-' || (s.v #>> '{}')
                      else
                        (s.v #>> '{}') || '-'
                        || coalesce((m.score -> 'player2' -> (s.i::integer - 1)) #>> '{}', '0')
                    end,
                    ', ' order by s.i)
             from jsonb_array_elements(m.score -> 'player1') with ordinality s(v, i)
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
         else round(m.duration::numeric / 1000.0)::integer
       end as duration_seconds,
       exists (select 1 from public.match_stats s where s.match_id = m.id) as has_stats,
       -- ask.side_player_name(): in a program scope the roster player's name
       -- (one spelling per player), else the name stored on the match. The
       -- membership and program checks it repeats are already true of every
       -- my_matches() row in a program scope.
       coalesce(
         (
           select nullif(btrim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '')
             from public.program_players pp
            where m.program_id is not null
              and m.program_id = ask.scope_program_id()
              and pp.program_id = m.program_id
              and pp.merged_into_id is null
              and pp.archived_at is null
              and (pp.id = seat.id or pp.claimed_by_user_id = seat.id)
            order by (pp.id = seat.id) desc
            limit 1
         ),
         seat.stored_name
       ) as player_name
  from public.matches m
  join mine on mine.match_id = m.id
  cross join lateral (
    select case mine.side
             when 'player1' then m.player1_id
             when 'player2' then m.player2_id
           end as id,
           case mine.side
             when 'player1' then m.player1_name
             when 'player2' then m.player2_name
           end as stored_name
  ) as seat;

-- ── ask.match_stats ──────────────────────────────────────────────────────────

create or replace view ask.match_stats as
with mine as (
  select match_id, me_is_player1
    from ask.my_matches()
   where me_is_player1 is not null
)
select s.match_id,
       case when s.is_player1 = mine.me_is_player1 then 'me' else 'opponent' end as side,
       s.aces,
       s.double_faults,
       s.winners,
       s.unforced_errors,
       s.forced_errors,
       s.avg_rally_length,
       s.first_serves,
       s.first_serves_in,
       s.first_serve_points_won,
       s.second_serves,
       s.second_serves_in,
       s.second_serve_points_won,
       s.service_games,
       s.service_games_won,
       s.first_returns,
       s.first_returns_in,
       s.first_return_points_won,
       s.second_returns,
       s.second_returns_in,
       s.second_return_points_won,
       s.return_games,
       s.return_games_won,
       s.break_points_faced,
       s.break_points_saved,
       s.break_point_opportunities,
       s.break_points_converted,
       s.set_points_faced,
       s.set_points_saved,
       s.set_point_opportunities,
       s.set_points_converted,
       s.total_points,
       s.total_points_won,
       s.service_winners,
       s.forehand_winners,
       s.backhand_winners,
       s.forehand_unforced_errors,
       s.backhand_unforced_errors,
       s.volley_winners,
       s.net_points_appearances,
       s.net_points_won,
       s.serve_wide,
       s.serve_body,
       s.serve_t,
       s.return_cross_court,
       s.return_down_the_line,
       s.return_middle,
       s.return_contact_inside,
       s.return_contact_middle,
       s.return_contact_deep,
       s.short_rally_won,
       s.short_rally_total,
       s.medium_rally_won,
       s.medium_rally_total,
       s.long_rally_won,
       s.long_rally_total,
       s.first_serve_pct,
       s.first_serve_won_pct,
       s.second_serve_won_pct,
       s.service_games_won_pct,
       s.first_return_in_pct,
       s.second_return_in_pct,
       s.first_return_won_pct,
       s.second_return_won_pct,
       s.return_games_won_pct,
       s.break_points_saved_pct,
       s.break_points_converted_pct,
       s.set_points_saved_pct,
       s.set_points_converted_pct,
       s.total_points_won_pct,
       s.serve_rating,
       s.return_rating,
       s.under_pressure_rating,
       s.short_rally_won_pct,
       s.medium_rally_won_pct,
       s.long_rally_won_pct,
       s.serve_wide_pct,
       s.serve_body_pct,
       s.serve_t_pct,
       s.return_cross_court_pct,
       s.return_down_the_line_pct,
       s.return_middle_pct,
       s.return_contact_inside_pct,
       s.return_contact_middle_pct,
       s.return_contact_deep_pct
  from ask.my_stat_rows() s
  join mine on mine.match_id = s.match_id;

-- ── ask.points ───────────────────────────────────────────────────────────────

create or replace view ask.points as
with mine as (
  select match_id, me_is_player1
    from ask.my_matches()
   where me_is_player1 is not null
),
scored as (
  select p.*,
         bool_or(coalesce(p.point_score, '0-0') <> '0-0') over (partition by p.match_id) as has_point_score,
         row_number() over (partition by p.match_id, p.set_number, p.game_number order by p.point_number) - 1 as index_in_game,
         case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 1)))
           when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
         end as rung_a,
         case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 2)))
           when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
         end as rung_b
    from public.points p
   where p.match_id in (select mine_1.match_id from mine mine_1)
)
select p.match_id,
       p.set_number,
       p.game_number - min(p.game_number) over (partition by p.match_id, p.set_number) + 1 as game_number,
       p.point_number,
       p.server_is_player1 = mine.me_is_player1 as i_served,
       p.won_by_player1 = mine.me_is_player1 as i_won,
       p.is_break_point,
       p.is_set_point,
       p.is_match_point,
       p.is_pressure_point,
       p.rally_length,
       p.result_type,
       case
         when p.has_point_score and p.rung_a is not null and p.rung_b is not null
           then case when (p.rung_a + p.rung_b) % 2 = 0 then 'Deuce' else 'Ad' end
         else case when p.index_in_game % 2 = 0 then 'Deuce' else 'Ad' end
       end as court
  from scored p
  join mine on mine.match_id = p.match_id;

-- ── ask.shots ────────────────────────────────────────────────────────────────

create or replace view ask.shots as
with mine as (
  select mm.match_id,
         mm.me_is_player1,
         -- The match row's hands, then the seat's account profile.
         coalesce(
           ask.hand_of(m.player_hand),
           (select ask.hand_of(u.hand)
              from public.users u
             where u.id = case when mm.me_is_player1 then m.player1_id else m.player2_id end)
         ) as my_hand,
         coalesce(
           ask.hand_of(m.opponent_hand),
           (select ask.hand_of(u.hand)
              from public.users u
             where u.id = case when mm.me_is_player1 then m.player2_id else m.player1_id end)
         ) as opponent_hand
    from ask.my_matches() mm
    join public.matches m on m.id = mm.match_id
   where mm.me_is_player1 is not null
),
placed as (
  select p.match_id,
         p.point_number,
         s.shot_number,
         s.is_player1,
         s.shot_type,
         s.spin_type,
         s.speed_mph,
         s.zone,
         s.result,
         case
           when s.contact_x is null or s.contact_y is null
             or s.contact_x = 0 or s.contact_y = 11.885 then null
           when s.contact_x * (case when s.contact_y < 11.885 then 1 else -1 end) > 0
             then 'deuce'
           else 'ad'
         end as half
    from public.shots s
    join public.points p on p.id = s.point_id
    join mine on mine.match_id = p.match_id
),
-- inferHand(): each seat's forehands by half, for a seat with no stored hand.
inferred as (
  select match_id,
         is_player1,
         case
           when count(*) < 10 then null
           when count(*) filter (where half = 'deuce') >= 0.65 * count(*) then 'right'
           when count(*) filter (where half = 'ad') >= 0.65 * count(*) then 'left'
           else null
         end as hand
    from placed
   where shot_number >= 1
     and lower(coalesce(shot_type, '')) like '%forehand%'
     and half is not null
   group by match_id, is_player1
),
handed as (
  select placed.*,
         mine.me_is_player1,
         coalesce(
           case when placed.is_player1 = mine.me_is_player1
                then mine.my_hand else mine.opponent_hand end,
           inferred.hand
         ) as hand
    from placed
    join mine on mine.match_id = placed.match_id
    left join inferred
      on inferred.match_id = placed.match_id
     and inferred.is_player1 = placed.is_player1
)
select h.match_id,
       h.point_number,
       h.shot_number,
       h.is_player1 = h.me_is_player1 as mine,
       h.shot_type,
       initcap(h.spin_type) as spin_type,
       h.speed_mph,
       h.zone,
       h.result,
       case
         when h.zone in ('Crosscourt', 'Down the Line')
          and lower(coalesce(h.shot_type, '')) like '%forehand%'
          and h.hand is not null
          and h.half = case h.hand when 'right' then 'ad' else 'deuce' end
           then case h.zone when 'Crosscourt' then 'Inside Out' else 'Inside In' end
         else h.zone
       end as direction
  from handed h;

-- The grants `create or replace view` kept, asserted again: ask_reader reads
-- the four views and nothing else in this schema.
grant select on ask.matches, ask.match_stats, ask.points, ask.shots to ask_reader;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
--
-- Parity. For every viewer with personal matches (13) and every (member,
-- program) pair with program matches (9), each of the four views was read
-- as that pinned viewer before and after, and its row count and an md5 over
-- its rows (ordered) recorded: 88 (count, hash) pairs, all 88 identical.
-- Row-for-row, nothing a reader can see moved.
--
-- Timing, the viewer with the most personal matches (18 of 93), warm cache,
-- EXPLAIN ANALYZE execution time:
--
--   a shots query (group by shot_type)      145 ms  →   43 ms
--   a points query (group by i_served)       91 ms  →    8 ms
--   select * from ask.matches                96 ms  →    6 ms
--
-- and through public.ask_run_query (scope run twice + the query), wall clock:
--   shots 54 ms, points 15 ms, match_stats 18 ms (before: 145–1,179 ms,
--   97 ms, 103 ms). my_matches() itself: a 4 ms function scan returning 18
--   rows, in place of my_side() on all 93 rows of matches.
--
-- Privileges of ask_reader (information_schema.role_table_grants and
-- has_function_privilege): SELECT on ask.matches, ask.match_stats,
-- ask.points, ask.shots and nothing else; EXECUTE on ask.my_matches,
-- ask.my_match_ids, ask.my_side, ask.i_won, ask.my_stat_rows,
-- ask.scope_program_id, ask.side_player_name, ask.exec_query, ask.hand_of —
-- the previous set plus my_matches. Views still owned by postgres. All 124
-- column comments present (86 + 15 + 13 + 10).
--
-- Not run: tests/ask-views-parity.spec.ts and tests/ask-views-rls.spec.ts
-- are live-DB specs that skip against the production project, and the only
-- other project (advantage-v0) is paused. The hash parity above stands in
-- for the parity spec on live data; the RLS spec's guards (the reader's
-- grants, the read-only transaction, the subquery wrapping) are untouched.
