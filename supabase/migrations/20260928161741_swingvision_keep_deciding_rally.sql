-- SwingVision shots: keep only each point's deciding rally.
--
-- SwingVision files every ball struck since the previous point under the NEXT
-- point's Set/Game/Point — feeds and knock-ups, lets, a first serve the
-- players called out and played on anyway — each rally numbered from shot 1.
-- process-match imported them all, so dead serves counted as first serves
-- (and as the opponent's first returns), dead shot 2s as returns and return
-- contacts, dead volleys as net points, and rally_length took the longest
-- rally. The export's Points row has no entry for the dead rallies and its
-- Type column reads `none` on every dead ball.
--
-- Same rule as keepDecidingRallies() in process-match: per point, keep every
-- shot from the last serve on and, before a second serve, the latest earlier
-- first serve as the fault — its result forced to 'Out' when the tracker
-- called it in, since the point was replayed on a second serve. Everything
-- earlier goes, feeds included. Only points whose shots all carry a
-- video_time can be ordered here; the two SwingVision matches exported
-- without one were repaired from their workbooks' Start Time instead.
--
-- The eyes-on verifier's hand-seeded fixtures are left alone, and stats are
-- recalculated only for the matches this touched. Idempotent: a second run
-- finds nothing before a point's last serve but its fault, already 'Out'.
create temp table deciding_rally_shots on commit drop as
select s.id, s.point_id, p.match_id, s.shot_type, s.result, s.video_time
from public.shots s
join public.points p on p.id = s.point_id
join public.matches m on m.id = p.match_id
where m.source_provider = 'swing-vision'
  and m.created_by is distinct from (
    select id from auth.users where email = 'eyes-on-verifier@example.com'
  )
  and not exists (
    select 1 from public.shots x
    where x.point_id = s.point_id and x.video_time is null
  );

create temp table deciding_rally_last_serve on commit drop as
select distinct on (point_id) point_id, id, shot_type, video_time
from deciding_rally_shots
where shot_type in ('First Serve', 'Second Serve')
order by point_id, video_time desc;

create temp table deciding_rally_fault on commit drop as
select distinct on (s.point_id) s.id, s.point_id
from deciding_rally_shots s
join deciding_rally_last_serve l on l.point_id = s.point_id
where l.shot_type = 'Second Serve'
  and s.shot_type = 'First Serve'
  and s.video_time < l.video_time
order by s.point_id, s.video_time desc;

create temp table deciding_rally_dropped on commit drop as
select s.id, s.point_id, s.match_id
from deciding_rally_shots s
join deciding_rally_last_serve l on l.point_id = s.point_id
where s.video_time < l.video_time
  and s.id not in (select id from deciding_rally_fault);

update public.shots s
set result = 'Out'
from deciding_rally_fault f
where s.id = f.id
  and s.result = 'In';

delete from public.shots s
using deciding_rally_dropped d
where s.id = d.id;

update public.points p
set rally_length = coalesce(
  (select max(s.shot_number) from public.shots s where s.point_id = p.id),
  0
)
where p.id in (
  select point_id from deciding_rally_dropped
  union
  select point_id from deciding_rally_fault
);

do $$
declare
  touched uuid;
begin
  for touched in
    select distinct s.match_id
    from deciding_rally_shots s
    where s.point_id in (
      select point_id from deciding_rally_dropped
      union
      select point_id from deciding_rally_fault
    )
  loop
    perform public.calculate_match_stats(touched);
    perform public.backfill_returns_in_and_net_points(touched);
  end loop;
end;
$$;
