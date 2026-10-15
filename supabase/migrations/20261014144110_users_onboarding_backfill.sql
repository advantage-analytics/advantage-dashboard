-- First-run onboarding backfill: settle the one-time onboarding moments for
-- people who were here before them, so the deploy does not greet existing
-- users as if they were new.
--
--   workspace_hint_done_at — anyone already in a program has long since met
--     the workspace switcher; "You're in <Team> now" is for the first time a
--     second workspace appears, not for every member's next visit.
--   first_report_tour_done_at — a player with more than one finished personal
--     match (a `match_stats` row, `created_by` = them, `program_id` null: the
--     same definition `countFinishedMatchesFor` uses) can never be offered the
--     first-report tour, and the activity tray's "Tour a sample report" step
--     counts either tour as done, so it does not reappear for them.
--
-- Applied with apply_migration version 20261014144110 (name:
-- users_onboarding_backfill): 12 members and 6 veteran players settled.
--
-- Data only: no schema, grant, policy or function change. Idempotent — each
-- update touches null columns only. Users the app settles later (a veteran
-- who opens a report) take the same path through `markTourDone`.
--
-- Rollback: not separable from timestamps users set themselves afterwards;
-- the backfilled rows share this migration's apply time, so
--   update public.users set workspace_hint_done_at = null
--     where workspace_hint_done_at = '<apply time>';
-- (and the same for first_report_tour_done_at) undoes it if ever needed.

update public.users u
set workspace_hint_done_at = now()
where u.workspace_hint_done_at is null
  and exists (select 1 from public.program_members pm where pm.user_id = u.id);

update public.users u
set first_report_tour_done_at = now()
where u.first_report_tour_done_at is null
  and (
    select count(distinct m.id)
    from public.matches m
    join public.match_stats s on s.match_id = m.id
    where m.created_by = u.id and m.program_id is null
  ) > 1;
