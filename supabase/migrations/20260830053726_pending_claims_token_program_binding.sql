-- T4 re-run: close the cross-path row hijack on pending_claims.
--
-- pending_claims is keyed by email alone, and BOTH start paths upsert on that
-- key. Before this migration nothing tied the emailed token to the program it
-- was issued for, and nothing stopped one start from silently inheriting
-- binding columns written by a different identity's earlier start:
--
--   (a) lockout     An authenticated attacker starts a signed-in claim with a
--                   victim's address, binding claimant_user_id to themselves.
--                   The victim's signed-out start never touched that column,
--                   so the binding survived their restart and completeClaim's
--                   ownership guard then rejected the victim indefinitely.
--   (b) redirection After a coach's signed-in start (token emailed, row bound
--                   to program P1), a sessionless upsert on the same email
--                   could swap program_key to P2; the coach's genuine token
--                   then completed ownership of P2 -- the attacker's program.
--
-- The fix has three parts, one in the application and two here:
--
--   1. (application) Every start now writes EVERY binding column: a
--      signed-out start explicitly nulls claimant_user_id / token_hash /
--      token_program_key, a signed-in start writes all three together. A row
--      is therefore entirely the product of its most recent start -- the
--      mailbox owner, the only party who can complete either way, decides
--      which link is live.
--   2. token_program_key records, in the same statement that stores the token
--      hash, which program that token was issued for. The CHECK below makes
--      both failure shapes unrepresentable: binding columns are
--      all-or-nothing, and a live token always names the row's CURRENT
--      program. An UPDATE that swaps program_key out from under a token now
--      fails loudly instead of redirecting it.
--   3. complete_program_claim_with_token re-verifies the same equality before
--      completing, so even a row that somehow diverged (or a future drop of
--      the constraint) completes nothing.

alter table public.pending_claims
  add column token_program_key text;

comment on column public.pending_claims.token_program_key is
  'The program_key the emailed verification token was issued for. Written only in the same statement as token_hash, never separately; the binding CHECK pins it to program_key so a token can only ever complete the program it was issued for. NULL for signed-out rows.';

alter table public.pending_claims
  add constraint pending_claims_binding_all_or_nothing check (
    (claimant_user_id is null and token_hash is null and token_program_key is null)
    or
    (claimant_user_id is not null and token_hash is not null and token_program_key = program_key)
  );

comment on constraint pending_claims_binding_all_or_nothing on public.pending_claims is
  'A start writes the whole binding or none of it, and a live token always names the row''s current program. Statements that would strand a stale claimant binding on someone else''s restart, or swap the program out from under an issued token, fail here instead of succeeding silently.';

-- Same function, one new gate: the program being handed over must be the one
-- the token was ISSUED for. With the CHECK above this cannot diverge on a live
-- row; the in-function check keeps the property local to the function that
-- relies on it. Still SECURITY INVOKER, still service_role-execute-only.
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
    delete from public.pending_claims where email = v_pending.email;
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
    delete from public.pending_claims where email = v_pending.email;
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

  -- Single use, in the same transaction as the writes it authorised.
  delete from public.pending_claims where email = v_pending.email;

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

comment on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text) is
  'Service-role-only signed-in counterpart of complete_program_claim. Selects the pending claim by emailed-token hash, requires it to be bound to the passed claimant AND to the program the token was issued for, and completes it atomically. Never expose to anon/authenticated: it has no auth.uid()/auth.email() gate of its own.';

-- CREATE OR REPLACE preserves the ACL, but the ACL is the security boundary
-- here, so it is re-asserted rather than assumed.
revoke execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  to service_role;
