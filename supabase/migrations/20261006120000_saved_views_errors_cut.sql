-- Verified against live saved_views_cut_check on 2026-10-07 (the five cuts of
-- 20260923210000_saved_views_rally_placement, nothing more) and applied there.
-- Add the Visualizations "errors" cut without changing any existing saved view.
alter table public.saved_views drop constraint saved_views_cut_check;
alter table public.saved_views add constraint saved_views_cut_check
  check (cut in ('serve', 'returnPlacement', 'returnContact', 'rallyPosition', 'rallyPlacement', 'errors'));
