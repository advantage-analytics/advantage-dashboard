-- Accepting an invitation — the write that turns a token into a membership.
--
-- `program_invites` shipped with `accepted_at` and `accepted_user_id` and
-- nothing that ever set them, because there was no acceptance screen and no
-- raw token to accept with: `inviteMember()` hashed the token in the same
-- expression that generated it. Both halves are fixed together — the action
-- now mails the token, and this is what the link resolves to.
--
-- SECURITY DEFINER because the caller cannot do any of this themselves, by
-- design. `program_invites` grants select only to program staff, and the
-- invitee is by definition not staff yet; `program_members` has no insert
-- policy at all, since a table anyone may insert into is a table anyone may
-- join a program through. The raw token is the only thing that proves the
-- caller is the intended recipient, and it never reaches the database — only
-- its SHA-256 hash does, matched against `program_invites_token_key`.

-- ---------------------------------------------------------------------------
-- Why this returns a status instead of raising
-- ---------------------------------------------------------------------------
--
-- Four of the five outcomes are not errors: an expired link, a used link, an
-- unknown link and a link opened by the wrong account are all ordinary things
-- a person does, and each one gets its own screen with its own way forward.
-- Raising would flatten them into an exception whose only distinguishing mark
-- is a message string the route would have to pattern-match — the same
-- brittleness `toMessage()` already works around elsewhere.
--
-- So the exception is reserved for the one case that really is broken: no
-- session at all, which the route is supposed to have prevented.

create or replace function public.accept_program_invite(p_token_hash text)
returns table (status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- `returns table (status, program_id)` declares those two as OUT variables, and
-- `program_id` is also a column of `program_members`. plpgsql resolves the
-- ambiguity in favour of the variable, and an INSERT column list cannot be
-- table-qualified to break the tie — so the insert below fails at runtime with
-- "column reference program_id is ambiguous", on the happy path only. Every
-- refusal path returns before reaching it, which is exactly how a first test
-- against a bad token passes while the feature is broken.
#variable_conflict use_column
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_invite public.program_invites;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The address on the SESSION, never one passed in. A parameter here would
  -- let any authenticated caller claim any invitation by naming its address.
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_invite
    from public.program_invites i
   where i.token_hash = p_token_hash;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  -- Ordered so the most specific answer wins. A used invitation that has also
  -- expired should read as used, because "you already did this" tells the
  -- person something true and actionable while "it expired" sends them back to
  -- the coach for a link they do not need.
  if v_invite.accepted_at is not null then
    return query select 'already_used'::text, v_invite.program_id;
    return;
  end if;

  if v_invite.expires_at <= now() then
    return query select 'expired'::text, v_invite.program_id;
    return;
  end if;

  -- Bound to one address, and a mismatch is refused rather than silently
  -- re-bound. An invitation forwarded to a colleague must not quietly make
  -- THEM the assistant coach — the owner chose an address, and that choice is
  -- the only evidence of who was meant.
  --
  -- `is distinct from`, NEVER `<>`. If the session's auth.users row cannot be
  -- read, v_email is NULL and `lower(email) <> NULL` evaluates to NULL — which
  -- plpgsql treats as false, skips the branch, and falls through to grant the
  -- membership. A deleted user holding an unexpired JWT is enough to reach
  -- that, so the one comparison guarding who joins a program has to be the
  -- null-safe operator. This fails closed: unknown address, no membership.
  if lower(v_invite.email) is distinct from v_email then
    return query select 'wrong_address'::text, v_invite.program_id;
    return;
  end if;

  -- `do nothing` rather than an error: someone already on the roster who opens
  -- an old link has arrived where the link was taking them. The invitation is
  -- still marked used below, so the second click cannot leave a live token
  -- behind.
  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_invite.program_id, v_uid, v_invite.role, v_invite.upload_enabled,
     v_invite.invited_by)
  on conflict (program_id, user_id) do nothing;

  -- Guarded on `accepted_at is null` so two clicks racing each other cannot
  -- both stamp it, which would leave the second one's timestamp on a
  -- membership the first one created.
  update public.program_invites
     set accepted_at = now(),
         accepted_user_id = v_uid
   where id = v_invite.id
     and accepted_at is null;

  return query select 'ok'::text, v_invite.program_id;
end;
$$;

revoke all on function public.accept_program_invite(text) from public;
revoke execute on function public.accept_program_invite(text) from anon;
grant execute on function public.accept_program_invite(text) to authenticated;
