-- ask.matches names only a college program as the opponent's team.
--
-- The view runs as its owner, so its join to public.programs (20261030204509)
-- skips the programs policy that keeps a custom organisation's program visible
-- to its members alone. set_opponent_team and the admin path check only that a
-- program exists, so a match could point at a private program and show its name
-- and conference to everyone who can read the match. The directory is colleges,
-- and college rows are public, so the join now takes those alone. A link to
-- anything else reads as no linked school; opponent_program_id still reports the
-- id the match already holds. Same columns and order: `create or replace` keeps
-- the grants.

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
       op.conference as opponent_conference
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
