-- ask.points: the running score before each point, turned to the player.
-- ask.matches: is_verified and errors_judged.
--
-- For the MCP connector (docs/ask-mcp-connector.md): a player's or coach's own
-- Claude can say "point 47, 30-40 in game 8" and line a hand-kept chart up
-- against the match, and can tell a match Advantage checked point by point
-- from one the video analysis read alone. The in-app planner is not shown
-- these columns (schema.ts mcpOnly).
--
-- public.points stores set_score, game_score and point_score SERVER-FIRST
-- ("30-40" is server 30, returner 40 — film-score.ts), as the score before the
-- point is played. Here each is turned viewer-first: kept when the viewer
-- served, its halves swapped when they returned, null when the server is not
-- known. A match whose point scores never leave 0-0 had none read (the
-- has_point_score test the court column already uses), so its point_score is
-- null rather than a column of 0-0s.
--
-- errors_judged is errorSplitJudged() (src/lib/data/error-split.ts): every
-- SwingVision match, and a video match only while it is verified AND its
-- errors were judged. is_verified is verificationFor(): verified with a
-- verified_at.
--
-- result_type's comment now says that an unjudged match reads every error as
-- Unforced Error. That column is in the planner's schema too, so the wording
-- names no MCP-only column.
--
-- Both views keep the live bodies with columns appended at the end, so
-- `create or replace` keeps their grants. Nothing else reads either view.

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
       ) as player_name,
       -- A scalar subquery with limit 1, never exists(): the planner may run
       -- an exists() as a hashed subplan, one scan of every shot in the
       -- database (643 ms warm for an 18-match player on 2026-10-27); this
       -- form probes the match's own points and shots by index and stops at
       -- the first positioned shot (17 ms for the same matches).
       coalesce((
         select true
           from public.points p
           join public.shots s on s.point_id = p.id
          where p.match_id = m.id
            and ((s.contact_x is not null and s.contact_y is not null
                  and s.contact_x <> 0::double precision
                  and s.contact_y <> 11.885::double precision)
              or (s.landing_x is not null and s.landing_y is not null
                  and s.landing_x <> 0::double precision
                  and s.landing_y <> 11.885::double precision))
          limit 1
       ), false) as has_coords,
       -- The linked program's name, or the school as typed: the two columns
       -- are either/or (matches_opponent_program_or_school_check).
       coalesce(op.school_name, m.opponent_school) as opponent_school,
       m.opponent_program_id,
       op.conference as opponent_conference,
       coalesce(m.verified and m.verified_at is not null, false) as is_verified,
       coalesce(
         m.source_provider = 'swing-vision'
           or (m.verified and m.verified_at is not null and m.errors_judged_at is not null),
         false
       ) as errors_judged
  from public.matches m
  join mine on mine.match_id = m.id
  -- College rows only: this view runs as its owner, so programs RLS does not
  -- hide a custom organisation's name here.
  left join public.programs op on op.id = m.opponent_program_id and op.org_type = 'college'
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
       end as court,
       -- Server-first in public.points; swapped when the viewer returned.
       case
         when not p.has_point_score or p.point_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.point_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.point_score, '-', 2) || '-' || split_part(p.point_score, '-', 1)
       end as point_score,
       case
         when p.game_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.game_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.game_score, '-', 2) || '-' || split_part(p.game_score, '-', 1)
       end as game_score,
       case
         when p.set_score is null then null
         when p.server_is_player1 = mine.me_is_player1 then p.set_score
         when p.server_is_player1 <> mine.me_is_player1 then
           split_part(p.set_score, '-', 2) || '-' || split_part(p.set_score, '-', 1)
       end as set_score
  from scored p
  join mine on mine.match_id = p.match_id;

comment on column ask.matches.is_verified is
  'True when Advantage checked every point of this match against the video (Verified by Advantage): its servers, winners and point endings were checked by hand rather than read by the video analysis alone. False for every other match.';
comment on column ask.matches.errors_judged is
  'True when each error in this match was judged forced or unforced: every SwingVision match, and a video match Advantage verified with its errors judged. When false, ask.points.result_type reads Unforced Error for every error and ask.match_stats.unforced_errors counts every error, so call them errors, not unforced errors.';
comment on column ask.points.result_type is
  'How the point ended, as text: Ace, Double Fault, Service Winner, Forehand Winner, Backhand Winner, Volley Winner, Overhead Winner, Forehand Unforced Error, Backhand Unforced Error, Forehand Forced Error, Backhand Forced Error, and the like; the stroke named is the one that ended the point, by whoever hit it; null when unknown. Forced Error appears only on matches whose errors were judged (SwingVision, and video matches Advantage verified with errors judged); on every other match each error reads Unforced Error, whether or not it was forced.';
comment on column ask.points.point_score is
  'The point score before this point was played, the viewer first: 30-40 is the viewer on 30 and the opponent on 40; AD is advantage, 0-0 opens every game, and a tiebreak counts in plain numbers (3-2). Null when the source never read point scores or the server is unknown.';
comment on column ask.points.game_score is
  'Games in the current set before this point, the viewer first, e.g. 4-5; null when not recorded.';
comment on column ask.points.set_score is
  'Sets each side had won before this point, the viewer first, e.g. 1-0; null when not recorded.';
