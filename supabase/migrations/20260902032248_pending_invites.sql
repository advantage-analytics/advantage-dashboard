-- An invitee can see, and accept, the invitations addressed to them — without
-- the emailed link.
--
-- Until now the only way into a program was the link: `accept_program_invite`
-- takes a token hash, and the invitee proves who they are by holding it. That
-- breaks for the person who signed up first and opened the link second — or
-- never: an invite sent to an address that already has an account, a link
-- that went to a school inbox they no longer check. They log in, see an empty
-- personal workspace, and nothing tells them a coach is waiting.
--
-- Two functions close that gap, and the thing worth staring at is what each
-- one is NOT.
--
-- `pending_program_invites()` is the invitee's ONLY view of `program_invites`,
-- and it is a function rather than a policy on purpose. The table's one policy
-- is "Program staff can read invites", and it stays that way. A policy of the
-- shape `lower(email) = lower(auth.email())` would let the invitee read their
-- own row — including `token_hash`, the secret the emailed link is built from.
-- RLS hides rows, never columns. So the invitee gets a SECURITY DEFINER window
-- that projects exactly the columns the dashboard needs to render "you have
-- been invited to <school>" and nothing that could mint a link. It also gates
-- on `auth.users.email_confirmed_at`: in the link flow, holding the token is
-- the proof of address; here there is no token, so the only proof is that the
-- session's address has been confirmed. An unconfirmed signup as
-- coach@school.edu must see nothing, or anyone could learn which schools have
-- invited which addresses by typing them into the sign-up form.
--
-- `accept_pending_invite(p_invite_id)` performs no membership insert, stamps
-- no `accepted_at`, and writes no audit row of its own. It checks that the
-- caller is the confirmed addressee of that row and then delegates to
-- `accept_program_invite(token_hash)` — the function that already owns the
-- seat lock, the claim-vs-mint branch (`player_id`, `upload_enabled`), the
-- guarded `accepted_at` stamp and the audit log. One code path binds a login
-- to a program, whichever door it came through, so every invariant the roster
-- reads depend on holds by construction rather than twice by hand. The
-- delegation is what makes `already_used`, `expired`, `no_seats`,
-- `player_gone` and `already_claimed` fall out for free.
--
-- On its own refusal paths — `not_found`, `unconfirmed`, `wrong_address` —
-- this function returns a NULL `program_id`. The token function discloses the
-- program on `wrong_address` because possessing the link is itself a weak
-- proof; an invite id is not a secret, so nothing about the row is disclosed
-- until the address is proven.
--
-- `#variable_conflict use_column` is carried over from 20260820151500 with its
-- post-mortem: `returns table (status, program_id)` declares `program_id` as
-- an OUT variable, and it is also a column of every table these functions
-- touch. Ambiguity there surfaces at runtime, on the happy path only.
--
-- No table policy changes, no new table privileges. `program_invites` stays
-- staff-read only.

-- ── Index ───────────────────────────────────────────────────────────────────
-- Both functions look up open invitations by lowercased address. The existing
-- `program_invites_open_email_key (program_id, lower(email))` leads with the
-- program, which the invitee does not know yet; this one leads with the
-- address and carries the same `accepted_at is null` predicate, so it only
-- ever holds the rows the read function can return.

create index program_invites_open_lower_email_idx
  on public.program_invites (lower(email))
  where accepted_at is null;

-- ── Read ────────────────────────────────────────────────────────────────────

create or replace function public.pending_program_invites()
returns table(
  invite_id          uuid,
  program_id         uuid,
  school_name        text,
  team               text,
  org_type           text,
  role               text,
  invited_by         uuid,
  inviter_first_name text,
  inviter_last_name  text,
  expires_at         timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  -- No session, no rows. Not an exception: this is a list, and an empty list
  -- is the honest answer for a caller who is nobody.
  if v_uid is null then
    return;
  end if;

  -- The address is only an address once it has been confirmed. Filtering on
  -- `email_confirmed_at` here, rather than after the fact, means an unconfirmed
  -- session never reaches the join at all.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;

  if v_email is null then
    return;
  end if;

  -- Pending means: addressed to me, not yet accepted, not yet expired, and I
  -- am not already on that roster. The last clause keeps a member who arrived
  -- by another door (a claim, an older link) from being nagged to accept an
  -- invitation that would be a no-op.
  return query
    select i.id,
           i.program_id,
           p.school_name,
           p.team,
           p.org_type,
           i.role,
           i.invited_by,
           u.first_name,
           u.last_name,
           i.expires_at
      from public.program_invites i
      join public.programs p on p.id = i.program_id
      left join public.users u on u.id = i.invited_by
     where lower(i.email) = v_email
       and i.accepted_at is null
       and i.expires_at > now()
       and not exists (
         select 1
           from public.program_members m
          where m.program_id = i.program_id
            and m.user_id = v_uid
       )
     order by i.created_at desc;
end;
$$;

comment on function public.pending_program_invites() is
  'Open invitations addressed to the confirmed email of the calling user, for programs they are not yet a member of. The invitee''s only view of program_invites; never returns token_hash.';

revoke all on function public.pending_program_invites() from public, anon;
grant execute on function public.pending_program_invites() to authenticated;

-- ── Accept ──────────────────────────────────────────────────────────────────

create or replace function public.accept_pending_invite(p_invite_id uuid)
returns table(status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_invite    public.program_invites;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite
    from public.program_invites i
   where i.id = p_invite_id;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u
   where u.id = v_uid;

  -- Checked before the address, so an unconfirmed session learns nothing about
  -- whose invitation this is — not even that the address is wrong.
  if v_confirmed is null then
    return query select 'unconfirmed'::text, null::uuid;
    return;
  end if;

  -- `is distinct from`, NEVER `<>` — see 20260820151500. A NULL `v_email`
  -- must refuse, not fall through.
  if lower(v_invite.email) is distinct from v_email then
    return query select 'wrong_address'::text, null::uuid;
    return;
  end if;

  -- Everything that binds the login to the program lives in one place.
  return query select * from public.accept_program_invite(v_invite.token_hash);
end;
$$;

comment on function public.accept_pending_invite(uuid) is
  'Accept an invitation by id, for the confirmed addressee only. Delegates to accept_program_invite(token_hash) and adds not_found / unconfirmed / wrong_address ahead of its statuses.';

revoke all on function public.accept_pending_invite(uuid) from public, anon;
grant execute on function public.accept_pending_invite(uuid) to authenticated;
