-- SwingVision shots: a point's deciding rally ends at the first feed after
-- its serve.
--
-- Follow-up to swingvision_keep_deciding_rally, which kept everything from a
-- point's last serve on. Now and then SwingVision also files the NEXT point's
-- feed, and the ball hit back off it, under this point, numbered on from the
-- rally (two points across every SwingVision match on 2026-09-28). A feed is
-- never part of a rally, so the feed and everything after it go — the same
-- cut keepDecidingRallies() in process-match makes. Points without a
-- video_time on every shot cannot be ordered and are left to the workbook
-- repair; the eyes-on verifier's fixtures are left alone. Idempotent.
create temp table trailing_feed_shots on commit drop as
select s.id, s.point_id, p.match_id, s.shot_type, s.video_time
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

create temp table trailing_feed_cut on commit drop as
select f.point_id, min(f.video_time) as video_time
from trailing_feed_shots f
join (
  select point_id, max(video_time) as video_time
  from trailing_feed_shots
  where shot_type in ('First Serve', 'Second Serve')
  group by point_id
) l on l.point_id = f.point_id
where f.shot_type = 'Feed'
  and f.video_time > l.video_time
group by f.point_id;

create temp table trailing_feed_dropped on commit drop as
select s.id, s.point_id, s.match_id
from trailing_feed_shots s
join trailing_feed_cut c on c.point_id = s.point_id
where s.video_time >= c.video_time;

delete from public.shots s
using trailing_feed_dropped d
where s.id = d.id;

update public.points p
set rally_length = coalesce(
  (select max(s.shot_number) from public.shots s where s.point_id = p.id),
  0
)
where p.id in (select point_id from trailing_feed_dropped);

do $$
declare
  touched uuid;
begin
  for touched in select distinct match_id from trailing_feed_dropped loop
    perform public.calculate_match_stats(touched);
    perform public.backfill_returns_in_and_net_points(touched);
  end loop;
end;
$$;
