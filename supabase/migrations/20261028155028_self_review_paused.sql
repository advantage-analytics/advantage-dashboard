-- Self review is paused (Advantage Review step 2, reverted from the app; the
-- feature waits in its own open PR). `20261028025013_self_review` stays live,
-- and its functions were granted to `authenticated`, so with the UI gone a
-- signed-in client could still call them through the API and write points.
-- This takes that door away and nothing else.
--
-- Kept on purpose, because they only guard a match Verified by Advantage or
-- are inert without these functions: the `label_sessions.kind` /
-- `label_points` columns, `matches_drop_self_review`, the analyst-only
-- deletion checks, `matches_guard_verification` and the
-- `zz_points_guard_verified_match` / `zz_shots_guard_verified_match`
-- triggers (`20261028050138_verified_player_lock`).
--
-- NOT revoked: `matches_same_player`. The Verified lock trigger calls it as
-- the invoker under the client's own JWT, so revoking it would refuse every
-- client update of a Verified match.
--
-- `service_role` keeps EXECUTE; no server code calls these today.
--
-- To bring self review back, re-grant in its PR:
--   grant execute on function public.can_fix_match_points(uuid) to authenticated;
--   grant execute on function public.self_review_state(uuid) to authenticated;
--   grant execute on function public.self_review_save(uuid, jsonb) to authenticated;

revoke execute on function
  public.can_fix_match_points(uuid),
  public.self_review_state(uuid),
  public.self_review_save(uuid, jsonb),
  public.self_review_reading(text),
  public.self_review_result_type(text, text, text)
from authenticated;
