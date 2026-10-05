-- Brings twelve existing SECURITY INVOKER functions in line with the new
-- default (function_default_privileges_no_anon): no EXECUTE for PUBLIC or
-- `anon`. Each keeps its own named grant to `authenticated` and
-- `service_role`, so signed-in users and server code lose nothing.
--
-- Checked against the live database on 2026-10-01 before applying:
--   - no RLS policy, view, generated column, column default or index
--     expression references any of them;
--   - the only dependents are SECURITY DEFINER functions (which run as
--     `postgres`), `import_match_rows` (service-role only), six triggers
--     (a trigger fires without an EXECUTE check on its function) and
--     `programs_time_zone_check`, which `anon` cannot reach because it has no
--     INSERT or UPDATE policy on `programs`;
--   - 15 days of API logs show `calculate_match_stats`,
--     `backfill_returns_in_and_net_points` and `key_moments` called by the
--     service role only, and the other three never called over REST.
--
-- Rollback (`normalized_person_name` had the `anon` grant only, never PUBLIC):
--   grant execute on function
--     public.calculate_match_stats(uuid),
--     public.backfill_returns_in_and_net_points(uuid),
--     public.key_moments(uuid),
--     public.is_iana_time_zone(text),
--     public.match_is_upload_shaped(text, text),
--     public.program_players_clear_claimed_at(),
--     public.set_conferences_updated_at(),
--     public.update_match_stats_updated_at(),
--     public.users_block_admin_self_update(),
--     public.users_block_plan_self_update(),
--     public.users_individual_pilot_guard()
--   to public, anon;
--   grant execute on function public.normalized_person_name(text, text) to anon;

revoke execute on function
  public.calculate_match_stats(uuid),
  public.backfill_returns_in_and_net_points(uuid),
  public.key_moments(uuid),
  public.is_iana_time_zone(text),
  public.match_is_upload_shaped(text, text),
  public.normalized_person_name(text, text),
  public.program_players_clear_claimed_at(),
  public.set_conferences_updated_at(),
  public.update_match_stats_updated_at(),
  public.users_block_admin_self_update(),
  public.users_block_plan_self_update(),
  public.users_individual_pilot_guard()
from public, anon;
