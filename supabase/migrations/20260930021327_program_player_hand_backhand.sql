-- Hand and backhand on the roster profile.
--
-- A coach-managed player has no `users` row, so until now the upload wizard
-- could only guess their style from their last match and had nowhere to keep
-- the coach's answer. The profile row now carries it.
--
-- One cell per person. An unclaimed profile's style lives on
-- `program_players`; once a player claims it, their own `users.hand/backhand`
-- is the value — the one they edit in Settings › Profile. Coach writes to a
-- claimed profile go to that `users` row (`set_program_player_style`), and
-- reads prefer it, falling back to whatever the coach recorded before the
-- claim (`program_roster_full`). Same vocabulary as `users` and `matches`.

alter table public.program_players
  add column hand text
    constraint program_players_hand_check check (hand in ('right', 'left')),
  add column backhand text
    constraint program_players_backhand_check check (backhand in ('one-handed', 'two-handed'));

-- ── add_program_player ────────────────────────────────────────────────────
-- Recreated from the live body with two trailing, defaulted parameters, so an
-- older client that names only the first six still resolves to it.
drop function if exists public.add_program_player(uuid, text, text, text, integer, text);

create function public.add_program_player(
  p_program_id uuid,
  p_first_name text,
  p_last_name text,
  p_class_year text default null,
  p_lineup_spot integer default null,
  p_email text default null,
  p_hand text default null,
  p_backhand text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_staff  boolean;
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

  -- Staff of THIS program, or a platform admin. The admin branch reads
  -- `users.is_admin` only; it never infers the program from the caller.
  v_staff := public.is_program_staff(p_program_id);
  if not (v_staff or public.is_admin()) then
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

  if p_hand is not null and p_hand not in ('right', 'left') then
    raise exception 'hand is right or left' using errcode = '22023';
  end if;

  if p_backhand is not null and p_backhand not in ('one-handed', 'two-handed') then
    raise exception 'backhand is one-handed or two-handed' using errcode = '22023';
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
    (program_id, first_name, last_name, class_year, lineup_spot, email, hand, backhand, created_by)
  values
    (p_program_id, v_first, v_last, nullif(btrim(coalesce(p_class_year, '')), ''),
     p_lineup_spot, v_email, p_hand, p_backhand, v_uid)
  returning id into v_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'player.added', v_id,
          jsonb_build_object('name', v_first || ' ' || v_last, 'email', v_email,
                             'by_admin', not v_staff));

  return v_id;
end;
$function$;

revoke all on function public.add_program_player(uuid, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.add_program_player(uuid, text, text, text, integer, text, text, text) to authenticated, service_role;

-- ── set_program_player_style ──────────────────────────────────────────────
-- The one writer of a roster player's style, used by both the Edit player
-- dialog and the upload wizard's "use for future matches". Kept apart from
-- `update_program_player` on purpose: adding defaulted parameters there would
-- let any client that omits them clear a saved style on every edit.
-- Null clears. Silent on a profile that is gone, like `update_program_player`.
create function public.set_program_player_style(
  p_player_id uuid,
  p_hand text,
  p_backhand text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_claimed uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select program_id, claimed_by_user_id into v_program, v_claimed
    from public.program_players
   where id = p_player_id
     and merged_into_id is null
     and archived_at is null;

  if v_program is null then
    return;
  end if;

  -- Staff of the program, a platform admin, or the player themselves on their
  -- own claimed profile (a player uploading their own match picks their row).
  if not (public.is_program_staff(v_program) or public.is_admin() or v_claimed = v_uid) then
    raise exception 'not authorized to edit this roster' using errcode = '42501';
  end if;

  if p_hand is not null and p_hand not in ('right', 'left') then
    raise exception 'hand is right or left' using errcode = '22023';
  end if;

  if p_backhand is not null and p_backhand not in ('one-handed', 'two-handed') then
    raise exception 'backhand is one-handed or two-handed' using errcode = '22023';
  end if;

  if v_claimed is not null then
    update public.users
       set hand = p_hand,
           backhand = p_backhand
     where id = v_claimed;
  else
    update public.program_players
       set hand = p_hand,
           backhand = p_backhand,
           updated_at = now()
     where id = p_player_id;
  end if;
end;
$function$;

revoke all on function public.set_program_player_style(uuid, text, text) from public, anon;
grant execute on function public.set_program_player_style(uuid, text, text) to authenticated, service_role;

-- ── program_roster_full ───────────────────────────────────────────────────
-- Recreated from the live body with `hand` and `backhand` appended. The
-- return type changes, so it has to be dropped; nothing in SQL depends on it.
drop function if exists public.program_roster_full(uuid);

create function public.program_roster_full(p_program_id uuid)
returns table(
  player_id uuid,
  profile_id uuid,
  user_id uuid,
  display_name text,
  email text,
  role text,
  class_year text,
  lineup_spot integer,
  managed_by text,
  upload_enabled boolean,
  joined_at timestamp with time zone,
  claimed_at timestamp with time zone,
  hand text,
  backhand text
)
language sql
stable
security definer
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
    -- Claimed by somebody who is staff here? Then arm 2 already speaks for
    -- them. Unclaimed profiles have no membership row and always appear.
    and (pm.role is null or pm.role = 'player')
    and p_program_id in (select public.user_program_ids())

  union all

  -- 2 · Staff seats. Still an INNER JOIN on users, and correctly so — there is
  --     no such thing as a coach-managed coach.
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

revoke all on function public.program_roster_full(uuid) from public, anon;
grant execute on function public.program_roster_full(uuid) to authenticated, service_role;
