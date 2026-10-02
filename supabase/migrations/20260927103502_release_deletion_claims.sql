-- T27: release a deletion claim when a later deletion step fails.
--
-- 20260919045221 made deletion durable. `prepare_my_account_deletion()` claims
-- the caller in admin_actor_delete_claims before releasing their team data,
-- and `admin_claim_match_storage_purge()` claims every match in
-- match_storage_purge_claims before purgeMatchStorage() removes a byte. From
-- the moment either claim commits, the console's guard triggers
-- (`reject_deleting_actor`, `reject_purging_match`) refuse every admission of
-- that actor or match with `*-deletion-in-progress`. That is the point of the
-- design — an admission must not land on a match whose blobs are half gone —
-- and it is also why a deletion that stops AFTER the claim protects the person
-- or the match for ever: both claim tables cascade from their parent, so a
-- deletion that completes cleans up on its own, but a failed step leaves the
-- parent standing and the claim with it. Neither claim has an expiry,
-- `on conflict do nothing` means a retry reuses the stuck row rather than
-- replacing it, and until now the way back was hand-run SQL.
--
-- The steps that can fail after a claim:
--
--   deleteAccount (src/components/dashboard/settings/actions.ts): the
--     personal-matches read, a purgeMatchStorage() throw, the matches delete
--     and the auth delete. The last one fails after the user's data is already
--     gone — the page tells them to contact support — and is released all the
--     same: the claim guards deletion I/O, and that I/O is over.
--   DELETE /api/matches/[matchId] (route.ts): the matches delete after the
--     purge. The 409 purge refusal takes no claim — the claim RPC returns
--     false before its insert — so that branch has nothing to release.
--
-- Two compensating functions, one per claim table, each the mirror image of
-- its claim: the same parent row lock first, so a release serializes with a
-- console admission that is mid-check on the same claim, then the delete.
--
--   release_my_account_deletion_claim() returns boolean — EXECUTE to
--     authenticated only, no argument: it deletes the admin_actor_delete_claims
--     row for auth.uid() and nobody else's, and returns whether one was
--     removed. Called with the USER's client, like
--     prepare_my_account_deletion(), and raises 28000 the same way when there
--     is no session.
--   admin_release_match_storage_purge(p_match_ids uuid[]) returns integer —
--     EXECUTE to service_role only, like admin_claim_match_storage_purge():
--     deletes the match_storage_purge_claims rows for those ids and returns
--     how many went. Both callers pass ids the request already proved the
--     caller owns (the route's `created_by = user.id` lookup; the action's own
--     personal-matches list), never a body field. A null or empty array
--     releases nothing and returns 0.
--
-- Both are best-effort at the call sites: a release that fails is logged and
-- never changes the message the person sees, because a claim left behind is
-- recoverable by hand and a message about the wrong failure is not.
--
-- Live on 2026-09-27 10:22 UTC (Supabase MCP, SELECT only), the last check
-- before this file was written: 0 rows in match_storage_purge_claims and 0 in
-- admin_actor_delete_claims; migration head 20260927094436
-- (abandon_admin_result_items); to_regprocedure of both new signatures is
-- null; pg_get_functiondef of admin_claim_match_storage_purge(uuid[]),
-- admin_claim_actor_deletion(uuid), prepare_my_account_deletion() and
-- admin_uploads_private.reject_purging_match() is byte-for-byte the body in
-- 20260919045221 — security definer, search_path pinned empty, EXECUTE
-- service_role-only on the two claim RPCs and authenticated-only on prepare
-- (service_role and public both lack it); both claim tables have RLS enabled,
-- one service_role SELECT policy each and no table privileges for anon,
-- authenticated or service_role. Applying this reads and writes no existing
-- row. It is one-shot: `create function` fails loudly on a second apply rather
-- than hiding a divergent schema.
--
-- Applied to the live database via the Supabase MCP as
-- `release_deletion_claims`; this file carries the version the live project
-- recorded on apply.

create function public.release_my_account_deletion_claim()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- The parent lock admin_claim_actor_deletion and reject_deleting_actor take,
  -- so an admission mid-check finishes before the claim it is reading goes.
  perform 1 from public.users where id = auth.uid() for update;
  delete from public.admin_actor_delete_claims where actor_user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.release_my_account_deletion_claim()
  from public, anon, authenticated, service_role;
grant execute on function public.release_my_account_deletion_claim()
  to authenticated;

comment on function public.release_my_account_deletion_claim() is
  'Called with the user''s own client when account deletion fails after prepare_my_account_deletion() took its claim: deletes the caller''s admin_actor_delete_claims row (auth.uid() only — there is no argument) under the users row lock and returns whether one was removed, so the admin console admits the person again. Best-effort at the call site; a completed deletion cascades the claim away and never needs this.';

create function public.admin_release_match_storage_purge(p_match_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_released integer;
begin
  if p_match_ids is null or cardinality(p_match_ids) = 0 then return 0; end if;
  -- Same lock, same order as admin_claim_match_storage_purge and
  -- reject_purging_match: parent rows first, in id order, then the claims.
  perform 1 from public.matches where id = any(p_match_ids) order by id for update;
  delete from public.match_storage_purge_claims where match_id = any(p_match_ids);
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;
revoke all on function public.admin_release_match_storage_purge(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.admin_release_match_storage_purge(uuid[])
  to service_role;

comment on function public.admin_release_match_storage_purge(uuid[]) is
  'Service-only. Called when a match delete fails after purgeMatchStorage() claimed the match in match_storage_purge_claims: deletes the claims for these ids under the matches row locks and returns how many were removed, so the admin console admits the match again. Callers pass ids the request already proved the caller owns, never a body field; null or empty releases nothing. A completed delete cascades the claim away and never needs this.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
begin
  -- The account release: exists, authenticated-only, definer, empty search_path.
  v_fn := 'public.release_my_account_deletion_claim()';
  if to_regprocedure(v_fn) is null then
    raise exception '%: function is missing', v_fn;
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '%: anon may execute it', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '%: authenticated may not execute it', v_fn;
  end if;
  if has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: service_role may execute it', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.prosecdef
  ) then
    raise exception '%: must be security definer', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception '%: search_path is not pinned empty', v_fn;
  end if;

  -- The purge release: exists, service_role-only, definer, empty search_path.
  v_fn := 'public.admin_release_match_storage_purge(uuid[])';
  if to_regprocedure(v_fn) is null then
    raise exception '%: function is missing', v_fn;
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '%: anon may execute it', v_fn;
  end if;
  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '%: authenticated may execute it', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: service_role may not execute it', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.prosecdef
  ) then
    raise exception '%: must be security definer', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception '%: search_path is not pinned empty', v_fn;
  end if;
end
$$;
