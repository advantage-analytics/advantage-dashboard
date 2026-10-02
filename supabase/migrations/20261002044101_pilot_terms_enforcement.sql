-- Pilot terms enforcement: the three program-creating RPCs a coach can reach
-- — `create_custom_program`, `complete_program_claim` and
-- `complete_program_claim_with_token` — refuse unless the acting user holds a
-- `pilot_terms_acceptances` row for `current_pilot_terms_version()`, and on
-- success stamp the new program's id onto that acceptance.
--
-- Depends on `20260926181544_pilot_terms_acceptances.sql` (the table and the
-- version function), which IS applied, and on
-- `20261001183845_claim_completion_service_role_only.sql`, which IS applied
-- and changed `complete_program_claim` to a service-role-only signature —
-- the section for it below was rewritten on 2026-10-01 to match.
--
-- SQLSTATE
-- --------
-- The refusal raises ONE named code: **TA001** ("terms acceptance"). Class
-- `TA` is outside every class Postgres defines (the standard reserves 0-4 and
-- A-H; Postgres's own extra classes are P0, XX, 5x, HV, F0, 0x…), and it is
-- not a PostgREST `PTxxx` status override, so it surfaces to supabase-js as
-- `error.code === "TA001"` with a plain 400. `TERMS_NOT_ACCEPTED_SQLSTATE` in
-- src/lib/services/programs/pilot-terms.ts is its one mirror; the three
-- server actions map it to the `"terms-not-accepted"` result reason.
--
-- Where the gate sits
-- -------------------
-- After the "already owned" idempotent return in the two claim RPCs, and
-- before any write everywhere: re-running a claim the caller already owns
-- creates nothing and so needs no acceptance, while a claim that would move a
-- program to a new owner does. `admin_create_program` and the other admin
-- RPCs are deliberately untouched — an admin creating a program on a coach's
-- behalf is not the coach accepting terms.
--
-- Stamping
-- --------
-- `program_id` goes onto the newest un-stamped acceptance of the current
-- version (the screen inserts a fresh row per creation). If every row is
-- already stamped — the coach accepted once and is creating a second team
-- without passing the screen again — a new row is inserted carrying the
-- SAME `accepted_at` as that acceptance, so the ledger still names every
-- program created under the terms without inventing a second acceptance
-- moment.
--
-- The function bodies below are the LIVE definitions (read with
-- pg_get_functiondef on 2026-09-26) plus the gate and the stamp; nothing
-- else in them changes. `create or replace` keeps each function's existing
-- grants, which are re-asserted at the end regardless.

-- ── Helpers ─────────────────────────────────────────────────────────────────
--
-- Two small SECURITY DEFINER functions so the rule is written once. Neither
-- is callable from a client: both are revoked from everything but the roles
-- that own the RPCs.

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
       and a.terms_version = public.current_pilot_terms_version()
  ) then
    raise exception 'pilot terms not accepted for version %',
      public.current_pilot_terms_version()
      using errcode = 'TA001';
  end if;
end;
$$;

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
  v_version text := public.current_pilot_terms_version();
  v_row_id  uuid;
  v_at      timestamptz;
begin
  -- Newest un-stamped acceptance of the current version.
  select a.id into v_row_id
    from public.pilot_terms_acceptances a
   where a.user_id = p_user_id
     and a.terms_version = v_version
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
  -- acceptance moment rather than pretending the coach accepted again now.
  select a.accepted_at into v_at
    from public.pilot_terms_acceptances a
   where a.user_id = p_user_id
     and a.terms_version = v_version
   order by a.accepted_at desc
   limit 1;

  if v_at is null then
    -- Unreachable when assert_pilot_terms_accepted ran first in the same
    -- transaction; kept as a hard stop rather than a silent no-op.
    raise exception 'pilot terms not accepted for version %', v_version
      using errcode = 'TA001';
  end if;

  insert into public.pilot_terms_acceptances
    (user_id, program_id, terms_version, accepted_at)
  values (p_user_id, p_program_id, v_version, v_at);
end;
$$;

revoke execute on function public.assert_pilot_terms_accepted(uuid)
  from public, anon, authenticated;
revoke execute on function public.stamp_pilot_terms_acceptance(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_pilot_terms_accepted(uuid)
  to service_role;
grant execute on function public.stamp_pilot_terms_acceptance(uuid, uuid)
  to service_role;

-- ── create_custom_program ───────────────────────────────────────────────────

create or replace function public.create_custom_program(p_name text, p_org_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Pilot terms: TA001 without a current-version acceptance. Before the
  -- lock and the cap, so a refused caller pays for nothing.
  perform public.assert_pilot_terms_accepted(v_uid);

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

  perform public.stamp_pilot_terms_acceptance(v_uid, v_id);

  return jsonb_build_object('program_id', v_id);
end;
$$;

-- ── complete_program_claim ──────────────────────────────────────────────────
--
-- The SERVICE-ROLE overload from 20261001183845_claim_completion_service_role_only.sql:
-- the claimant arrives as `p_claimant_user_id`, never `auth.uid()`, so the
-- acceptance is checked against that parameter. The body is that migration's
-- plus the gate and the stamp.
--
-- This section used to re-create the 7-argument overload and grant it to
-- `authenticated`. It must never do that again: that overload let any
-- signed-in user write their own review evidence, and it is dropped by
-- 20261002044100_drop_legacy_complete_program_claim.sql.

create or replace function public.complete_program_claim(
  p_claimant_user_id    uuid,
  p_program_key         text,
  p_claimed_email       text,
  p_claimant_name       text,
  p_claimant_role       text,
  p_domain_matched      boolean,
  p_skips_manual_review boolean,
  p_match_reason        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := p_claimant_user_id;
  v_program public.programs%rowtype;
  v_claim   public.program_claims%rowtype;
  v_status  text;
  v_contact boolean;
  v_ends_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_claimed_email is null or not exists (
    select 1
      from auth.users u
     where u.id = v_uid
       and lower(u.email) = lower(p_claimed_email)
  ) then
    raise exception 'claimed address does not match the claimant account'
      using errcode = '42501';
  end if;

  select * into v_program from public.programs p where p.program_key = p_program_key;
  if not found then
    raise exception 'unknown program %', p_program_key using errcode = 'P0002';
  end if;

  if v_program.owner_user_id = v_uid then
    select * into v_claim
      from public.program_claims c
     where c.program_id = v_program.id
       and c.claimant_user_id = v_uid
     order by c.created_at desc
     limit 1;

    return jsonb_build_object(
      'program_id',      v_program.id,
      'status',          coalesce(v_claim.status, 'approved'),
      'already_owned',   true,
      'contact_matched', coalesce(v_claim.contact_matched, false)
    );
  end if;

  -- Pilot terms: TA001 without a current-version acceptance. After the
  -- idempotent owner return (nothing is created there), before any write.
  perform public.assert_pilot_terms_accepted(v_uid);

  if v_program.status <> 'unclaimed' then
    raise exception 'program is already being set up' using errcode = '23505';
  end if;

  select exists (
    select 1
      from public.program_contacts c
     where c.program_id = v_program.id
       and lower(c.email) = lower(p_claimed_email)
       and not c.is_freemail
  ) into v_contact;

  if v_contact then
    v_status  := 'objection_window';
    v_ends_at := now() + interval '24 hours';
  else
    v_status  := 'pending_review';
    v_ends_at := null;
  end if;

  insert into public.program_claims (
    program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
    domain_matched, skips_manual_review, contact_matched, match_reason,
    status, objection_window_ends_at
  ) values (
    v_program.id, v_uid, lower(p_claimed_email), p_claimant_name, p_claimant_role,
    coalesce(p_domain_matched, false), coalesce(p_skips_manual_review, false), v_contact,
    case
      when v_contact then 'recorded staff contact for this program - approved automatically'
      else p_match_reason
    end,
    v_status, v_ends_at
  );

  insert into public.program_members as m (program_id, user_id, role, upload_enabled)
  values (v_program.id, v_uid, 'owner', true)
  on conflict (program_id, user_id) do nothing;

  update public.programs
     set owner_user_id = v_uid,
         claimed_at    = now(),
         status        = case when v_contact then 'active' else 'claim_pending' end,
         updated_at    = now()
   where id = v_program.id;

  perform public.stamp_pilot_terms_acceptance(v_uid, v_program.id);

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

-- ── complete_program_claim_with_token ───────────────────────────────────────
--
-- Not SECURITY DEFINER and executable by the service role alone (see
-- 20260830053726): the claimant arrives as `p_claimant_user_id`, never
-- `auth.uid()`, so the acceptance is checked against that parameter.

create or replace function public.complete_program_claim_with_token(
  p_claimant_user_id uuid,
  p_token_hash text,
  p_domain_matched boolean,
  p_skips_manual_review boolean,
  p_match_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pending public.pending_claims%rowtype;
  v_program public.programs%rowtype;
  v_claim   public.program_claims%rowtype;
  v_status  text;
  v_contact boolean;
  v_ends_at timestamptz;
begin
  if p_claimant_user_id is null
     or p_token_hash is null
     or length(p_token_hash) <> 64 then
    return jsonb_build_object('error', 'no-pending');
  end if;

  select * into v_pending
    from public.pending_claims c
   where c.token_hash = p_token_hash
   for update;
  if not found then
    return jsonb_build_object('error', 'no-pending');
  end if;

  -- The token proves the mailbox; the session proves the person. Both, always.
  if v_pending.claimant_user_id is null
     or v_pending.claimant_user_id <> p_claimant_user_id then
    return jsonb_build_object('error', 'wrong-account');
  end if;

  -- The token completes only the program it was issued for.
  if v_pending.token_program_key is null
     or v_pending.token_program_key <> v_pending.program_key then
    return jsonb_build_object('error', 'no-pending');
  end if;

  if v_pending.expires_at < now() then
    delete from public.pending_claims where id = v_pending.id;
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_program
    from public.programs p
   where p.program_key = v_pending.program_key;
  if not found then
    return jsonb_build_object('error', 'unknown-program');
  end if;

  if v_program.owner_user_id = p_claimant_user_id then
    -- Idempotent for the owner, and the row is spent either way.
    delete from public.pending_claims where id = v_pending.id;
    select * into v_claim
      from public.program_claims c
     where c.program_id = v_program.id
       and c.claimant_user_id = p_claimant_user_id
     order by c.created_at desc
     limit 1;
    return jsonb_build_object(
      'program_id',      v_program.id,
      'status',          coalesce(v_claim.status, 'approved'),
      'already_owned',   true,
      'contact_matched', coalesce(v_claim.contact_matched, false)
    );
  end if;

  -- Pilot terms: TA001 without a current-version acceptance for the
  -- CLAIMANT PARAMETER. Raised, not returned as a coded jsonb, so it rolls
  -- back the `for update` lock and leaves the pending row for a retry after
  -- the coach accepts.
  perform public.assert_pilot_terms_accepted(p_claimant_user_id);

  if v_program.status <> 'unclaimed' then
    return jsonb_build_object('error', 'taken');
  end if;

  select exists (
    select 1
      from public.program_contacts c
     where c.program_id = v_program.id
       and lower(c.email) = lower(v_pending.email)
       and not c.is_freemail
  ) into v_contact;

  if v_contact then
    v_status  := 'objection_window';
    v_ends_at := now() + interval '24 hours';
  else
    v_status  := 'pending_review';
    v_ends_at := null;
  end if;

  insert into public.program_claims (
    program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
    domain_matched, skips_manual_review, contact_matched, match_reason,
    status, objection_window_ends_at
  ) values (
    v_program.id, p_claimant_user_id, lower(v_pending.email),
    v_pending.full_name, v_pending.role,
    p_domain_matched, p_skips_manual_review, v_contact,
    case
      when v_contact then 'recorded staff contact for this program - approved automatically'
      else p_match_reason
    end,
    v_status, v_ends_at
  );

  insert into public.program_members as m (program_id, user_id, role, upload_enabled)
  values (v_program.id, p_claimant_user_id, 'owner', true)
  on conflict (program_id, user_id) do nothing;

  update public.programs
     set owner_user_id = p_claimant_user_id,
         claimed_at    = now(),
         status        = case when v_contact then 'active' else 'claim_pending' end,
         updated_at    = now()
   where id = v_program.id;

  -- Single use, in the same transaction as the writes it authorised — and
  -- scoped to THIS row alone.
  delete from public.pending_claims where id = v_pending.id;

  perform public.stamp_pilot_terms_acceptance(p_claimant_user_id, v_program.id);

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

-- ── Grants, re-asserted ─────────────────────────────────────────────────────
--
-- `create or replace` preserves each function's ACL; these restate the live
-- state so the file reads as the whole truth.

revoke execute on function public.create_custom_program(text, text)
  from public, anon;
grant execute on function public.create_custom_program(text, text)
  to authenticated, service_role;

revoke execute on function public.complete_program_claim(
  uuid, text, text, text, text, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_program_claim(
  uuid, text, text, text, text, boolean, boolean, text
) to service_role;

revoke execute on function public.complete_program_claim_with_token(
  uuid, text, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_program_claim_with_token(
  uuid, text, boolean, boolean, text
) to service_role;
