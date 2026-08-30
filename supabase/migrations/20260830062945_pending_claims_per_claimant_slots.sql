-- T4 re-run #2: close the cross-context start-clobber DoS on pending_claims.
--
-- The previous fix made every start rewrite its email's row WHOLESALE, which
-- killed both hijacks (lockout via an inherited stale binding, redirection via
-- a program swap under a live token) — but the mechanism itself left a
-- denial of service standing: email was the PRIMARY KEY, so one email meant
-- ONE row, every start for an address fought over the same slot, and whoever
-- wrote last won. Any signed-in account — no relationship to the program, no
-- proof of the mailbox — could call startClaim with a victim's school address
-- and overwrite the victim's in-flight anonymous claim, binding the row to
-- itself. The victim then clicked their perfectly valid magic link and was
-- turned away by the foreign-claimant guard; repeated every 60s, forever.
--
-- Root cause: one email-keyed slot SHARED across claim contexts. A foreign
-- start could destroy another party's in-flight claim, and a proven mailbox
-- owner could be blocked by a stranger's binding.
--
-- The fix separates the contexts so neither can touch the other:
--
--   * a surrogate `id` becomes the primary key — email stops being one;
--   * ONE constraint, `unique nulls not distinct (email, claimant_user_id)`,
--     carves the table into slots: at most one ANONYMOUS row per email
--     (claimant_user_id NULL — the signed-out flow's slot) and at most one
--     row per (email, claimant) pair (each signed-in account's own slot);
--   * both starts upsert ON CONFLICT (email, claimant_user_id). A signed-out
--     start carries NULL and can only ever create or replace the anonymous
--     slot; a signed-in start carries its own verified user id and can only
--     ever create or replace ITS OWN slot. A stranger's write physically
--     cannot land on anyone else's row — there is no statement that reaches
--     one;
--   * the OTP completion path selects the ANONYMOUS slot for the session's
--     verified address (claimant_user_id IS NULL), so no signed-in binding —
--     hostile or not — is even visible to it. The mailbox owner who clicks
--     their magic link completes their own claim no matter what anyone else
--     wrote, no matter how many times;
--   * the token completion path was already per-row (unique token_hash) and
--     stays so; its single-use deletes tighten from email-wide to id-scoped
--     below, so spending one claim's token no longer consumes every other
--     slot under the same address.
--
-- What this deliberately does NOT change: the signed-out flow's own
-- last-start-wins semantics for the anonymous slot (one mailbox, one
-- anonymous claim; every overwrite mails that mailbox and rides Supabase's
-- OTP throttles), the binding CHECK, the issued-program re-check, and the
-- token-hash uniqueness — the two prior migrations' guarantees all survive
-- per-row.

-- 1. Surrogate primary key. The table has at most a handful of live rows at
--    any time (24h TTL, opportunistic sweep), so the rewrite is trivial; the
--    existing rows keep their data and gain generated ids.
alter table public.pending_claims
  add column id uuid not null default gen_random_uuid();

alter table public.pending_claims
  drop constraint pending_claims_pkey;

alter table public.pending_claims
  add constraint pending_claims_pkey primary key (id);

-- 2. The slot constraint. NULLS NOT DISTINCT makes the anonymous slot real:
--    two (email, NULL) rows collide, so the signed-out upsert's ON CONFLICT
--    (email, claimant_user_id) resolves onto the one anonymous row exactly
--    as it used to resolve onto the one email row — while a signed-in row
--    for the same email is a different key and untouchable from there.
alter table public.pending_claims
  add constraint pending_claims_email_claimant_key
    unique nulls not distinct (email, claimant_user_id);

comment on table public.pending_claims is
  'In-flight program claims between the setup form and the emailed link. One ANONYMOUS slot per email (claimant_user_id NULL, the signed-out flow) plus one slot per (email, claimant_user_id) (signed-in starts) — enforced by pending_claims_email_claimant_key. A start can only ever write its own slot, so no start displaces another party''s in-flight claim. Service-role only: RLS enabled, zero policies.';

comment on column public.pending_claims.claimant_user_id is
  'Set server-side from the verified session when a signed-in user starts a claim; the claim then completes only for this account, via its emailed token. NULL marks the email''s one anonymous (signed-out) slot, which completes via the Supabase OTP session instead. Part of the slot key — a signed-in start conflicts only with its own row, never with the anonymous slot or another claimant''s.';

-- 3. Same completion function, deletes narrowed from email-wide to the one
--    row the token hashed to. `where email = ...` predates multiple rows per
--    email; left as-was it would consume every slot under the address —
--    including the anonymous one a signed-out claimant is mid-flight on —
--    whenever any one token was spent or found expired. Still SECURITY
--    INVOKER, still service_role-execute-only, and the binding + issued-
--    program gates are untouched.
create or replace function public.complete_program_claim_with_token(
  p_claimant_user_id uuid,
  p_token_hash text,
  p_domain_matched boolean,
  p_skips_manual_review boolean,
  p_match_reason text
) returns jsonb
language plpgsql
security invoker
set search_path to ''
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

  -- The token completes only the program it was issued for. A legitimate later
  -- start that changed the program also rewrote (or cleared) the token columns
  -- in the same statement -- the table CHECK enforces exactly that -- so a
  -- divergence here means a tampered or partially written row, and the only
  -- safe answer is that nothing is pending.
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
  -- scoped to THIS row alone: other slots under the same address (another
  -- account's claim, or the anonymous signed-out one) are not this token's
  -- to spend.
  delete from public.pending_claims where id = v_pending.id;

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

comment on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text) is
  'Service-role-only signed-in counterpart of complete_program_claim. Selects the pending claim by emailed-token hash, requires it to be bound to the passed claimant AND to the program the token was issued for, and completes it atomically; single-use deletes are scoped to that one row. Never expose to anon/authenticated: it has no auth.uid()/auth.email() gate of its own.';

-- CREATE OR REPLACE preserves the ACL, but the ACL is the security boundary
-- here, so it is re-asserted rather than assumed.
revoke execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  to service_role;
