-- "Verification pending" for the customer. A player's match list, report and
-- Home need to know whether an unverified match is waiting on a labeller, and
-- nothing they can read says so: label_sessions is admin-only under RLS, and
-- processing_jobs shows a job to the person who uploaded it, not to the other
-- player or the rest of the program.
--
-- match_label_states() answers that one question for the matches the caller
-- asks about, as four columns:
--
--   match_id     the match
--   results_at   processing_jobs.completed_at of the match's latest completed
--                job: when the vendor's results landed
--   has_video    whether that job covers any video. Mirrors jobVideoSeconds()
--                in src/lib/services/labels/video-seconds.ts: the trimmed
--                span when the end is a finite number past the start, else
--                what was billed
--   labelling    whether a labeller holds the match right now: an analyst
--                session, labelling or submitted, with someone assigned
--
-- SECURITY DEFINER, because it reads two tables the caller cannot. What keeps
-- that safe:
--
--   * Rows come back only for matches in visible_match_ids(), which is the
--     matches SELECT policy restated (creator, my_player_ids() on either
--     seat, program membership). A match id the caller cannot read returns
--     nothing, exactly as an id that does not exist does.
--   * A verified match never comes back. It has nothing pending.
--   * A match with no completed job never comes back either.
--   * No labeller id, session id, session status or job id is selected. The
--     session is read inside EXISTS and leaves as one boolean.
--
-- A signed-out caller has no execute grant; called as service_role there is no
-- auth.uid(), so visible_match_ids() is empty and so is the answer.

create or replace function public.match_label_states(p_match_ids uuid[])
returns table (
  match_id uuid,
  results_at timestamptz,
  has_video boolean,
  labelling boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         j.completed_at,
         j.has_video,
         exists (
           select 1
             from public.label_sessions s
            where s.match_id = m.id
              and s.kind = 'analyst'
              and s.status in ('labelling', 'submitted')
              and s.assigned_to is not null
         )
    from public.matches m
   cross join lateral (
     select pj.completed_at,
            case
              when pj.end_time_seconds not in ('NaN', 'Infinity', '-Infinity')
               and pj.end_time_seconds > coalesce(pj.start_time_seconds, 0)
                then true
              else coalesce(pj.billable_seconds, 0) > 0
            end as has_video
       from public.processing_jobs pj
      where pj.match_id = m.id
        and pj.status = 'completed'
        and pj.completed_at is not null
      order by pj.completed_at desc, pj.id desc
      limit 1
   ) j
   where m.id = any (p_match_ids)
     and m.id in (select public.visible_match_ids())
     and m.verified is false;
$$;

comment on function public.match_label_states(uuid[]) is
  'For the matches the caller can read and that are not verified: when results landed, whether the job has video, and whether a labeller holds it. Never returns a labeller or session id.';

revoke execute on function public.match_label_states(uuid[]) from public, anon;
grant execute on function public.match_label_states(uuid[]) to authenticated, service_role;
