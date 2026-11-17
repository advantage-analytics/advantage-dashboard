-- Two fixes to `20261117182112_label_todo`, both found in review:
--
-- 1. Verification pending read an add on any of the match's jobs. The queue
--    reads only the newest completed job, so an add on a job a re-run had
--    replaced kept the player's badge on "Verification pending" while no
--    labeller could see the match. It now reads the add on the newest job,
--    the one the queue uses.
--
-- 2. An add outlived its publish. A published session later reopened with
--    nobody assigned went back into To do with its old `added_at`, and read
--    as overdue at once. Publishing now takes the job out of `label_todo`;
--    a reopened match returns to Not in To do and an admin adds it again.

create or replace function public.match_label_states(p_match_ids uuid[])
returns table (match_id uuid, results_at timestamptz, has_video boolean, labelling boolean)
language sql
stable security definer
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
         or exists (
           select 1
             from public.label_todo t
            where t.job_id = j.id
         )
    from public.matches m
   cross join lateral (
     select pj.id,
            pj.completed_at,
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

-- ── Publish clears the add ──────────────────────────────────────────────────
-- Security definer: a publish may run as a role with no grant on
-- `label_todo`, and it must never fail for want of one.

create or replace function public.label_sessions_clear_todo_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.label_todo where job_id = new.job_id;
  return new;
end;
$$;

revoke execute on function public.label_sessions_clear_todo_on_publish() from public, anon, authenticated;

create trigger label_sessions_clear_todo_on_publish
  after update of status on public.label_sessions
  for each row
  when (new.status = 'complete' and old.status is distinct from 'complete' and new.kind = 'analyst')
  execute function public.label_sessions_clear_todo_on_publish();
