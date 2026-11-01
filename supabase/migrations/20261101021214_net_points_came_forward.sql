-- Net points count a player who came forward, not only one who hit a volley or
-- an overhead. `net_attempt_shot` is the SQL twin of `cameToNet`
-- (src/components/dashboard/matches/match-detail/match-filters/model.ts), so the
-- Statistics card, its Video cut, Ask and the AI summary all count the same
-- points. Change one and you must change the other.

create or replace function public.net_attempt_shot(
  p_shot_type text,
  p_shot_number integer,
  p_contact_y double precision
)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_shot_type in ('First Serve', 'Second Serve', 'Feed') then false
    when lower(btrim(coalesce(p_shot_type, ''))) like '%volley%' then true
    when lower(btrim(coalesce(p_shot_type, ''))) = 'overhead' then
      p_contact_y is null or abs(p_contact_y - 11.885) <= 8
    else
      p_shot_number >= 3
      and p_contact_y is not null
      and abs(p_contact_y - 11.885) <= 6.4
  end
$function$;

-- Only the two net_points_* subqueries change.
create or replace function public.backfill_returns_in_and_net_points(p_match_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  UPDATE public.match_stats ms SET
    first_returns_in = (
      SELECT COUNT(*) FROM public.shots ret
      JOIN public.shots serve
        ON ret.point_id = serve.point_id AND serve.shot_number = 1
      JOIN public.points p ON ret.point_id = p.id
      WHERE p.match_id = ms.match_id
        AND ret.shot_number = 2
        AND ret.is_player1 = ms.is_player1
        AND ret.is_player1 <> p.server_is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'First Serve'
        AND serve.result = 'In'
    ) + (
      -- Advantage Intelligence missed the return; the server struck again.
      SELECT COUNT(*) FROM public.points p
      JOIN public.matches m ON m.id = p.match_id
      JOIN public.shots serve
        ON serve.point_id = p.id AND serve.shot_number = 1
      WHERE p.match_id = ms.match_id
        AND m.source_provider = 'splitstep'
        AND p.server_is_player1 <> ms.is_player1
        AND serve.is_player1 = p.server_is_player1
        AND serve.shot_type = 'First Serve'
        AND serve.result = 'In'
        AND NOT EXISTS (
          SELECT 1 FROM public.shots r
          WHERE r.point_id = p.id AND r.shot_number = 2
            AND r.is_player1 <> p.server_is_player1
        )
        AND EXISTS (
          SELECT 1 FROM public.shots x
          WHERE x.point_id = p.id AND x.shot_number >= 2
            AND x.is_player1 = p.server_is_player1
        )
    ),
    second_returns_in = (
      SELECT COUNT(*) FROM public.shots ret
      JOIN public.shots serve
        ON ret.point_id = serve.point_id AND serve.shot_number = 1
      JOIN public.points p ON ret.point_id = p.id
      WHERE p.match_id = ms.match_id
        AND ret.shot_number = 2
        AND ret.is_player1 = ms.is_player1
        AND ret.is_player1 <> p.server_is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'Second Serve'
        AND serve.result = 'In'
    ) + (
      -- Advantage Intelligence missed the return; the server struck again.
      SELECT COUNT(*) FROM public.points p
      JOIN public.matches m ON m.id = p.match_id
      JOIN public.shots serve
        ON serve.point_id = p.id AND serve.shot_number = 1
      WHERE p.match_id = ms.match_id
        AND m.source_provider = 'splitstep'
        AND p.server_is_player1 <> ms.is_player1
        AND serve.is_player1 = p.server_is_player1
        AND serve.shot_type = 'Second Serve'
        AND serve.result = 'In'
        AND NOT EXISTS (
          SELECT 1 FROM public.shots r
          WHERE r.point_id = p.id AND r.shot_number = 2
            AND r.is_player1 <> p.server_is_player1
        )
        AND EXISTS (
          SELECT 1 FROM public.shots x
          WHERE x.point_id = p.id AND x.shot_number >= 2
            AND x.is_player1 = p.server_is_player1
        )
    ),
    net_points_appearances = (
      SELECT COUNT(*) FROM public.points p
      WHERE p.match_id = ms.match_id
        AND EXISTS (
          SELECT 1 FROM public.shots s
          WHERE s.point_id = p.id
            AND s.is_player1 = ms.is_player1
            AND public.net_attempt_shot(s.shot_type, s.shot_number, s.contact_y)
        )
    ),
    net_points_won = (
      SELECT COUNT(*) FROM public.points p
      WHERE p.match_id = ms.match_id
        AND (
          (ms.is_player1 AND p.won_by_player1)
          OR (NOT ms.is_player1 AND NOT p.won_by_player1)
        )
        AND EXISTS (
          SELECT 1 FROM public.shots s
          WHERE s.point_id = p.id
            AND s.is_player1 = ms.is_player1
            AND public.net_attempt_shot(s.shot_type, s.shot_number, s.contact_y)
        )
    ),
    updated_at = NOW()
  WHERE ms.match_id = p_match_id;
END;
$function$;

comment on column ask.match_stats.net_points_appearances is
  'Points on which this side came to the net: a volley, an overhead up the court, or any rally shot from inside the service line.';

-- Existing matches. Deliberately NOT a re-run of the function above: it also
-- rewrites first_returns_in and second_returns_in with no provider guard, which
-- would un-suppress those columns on Advantage Intelligence matches. Rows whose
-- figures do not move are left alone, so their Ask cache stays valid; a changed
-- row's updated_at comes from trigger_update_match_stats_updated_at.
with recount as (
  select
    ms.id,
    count(*) filter (where came.forward) as appearances,
    count(*) filter (
      where came.forward and p.won_by_player1 = ms.is_player1
    ) as won
  from public.match_stats ms
  left join public.points p on p.match_id = ms.match_id
  left join lateral (
    select exists (
      select 1 from public.shots s
      where s.point_id = p.id
        and s.is_player1 = ms.is_player1
        and public.net_attempt_shot(s.shot_type, s.shot_number, s.contact_y)
    ) as forward
  ) came on true
  group by ms.id
)
update public.match_stats ms
set net_points_appearances = recount.appearances,
    net_points_won = recount.won
from recount
where recount.id = ms.id
  and (
    ms.net_points_appearances is distinct from recount.appearances
    or ms.net_points_won is distinct from recount.won
  );
