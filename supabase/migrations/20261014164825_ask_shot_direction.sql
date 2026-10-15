-- ask.shots gains `direction`: the Video tab's Custom › Direction, so a
-- question about "forehand crosscourt" counts the same shots the Video filter
-- of that name shows.
--
-- ask.shots.zone is the stored direction (`directionZone` in
-- src/lib/services/splitstep/derivation/court.ts). The Video filter starts
-- from it and renames one case (`shotDirection()` in
-- src/components/dashboard/matches/match-detail/match-filters/shot-geometry.ts):
-- a FOREHAND struck from the hitter's backhand half — the ad half for a
-- right-hander, the deuce half for a left-hander — is Inside Out when its zone
-- is Crosscourt and Inside In when it is Down the Line. Backhands, an unknown
-- hand and an unmeasured contact are never renamed. On the first video match
-- checked (19b3cdf6…, both players right-handed) 189 of 405 forehands with a
-- rally zone were inside-out or inside-in, so counting zone alone put Ask's
-- "forehand crosscourt" at 99 shots where the Video filter shows 33.
--
-- The product owner's call (2026-10-14): keep them apart. Crosscourt means
-- crosscourt only; Inside Out and Inside In are directions of their own.
--
-- Each rule below restates its TypeScript twin, in the same order:
--
--   ask.hand_of(raw)  normalizePlayerHand() (player-hands.ts): "right",
--                     "RIGHT HANDED", "R" → right; the left forms → left;
--                     anything else → null, never a guess.
--   the seat's hand   transformDbMatchToMatch() (match-detail-server.ts):
--                     the match row first — player_hand is the viewer's
--                     seat (the side ask.my_side() names, which is
--                     resolveYouSide()'s), opponent_hand the other — then
--                     that seat's account profile (users.hand by the seat's
--                     id); then inferHand() (shot-geometry.ts): the seat's
--                     forehands with shot_number >= 1 and a known half, at
--                     least 10 of them, 65% or more on one half.
--   the half          hitterHalf(): facing +y from the low-y end, -y from
--                     the high-y end (net at y = 11.885); x * facing > 0 is
--                     deuce. Null when x or y is unmeasured, x = 0 or y is
--                     exactly the net.
--
-- `direction` for a serve is its zone (Wide, Body, T); for a rally shot
-- Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when the
-- zone is. No coordinate leaves the view: only the label does
-- (tests/ask-views-parity.spec.ts holds the column list to that).
--
-- Kept in step by a parity spec that runs both rules over the same shots.
--
-- Columns are appended, so `create or replace view` keeps the view's grants
-- (SELECT to ask_reader alone) and every existing column's comment.
--
-- VERIFIED live after apply (2026-10-14, version 20261014164825):
--   * through public.ask_run_team_query as a member of the match's program,
--     forehands of 19b3cdf6… by direction: the program's player 56
--     Crosscourt, 55 Down the Line, 39 Inside Out, 21 Inside In, 43 Middle;
--     the opponent 33, 72, 66, 63, 16 — the Video filter's counts for the
--     same match, computed beforehand from shotDirection()'s rule.
--   * columns: match_id, point_number, shot_number, mine, shot_type,
--     spin_type, speed_mph, zone, result, direction (no coordinate).
--   * ask.shots SELECT: ask_reader t, authenticated f. ask.hand_of execute:
--     ask_reader t, authenticated f, anon f.
--   * read as postgres with no viewer pinned, ask.shots returns 0 rows.

create or replace function ask.hand_of(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or v = '' then null
    when v = 'r' or v like 'right%' then 'right'
    when v = 'l' or v like 'left%' then 'left'
    else null
  end
    from (select lower(btrim(raw)) as v) as t;
$$;

comment on function ask.hand_of(text) is
  'Restates normalizePlayerHand() (src/components/dashboard/matches/player-hands.ts): right, left, or null for anything else.';

revoke all on function ask.hand_of(text) from public, anon, authenticated;
grant execute on function ask.hand_of(text) to ask_reader;

create or replace view ask.shots as
with mine as (
  select m.id as match_id,
         ask.my_side(m.*) = 'player1' as me_is_player1,
         -- The match row's hands, then the seat's account profile.
         coalesce(
           ask.hand_of(m.player_hand),
           (select ask.hand_of(u.hand)
              from public.users u
             where u.id = case when ask.my_side(m.*) = 'player1'
                               then m.player1_id else m.player2_id end)
         ) as my_hand,
         coalesce(
           ask.hand_of(m.opponent_hand),
           (select ask.hand_of(u.hand)
              from public.users u
             where u.id = case when ask.my_side(m.*) = 'player1'
                               then m.player2_id else m.player1_id end)
         ) as opponent_hand
    from public.matches m
   where m.id in (select ask.my_match_ids())
     and ask.my_side(m.*) is not null
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

comment on column ask.shots.direction is
  'Where the shot went, as the Video tab''s Direction filter names it: for serves Wide, Body or T; for other shots Crosscourt, Down the Line, Inside Out, Inside In or Middle. A forehand hit from the backhand side is Inside Out (crosscourt) or Inside In (down the line), never Crosscourt or Down the Line; null when not recorded.';

-- Two existing comments, corrected beside it. zone now points at direction;
-- shot_number said the serve is always 1, but a faulted first serve (or a
-- feed) is stored as 0 and the serve that started the rally is 1 — the
-- Video filter's "1 = the serve" counts the same way.
comment on column ask.shots.zone is
  'Where the shot was aimed, as stored: for serves Wide, Body or T; for other shots Crosscourt, Down the Line or Middle; null when not recorded. Use direction instead for any question about direction.';
comment on column ask.shots.shot_number is
  'The shot''s order within the point: 1 is the serve that started the rally (the second serve after a fault), 2 the return, 3 the server''s next shot, and so on. 0 is a faulted first serve or a feed, never part of the rally.';
