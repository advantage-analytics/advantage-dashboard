-- Join age gate: the two database doors that add a person to a team through a
-- link or an invitation now refuse an account with no date of birth, and an
-- account under 13. Owner decision 2026-10-25 (Terms 2.0, Privacy 1.4,
-- Guardian Terms 1.1): under 13 never holds an account; 13 to 17 may hold one
-- only to join a team through its invitation or join link, so 13+ passes here.
--
-- Why in SQL and not only in the server actions: both functions are EXECUTE
-- for `authenticated`, so a signed-in browser can call them directly and skip
-- `join-actions.ts`. The actions collect and write `users.dob` first
-- (`src/app/onboarding/age.ts` is the rule); these refuse what they did not.
--
-- Doors covered:
--   * `accept_program_invite`     — the invitation link, and by delegation
--   * `accept_pending_invite`     — the invitation accepted by id (onboarding
--                                   intercept, /invitations/[id], the tray)
--   * `accept_program_join_link`  — the join link, both modes: an approve-mode
--                                   request is refused too, so a request a
--                                   coach approves was age-checked when filed
-- Not covered, on purpose: `create_custom_program`, the claim RPCs (an owner
-- making their own team, not joining one) and `restore_program_player` (a
-- coach restoring someone who already joined).
--
-- New statuses, mapped to sentences in `join-actions.ts` `describe()`:
--   age_required  — `users.dob` is null; the screen asks for it
--   too_young     — under 13 by `users.dob`
--
-- APPLY WITH THE DEPLOY, never ahead of it: on the code before this change no
-- join form sends a date of birth, so every account without one (all of them,
-- before the age gate) would be refused.

create or replace function public.join_age_refusal(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.dob is null then 'age_required'
    when u.dob > (current_date - interval '13 years') then 'too_young'
  end
  from public.users u
  where u.id = p_user_id;
$$;

comment on function public.join_age_refusal(uuid) is
  'age_required / too_young / null for a user joining a team by link or '
  'invitation. Read by accept_program_invite and accept_program_join_link.';

revoke execute on function public.join_age_refusal(uuid)
  from public, anon, authenticated;
grant execute on function public.join_age_refusal(uuid) to service_role;

-- ── accept_program_invite ───────────────────────────────────────────────────
-- Unchanged from the live definition except the age block after the address
-- check, before the program lock.

create or replace function public.accept_program_invite(p_token_hash text)
returns table(status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_invite    public.program_invites;
  v_player_id uuid;
  v_player    public.program_players;
  v_age       text;
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

  -- The age gate (20261026080000): a date of birth on file, and 13 or older.
  -- A missing users row also refuses (`coalesce`): nothing unknown joins.
  v_age := coalesce(public.join_age_refusal(v_uid), 'ok');
  if v_age <> 'ok' then
    return query select v_age, v_invite.program_id;
    return;
  end if;

  -- Still locked: acceptance moves a reservation from `pending` to `used`, and
  -- a coach adding a player at the same moment must see one or the other.
  perform 1 from public.programs where id = v_invite.program_id for update;

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
    -- "Someone new", accepted as a player. Shared with the join-link door:
    -- claim the roster row carrying this address if a coach added one since
    -- the invitation went out, else mint one.
    select r.player_id into v_player_id
      from public._ensure_program_player_row
             (v_invite.program_id, v_uid, v_email, v_invite.invited_by) r;
    -- NULL: a player the coach removed, re-invited by mistake. The roster row
    -- is archived with its claim, and a membership on it would be invisible.
    -- `player_gone`'s sentence fits — "ask your coach", who can restore them.
    if v_player_id is null then
      return query select 'player_gone'::text, v_invite.program_id;
      return;
    end if;
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
$function$;

-- ── accept_program_join_link ────────────────────────────────────────────────
-- Unchanged from the live definition except the age block after the
-- returning-member check (a member re-opening the link is not joining), before
-- seats and before an approve-mode request is filed.

create or replace function public.accept_program_join_link(p_token text)
returns table(status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_link      public.program_join_links;
  v_seats     integer;
  v_can_upload boolean;
  v_used      integer;
  v_pending   integer;
  v_name      text;
  v_player_id uuid;
  v_claimed   boolean;
  v_age       text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_link
    from public.program_join_links l
   where l.token = p_token
     and l.revoked_at is null;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u
   where u.id = v_uid;

  -- A NULL address (auth row unreadable) also lands here: nothing below may
  -- bind a membership to an address it cannot see.
  if v_confirmed is null or v_email is null then
    return query select 'unconfirmed'::text, null::uuid;
    return;
  end if;

  -- Before seats, so a returning member is never told the program is full.
  if exists (
    select 1 from public.program_members pm
     where pm.program_id = v_link.program_id and pm.user_id = v_uid
  ) then
    return query select 'ok'::text, v_link.program_id;
    return;
  end if;

  -- The age gate (20261026080000): a date of birth on file, and 13 or older.
  -- Before an approve-mode request is filed, so an approved request was
  -- already age-checked.
  v_age := coalesce(public.join_age_refusal(v_uid), 'ok');
  if v_age <> 'ok' then
    return query select v_age, v_link.program_id;
    return;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Locked, because two players opening the last seat would both read
  -- `taken < seats`. The link reserved nothing; the seat is taken here.
  select p.seats, p.players_can_upload into v_seats, v_can_upload
    from public.programs p where p.id = v_link.program_id for update;
  select c.used, c.pending into v_used, v_pending
    from public.program_seat_counts(v_link.program_id) c;

  -- A roster row already carrying this address holds its seat; claiming it
  -- adds nobody, so it is never refused for seats (the same rule
  -- `program_seat_counts` documents for claim invitations).
  if not exists (
       select 1 from public.program_players pp
        where pp.program_id = v_link.program_id
          and pp.merged_into_id is null
          and pp.archived_at is null
          and pp.claimed_by_user_id is null
          and lower(pp.email) = v_email
     )
     and v_used + v_pending + 1 > coalesce(v_seats, 0) then
    return query select 'no_seats'::text, v_link.program_id;
    return;
  end if;

  -- ── Approve mode: file a request for the Roster's "Join requests" card ───
  if v_link.mode = 'approve' then
    select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
      into v_name
      from public.users u where u.id = v_uid;

    -- Idempotent through `program_requests_open_unique`
    -- (kind, program_id, lower(email)) where status = 'open'.
    insert into public.program_requests (kind, program_id, email, name, role)
    values ('invite_request', v_link.program_id, v_email, v_name, 'player')
    on conflict (kind, program_id, lower(email))
      where status = 'open' and program_id is not null
    do nothing;

    return query select 'requested'::text, v_link.program_id;
    return;
  end if;

  -- ── Open mode: claim or mint the roster row, then the membership ─────────
  select r.player_id, r.claimed into v_player_id, v_claimed
    from public._ensure_program_player_row
           (v_link.program_id, v_uid, v_email, v_link.created_by) r;

  -- NULL: removed from this roster (archived, claim kept) or merged away. The
  -- link is not a way back in; a coach restores them from the roster.
  if v_player_id is null then
    return query select 'removed'::text, v_link.program_id;
    return;
  end if;

  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_link.program_id, v_uid, 'player', coalesce(v_can_upload, true), v_link.created_by)
  on conflict (program_id, user_id) do nothing;

  update public.program_join_links
     set uses = uses + 1
   where id = v_link.id;

  -- A request this person filed while the link was in approve mode is
  -- answered by the join itself. Left open, it sat in the Roster's "Join
  -- requests" card for somebody already on the team, and Approve refused it
  -- ("that person is already on this roster") until a coach declined it by
  -- hand. `resolved_by` stays null: nobody on staff resolved it.
  update public.program_requests r
     set status      = 'resolved',
         resolved_at = now()
   where r.kind = 'invite_request'
     and r.program_id = v_link.program_id
     and lower(r.email) = v_email
     and r.status = 'open';

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_link.program_id, v_uid, 'join_link.accepted', v_link.id,
     jsonb_build_object('role', 'player', 'player_id', v_player_id,
                        'claimed', v_claimed, 'mode', v_link.mode));

  return query select 'ok'::text, v_link.program_id;
end;
$function$;
