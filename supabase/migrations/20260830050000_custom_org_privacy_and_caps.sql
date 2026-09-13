-- Custom orgs are private workspaces, and 20260830000931 shipped them into a
-- table whose SELECT policy predates the distinction. Two fixes, one re-grant:
--
-- 1. `programs` had a blanket `using (true)` SELECT policy ("Programs are
--    publicly readable"), written when every row was a public collegiate
--    directory entry. A custom org row (school_name, status, flags, raw
--    owner_user_id) was therefore readable by anyone via PostgREST with
--    `org_type=neq.college`. College rows stay public — the claim flow's
--    directory depends on it — while custom rows narrow to their owner and
--    their members. Membership, not staff: `user_program_role()` includes
--    players, and a player's dashboard joins `programs` through
--    `program_members` to resolve the workspace at all
--    (`listProgramWorkspaces`), so `is_program_staff()` here would have locked
--    every player out of their own club.
--
-- 2. `create_custom_program` had no per-user cap: one account could loop the
--    RPC and mint unbounded team workspaces against the paid vendor budget.
--    Author decision, two halves: custom orgs draw the INDIVIDUAL monthly
--    processing figure rather than the collegiate 75h (enforced in
--    `splitstep/quota.ts` — `quotaTierFor()` — until a paid plan raises it),
--    and, defense-in-depth here in the definer, one account may own at most
--    TWO custom orgs. The count is serialized per user with an advisory
--    transaction lock, the same pattern `reserve_processing_quota` uses, so
--    two concurrent calls cannot both pass the check.
--
--    The replacement also sets `roster_public = false` on custom rows: the
--    column defaults true because a collegiate roster is scouting material
--    (`pooled_roster()` serves any program whose flag is set, keyed by id),
--    but a private club's member names are nobody's scouting material until
--    its owner opts in via Team settings.
--
-- After 20260830000931 was applied, EXECUTE on the RPC was revoked from
-- `authenticated` as interim mitigation; the grant at the bottom re-opens it
-- now that both findings are fixed.

-- ── 1. programs SELECT: college public, custom member-only ───────────────────

drop policy "Programs are publicly readable" on public.programs;

create policy "Programs readable: college public, custom orgs member-only"
  on public.programs
  for select
  using (
    org_type = 'college'
    or owner_user_id = (select auth.uid())
    or public.user_program_role(id) is not null
  );

-- ── 2. create_custom_program: per-user ownership cap of 2 ────────────────────

create or replace function public.create_custom_program(
  p_name text,
  p_org_type text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 'college' is deliberately not accepted: collegiate programs enter through
  -- the seeded directory and the claim flow, never through self-serve
  -- creation — that is what keeps the claim flow's review meaning anything.
  if p_org_type is null
     or p_org_type not in ('club', 'high_school', 'academy', 'other') then
    raise exception 'invalid org type' using errcode = '22023';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  -- Serialize this user's creations, so two concurrent calls cannot both read
  -- "1 owned" and both insert. Transaction-scoped: releases on commit or
  -- rollback with no cleanup path.
  perform pg_advisory_xact_lock(
    hashtext('create_custom_program:' || v_uid::text)
  );

  -- At most two self-serve orgs per owner. Defense-in-depth on top of the
  -- reduced processing quota (splitstep/quota.ts): the cap is what bounds the
  -- blast radius if the tier mapping ever regresses. SQLSTATE 54000
  -- ("program_limit_exceeded" — for once the class name is literal) is what
  -- `createCustomProgram()` matches to say "limit reached" rather than
  -- "something failed".
  if (select count(*)
        from public.programs
       where owner_user_id = v_uid
         and org_type <> 'college') >= 2 then
    raise exception
      'custom org limit reached: one account may own at most 2'
      using errcode = '54000';
  end if;

  insert into public.programs (
    org_type, school_name,
    program_key, school_group, team,
    status, owner_user_id, claimed_at,
    roster_public
  ) values (
    p_org_type, v_name,
    null, null, null,
    'active', v_uid, now(),
    -- Private by default, unlike the collegiate directory rows the column's
    -- default was written for: pooled_roster() serves any program with this
    -- flag set, and a club's member names are not public scouting material
    -- until its owner says so.
    false
  )
  returning id into v_id;

  insert into public.program_members (program_id, user_id, role, upload_enabled)
  values (v_id, v_uid, 'owner', true);

  return jsonb_build_object('program_id', v_id);
end;
$function$;

-- ── 3. Re-open the RPC to signed-in users ────────────────────────────────────
-- The function checks auth itself, but there is no reason for anon to be able
-- to call it at all.
revoke all on function public.create_custom_program(text, text) from public;
revoke execute on function public.create_custom_program(text, text) from anon;
grant execute on function public.create_custom_program(text, text) to authenticated;
