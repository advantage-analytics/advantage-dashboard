-- Second half of 20261001183845_claim_completion_service_role_only.sql.
--
-- That migration made the 7-argument `complete_program_claim` ignore its
-- evidence parameters but left it executable by `authenticated`, so a direct
-- /rest/v1/rpc call can still START a claim without the pending-claim row,
-- the pilot terms screen or the form's rate limits. With the new caller in
-- production nothing legitimate uses it, and it goes.
--
-- Rollback: re-run section 2 of 20261001183845 (`create function` restores
-- Supabase's default grants, so follow it with
-- `revoke execute ... from public, anon`).

drop function if exists public.complete_program_claim(
  text, text, text, text, boolean, boolean, text
);
