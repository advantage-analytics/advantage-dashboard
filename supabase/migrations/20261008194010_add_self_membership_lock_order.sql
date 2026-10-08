-- The membership lock in `add_self_as_program_player`, in the right order.
--
-- `20261008193033` closed the removal race by re-reading the caller's
-- membership `for share` AFTER taking the program lock. That order is the
-- reverse of the one a removal uses: `remove_program_member` and
-- `leave_program` take the member row first, and the
-- `program_members_after_delete` trigger then locks the program row. A coach
-- being removed at the moment they pressed "Add me to the roster" could
-- therefore deadlock — Postgres aborts one side after a second, so nothing
-- was corrupted, but one of the two calls failed for no reason of its own.
--
-- The single membership read is now the locked one, taken first. A removal
-- that already committed finds no row and is refused; one in flight waits and
-- then archives the profile this creates. Member-then-program, the same order
-- as every other writer. Everything else is the previous body, unchanged.
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
  --
  -- Share-locked, and BEFORE the program row: a removal of this login either
  -- already committed (no row, refused below) or waits for this transaction
  -- and then archives the profile it finds, which is what
  -- `remove_program_member` does. The order matters. Removing or leaving
  -- takes the member row first and the program row second (the
  -- `program_members_after_delete` trigger locks it), so this takes them in
  -- the same order; program-then-member would deadlock against either.
  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = v_uid
     for share;

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

  -- Locked before the lookups below: they read state a concurrent call could
  -- change — this login's own row, and the seat count.
  select p.seats into v_seats
    from public.programs p where p.id = p_program_id for update;

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
