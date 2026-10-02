-- Acquisition source: two more answers, and a null-source hole closed (T7).
--
-- Both constraints come from 20260926182506_onboarding_intake_answers.sql,
-- which is left as applied; this migration drops and re-adds them.
--
-- 1. users_acquisition_source_detail_only_other was written as
--    `acquisition_source_detail is null or acquisition_source = 'other'`.
--    When acquisition_source is NULL, `acquisition_source = 'other'` evaluates
--    to NULL, and a CHECK whose expression is NULL passes — so a detail could
--    be stored with no source at all (T6's live-spec finding). The app layer
--    never does this (it forces the detail null unless the source is `other`),
--    but the constraint exists to keep every other writer honest, and it did
--    not. `is not distinct from 'other'` is false for NULL, so the row is now
--    refused unless the source really is `other`.
--
-- 2. users_acquisition_source_values gains `reddit` and `linkedin`, in this
--    same migration so the live constraint accepts both before answers.ts
--    (T8) offers them — the other order would fail the onboarding step for
--    real users on exactly the two answers nobody had yet tested.
--
-- Nothing else is touched: no other constraint, column or grant. Pre-checked
-- live that no users row has a detail with a null source and no row carries a
-- source outside the new list, so both re-adds validate the existing data.
--
-- Applied to the live database via the Supabase MCP as
-- `acquisition_source_reddit_linkedin_null_detail` (version 20260926202555).

alter table public.users
  drop constraint if exists users_acquisition_source_values;

alter table public.users
  add constraint users_acquisition_source_values
    check (acquisition_source is null
           or acquisition_source in ('coach_or_teammate', 'swingvision_community',
                                     'social', 'google', 'college_event', 'utr',
                                     'reddit', 'linkedin', 'other'));

alter table public.users
  drop constraint if exists users_acquisition_source_detail_only_other;

alter table public.users
  add constraint users_acquisition_source_detail_only_other
    check (acquisition_source_detail is null
           or acquisition_source is not distinct from 'other');
