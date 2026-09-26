-- Visualizations Phase 1.2: the Heat chart and the Rally position cut are saveable.
-- Only the two value checks widen; grants and RLS are untouched.
alter table public.saved_views drop constraint saved_views_cut_check;
alter table public.saved_views add constraint saved_views_cut_check
  check (cut in ('serve','returnPlacement','returnContact','rallyPosition'));
alter table public.saved_views drop constraint saved_views_chart_check;
alter table public.saved_views add constraint saved_views_chart_check
  check (chart in ('scatter','zones','heat'));
