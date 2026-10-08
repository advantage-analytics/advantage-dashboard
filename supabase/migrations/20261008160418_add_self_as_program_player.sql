-- Staff who also play: a way onto their own roster.
--
-- A team match is recorded against a roster player (`matches.player1_id` is a
-- `program_players.id`), and an owner, coach or staff member who also plays had
-- no way to get a profile: `add_program_player` and `create_program_invite`
-- both refuse an address that already belongs to a member. The receiving end
-- was already built — `my_player_ids()` and `upload_eligibility_refusal` accept
-- a staff login holding a claimed profile — so this adds the one missing door
-- and corrects the two functions that assumed only a `player` could hold one.
--
--   1 · add_self_as_program_player   the door
--   2 · program_roster_full          arm 1 no longer hides a staff-held profile
--   3 · archive_program_player       removing that profile keeps the membership

-- ── 1 · The door ────────────────────────────────────────────────────────────
create or replace function public.add_self_as_program_player(
  p_program_id  uuid,
  p_class_year  text    default null,
  p_lineup_spot integer default null,
  p_hand        text    default null,
  p_backhand    text    default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_role     text;
  v_first    text;
  v_last     text;
  v_id       uuid;
  v_archived timestamptz;
  v_seats    integer;
  v_used     integer;
  v_pending  integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The caller's OWN membership, never a parameter: this function can only
  -- ever put the person calling it on the roster.
  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = v_uid;

  -- A player already has a profile (or the safety arm of the roster speaks for
  -- them); a stranger has no business here.
  if v_role is null or v_role not in ('owner', 'coach', 'staff') then
    raise exception 'only the owner, a coach or staff can add themselves as a player'
      using errcode = '42501';
  end if;

  if p_lineup_spot is not null and p_lineup_spot < 1 then
    raise exception 'a lineup spot starts at 1' using errcode = '22023';
  end if;

  if p_hand is not null and p_hand not in ('right', 'left') then
    raise exception 'hand is right or left' using errcode = '22023';
  end if;

  if p_backhand is not null and p_backhand not in ('one-handed', 'two-handed') then
    raise exception 'backhand is one-handed or two-handed' using errcode = '22023';
  end if;

  -- `program_players_claimed_key` is one profile per login per program and
  -- counts archived rows, so a profile this login once held is restored, never
  -- duplicated. A live one makes the call a no-op: clicking twice is ordinary.
  select pp.id, pp.archived_at into v_id, v_archived
    from public.program_players pp
   where pp.program_id = p_program_id
     and pp.claimed_by_user_id = v_uid
     and pp.merged_into_id is null
   limit 1;

  if v_id is not null and v_archived is null then
    return v_id;
  end if;

  select btrim(coalesce(u.first_name, '')), btrim(coalesce(u.last_name, ''))
    into v_first, v_last
    from public.users u
   where u.id = v_uid;

  -- Same rule as `add_program_player`: a roster row needs both names.
  if v_id is null and (coalesce(v_first, '') = '' or coalesce(v_last, '') = '') then
    raise exception 'add your first and last name in Settings › Profile first'
      using errcode = '22023';
  end if;

  -- ── Seats ──────────────────────────────────────────────────────────────
  -- Locked for the same reason as everywhere else a seat is taken.
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

  if v_id is not null then
    update public.program_players
       set archived_at = null,
           class_year  = coalesce(nullif(btrim(coalesce(p_class_year, '')), ''), class_year),
           lineup_spot = p_lineup_spot,
           updated_at  = now()
     where id = v_id;
  else
    -- No `email`: the roster reads the login's own address for a claimed row,
    -- and leaving the column null keeps `program_players_email_key` out of it.
    insert into public.program_players
      (program_id, first_name, last_name, class_year, lineup_spot,
       claimed_by_user_id, claimed_at, created_by)
    values
      (p_program_id, v_first, v_last, nullif(btrim(coalesce(p_class_year, '')), ''),
       p_lineup_spot, v_uid, now(), v_uid)
    returning id into v_id;
  end if;

  -- Style lives on the account once a profile is claimed
  -- (`set_program_player_style`), and only an answer given overwrites one.
  if p_hand is not null or p_backhand is not null then
    update public.users
       set hand     = coalesce(p_hand, hand),
           backhand = coalesce(p_backhand, backhand)
     where id = v_uid;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'player.added', v_id,
          jsonb_build_object('name', v_first || ' ' || v_last, 'self', true,
                             'member_role', v_role,
                             'restored', v_archived is not null));

  return v_id;
end;
$function$;

revoke all on function public.add_self_as_program_player(uuid, text, integer, text, text) from public, anon;
grant execute on function public.add_self_as_program_player(uuid, text, integer, text, text) to authenticated, service_role;

-- ── 2 · The roster ──────────────────────────────────────────────────────────
-- Arm 1 used to drop a profile claimed by somebody who is staff here, on the
-- reasoning that arm 2 "already speaks for them". It does not: arm 2 carries
-- the LOGIN id, and that person's matches carry the PROFILE id, so the roster
-- table, the lineup, the player page and every "is this match ours" check lost
-- them. A staff member who plays is now both rows — a player row (the profile)
-- and a staff row (the seat at the table) — joined by `user_id`, which is how
-- the app tells that the player row is also a coach. Same return type.
create or replace function public.program_roster_full(p_program_id uuid)
returns table(player_id uuid, profile_id uuid, user_id uuid, display_name text, email text, role text, class_year text, lineup_spot integer, managed_by text, upload_enabled boolean, joined_at timestamp with time zone, claimed_at timestamp with time zone, hand text, backhand text)
language sql
stable security definer
set search_path to ''
as $function$
  -- 1 · Players. Claimed or not, the profile row IS the roster row, and its id
  --     is what their matches carry.
  select
    pp.id,
    pp.id,
    pp.claimed_by_user_id,
    btrim(pp.first_name || ' ' || pp.last_name),
    -- The profile's address wins: a coach may have recorded a school address
    -- for someone whose login is a personal one.
    coalesce(pp.email, u.email),
    'player'::text,
    coalesce(pp.class_year, u.class),
    pp.lineup_spot,
    case when pp.claimed_by_user_id is null then 'coach' else 'self' end,
    coalesce(pm.upload_enabled, false),
    coalesce(pm.joined_at, pp.created_at),
    pp.claimed_at,
    -- Style is the other way round from email: once claimed, the player's own
    -- answer is the one cell, and the coach's pre-claim value only fills a gap.
    -- `u` is null for an unclaimed profile, so this is `pp` alone there.
    coalesce(u.hand, pp.hand),
    coalesce(u.backhand, pp.backhand)
  from public.program_players pp
  left join public.users u
    on u.id = pp.claimed_by_user_id
  left join public.program_members pm
    on pm.program_id = pp.program_id and pm.user_id = pp.claimed_by_user_id
  where pp.program_id = p_program_id
    and pp.merged_into_id is null
    and pp.archived_at is null
    and p_program_id in (select public.user_program_ids())

  union all

  -- 2 · Staff seats. Still an INNER JOIN on users, and correctly so — there is
  --     no such thing as a coach-managed coach. A staff member who also holds
  --     a profile appears here AND in arm 1, sharing a `user_id`.
  select
    pm.user_id,
    null::uuid,
    pm.user_id,
    nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
    u.email,
    pm.role,
    u.class,
    null::integer,
    'self'::text,
    pm.upload_enabled,
    pm.joined_at,
    null::timestamptz,
    u.hand,
    u.backhand
  from public.program_members pm
  join public.users u on u.id = pm.user_id
  where pm.program_id = p_program_id
    and pm.role <> 'player'
    and p_program_id in (select public.user_program_ids())

  union all

  -- 3 · The safety arm. A player-role member with no live profile row must not
  --     silently disappear — that is the exact failure mode of program_roster's
  --     inner join that this feature exists to work around, and it would be
  --     absurd to reintroduce it here. Always empty after the backfill; it is
  --     here so "always" is enforced rather than assumed.
  select
    pm.user_id,
    null::uuid,
    pm.user_id,
    nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
    u.email,
    'player'::text,
    u.class,
    pm.ladder_position,
    'self'::text,
    pm.upload_enabled,
    pm.joined_at,
    null::timestamptz,
    u.hand,
    u.backhand
  from public.program_members pm
  join public.users u on u.id = pm.user_id
  where pm.program_id = p_program_id
    and pm.role = 'player'
    and not exists (
      select 1 from public.program_players pp
       where pp.program_id = pm.program_id
         and pp.claimed_by_user_id = pm.user_id
         and pp.merged_into_id is null
    )
    and p_program_id in (select public.user_program_ids());
$function$;

-- ── 3 · Removing a profile ──────────────────────────────────────────────────
-- Archiving a claimed profile also removed the login from the program, which
-- is right for a player (the profile was their whole membership) and wrong for
-- staff: taking a coach off the roster would have taken them off the team, and
-- for the owner `remove_program_member` raises, so the profile could never be
-- archived at all. The membership now goes only when it is a player's.
create or replace function public.archive_program_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_claimed uuid;
  v_role    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select program_id, claimed_by_user_id into v_program, v_claimed
    from public.program_players
   where id = p_player_id and archived_at is null and merged_into_id is null;

  if v_program is null then
    return;
  end if;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to edit this roster' using errcode = '42501';
  end if;

  update public.program_players
     set archived_at = now(), updated_at = now()
   where id = p_player_id;

  -- A claimed profile's seat goes back when the person leaves the program —
  -- but only a PLAYER leaves with their profile. Staff who also play keep
  -- their seat at the table; they have only stopped being on the roster.
  if v_claimed is not null then
    select pm.role into v_role
      from public.program_members pm
     where pm.program_id = v_program and pm.user_id = v_claimed;

    if v_role = 'player' then
      perform public.remove_program_member(v_program, v_claimed);
    end if;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.archived', p_player_id,
          jsonb_build_object('had_account', v_claimed is not null,
                             'kept_membership', v_role is not null and v_role <> 'player'));
end;
$function$;
