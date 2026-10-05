-- Applied to the live project 2026-10-01 as version 20261001183845.
--
-- Claim completion: evidence can no longer be set by the claimant.
--
-- The gap
-- -------
-- `complete_program_claim(text,text,text,text,boolean,boolean,text)` is
-- SECURITY DEFINER and executable by `authenticated`. It derives the claim
-- STATUS itself (`program_contacts`), but stores `p_domain_matched`,
-- `p_skips_manual_review` and `p_match_reason` exactly as passed. Any
-- signed-in user can call it through /rest/v1/rpc and write whatever
-- evidence they like onto their own claim; the admin review drawer prints
-- those columns as facts.
--
-- The fix, in two parts
-- ---------------------
--  1. A NEW overload that takes the claimant as `p_claimant_user_id` and is
--     executable by the service role alone — the same shape as
--     `complete_program_claim_with_token`. `completeClaim()` calls it through
--     the admin client after `getUser()`; the evidence comes from
--     `domain-match.ts`, run on the server against the program row.
--
--     It stays SECURITY DEFINER, unlike the token sibling, for one reason:
--     it re-checks inside the database that the claimed address IS the
--     account's address, and `service_role` holds no SELECT on `auth.users`.
--     That check replaces the old `auth.email()` comparison, which cannot
--     work here (a service-role call carries no user JWT).
--
--  2. The LEGACY 7-argument overload stays callable for now, because staging
--     and production share this database and production still runs code that
--     calls it with the user's session. It stops trusting its caller instead:
--     the three evidence parameters are ignored and the row records "not
--     matched / does not skip review" with a reason that says the evidence
--     was not recorded. That fails closed — a reviewer sees less support for
--     the claim, never more.
--
--     It is dropped by 20261002044100_drop_legacy_complete_program_claim.sql
--     once the new caller is deployed to production. Until then a direct call can still START a claim (as it
--     always could), but can no longer decorate it.
--
-- Not in this migration: pilot terms enforcement
-- (20261002044101_pilot_terms_enforcement.sql) was still un-applied on live,
-- and these bodies are the LIVE ones (pg_get_functiondef, 2026-10-01), which
-- carry no TA001 gate. That file is updated in the same PR to target the new
-- signature, so applying it later cannot resurrect the exposed overload.

-- ── 1. The service-role overload ────────────────────────────────────────────

create function public.complete_program_claim(
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

  -- The claimed address must be the account's own. The caller is trusted
  -- server code, but a claim that names one person and one mailbox should
  -- not depend on every future caller remembering to compare them.
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

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

-- Supabase's default privileges hand EXECUTE on every new public function to
-- anon and authenticated. Take it back before anything else can happen.
revoke execute on function public.complete_program_claim(
  uuid, text, text, text, text, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_program_claim(
  uuid, text, text, text, text, boolean, boolean, text
) to service_role;

comment on function public.complete_program_claim(
  uuid, text, text, text, text, boolean, boolean, text
) is
  'Service-role-only. Completes a signed-out (OTP) program claim for p_claimant_user_id, whose account address must equal p_claimed_email. Status is derived here from program_contacts; the domain evidence parameters are computed by trusted server code (domain-match.ts) and must never be reachable from a browser.';

-- ── 2. The legacy overload stops trusting its caller ────────────────────────
--
-- Body is the live one with exactly one change: the three evidence
-- parameters are no longer read.

create or replace function public.complete_program_claim(
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
  v_uid     uuid := (select auth.uid());
  v_email   text := (select auth.email());
  v_program public.programs%rowtype;
  v_claim   public.program_claims%rowtype;
  v_status  text;
  v_contact boolean;
  v_ends_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_email is null or lower(v_email) <> lower(p_claimed_email) then
    raise exception 'claimed address does not match the verified session'
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

  -- p_domain_matched, p_skips_manual_review and p_match_reason are IGNORED:
  -- this overload is callable by any signed-in user, so nothing it is told
  -- about the evidence may reach a reviewer.
  insert into public.program_claims (
    program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
    domain_matched, skips_manual_review, contact_matched, match_reason,
    status, objection_window_ends_at
  ) values (
    v_program.id, v_uid, lower(p_claimed_email), p_claimant_name, p_claimant_role,
    false, false, v_contact,
    case
      when v_contact then 'recorded staff contact for this program - approved automatically'
      else 'domain evidence not recorded (legacy call path) - check the address against the program''s domains'
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

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

comment on function public.complete_program_claim(
  text, text, text, text, boolean, boolean, text
) is
  'DEPRECATED - dropped once the service-role overload''s caller is in production. Still callable by authenticated for the code already deployed, but ignores its three evidence parameters and records none.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (run by hand; not part of the migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Restores the exact pre-migration state: one 7-argument overload, trusting
-- its parameters, with its original comment. Only safe while the deployed
-- code still calls that overload - once `completeClaim()` calls the new one,
-- dropping it breaks claim completion. Strip the leading `-- ` to run.
--
-- begin;
--
-- drop function if exists public.complete_program_claim(
--   uuid, text, text, text, text, boolean, boolean, text
-- );
--
-- -- The live body of 2026-10-01 (pg_get_functiondef), verbatim. `create or
-- -- replace` keeps the ACL (authenticated + service_role), so no grant follows.
-- create or replace function public.complete_program_claim(
--   p_program_key text, p_claimed_email text, p_claimant_name text,
--   p_claimant_role text, p_domain_matched boolean,
--   p_skips_manual_review boolean, p_match_reason text
-- )
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- declare
--   v_uid     uuid := (select auth.uid());
--   v_email   text := (select auth.email());
--   v_program public.programs%rowtype;
--   v_claim   public.program_claims%rowtype;
--   v_status  text;
--   v_contact boolean;
--   v_ends_at timestamptz;
-- begin
--   if v_uid is null then
--     raise exception 'not authenticated' using errcode = '28000';
--   end if;
--
--   if v_email is null or lower(v_email) <> lower(p_claimed_email) then
--     raise exception 'claimed address does not match the verified session'
--       using errcode = '42501';
--   end if;
--
--   select * into v_program from public.programs p where p.program_key = p_program_key;
--   if not found then
--     raise exception 'unknown program %', p_program_key using errcode = 'P0002';
--   end if;
--
--   if v_program.owner_user_id = v_uid then
--     select * into v_claim
--       from public.program_claims c
--      where c.program_id = v_program.id
--        and c.claimant_user_id = v_uid
--      order by c.created_at desc
--      limit 1;
--
--     return jsonb_build_object(
--       'program_id',      v_program.id,
--       'status',          coalesce(v_claim.status, 'approved'),
--       'already_owned',   true,
--       'contact_matched', coalesce(v_claim.contact_matched, false)
--     );
--   end if;
--
--   if v_program.status <> 'unclaimed' then
--     raise exception 'program is already being set up' using errcode = '23505';
--   end if;
--
--   select exists (
--     select 1
--       from public.program_contacts c
--      where c.program_id = v_program.id
--        and lower(c.email) = lower(p_claimed_email)
--        and not c.is_freemail
--   ) into v_contact;
--
--   if v_contact then
--     v_status  := 'objection_window';
--     v_ends_at := now() + interval '24 hours';
--   else
--     v_status  := 'pending_review';
--     v_ends_at := null;
--   end if;
--
--   insert into public.program_claims (
--     program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
--     domain_matched, skips_manual_review, contact_matched, match_reason,
--     status, objection_window_ends_at
--   ) values (
--     v_program.id, v_uid, lower(p_claimed_email), p_claimant_name, p_claimant_role,
--     p_domain_matched, p_skips_manual_review, v_contact,
--     case
--       when v_contact then 'recorded staff contact for this program - approved automatically'
--       else p_match_reason
--     end,
--     v_status, v_ends_at
--   );
--
--   insert into public.program_members as m (program_id, user_id, role, upload_enabled)
--   values (v_program.id, v_uid, 'owner', true)
--   on conflict (program_id, user_id) do nothing;
--
--   update public.programs
--      set owner_user_id = v_uid,
--          claimed_at    = now(),
--          status        = case when v_contact then 'active' else 'claim_pending' end,
--          updated_at    = now()
--    where id = v_program.id;
--
--   return jsonb_build_object(
--     'program_id',      v_program.id,
--     'status',          v_status,
--     'already_owned',   false,
--     'contact_matched', v_contact
--   );
-- end;
-- $$;
--
-- comment on function public.complete_program_claim(
--   text, text, text, text, boolean, boolean, text
-- ) is
--   'Verified magic-link click -> claim + owner membership + program status, atomically. Auto-approves when the address is a recorded non-freemail contact for this exact program; everything else routes to review.';
--
-- commit;
