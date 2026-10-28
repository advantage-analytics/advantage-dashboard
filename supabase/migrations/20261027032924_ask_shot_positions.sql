-- ask.shots: court positions, turned to the player. ask.matches: has_coords.
--
-- For the MCP connector (docs/ask-mcp-connector.md): a player's own Claude
-- can draw heatmaps and answer depth questions over the shots it already
-- reads. The in-app planner is not shown these columns (schema.ts mcpOnly).
--
-- public.shots stores positions in one fixed world frame for both sources —
-- metres, x about the centre line, y 0 at one baseline, 11.885 at the net,
-- 23.77 at the other — and that frame does not follow end changes. No end is
-- stored, so each point's end is voted from its own shots, exactly as the
-- film court decides it (film-court.ts `youAreAtLowEnd`): every real contact
-- votes on whether the player is at the y = 0 end; only when contacts tie do
-- landings vote (net balls left out); a point still tied gets no positions.
-- At the high end the point is rotated 180° (x -> -x, y -> 23.77 - y), both
-- axes, never y alone, or deuce and ad swap. Checked on the live data
-- 2026-10-26: 17 of ~6,700 points had one player's contacts on both sides of
-- the net, 2 had both players voting for the same end.
--
-- A contact or landing at x = 0 or y = 11.885 is a placeholder, not a
-- position (the half CASE below already reads contacts that way). A net
-- ball's landing is dropped: 306 of 431 netted video serves recorded a
-- landing on the far side, and SwingVision imputes one on the hitter's. So
-- is any landing on the hitter's own half (see `landed`).
-- landing_pinned marks SwingVision serve landings set on a service line
-- (10–17% of its serves within 5 cm, against ~2% on video).
--
-- Both views keep the live bodies with columns appended at the end, so
-- `create or replace` keeps their grants and ask.point_plays (which reads
-- ask.shots) is untouched.

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
       exists (
         select 1
           from public.points p
           join public.shots s on s.point_id = p.id
          where p.match_id = m.id
            and s.contact_x is not null and s.contact_y is not null
            and s.contact_x <> 0::double precision
            and s.contact_y <> 11.885::double precision
       ) as has_coords
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

comment on column ask.matches.has_coords is
  'True when the match''s shots carry court positions (ask.shots contact_x, contact_y, landing_x, landing_y). Some SwingVision imports have none at all; a figure built from positions covers only the matches where this is true.';

create or replace view ask.shots as
with mine as (
  select mm.match_id,
         mm.me_is_player1,
         m.source_provider,
         coalesce(ask.hand_of(m.player_hand), (
           select ask.hand_of(u.hand)
             from public.users u
            where u.id = case when mm.me_is_player1 then m.player1_id
                              else m.player2_id end)) as my_hand,
         coalesce(ask.hand_of(m.opponent_hand), (
           select ask.hand_of(u.hand)
             from public.users u
            where u.id = case when mm.me_is_player1 then m.player2_id
                              else m.player1_id end)) as opponent_hand
    from ask.my_matches() mm(match_id, me_is_player1)
    join public.matches m on m.id = mm.match_id
   where mm.me_is_player1 is not null
), placed as (
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
             or s.contact_x = 0::double precision
             or s.contact_y = 11.885::double precision then null::text
           when (s.contact_x * case when s.contact_y < 11.885::double precision
                                    then 1 else -1 end::double precision)
                > 0::double precision then 'deuce'::text
           else 'ad'::text
         end as half,
         -- Positions with the placeholders read as missing, in the stored frame.
         case when s.contact_x = 0::double precision
                or s.contact_y = 11.885::double precision then null
              else s.contact_x end as raw_contact_x,
         case when s.contact_x = 0::double precision
                or s.contact_y = 11.885::double precision then null
              else s.contact_y end as raw_contact_y,
         case when s.landing_x = 0::double precision
                or s.landing_y = 11.885::double precision then null
              else s.landing_x end as raw_landing_x,
         case when s.landing_x = 0::double precision
                or s.landing_y = 11.885::double precision then null
              else s.landing_y end as raw_landing_y
    from public.shots s
    join public.points p on p.id = s.point_id
    join mine on mine.match_id = p.match_id
), inferred as (
  select placed.match_id,
         placed.is_player1,
         case
           when count(*) < 10 then null::text
           when count(*) filter (where placed.half = 'deuce')::numeric
                >= 0.65 * count(*)::numeric then 'right'::text
           when count(*) filter (where placed.half = 'ad')::numeric
                >= 0.65 * count(*)::numeric then 'left'::text
           else null::text
         end as hand
    from placed
   where placed.shot_number >= 1
     and lower(coalesce(placed.shot_type, '')) like '%forehand%'
     and placed.half is not null
   group by placed.match_id, placed.is_player1
), handed as (
  select placed.match_id,
         placed.point_number,
         placed.shot_number,
         placed.is_player1,
         placed.shot_type,
         placed.spin_type,
         placed.speed_mph,
         placed.zone,
         placed.result,
         placed.half,
         placed.raw_contact_x,
         placed.raw_contact_y,
         placed.raw_landing_x,
         placed.raw_landing_y,
         mine.me_is_player1,
         mine.source_provider,
         coalesce(case when placed.is_player1 = mine.me_is_player1
                       then mine.my_hand else mine.opponent_hand end,
                  inferred.hand) as hand
    from placed
    join mine on mine.match_id = placed.match_id
    left join inferred on inferred.match_id = placed.match_id
                      and inferred.is_player1 = placed.is_player1
), ends as (
  -- film-court.ts youAreAtLowEnd: true = the player is at the y = 0 end.
  select match_id,
         point_number,
         case
           when coalesce(contact_votes, 0) <> 0 then contact_votes > 0
           when coalesce(landing_votes, 0) <> 0 then landing_votes > 0
         end as me_low
    from (
      select match_id,
             point_number,
             sum(case when raw_contact_y is null then null
                      when (raw_contact_y < 11.885::double precision)
                           = (is_player1 = me_is_player1) then 1
                      else -1 end) as contact_votes,
             sum(case when raw_landing_y is null
                        or lower(btrim(coalesce(result, ''))) = 'net' then null
                      when (raw_landing_y > 11.885::double precision)
                           = (is_player1 = me_is_player1) then 1
                      else -1 end) as landing_votes
        from handed
       group by match_id, point_number
    ) votes
), turned as (
  select h.*,
         case when e.me_low then h.raw_contact_x
              when not e.me_low then -h.raw_contact_x end as contact_x,
         case when e.me_low then h.raw_contact_y
              when not e.me_low then 23.77::double precision - h.raw_contact_y end as contact_y,
         case when lower(btrim(coalesce(h.result, ''))) = 'net' then null
              when e.me_low then h.raw_landing_x
              when not e.me_low then -h.raw_landing_x end as turned_landing_x,
         case when lower(btrim(coalesce(h.result, ''))) = 'net' then null
              when e.me_low then h.raw_landing_y
              when not e.me_low then 23.77::double precision - h.raw_landing_y end as turned_landing_y
    from handed h
    left join ends e on e.match_id = h.match_id and e.point_number = h.point_number
), landed as (
  -- A ball that crossed the net cannot bounce on its hitter's own half; a
  -- landing recorded there is the tracker's error (3.8% of video In shots,
  -- most of them mid-rally, on 2026-10-26), so it is dropped like a net ball's.
  select t.*,
         case when (t.is_player1 = t.me_is_player1)
                   = (t.turned_landing_y < 11.885::double precision) then null
              else t.turned_landing_x end as landing_x,
         case when (t.is_player1 = t.me_is_player1)
                   = (t.turned_landing_y < 11.885::double precision) then null
              else t.turned_landing_y end as landing_y
    from turned t
)
select match_id,
       point_number,
       shot_number,
       is_player1 = me_is_player1 as mine,
       shot_type,
       initcap(spin_type) as spin_type,
       speed_mph,
       zone,
       result,
       case
         when zone = any (array['Crosscourt'::text, 'Down the Line'::text])
          and hand is not null
          and (
            -- A forehand from the backhand half (ad for a right-hander) ...
            (lower(coalesce(shot_type, '')) like '%forehand%'
              and half = case hand when 'right' then 'ad' else 'deuce' end)
            -- ... or a backhand from the forehand half (deuce for one).
            or (lower(coalesce(shot_type, '')) like '%backhand%'
              and half = case hand when 'right' then 'deuce' else 'ad' end)
          )
         then case zone when 'Crosscourt' then 'Inside Out'::text
                        else 'Inside In'::text end
         else zone
       end as direction,
       contact_x,
       contact_y,
       landing_x,
       landing_y,
       case
         when landing_y is null then null
         else coalesce(source_provider, '') = 'swing-vision'
          and lower(coalesce(shot_type, '')) like '%serve%'
          and least(abs(raw_landing_y - 5.485::double precision),
                    abs(raw_landing_y - 18.285::double precision))
              < 0.05::double precision
       end as landing_pinned,
       case
         when landing_y is null or lower(btrim(coalesce(result, ''))) <> 'in' then null
         when lower(coalesce(shot_type, '')) like '%serve%' then zone
         else
           case
             when abs(landing_y - 11.885::double precision) < 11.885::double precision / 3 then 'Short'
             when abs(landing_y - 11.885::double precision) < 2 * 11.885::double precision / 3 then 'Mid'
             else 'Deep'
           end
           || ' ' ||
           case
             when abs(landing_x) < 4.115::double precision / 3 then 'Middle'
             when landing_x > 0::double precision then 'Right'
             else 'Left'
           end
       end as landing_section
  from landed l;

comment on column ask.shots.contact_x is
  'Where the hitter struck the ball, across the court: metres from the centre line, positive to the player''s right as they face the net from their own baseline. The frame is turned to the player for every point, so end changes need no handling; null when not measured.';
comment on column ask.shots.contact_y is
  'Where the hitter struck the ball, along the court: metres from the player''s own baseline (0), through the net (11.885), to the opponent''s baseline (23.77); below 0 or above 23.77 is behind a baseline. Turned to the player like contact_x; null when not measured.';
comment on column ask.shots.landing_x is
  'Where the ball bounced, across the court, in the same frame as contact_x; the singles sidelines are at -4.115 and 4.115. Null when not measured, for every ball that hit the net (result Net), and when the recorded bounce is on the hitter''s own half, none of which is a real position. Use result, not this, to say whether a ball was in.';
comment on column ask.shots.landing_y is
  'Where the ball bounced, along the court, in the same frame as contact_y: the player''s shots that land in sit between 11.885 and 23.77, the opponent''s between 0 and 11.885; the service lines are at 5.485 and 18.285. Null like landing_x.';
comment on column ask.shots.landing_pinned is
  'True when a SwingVision serve''s bounce sits on a service line, where SwingVision often places a faulted serve instead of measuring it: leave these out of any figure about where serves landed. False otherwise; null when there is no bounce.';
comment on column ask.shots.landing_section is
  'Which section of the court an in-play ball (result In) bounced in, for counting rather than plotting. A serve has its zone: Wide, Body or T. Any other shot has a depth and a lane, as Short, Mid or Deep (thirds of the half from the net to the baseline) then Left, Middle or Right (thirds of the singles width as the player sees it from their own baseline), for example Deep Left. Null when the ball was not in or its bounce is not measured.';
