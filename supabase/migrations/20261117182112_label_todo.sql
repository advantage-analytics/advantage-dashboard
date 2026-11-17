-- The labellers' To do is chosen by an admin (Labeller To-do Picker, option A).
-- Before this, every analysed match since a fixed date entered To do, and the
-- labellers worked matches that did not need it.
--
-- One row per job an admin added. The queue (`src/lib/services/labels/queue.ts`)
-- puts a job in To do only with a row here; the label is due 36 h after
-- `added_at`. Remove deletes the row, and is refused once someone holds the
-- match. A match already in progress, sent back, handed in or published and
-- waiting for a check stays on the board without one.
--
-- Read and written only by the server with the service role: a labeller holds
-- no grant here, as on `processing_jobs`, and RLS with no policy keeps every
-- other role out.

create table public.label_todo (
  job_id uuid primary key references public.processing_jobs (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  added_by uuid references public.users (id) on delete set null,
  added_at timestamptz not null default now()
);

create index label_todo_match_id on public.label_todo (match_id);

alter table public.label_todo enable row level security;

revoke all on table public.label_todo from anon, authenticated;

-- ── Verification pending ────────────────────────────────────────────────────
-- A player's unverified match reads "Verification pending" while a labeller is
-- on it. It now also does while an admin has it in To do, and no longer from a
-- date: a match nobody chose is not promised a check. Same signature and
-- columns as 20261114205508_match_label_states, so its grants stand;
-- `labelling` now means "waiting on a labeller".

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
            where t.match_id = m.id
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
