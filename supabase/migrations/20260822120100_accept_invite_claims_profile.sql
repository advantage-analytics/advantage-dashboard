-- Accepting a targeted invitation claims the roster row instead of making one.
--
-- This is where "claim, don't copy" actually happens, and the thing worth
-- staring at is what it does NOT do: it writes no match rows. The profile id
-- stays in `matches.player1_id`, and `my_player_ids()` — already in the read
-- predicate since 20260822090400 — makes those matches readable by the account
-- that just bound to it. History is untouched because nothing touched it.
--
-- `#variable_conflict use_column` is preserved from 20260820151500, and its
-- post-mortem is worth keeping in view: `returns table (status, program_id)`
-- declares those two as OUT variables, and `program_id` is also a column of
-- `program_members`, so the insert fails at runtime with "column reference
-- program_id is ambiguous" — on the happy path only. Every refusal path returns
-- before reaching it, which is exactly how a first test against a bad token
-- passes while the feature is broken.

create or replace function public.accept_program_invite(p_token_hash text)
returns table(status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid      uuid := (select auth.uid());
  v_email    text;
  v_invite   public.program_invites;
  v_player   public.program_players;
  v_seats    integer;
  v_used     integer;
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_invite
    from public.program_invites i
   where i.token_hash = p_token_hash;

  -- Ordered so the most specific answer wins: a used invitation that has also
  -- expired should read as used.
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_invite.accepted_at is not null then
    return query select 'already_used'::text, v_invite.program_id;
    return;
  end if;

  if v_invite.expires_at <= now() then
    return query select 'expired'::text, v_invite.program_id;
    return;
  end if;

  -- `is distinct from`, NEVER `<>`. If the session's `auth.users` row cannot be
  -- read, `v_email` is NULL and `lower(email) <> NULL` evaluates to NULL —
  -- which plpgsql treats as false, skips the branch, and falls through to grant
  -- the membership. This fails closed: unknown address, no membership.
  if lower(v_invite.email) is distinct from v_email then
    return query select 'wrong_address'::text, v_invite.program_id;
    return;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Locked, because two people accepting into the last seat would both read
  -- `used < seats` and both insert. Locking the program row makes the second
  -- wait and re-read.
  --
  -- Someone already on the roster clicking an old link has arrived where the
  -- link was taking them and must not be refused — so the check only applies
  -- when this acceptance would actually consume a seat.
  perform 1 from public.programs where id = v_invite.program_id for update;

  select exists (
    select 1 from public.program_members
     where program_id = v_invite.program_id and user_id = v_uid
  ) into v_is_member;

  if not v_is_member then
    select p.seats into v_seats
      from public.programs p where p.id = v_invite.program_id;
    select count(*) into v_used
      from public.program_members pm where pm.program_id = v_invite.program_id;

    if v_used >= coalesce(v_seats, 0) then
      -- A status, not an exception. It joins the four ordinary human outcomes
      -- above, each of which has its own screen and its own way forward — here,
      -- "ask your coach to free a seat".
      return query select 'no_seats'::text, v_invite.program_id;
      return;
    end if;
  end if;

  -- ── Claim, or mint ───────────────────────────────────────────────────────
  if v_invite.player_id is not null then
    select * into v_player
      from public.program_players
     where id = v_invite.player_id
       and program_id = v_invite.program_id;

    if not found or v_player.merged_into_id is not null
       or v_player.archived_at is not null then
      return query select 'player_gone'::text, v_invite.program_id;
      return;
    end if;

    -- Guarded on `claimed_by_user_id is null` in the UPDATE itself, not checked
    -- and then written. Two clicks racing must not both bind: a profile id in
    -- `matches.player1_id` is READ ACCESS to every match carrying it, so the
    -- window between a check and a write is a window in which one athlete's
    -- season could be handed to two accounts.
    update public.program_players
       set claimed_by_user_id = v_uid,
           claimed_at         = now(),
           -- Fill the address only if the profile had none; a coach's record of
           -- a school address should not be overwritten by a personal login.
           email              = coalesce(email, v_email),
           updated_at         = now()
     where id = v_invite.player_id
       and claimed_by_user_id is null;

    if not found then
      return query select 'already_claimed'::text, v_invite.program_id;
      return;
    end if;

    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (v_invite.program_id, v_uid, 'player.claimed', v_invite.player_id,
       jsonb_build_object('email', v_email));

  elsif v_invite.role = 'player' then
    -- "Someone new", accepted as a player. They still get a roster row, so the
    -- invariant every read below depends on — every player-role member has
    -- exactly one live profile — holds by construction rather than by luck.
    --
    -- Names come from the profile the signup trigger wrote. When it has none,
    -- the email's local part and an em-dash stand in: `program_players`
    -- requires both, and a coach can correct them. A member who cannot be
    -- inserted at all would vanish from the roster, which is the failure this
    -- whole feature exists to remove.
    insert into public.program_players
      (program_id, first_name, last_name, email, claimed_by_user_id, claimed_at, created_by)
    select
      v_invite.program_id,
      coalesce(nullif(btrim(u.first_name), ''), split_part(v_email, '@', 1)),
      coalesce(nullif(btrim(u.last_name), ''), '—'),
      v_email,
      v_uid,
      now(),
      v_invite.invited_by
    from public.users u
    where u.id = v_uid
    on conflict (program_id, claimed_by_user_id) where claimed_by_user_id is not null
    do nothing;
  end if;

  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_invite.program_id, v_uid, v_invite.role, v_invite.upload_enabled,
     v_invite.invited_by)
  on conflict (program_id, user_id) do nothing;

  -- Guarded on `accepted_at is null` so two clicks racing cannot both stamp it.
  update public.program_invites
     set accepted_at = now(),
         accepted_user_id = v_uid
   where id = v_invite.id
     and accepted_at is null;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_invite.program_id, v_uid, 'invite.accepted', v_invite.id,
     jsonb_build_object('role', v_invite.role, 'player_id', v_invite.player_id));

  return query select 'ok'::text, v_invite.program_id;
end;
$$;

comment on function public.accept_program_invite(text) is
  'Bind a login to a program. A targeted invitation claims its roster row without moving a single match; an untargeted one mints a profile. Returns ok / not_found / already_used / expired / wrong_address / no_seats / player_gone / already_claimed.';
