-- set_program_player_style: mirror a claimed profile's style onto the roster
-- row too, and leave an audit trail.
--
-- The first version wrote only `users.hand/backhand` for a claimed profile.
-- The readers that can see a profile claimed by STAFF — an owner or coach who
-- also plays — read `program_players` directly (`program_roster_full`'s player
-- arm drops that profile, so the Edit player dialog and the wizard's own-row
-- read fall back to the row itself), so a style saved for them never read
-- back: the dialog reopened on "Not set" and the wizard offered "use for
-- future matches" on every upload.
--
-- `users` stays the one cell for a claimed player — `program_roster_full`
-- still prefers it, so a change in their own Settings wins — and the roster
-- row now carries the last value a coach saved alongside it.
--
-- The audit row reuses `player.updated` (the action CHECK is a closed list):
-- a coach's write can land on a player's own profile, and there should be a
-- trace of who made it.

create or replace function public.set_program_player_style(
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
  end if;

  update public.program_players
     set hand = p_hand,
         backhand = p_backhand,
         updated_at = now()
   where id = p_player_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.updated', p_player_id,
          jsonb_build_object('style', jsonb_build_object('hand', p_hand, 'backhand', p_backhand),
                             'claimed', v_claimed is not null));
end;
$function$;

revoke all on function public.set_program_player_style(uuid, text, text) from public, anon;
grant execute on function public.set_program_player_style(uuid, text, text) to authenticated, service_role;
