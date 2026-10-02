-- T4: bind program claims started by a SIGNED-IN account to that account.
--
-- The signed-out flow proves the school mailbox by signing the claimant in AS
-- that address (Supabase OTP magic link). A signed-in coach must keep the
-- account they already have, so for them the proof moves to a claim-scoped
-- secret: a 256-bit token is emailed to the school address and only its
-- SHA-256 hash is stored here. Completing the claim then requires BOTH the
-- emailed token (mailbox proof) and the same signed-in session that started
-- the claim (identity binding) -- neither alone finishes anything.
--
-- `pending_claims` has RLS enabled with no policies, so these columns are
-- reachable only through the service role; the hash never travels to a client.

alter table public.pending_claims
  add column claimant_user_id uuid references auth.users (id) on delete cascade,
  add column token_hash text;

comment on column public.pending_claims.claimant_user_id is
  'Set server-side from the verified session when a signed-in user starts a claim; the claim can then only complete for this account. NULL for signed-out starts.';
comment on column public.pending_claims.token_hash is
  'SHA-256 hex of the verification token emailed to the school address for signed-in starts. The raw token exists only in that email. NULL for signed-out starts.';

-- Token lookup is by hash; unique so one token can never select two rows.
create unique index pending_claims_token_hash_key
  on public.pending_claims (token_hash)
  where token_hash is not null;

-- The signed-in counterpart of complete_program_claim. Differences, on purpose:
--   * NOT callable from the API. complete_program_claim authenticates its
--     caller via auth.email(); this one cannot (the session email is the login
--     address, not the school address), so instead of trusting parameters it is
--     executable by service_role only and the server route supplies the
--     claimant id from auth.getUser(). SECURITY INVOKER, so even a stray grant
--     would leave a caller facing RLS rather than definer rights.
--   * The claimed email, name, role and program all come from the pending row
--     selected BY TOKEN HASH -- the one thing the claimant proves possession
--     of -- never from parameters a caller could vary independently.
--   * Verification, the claim writes and the single-use delete share one
--     transaction, so a token can never complete two claims.
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
  'Service-role-only signed-in counterpart of complete_program_claim. Selects the pending claim by emailed-token hash, requires it to be bound to the passed claimant, and completes it atomically. Never expose to anon/authenticated: it has no auth.uid()/auth.email() gate of its own.';

revoke execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_program_claim_with_token(uuid, text, boolean, boolean, text)
  to service_role;
