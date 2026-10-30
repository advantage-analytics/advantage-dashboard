-- Forced vs unforced errors, phase 2 (T11): the judged marker.
--
-- T1 (20261029222042_forced_errors_judged) made `calculate_match_stats` count
-- `match_stats.forced_errors` only where `matches.errors_judged_at` is set
-- (or the match is a SwingVision import). Nothing set it yet. From here the
-- label console's Mark complete sets it: `verify_match` takes a third
-- parameter, `p_errors_judged`, true when every error in the session is
-- marked forced or unforced (session-status-session.ts passes
-- `unmarkedErrors(...)` being empty, the same gate T12 blocks the dialog on).
--
--   * true  → `errors_judged_at = now()`, then `calculate_match_stats` runs
--             again inside the same transaction. Mark complete's publish
--             already ran it (apply-session.ts `recompute`, before this call)
--             against a NULL marker, so the row it left has NULL
--             forced_errors; the re-run is what makes the stamp and the stat
--             row agree atomically. Verify still comes last — a publish whose
--             recompute fails is never verified, as before.
--   * false → the column is left as it is (an unmarked error can reach a
--             publish only from a stale client; T12 refuses it in the dialog).
--
-- `unverify_match` is unchanged: Reopen keeps the marker, and completing
-- again needs every error marked like any new publish.
--
-- Signature: the live function was `verify_match(uuid, uuid)`. Adding a
-- defaulted parameter with `create or replace` would leave BOTH overloads,
-- and a call with two arguments — PostgREST's `rpc('verify_match', {p_match_id,
-- p_actor})` as much as `select verify_match(a, b)` — then fails as ambiguous.
-- A thin two-argument wrapper has the same problem, so the old overload is
-- dropped (run with `execute_sql`; the MCP's `apply_migration` declines DROP)
-- and the grants are restated: service_role only, never anon.
--
-- The 18 matches verified before this migration are not touched: no UPDATE
-- here, and `errors_judged_at` stays NULL on them until each is reopened and
-- completed again with every error marked.

drop function if exists public.verify_match(uuid, uuid);

create function public.verify_match(
  p_match_id uuid,
  p_actor uuid,
  p_errors_judged boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.users u where u.id = p_actor and u.is_admin
  ) then
    raise exception 'Only an Advantage admin can verify a match'
      using errcode = '42501';
  end if;
  update public.matches
     set verified = true,
         verified_at = now(),
         verified_by = p_actor,
         errors_judged_at = case
           when p_errors_judged then now()
           else errors_judged_at
         end
   where id = p_match_id
  returning verified_at into v_at;
  if v_at is null then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;
  -- The stat row was computed before the stamp existed (apply-session.ts
  -- recompute); count forced errors now that the match is judged.
  if p_errors_judged then
    perform public.calculate_match_stats(p_match_id);
  end if;
  return v_at;
end;
$$;

comment on function public.verify_match(uuid, uuid, boolean) is
  'Verified by Advantage: sets matches.verified with verified_at = now() and '
  'verified_by = p_actor, who must be an admin. With p_errors_judged it also '
  'stamps errors_judged_at = now() and re-runs calculate_match_stats so '
  'match_stats.forced_errors is counted; false leaves the stamp as it is. '
  'service_role only.';

revoke execute on function public.verify_match(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.verify_match(uuid, uuid, boolean)
  to service_role;
