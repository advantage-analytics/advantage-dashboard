-- Verified against live saved_views_cut_check on 2026-09-23.
-- Add one cut without changing any existing saved view.
alter table public.saved_views drop constraint saved_views_cut_check;
alter table public.saved_views add constraint saved_views_cut_check
  check (cut in ('serve', 'returnPlacement', 'returnContact', 'rallyPosition', 'rallyPlacement'));
