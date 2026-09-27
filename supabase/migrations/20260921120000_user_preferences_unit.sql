-- Visualizations Phase 2C: the distance unit every chart and readout follows.
-- One value per user; NOT NULL with a default like every other column here,
-- so existing rows read 'ft' and the app's DEFAULT_PREFERENCES stays in step.
alter table public.user_preferences
  add column unit text not null default 'ft'
  check (unit in ('ft', 'm'));
