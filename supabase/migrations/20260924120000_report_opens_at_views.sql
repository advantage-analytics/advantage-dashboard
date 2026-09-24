-- "Match report opens at" follows the report's rail views (F1): Statistics ·
-- Visualizations · Video, stored as their `?tab=` values so the app needs no
-- mapping layer. 'story' no longer exists; 'stats' and 'video' are renamed.
alter table public.user_preferences
  drop constraint user_preferences_report_opens_check;

update public.user_preferences
  set match_report_opens_at =
    case when match_report_opens_at = 'video' then 'film' else 'statistics' end
  where match_report_opens_at not in ('statistics', 'shots', 'film');

alter table public.user_preferences
  alter column match_report_opens_at set default 'statistics';

alter table public.user_preferences
  add constraint user_preferences_report_opens_check
  check (match_report_opens_at in ('statistics', 'shots', 'film'));
