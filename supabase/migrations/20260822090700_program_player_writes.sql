-- The three writes the Roster page performs on a player profile.
--
-- Same shape as 20260818041025's four membership writes, and for the same
-- reason: `program_players` carries exactly one policy, a SELECT. An UPDATE
-- policy could not restrict columns, so "a coach may edit a player" would also
-- be "a coach may set claimed_by_user_id" — and that column is read access to
-- every match carrying this profile's id. Claiming happens in exactly one
-- place, `accept_program_invite`, holding a token bound to a verified address.

-- ---------------------------------------------------------------------------
-- Add a player
-- ---------------------------------------------------------------------------

create or replace function public.add_program_player(
  p_program_id  uuid,
  p_first_name  text,
  p_last_name   text,
  p_class_year  text default null,
  p_lineup_spot integer default null,
  p_email       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_first  text := btrim(coalesce(p_first_name, ''));
  v_last   text := btrim(coalesce(p_last_name, ''));
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_clash  text;
  v_id     uuid;
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

  -- The reverse tripwire. Somebody already holding a seat here does not need a
  -- second, coach-managed row — that is the duplicate the whole model exists to
  -- prevent, arriving from the other direction.
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
$$;

revoke all on function public.add_program_player(uuid, text, text, text, integer, text) from public;
grant execute on function public.add_program_player(uuid, text, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Edit a player
-- ---------------------------------------------------------------------------

-- Named columns, never a jsonb patch: the point of routing this through a
-- function is that `claimed_by_user_id`, `merged_into_id` and `program_id` are
-- unreachable. A patch object would put them back in reach.
create or replace function public.update_program_player(
  p_player_id   uuid,
  p_first_name  text,
  p_last_name   text,
  p_class_year  text default null,
  p_lineup_spot integer default null,
  p_email       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_first   text := btrim(coalesce(p_first_name, ''));
  v_last    text := btrim(coalesce(p_last_name, ''));
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select program_id into v_program
    from public.program_players
   where id = p_player_id and merged_into_id is null;

  -- Silent on a row that is gone, matching `revoke_program_invite`: clicking
  -- twice is ordinary.
  if v_program is null then
    return;
  end if;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to edit this roster' using errcode = '42501';
  end if;

  if v_first = '' or v_last = '' then
    raise exception 'a player needs a first and last name' using errcode = '22023';
  end if;

  if v_email is not null and v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address' using errcode = '22023';
  end if;

  update public.program_players
     set first_name  = v_first,
         last_name   = v_last,
         class_year  = nullif(btrim(coalesce(p_class_year, '')), ''),
         lineup_spot = p_lineup_spot,
         email       = v_email,
         updated_at  = now()
   where id = p_player_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.updated', p_player_id,
          jsonb_build_object('name', v_first || ' ' || v_last));
end;
$$;

revoke all on function public.update_program_player(uuid, text, text, text, integer, text) from public;
grant execute on function public.update_program_player(uuid, text, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Take a player off the roster
-- ---------------------------------------------------------------------------

-- Archives, never deletes. `matches.player1_id` has no foreign key, so a delete
-- would leave every match this athlete played pointing at nothing — the season
-- would still exist and belong to nobody. Archiving also frees the address for
-- the partial unique index, which is what a graduating senior's replacement
-- needs.
create or replace function public.archive_program_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  -- A claimed profile's seat goes back when the person leaves the program.
  -- `remove_program_member` refuses owners, and so does this by delegation.
  if v_claimed is not null then
    perform public.remove_program_member(v_program, v_claimed);
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.archived', p_player_id,
          jsonb_build_object('had_account', v_claimed is not null));
end;
$$;

revoke all on function public.archive_program_player(uuid) from public;
grant execute on function public.archive_program_player(uuid) to authenticated;

comment on function public.add_program_player(uuid, text, text, text, integer, text) is
  'Create a coach-managed roster row. No account, no seat. Refuses an email already held by a member or another live profile.';
comment on function public.archive_program_player(uuid) is
  'Take a player off the roster, keeping their matches attributable. Releases their seat if the profile was claimed.';
