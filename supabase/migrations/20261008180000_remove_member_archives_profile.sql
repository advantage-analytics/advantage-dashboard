-- Removing a member from a team also takes their player profile off the roster.
--
-- Since `20261008160418`, an owner, coach or staff member can hold a claimed
-- player profile. `remove_program_member` only ever deleted the membership
-- row, which was the whole job while staff could not hold one: a PLAYER is
-- removed through `archive_program_player`, which archives the profile first
-- and then calls this. Removing a coach who had added themselves therefore
-- left a live profile with no member behind it — still a row on the roster,
-- still holding a seat.
--
-- The profile is now archived with the membership, which is exactly the state
-- a removed player is left in: off the roster, seat freed, claim kept so their
-- own matches stay theirs. Idempotent for the player path, where the profile
-- is already archived by the time this runs. Everything above the final
-- UPDATE is the previous live body, unchanged.
--
-- Applied by hand from the SQL editor on 2026-10-08 (the Supabase MCP
-- declines a statement containing DELETE), so `supabase_migrations` carries
-- no row for it; the version in this filename orders it after the two above.
create or replace function public.remove_program_member(p_program_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role   text;
  v_caller text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = p_user_id;

  if v_role is null then
    return;
  end if;

  if v_role = 'owner' then
    raise exception 'transfer ownership before removing the owner'
      using errcode = '42501';
  end if;

  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;

  if v_role = 'coach' and v_caller <> 'owner' then
    raise exception 'Coaches are the owner''s to remove.'
      using errcode = '42501';
  end if;

  if v_role = 'staff' and v_caller not in ('owner', 'coach') then
    raise exception 'Only the owner or a coach can remove staff.'
      using errcode = '42501';
  end if;

  delete from public.program_members
   where program_id = p_program_id and user_id = p_user_id;

  -- Their player profile, if they held one, leaves the roster with them.
  update public.program_players
     set archived_at = now(), updated_at = now()
   where program_id = p_program_id
     and claimed_by_user_id = p_user_id
     and archived_at is null
     and merged_into_id is null;
end;
$function$;
