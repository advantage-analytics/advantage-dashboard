-- Pilot terms version 3: both flows now say the video analysis provider uses
-- match video, including video from high school and junior teams, to improve
-- its analysis models (Terms and Conditions 2.1 §6, Privacy Policy 1.5 §3, §10).
-- Version 2 promised junior team video was never used to train models.
--
-- Mirrors `PILOT_TERMS_VERSION` in src/lib/services/programs/pilot-terms.ts.
-- Apply together with the deploy that ships that constant.

create or replace function public.current_pilot_terms_version()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '2026-fall-pilot-3'::text;
$$;
