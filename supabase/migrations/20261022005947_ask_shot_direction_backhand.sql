-- ask.shots.direction: Inside Out / Inside In for both wings.
--
-- Until now only a forehand struck from its hitter's backhand half was
-- renamed. A backhand struck from the forehand half (deuce for a
-- right-hander) is the same shot on the other wing, so it is renamed too:
-- Crosscourt -> Inside Out, Down the Line -> Inside In. This is the rule the
-- Video tab's Direction filter applies in the browser
-- (match-filters/shot-geometry.ts `shotDirection`), and the column comment
-- is the meaning Ask's schema prompt carries (src/lib/services/ask/schema.ts).
--
-- The body is the live view's, with the final CASE alone changed: same
-- columns, same order, so `create or replace` keeps its grants.

create or replace view ask.shots as
with mine as (
  select mm.match_id,
         mm.me_is_player1,
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
         end as half
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
         mine.me_is_player1,
         coalesce(case when placed.is_player1 = mine.me_is_player1
                       then mine.my_hand else mine.opponent_hand end,
                  inferred.hand) as hand
    from placed
    join mine on mine.match_id = placed.match_id
    left join inferred on inferred.match_id = placed.match_id
                      and inferred.is_player1 = placed.is_player1
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
       end as direction
  from handed h;

comment on column ask.shots.direction is
  'Where the shot went, as the Video tab''s Direction filter names it: for serves Wide, Body or T; for other shots Crosscourt, Down the Line, Inside Out, Inside In or Middle. A forehand hit from the backhand side, or a backhand hit from the forehand side, is Inside Out (crosscourt) or Inside In (down the line), never Crosscourt or Down the Line; null when not recorded.';
