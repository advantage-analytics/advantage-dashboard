-- Applied live 2026-10-26 as version 20261026190847, right after the production deploy
-- that ships the code it pairs with.
--
-- Pilot terms version 2: the team terms now say video from high school and
-- junior teams is never used to train models (Terms and Conditions 2.0 §6,
-- Privacy Policy 1.4 §3). A new version means every coach accepts again before
-- their next creation or claim — see the header of
-- 20260926181544_pilot_terms_acceptances.sql.
--
-- Mirrors `PILOT_TERMS_VERSION` in src/lib/services/programs/pilot-terms.ts.
-- Apply together with the deploy that ships that constant: applied ahead of
-- it, the enforcing RPCs refuse every coach whose screen still records the
-- old version.

create or replace function public.current_pilot_terms_version()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '2026-fall-pilot-2'::text;
$$;
