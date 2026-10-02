-- set_program_player_style: close a NULL hole in the authorization check.
--
-- The guard read `if not (is_program_staff(...) or is_admin() or v_claimed =
-- v_uid)`. For an UNCLAIMED profile `v_claimed` is null, so the last term is
-- null, the whole disjunction is null for anyone who is neither staff nor an
-- admin, `not null` is null — and `if null` skips the raise. Any
-- authenticated user holding an unclaimed profile's id could set its style
-- and write an audit row into that program. Found by the pr-check
-- rls-boundary-reviewer, reproduced against the live database, fixed here.
--
-- `is not null and =` makes the self-edit term a plain boolean. The rest of
-- the body is 20260930045811's, unchanged.

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
  -- own claimed profile. Every term is a non-null boolean: a null here would
  -- make the whole check null, and `if null` does not raise.
  if not (
    coalesce(public.is_program_staff(v_program), false)
    or coalesce(public.is_admin(), false)
    or (v_claimed is not null and v_claimed = v_uid)
  ) then
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
