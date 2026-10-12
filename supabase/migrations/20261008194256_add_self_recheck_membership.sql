-- A removal racing "Add me to the roster" no longer leaves a stray profile.
--
-- `add_self_as_program_player` read the caller's membership once, before it
-- took the program lock. A removal landing between that read and the insert
-- left a live claimed profile for somebody no longer on the team — a roster
-- row and a seat with no member behind them, the state
-- `20261008180000_remove_member_archives_profile` exists to prevent.
--
-- The membership is now read a second time once the program row is locked.
-- That lock is already what a removal waits on (its after-delete trigger
-- takes it before the profile is archived), so no lock on the member row is
-- needed, and none is taken.
--
-- Two earlier attempts at this were applied live the same day and are
-- superseded by this file, which is the only one kept in the repo:
--   20261008193033  re-read `for share` after the program lock — could
--                   deadlock against `remove_program_member`/`leave_program`
--   20261008194010  `for share` before the program lock — could deadlock
--                   against `set_program_member_role`/`transfer_program_ownership`
-- The existing writers do not agree on member-vs-program order, so any lock
-- on the member row here conflicts with one side or the other.
--
-- Not closed: the same login leaving the program (`leave_program`) at the
-- instant it adds itself. Only that person can cause it, to themselves.
-- Everything else in the function is the previous body, unchanged.
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

  -- Locked first: everything below reads state a concurrent call could change
  -- — this login's own row, and the seat count.
  select p.seats into v_seats
    from public.programs p where p.id = p_program_id for update;

  -- The membership again, now that the program row is held — a plain read,
  -- with NO lock on the member row. The program lock is what serialises this
  -- against a removal: `remove_program_member` deletes the member row, its
  -- after-delete trigger then takes this same program lock, and only after
  -- that does it archive the login's profile. So a removal that got the
  -- program lock first has finished (no row here: refused), and one that has
  -- not is waiting behind this call and will archive the profile it creates.
  -- Locking the member row as well would order this against either the
  -- removal path (member, then program) or the role-change and transfer path
  -- (program, then member) and deadlock against the other.
  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = v_uid;

  if v_role is null or v_role not in ('owner', 'coach', 'staff') then
    raise exception 'only the owner, a coach or staff can add themselves as a player'
      using errcode = '42501';
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
