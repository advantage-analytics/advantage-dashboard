-- Two security-advisor lines closed, one deliberately left open (intent 6(a)+(c);
-- 6(b) is DROPPED, not deferred — see "What is NOT revoked" below).
--
-- 1. key_moments(uuid): pin search_path = 'public', NOT ''.
--    The advisor lists it under function_search_path_mutable. Every other
--    function in this folder pins '' and schema-qualifies its reads; this one
--    cannot without a rewrite. Its body (20260508000000_increase_key_moments_limit.sql,
--    lines 41–111) reads UNQUALIFIED `points` and `shots` seven times, so an
--    empty search_path would make every call raise "relation points does not
--    exist". 'public' pins the resolution the function has always had — a
--    caller can no longer redirect `points` at a table of their own by
--    setting their session search_path — without touching the body. It is
--    plain INVOKER (no security definer), so RLS on points/shots still applies
--    to whoever calls it. Nothing in src/ or supabase/functions/ calls the SQL
--    function today (the `matches.key_moments` column is a different thing);
--    the function stays either way.
--
-- 2. matches_block_client_regraft(): revoke EXECUTE from public, anon and
--    authenticated (pattern: 20260925023148_match_video_expiry_sweep.sql:150).
--    It is SECURITY DEFINER (20260913120000, the live body), so it sits on the
--    advisor's anon_security_definer_function_executable list. It only ever
--    runs as the BEFORE INSERT OR UPDATE trigger on matches, and Postgres does
--    not check EXECUTE privilege when a trigger fires — the trigger's owner
--    is what runs it — so the revoke cannot weaken the regraft guard. It just
--    removes a pointless direct RPC surface. tests/rls-workspace-isolation.spec.ts
--    asserts the trigger's 42501 refusal after this is applied, which proves
--    the trigger still fires with EXECUTE gone.
--
-- What is NOT revoked — the seven RLS helpers, and this is on purpose:
--
--   is_admin, is_program_staff, my_player_ids, user_program_ids,
--   user_program_role, visible_match_ids, visible_point_ids
--
-- The repo shipped exactly that revoke on 2026-08-21 (20260821144754) and put
-- it back within the minute (20260821144843). RLS policy expressions run as
-- the QUERYING role, not the policy owner, so with EXECUTE revoked an anon
-- read of matches / points / shots / program_events / program_claims raised
-- "permission denied for function …" — a 500 — instead of returning 0 rows.
-- 20260822090300_my_player_ids.sql:41-45 re-grants anon on the seventh for the
-- same reason, and the restore migration records that the "runs as the policy
-- owner" probe which motivated the revoke was invalid (cached plan). The
-- advisor's anon_security_definer_function_executable line on those seven is
-- a documented accept, not a to-do. No other grant changes here.
--
-- Applied to the live database via the Supabase MCP as
-- `key_moments_search_path_regraft_grants`; this file carries the version the
-- live project recorded on apply.

alter function public.key_moments(uuid) set search_path = 'public';

revoke execute on function public.matches_block_client_regraft() from public, anon, authenticated;

-- Prepend a trigger-only note to the function's LIVE comment rather than
-- replacing it: the live text (last written by 20260911000000, then possibly
-- amended live) documents the player1_id and upload-shape rules, and the
-- repo lags the database. Guarded so a re-apply does not stack the note.
do $$
declare
  v_old text := obj_description('public.matches_block_client_regraft()'::regprocedure, 'pg_proc');
begin
  if v_old is null or position('Trigger-only' in v_old) = 0 then
    execute format(
      'comment on function public.matches_block_client_regraft() is %L',
      'Trigger-only (BEFORE INSERT OR UPDATE on matches): EXECUTE is revoked from public, anon and authenticated, which does not affect trigger firing. '
        || coalesce(v_old, '')
    );
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'public.key_moments(uuid)'::regprocedure
       and p.proconfig @> array['search_path=public']
  ) then
    raise exception 'public.key_moments(uuid): search_path is not pinned to public';
  end if;

  if has_function_privilege('anon', 'public.matches_block_client_regraft()', 'execute') then
    raise exception 'public.matches_block_client_regraft(): anon may still execute it';
  end if;

  if has_function_privilege('authenticated', 'public.matches_block_client_regraft()', 'execute') then
    raise exception 'public.matches_block_client_regraft(): authenticated may still execute it';
  end if;
end
$$;
