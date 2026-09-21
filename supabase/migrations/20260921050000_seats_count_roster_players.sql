-- A seat is a player on the roster — not a login.
--
-- Until now `program_seat_usage` counted `program_members`: every login on the
-- program, staff included, coach-managed players excluded. A coach looking at
-- nine players read "2 of 25" (the owner and one assistant), the cap never
-- bound a program whose staff upload everything, and a coach-managed player
-- could be refused `no_seats` while claiming a profile that already held their
-- matches.
--
-- Decided 2026-09-20:
--   used    = live roster profiles (not archived, not merged, not contributed
--             by another program — nobody here chose those rows)
--   pending = open invitations to SOMEONE NEW as a player. An invitation to
--             claim an existing row adds nobody; a staff invitation takes none.
-- Claiming therefore never moves the count and is never refused for seats.
--
-- No live program exceeds its cap under this definition (largest: 11 / 25).

-- ── The rule, once ─────────────────────────────────────────────────────────
-- Internal: no program-membership check of its own, so it is not granted to
-- API roles. Every caller below is SECURITY DEFINER and has already decided
-- who is asking.
create or replace function public.program_seat_counts(
  p_program_id uuid,
  p_exclude_email text default null
)
returns table (used integer, pending integer)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (select count(*)::int
       from public.program_players pp
      where pp.program_id = p_program_id
        and pp.archived_at is null
        and pp.merged_into_id is null
        and pp.contributed_by_program_id is null),
    (select count(*)::int
       from public.program_invites i
      where i.program_id = p_program_id
        and i.accepted_at is null
        and i.expires_at > now()
        and i.role = 'player'
        and i.player_id is null
        -- A RESEND of an open invitation must not cost a second seat.
        and (p_exclude_email is null or lower(i.email) <> lower(p_exclude_email)));
$function$;

revoke execute on function public.program_seat_counts(uuid, text) from public, anon, authenticated;

create or replace function public.program_seat_usage(p_program_id uuid)
returns table (seats integer, used integer, pending integer)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.seats, c.used, c.pending
    from public.programs p
    cross join lateral public.program_seat_counts(p.id) c
   where p.id = p_program_id
     and p_program_id in (select public.user_program_ids());
$function$;

-- ── Add player: the seat is taken here ─────────────────────────────────────
create or replace function public.add_program_player(
  p_program_id uuid,
  p_first_name text,
  p_last_name text,
  p_class_year text default null,
  p_lineup_spot integer default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_first  text := btrim(coalesce(p_first_name, ''));
  v_last   text := btrim(coalesce(p_last_name, ''));
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_clash  text;
  v_id     uuid;
  v_seats  integer;
  v_used   integer;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to add players to this program'
      using errcode = '42501';
  end if;

  -- Both names, because the roster row has no email to fall back to and a
  -- nameless row is one nobody can find. This is also what makes the six
  -- display-name ladders in the app unreachable for a coach-managed player.
  if v_first = '' or v_last = '' then
    raise exception 'a player needs a first and last name' using errcode = '22023';
  end if;

  if v_email is not null and v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address' using errcode = '22023';
  end if;

  if p_lineup_spot is not null and p_lineup_spot < 1 then
    raise exception 'a lineup spot starts at 1' using errcode = '22023';
  end if;

  -- The reverse tripwire. Somebody already on this program with a login does
  -- not need a second, coach-managed row — that is the duplicate the whole
  -- model exists to prevent, arriving from the other direction.
  if v_email is not null then
    if exists (
      select 1
        from public.program_members pm
        join public.users u on u.id = pm.user_id
       where pm.program_id = p_program_id
         and lower(u.email) = v_email
    ) then
      raise exception 'that person already has an account on this roster'
        using errcode = '23505';
    end if;

    -- And the same address must not already be on a live profile. The partial
    -- unique index would refuse it anyway; this turns a constraint-violation
    -- string into a sentence naming who it collided with.
    select btrim(pp.first_name || ' ' || pp.last_name) into v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and lower(pp.email) = v_email
       and pp.merged_into_id is null
       and pp.archived_at is null;

    if v_clash is not null then
      raise exception '% is already on this roster with that email', v_clash
        using errcode = '23505';
    end if;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Locked, because two coaches adding into the last seat would both read
  -- `taken < seats` and both insert. Last of the guards, so a refusal for a
  -- bad name or a duplicate never waits on the lock.
  select p.seats into v_seats
    from public.programs p where p.id = p_program_id for update;
  select c.used, c.pending into v_used, v_pending
    from public.program_seat_counts(p_program_id) c;

  if v_used + v_pending + 1 > coalesce(v_seats, 0) then
    raise exception
      'all % seats are taken — archive a player or revoke an open invitation to free one',
      coalesce(v_seats, 0)
      using errcode = '54000';
  end if;

  insert into public.program_players
    (program_id, first_name, last_name, class_year, lineup_spot, email, created_by)
  values
    (p_program_id, v_first, v_last, nullif(btrim(coalesce(p_class_year, '')), ''),
     p_lineup_spot, v_email, v_uid)
  returning id into v_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'player.added', v_id,
          jsonb_build_object('name', v_first || ' ' || v_last, 'email', v_email));

  return v_id;
end;
$function$;

-- ── Invite: only somebody new, as a player, reserves a seat ────────────────
create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamp with time zone,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_email    text := lower(trim(p_email));
  v_seats    integer;
  v_used     integer;
  v_pending  integer;
  v_player   public.program_players;
  v_clash_id uuid;
  v_clash    text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- WIDENED (T4): staff of the program, or a platform admin.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to invite to this program'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address'
      using errcode = '22023';
  end if;

  -- Owner is absent on purpose: ownership moves by transfer, never by
  -- invitation, and a program with two owners has no answer to "who decides".
  if p_role not in ('coach', 'staff', 'player') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- Somebody already inside does not need a second way in, and accepting would
  -- collide with `program_members_program_user_key`.
  if exists (
    select 1
      from public.program_members pm
      join public.users u on u.id = pm.user_id
     where pm.program_id = p_program_id
       and lower(u.email) = v_email
  ) then
    raise exception 'that person is already on this roster'
      using errcode = '23505';
  end if;

  if p_player_id is not null then
    select * into v_player
      from public.program_players
     where id = p_player_id
       and program_id = p_program_id
       and merged_into_id is null
       and archived_at is null;

    -- Checked against THIS program, so an id from somewhere else names nobody.
    -- It arrives from a browser and is untrusted.
    if not found then
      raise exception 'that player is not on this roster' using errcode = '22023';
    end if;

    if v_player.claimed_by_user_id is not null then
      raise exception '% already has an account',
        btrim(v_player.first_name || ' ' || v_player.last_name)
        using errcode = '23505';
    end if;

    -- The invitation carries the role the profile implies. A roster row is a
    -- player; inviting one as staff would bind a coach's login to an athlete's
    -- match history.
    if p_role <> 'player' then
      raise exception 'a roster player can only be invited as a player'
        using errcode = '22023';
    end if;

  else
    -- No target named, but this address is already on a coach-managed row. Do
    -- not create the duplicate; tell the caller which row it should attach to.
    --
    -- THIS LOOKUP MUST NEVER BE WIDENED. Not to `public.users`, and not to
    -- another program. As written it is not an enumeration oracle: the caller
    -- is authenticated staff of this one program, the candidate set is their
    -- own roster which they can already read in full through
    -- `program_roster_full`, and the comparison is equality on one program's
    -- rows.
    select pp.id, btrim(pp.first_name || ' ' || pp.last_name)
      into v_clash_id, v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
       and pp.claimed_by_user_id is null
       and lower(pp.email) = v_email;

    if v_clash_id is not null then
      raise exception '% is already on this roster without an account', v_clash
        using errcode = 'P0001',
              detail  = v_clash_id::text,
              hint    = 'link_player';
    end if;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Reserved at invite time, not at acceptance: the refusal belongs in front
  -- of the coach, who is the only person who can free a seat. Only somebody
  -- NEW invited as a player reserves one — a claim invitation targets a row
  -- that already holds its seat, and staff hold none. After the tripwire
  -- above, so "this person is already on your roster" is never masked by
  -- "no seats". Locked for the same reason `add_program_player` locks.
  if p_role = 'player' and p_player_id is null then
    select p.seats into v_seats
      from public.programs p where p.id = p_program_id for update;
    select c.used, c.pending into v_used, v_pending
      from public.program_seat_counts(p_program_id, v_email) c;

    if v_used + v_pending + 1 > coalesce(v_seats, 0) then
      raise exception
        'this program has % seats, and they are taken or reserved by open invitations',
        coalesce(v_seats, 0)
        using errcode = '54000';
    end if;
  end if;

  insert into public.program_invites
    (program_id, email, role, token_hash, invited_by, expires_at, player_id)
  values
    (p_program_id, v_email, p_role, p_token_hash, v_uid, p_expires_at, p_player_id)
  on conflict (program_id, lower(email)) where accepted_at is null
  do update set role       = excluded.role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                player_id  = excluded.player_id,
                created_at = now()
  returning id into v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'invite.created', v_id,
     jsonb_build_object('email', v_email, 'role', p_role, 'player_id', p_player_id));

  return v_id;
end;
$function$;

-- ── Accept: never refused for seats ────────────────────────────────────────
-- The seat was settled when the coach acted: a claim's row already holds one,
-- a new player's open invitation reserved one (it leaves `pending` and enters
-- `used` in this same transaction), and staff take none. The `no_seats`
-- status is therefore gone from this function; the app keeps its screen for
-- it, harmlessly unreachable.
create or replace function public.accept_program_invite(p_token_hash text)
returns table (status text, program_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_invite    public.program_invites;
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
$function$;

-- ── Restore: every restored player needs a seat ────────────────────────────
create or replace function public.restore_program_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_claimed uuid;
  v_email   text;
  v_clash   text;
  v_seats   integer;
  v_used    integer;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select program_id, claimed_by_user_id, email
    into v_program, v_claimed, v_email
    from public.program_players
   where id = p_player_id
     and archived_at is not null
     and merged_into_id is null;

  -- Silent on a live row, a merged row or an unknown id, matching
  -- `update_program_player` and `archive_program_player`: clicking twice is
  -- ordinary, and a merged profile's history already lives on the survivor.
  if v_program is null then
    return;
  end if;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to edit this roster' using errcode = '42501';
  end if;

  -- Archiving freed the address for the partial unique index
  -- (`program_players_email_key`), so a replacement may hold it by now. The
  -- index would refuse the update anyway; this turns a constraint-violation
  -- string into the same sentence `add_program_player` uses, naming who.
  if v_email is not null then
    select btrim(pp.first_name || ' ' || pp.last_name) into v_clash
      from public.program_players pp
     where pp.program_id = v_program
       and lower(pp.email) = lower(v_email)
       and pp.id <> p_player_id
       and pp.merged_into_id is null
       and pp.archived_at is null;

    if v_clash is not null then
      raise exception '% is already on this roster with that email', v_clash
        using errcode = '23505';
    end if;
  end if;

  -- Archiving freed this player's seat, so coming back takes one — login or
  -- not. Checked BEFORE the row is touched so a full program leaves nothing
  -- half-restored, and locked because two restores racing into the last seat
  -- would both read `taken < seats`. An exception rather than a status: this
  -- is a staff action with a DialogProblem to land in.
  select p.seats into v_seats
    from public.programs p where p.id = v_program for update;
  select c.used, c.pending into v_used, v_pending
    from public.program_seat_counts(v_program) c;

  if v_used + v_pending + 1 > coalesce(v_seats, 0) then
    raise exception
      'all % seats are taken — archive a player or revoke an open invitation first',
      coalesce(v_seats, 0)
      using errcode = '54000';
  end if;

  update public.program_players
     set archived_at = null, updated_at = now()
   where id = p_player_id;

  -- A claimed profile also gets its membership back: `accept_program_invite`
  -- requires `claimed_by_user_id is null`, so a claimed profile can never be
  -- claimed again — restored without it, the login would be a dead state —
  -- and the person already consented to this program once.
  if v_claimed is not null then
    insert into public.program_members
      (program_id, user_id, role, upload_enabled, invited_by)
    values
      (v_program, v_claimed, 'player', false, v_uid)
    on conflict (program_id, user_id) do nothing;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.restored', p_player_id,
          jsonb_build_object('had_account', v_claimed is not null));
end;
$function$;
