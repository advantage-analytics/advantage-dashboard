-- Join links, second pass: what the branch gate found.
--
-- Three fixes to 20261007214009_program_join_links.sql, raised by the RLS and
-- pipeline-guardrail reviews of the same branch:
--
--   1. `set_program_join_link` was gated on `is_program_staff`, while the
--      mode-change and revoke functions are owner/coach only. Minting revokes
--      the live row and sets its mode, so plain staff could drop a coach's
--      approval requirement — or kill a link everyone holds — by "resetting".
--      Same gate for all three now. Staff still read and copy the live link.
--   2. `_ensure_program_player_row` answered "already holds a row" for an
--      ARCHIVED or MERGED row too, so a player a coach had removed could walk
--      back in through an open link onto a profile the roster no longer
--      shows. It now answers a NULL `player_id` for that case — its one
--      "nothing to bind to" signal, so its return shape is unchanged and no
--      function is dropped. The link door turns that into `removed`, the
--      invite door into `player_gone` (the coach's restore is the way back).
--
-- Applied live as the version in this file's name.

-- ── 1. the helper: a dead row is a NULL player_id ──────────────────────────
create or replace function public._ensure_program_player_row(
  p_program_id uuid,
  p_user_id uuid,
  p_email text,
  p_created_by uuid
)
returns table (player_id uuid, claimed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_email     text := lower(p_email);
  v_player_id uuid;
begin
  if p_user_id is null or v_email is null then
    raise exception 'a player row needs a login and an address' using errcode = '22023';
  end if;

  -- Already holds a LIVE row here (a returning member, or a second click).
  select pp.id into v_player_id
    from public.program_players pp
   where pp.program_id = p_program_id
     and pp.claimed_by_user_id = p_user_id
     and pp.archived_at is null
     and pp.merged_into_id is null;

  if v_player_id is not null then
    return query select v_player_id, false;
    return;
  end if;

  -- Holds only a DEAD row: archived (removed from the roster, claim kept —
  -- `archive_program_player`) or merged away. Re-admitting would bind a live
  -- membership to a profile the roster no longer shows, which is how a removed
  -- player walked back in through a link that sat in a group chat for months.
  -- Refuse with a NULL id — every other path returns a row — and let the
  -- caller say it in its own words; `restore_program_player` is the coach's
  -- door for this.
  if exists (
       select 1 from public.program_players pp
        where pp.program_id = p_program_id
          and pp.claimed_by_user_id = p_user_id
     ) then
    return query select null::uuid, false;
    return;
  end if;

  -- Guarded on `claimed_by_user_id is null` in the UPDATE itself, not checked
  -- and then written: a profile id in `matches.player1_id` is READ ACCESS to
  -- every match carrying it, so the window between a check and a write is a
  -- window in which one athlete's season could be handed to two accounts.
  update public.program_players
     set claimed_by_user_id = p_user_id,
         claimed_at         = now(),
         updated_at         = now()
   where id = (
           select pp.id
             from public.program_players pp
            where pp.program_id = p_program_id
              and pp.merged_into_id is null
              and pp.archived_at is null
              and pp.claimed_by_user_id is null
              and lower(pp.email) = v_email
            limit 1
         )
     and claimed_by_user_id is null
  returning id into v_player_id;

  if v_player_id is not null then
    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (p_program_id, p_user_id, 'player.claimed', v_player_id,
       jsonb_build_object('email', v_email));

    return query select v_player_id, true;
    return;
  end if;

  insert into public.program_players
    (program_id, first_name, last_name, email, claimed_by_user_id, claimed_at, created_by)
  select
    p_program_id,
    coalesce(nullif(btrim(u.first_name), ''), split_part(v_email, '@', 1)),
    coalesce(nullif(btrim(u.last_name), ''), '—'),
    v_email,
    p_user_id,
    now(),
    p_created_by
  from public.users u
  where u.id = p_user_id
  on conflict (program_id, claimed_by_user_id) where claimed_by_user_id is not null
  do nothing
  returning id into v_player_id;

  -- The conflict branch (raced by a parallel claim) leaves `v_player_id`
  -- null; read the row that won.
  if v_player_id is null then
    select pp.id into v_player_id
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.claimed_by_user_id = p_user_id;
  end if;

  return query select v_player_id, false;
end;
$function$;

revoke all on function public._ensure_program_player_row(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public._ensure_program_player_row(uuid, uuid, text, uuid)
  to service_role;

-- ── 2. accept_program_invite: a removed player is `player_gone` ────────────
create or replace function public.accept_program_invite(p_token_hash text)
returns table (status text, program_id uuid)
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

revoke all on function public.accept_program_invite(text) from public, anon;
grant execute on function public.accept_program_invite(text) to authenticated, service_role;

-- ── 3. accept_program_join_link: a removed player is `removed` ─────────────
create or replace function public.accept_program_join_link(p_token text)
returns table (status text, program_id uuid)
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

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_link.program_id, v_uid, 'join_link.accepted', v_link.id,
     jsonb_build_object('role', 'player', 'player_id', v_player_id,
                        'claimed', v_claimed, 'mode', v_link.mode));

  return query select 'ok'::text, v_link.program_id;
end;
$function$;

revoke all on function public.accept_program_join_link(text) from public, anon;
grant execute on function public.accept_program_join_link(text) to authenticated, service_role;

-- ── 4. set_program_join_link: owner / coach / admin ────────────────────────
create or replace function public.set_program_join_link(
  p_program_id uuid,
  p_token text,
  p_mode text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_old_id   uuid;
  v_caller   text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Owner, coach or admin — the same gate as `set_program_join_link_mode`
  -- and `revoke_program_join_link`. Minting replaces the live row AND sets
  -- its mode, so a wider gate here let plain staff do by "reset" what the
  -- other two functions refuse them: drop a coach's approval requirement, or
  -- kill a link everyone holds. Staff still read and copy the live link.
  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;
  if v_caller is null or v_caller not in ('owner', 'coach') then
    raise exception 'Only the owner and coaches can turn on or reset the join link.'
      using errcode = '42501';
  end if;

  if p_mode not in ('open', 'approve') then
    raise exception 'unknown join link mode %', p_mode using errcode = '22023';
  end if;

  -- The token is minted by the server (`generateToken()`, 32 bytes base64url
  -- = 43 chars). Anything shorter did not come from there.
  if p_token is null or length(p_token) < 32 then
    raise exception 'join link token is too short' using errcode = '22023';
  end if;

  -- Serialises two staff resetting at once against the one-live-row index.
  perform 1 from public.programs where id = p_program_id for update;

  update public.program_join_links
     set revoked_at = now()
   where program_id = p_program_id
     and revoked_at is null
  returning id into v_old_id;

  insert into public.program_join_links (program_id, token, mode, created_by)
  values (p_program_id, p_token, p_mode, v_uid)
  returning id into v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'join_link.created', v_id,
     jsonb_build_object('mode', p_mode, 'replaced', v_old_id));

  return v_id;
end;
$function$;

revoke all on function public.set_program_join_link(uuid, text, text) from public, anon;
grant execute on function public.set_program_join_link(uuid, text, text) to authenticated, service_role;
