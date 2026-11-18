-- Verified against live saved_views_cut_check on 2026-11-17 (the six cuts of
-- 20261006120000_saved_views_errors_cut, nothing more) and applied there.
-- Add the Visualizations "approaches" cut without changing any existing saved view.
alter table public.saved_views drop constraint saved_views_cut_check;
alter table public.saved_views add constraint saved_views_cut_check
  check (cut in ('serve', 'returnPlacement', 'returnContact', 'rallyPosition', 'rallyPlacement', 'errors', 'approaches'));
