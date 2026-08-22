-- An invitation can name the roster row it is for.
--
-- This is the change that makes the duplicate impossible rather than merely
-- repairable. A coach adds Priya in August and invites her in September; if the
-- invitation cannot say "this is for that row", accepting it mints a second
-- Priya and her three matches are stranded on the first one.
--
-- The research brief's finding, from five roster products: the strongest
-- pattern is selection at the join point. GameChanger makes joiners pick which
-- roster player they are; TeamSnap auto-links by email. Both put the choice
-- where the duplicate would otherwise be created.

alter table public.program_invites
  add column if not exists player_id uuid
  references public.program_players(id) on delete set null;

comment on column public.program_invites.player_id is
  'The roster row this invitation binds a login to. NULL means "someone new" — acceptance mints a profile instead.';

-- ---------------------------------------------------------------------------
-- Invite, now with a target, a seat check and a tripwire
-- ---------------------------------------------------------------------------

-- A SIX-argument overload, not a replacement. `create or replace` with a
-- different argument list creates a second function, and PostgREST resolves
-- overloads by the set of parameter NAMES in the request body — five keys hit
-- the old one, six hit this one. So the deploy has no window where the app and
-- the database disagree about the signature.
--
-- `p_player_id` deliberately has NO DEFAULT. A default would make a five-key
-- call ambiguous between the two overloads, and PostgREST would refuse it.
create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email      text,
  p_role       text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_player_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  if not public.is_program_staff(p_program_id) then
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

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Reserved at invite time, not at acceptance. The alternative fails at the
  -- worst possible moment: a coach on 20 seats sends 30 invitations, and the
  -- 21st athlete creates an account, sets a password, clicks through, and hits
  -- a wall they can do nothing about. The refusal belongs in front of the
  -- coach, who is the only person who can free a seat.
  --
  -- The address being written is excluded from the pending count, so a RESEND
  -- of an open invitation never costs a second seat.
  select p.seats into v_seats from public.programs p where p.id = p_program_id;

  select count(*) into v_used
    from public.program_members pm where pm.program_id = p_program_id;

  select count(*) into v_pending
    from public.program_invites i
   where i.program_id = p_program_id
     and i.accepted_at is null
     and i.expires_at > now()
     and lower(i.email) <> v_email;

  if v_used + v_pending + 1 > coalesce(v_seats, 0) then
    raise exception
      'this program has % seats, and they are taken or reserved by open invitations',
      coalesce(v_seats, 0)
      using errcode = '54000';
  end if;

  -- ── The target ───────────────────────────────────────────────────────────
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
    -- ── The tripwire ───────────────────────────────────────────────────────
    -- No target named, but this address is already on a coach-managed row. Do
    -- not create the duplicate; tell the caller which row it should attach to.
    --
    -- THIS LOOKUP MUST NEVER BE WIDENED. Not to `public.users`, and not to
    -- another program. As written it is not an enumeration oracle: the caller
    -- is authenticated staff of this one program, the candidate set is their
    -- own roster which they can already read in full through
    -- `program_roster_full`, and the comparison is equality on one program's
    -- rows. A version that answered "is this person already on Advantage?"
    -- would be a probe against the entire user table, which is the failure
    -- `domain-match.ts` documents at length.
    select pp.id, btrim(pp.first_name || ' ' || pp.last_name)
      into v_clash_id, v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
       and pp.claimed_by_user_id is null
       and lower(pp.email) = v_email;

    if v_clash_id is not null then
      -- `hint` and `detail` both survive PostgREST, so the server action can
      -- reopen the dialog with the right row preselected instead of asking the
      -- coach to find it again.
      raise exception '% is already on this roster without an account', v_clash
        using errcode = 'P0001',
              detail  = v_clash_id::text,
              hint    = 'link_player';
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
$$;

revoke all on function public.create_program_invite(uuid, text, text, text, timestamptz, uuid) from public;
revoke execute on function public.create_program_invite(uuid, text, text, text, timestamptz, uuid) from anon;
grant execute on function public.create_program_invite(uuid, text, text, text, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The five-argument signature becomes a wrapper
-- ---------------------------------------------------------------------------

-- Kept for one deploy so a running instance of the app does not break the
-- moment this migration lands. It delegates rather than duplicating, so the
-- seat check and the tripwire apply to it too — a caller on the old signature
-- gets the new behaviour, which is the point of not forking the body.
create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email      text,
  p_role       text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_program_invite(
    p_program_id, p_email, p_role, p_token_hash, p_expires_at, null::uuid
  );
$$;

comment on function public.create_program_invite(uuid, text, text, text, timestamptz) is
  'DEPRECATED wrapper. Delegates to the six-argument form with no target. Drop once no deployed code calls it.';
