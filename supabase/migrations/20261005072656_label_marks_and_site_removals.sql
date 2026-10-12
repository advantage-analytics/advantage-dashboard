-- Marks on the labelling console (the derivation's flags and fixes drawn on
-- the black rail), the site's own stroke removals, and dismissed suggestions.
--
-- Three things, all on label_* tables and nothing else: points, shots,
-- matches and processing_jobs are not touched.
--
-- 1. label_sessions.marks_enabled — whether the console computes marks for the
--    session. New sessions default to true. The ground-truth session
--    (Ace v Goodman, 54097a66…) is set false BEFORE anything below runs so the
--    backfill can never write one of its rows: its labels were made blind to
--    the derivation and must stay that way.
--
-- 2. label_shots.site_removal / site_removal_restored_at — a stroke the SITE
--    removed before the transcript was built (played.ts: a non-serve stroke
--    before the point's last serve, the receiver striking a fault back). The
--    seed writes it on every such row; `site_removal_restored_at` is set when
--    the labeller clicks Restore. A labeller's own removal stays
--    `status = 'deleted'`, which is what lets the comparison tell the two
--    apart. A row with `site_removal` set and no restore is a "ghost".
--
-- 3. label_points.dismissed — the suggestion keys the labeller dismissed
--    ('missing_shot:<afterEventId>', 'missing_point'). The only stored piece
--    of a mark's life-cycle; everything else is derived.

alter table public.label_sessions
  add column marks_enabled boolean not null default true;

-- Ground truth: never marked, never backfilled. Must precede the backfill.
update public.label_sessions
set marks_enabled = false
where id = '54097a66-c5f1-4697-a85f-8a97e5a8f947';

alter table public.label_shots
  add column site_removal text
    check (site_removal in ('hit_after_fault')),
  add column site_removal_restored_at timestamptz,
  add constraint label_shots_site_removal_restore_needs_removal
    check (site_removal_restored_at is null or site_removal is not null);

alter table public.label_points
  add column dismissed text[] not null default '{}';

-- Backfill: the played.ts rule over label rows. A vendor stroke (event_id set)
-- that is live, not a serve, and has a serve of the same point AFTER it on the
-- video was dropped by the site before the transcript was built. A null
-- stroke is a non-serve here: every seeded serve maps to first_serve or
-- second_serve (lib/services/labels/seed.ts `labelStroke`). The serve it is
-- measured against is any vendor serve row of the point, deleted or not — the
-- labeller's later removal of a serve does not change what the site did.
-- Only sessions with marks_enabled; the ground-truth session is also named
-- outright so no later edit to its flag can reach it through this file.
update public.label_shots s
set site_removal = 'hit_after_fault'
where s.site_removal is null
  and s.event_id is not null
  and s.status <> 'deleted'
  and (s.stroke is null or s.stroke not in ('first_serve', 'second_serve'))
  and s.video_time is not null
  and s.session_id <> '54097a66-c5f1-4697-a85f-8a97e5a8f947'
  and exists (
    select 1
    from public.label_sessions ls
    where ls.id = s.session_id
      and ls.marks_enabled
  )
  and exists (
    select 1
    from public.label_shots serve
    where serve.label_point_id = s.label_point_id
      and serve.event_id is not null
      and serve.stroke in ('first_serve', 'second_serve')
      and serve.video_time > s.video_time
  );
