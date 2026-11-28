-- 2027 pricing, stage G · team terms: a second terms version for January
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it BEFORE January 1, 2027 (UTC).
-- It can go in any time before then: it only widens what the three
-- program-creating RPCs accept, and nothing records the new version until the
-- app starts showing it on that date.
--
-- WHAT CHANGES. From January 1 a coach claiming a program, or creating a club,
-- high school or academy team, that is not on a running pilot accepts the
-- "Team terms" (`TEAM_TERMS_VERSION` = '2027-team-1' in
-- src/lib/services/programs/pilot-terms.ts) instead of the fall pilot's
-- ('2026-fall-pilot-3', `current_pilot_terms_version()`). A program still on
-- a running pilot keeps the pilot's. So from that day TWO versions are live
-- at once, and the gate has to accept either.
--
-- Which of the two a given claim needs is decided by the app, on the server
-- (`pilot-terms-server.ts`): it shows one, and records only the one it
-- showed. The database's job is unchanged: no creation or claim without an
-- acceptance at a live version.
--
-- WHAT IS REPLACED. `assert_pilot_terms_accepted` and
-- `stamp_pilot_terms_acceptance`, the two helpers
-- 20261002044101_pilot_terms_enforcement.sql wrote the rule into. Both bodies
-- are the LIVE definitions (read with pg_get_functiondef on 2026-11-26) with
-- one change: "the current pilot version" becomes "any accepted version".
-- The stamp additionally carries the version of the acceptance it copies,
-- where before there was only one it could be. `create_custom_program`,
-- `complete_program_claim` and `complete_program_claim_with_token` call these
-- helpers and are not touched. `current_pilot_terms_version()` is not
-- touched either: it still names the pilot's version, and the refusal's
-- message still quotes it.
--
-- UNTIL THIS IS APPLIED the database knows only the pilot version, and
-- `accepted_terms_versions()` does not exist. The app asks for that function
-- before showing the team terms; when the call fails it keeps showing, and
-- recording, the pilot terms, so a claim made in that window finishes as it
-- does today instead of being refused for ever. The wording is then stale,
-- which is why this goes in before the date.
--
-- Re-runnable: every statement is `create or replace` or a grant.

-- ── The accepted versions ───────────────────────────────────────────────────
--
-- The pilot's version is read from its own function, so a later pilot bump
-- (a new migration replacing `current_pilot_terms_version()`) moves this too.
-- '2027-team-1' mirrors `TEAM_TERMS_VERSION`; bump both in the same change.

create or replace function public.accepted_terms_versions()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[public.current_pilot_terms_version(), '2027-team-1']::text[];
$$;

-- Signed-in callers may read it (the app probes it with the coach's own
-- session to learn whether this migration is applied); signed out may not.
revoke execute on function public.accepted_terms_versions()
  from public, anon;
grant execute on function public.accepted_terms_versions()
  to authenticated, service_role;

-- ── The gate ────────────────────────────────────────────────────────────────

create or replace function public.assert_pilot_terms_accepted(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.pilot_terms_acceptances a
     where a.user_id = p_user_id
       and a.terms_version = any (public.accepted_terms_versions())
  ) then
    raise exception 'pilot terms not accepted for version %',
      public.current_pilot_terms_version()
      using errcode = 'TA001';
  end if;
end;
$$;

-- ── The stamp ───────────────────────────────────────────────────────────────

create or replace function public.stamp_pilot_terms_acceptance(
  p_user_id uuid,
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versions text[] := public.accepted_terms_versions();
  v_version  text;
  v_row_id   uuid;
  v_at       timestamptz;
begin
  -- Newest un-stamped acceptance of an accepted version.
  select a.id into v_row_id
    from public.pilot_terms_acceptances a
   where a.user_id = p_user_id
     and a.terms_version = any (v_versions)
     and a.program_id is null
   order by a.accepted_at desc
   limit 1
   for update;

  if v_row_id is not null then
    update public.pilot_terms_acceptances
       set program_id = p_program_id
     where id = v_row_id;
    return;
  end if;

  -- Every row is stamped already: record this program against the same
  -- acceptance moment, and the same version, rather than pretending the
  -- coach accepted again now.
  select a.accepted_at, a.terms_version into v_at, v_version
    from public.pilot_terms_acceptances a
   where a.user_id = p_user_id
     and a.terms_version = any (v_versions)
   order by a.accepted_at desc
   limit 1;

  if v_at is null then
    -- Unreachable when assert_pilot_terms_accepted ran first in the same
    -- transaction; kept as a hard stop rather than a silent no-op.
    raise exception 'pilot terms not accepted for version %',
      public.current_pilot_terms_version()
      using errcode = 'TA001';
  end if;

  insert into public.pilot_terms_acceptances
    (user_id, program_id, terms_version, accepted_at)
  values (p_user_id, p_program_id, v_version, v_at);
end;
$$;

-- ── Grants, re-asserted ─────────────────────────────────────────────────────
--
-- `create or replace` keeps each function's ACL; these restate the live state
-- (service role only) so the file reads as the whole truth.

revoke execute on function public.assert_pilot_terms_accepted(uuid)
  from public, anon, authenticated;
revoke execute on function public.stamp_pilot_terms_acceptance(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_pilot_terms_accepted(uuid)
  to service_role;
grant execute on function public.stamp_pilot_terms_acceptance(uuid, uuid)
  to service_role;
