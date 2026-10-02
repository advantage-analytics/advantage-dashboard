-- Drop the results-visibility machinery now that every member reads the
-- program's matches unconditionally (20260830120000_matches_visible_to_members).
--
-- `roster_visible` never gated the roster — `program_players` is member-
-- visible with no reference to it — and `resultsScope()` now returns
-- "program" for every member regardless of the flag, so the column is dead
-- weight that Settings still presents as a choice.
--
-- `update_program_settings` takes the column as a required `boolean`
-- parameter. Postgres will not let us `CREATE OR REPLACE` with a changed
-- parameter list, so the function is dropped and recreated with 8 params
-- instead of 9.

--
-- Pre-drop state, recorded because the drop is irreversible: 1941 programs,
-- of which exactly one carried `roster_visible = true` — `ZZ Test Program`
-- (edaf1aa0-b346-4a9f-aa8d-d47d586d25a4), the fake team. The two real
-- member-carrying programs (Dartmouth College, UCLA) were both false, and
-- since 20260830120000 that made no difference to what their members read.
-- Nothing a user chose is being discarded.

-- 1. Drop the old 9-argument function and its grants.
drop function if exists public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean, boolean
);

-- 2. Recreate without `p_roster_visible`.
create function public.update_program_settings(
  p_program_id         uuid,
  p_school_name        text,
  p_team               text,
  p_conference         text,
  p_home_venue         text,
  p_default_surface    text,
  p_season             text,
  p_players_can_upload boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The authorization. `is_program_staff` is the same helper the members and
  -- invites policies use, so there is one answer to "may this person run the
  -- program" rather than a second definition drifting here.
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_team is not null and p_team not in ('mens', 'womens') then
    raise exception 'unknown squad %', p_team using errcode = '22023';
  end if;

  update public.programs
     set school_name        = coalesce(nullif(trim(p_school_name), ''), school_name),
         team               = coalesce(p_team, team),
         conference         = coalesce(nullif(trim(p_conference), ''), conference),
         home_venue         = coalesce(nullif(trim(p_home_venue), ''), home_venue),
         default_surface    = coalesce(p_default_surface, default_surface),
         season             = coalesce(nullif(trim(p_season), ''), season),
         players_can_upload = p_players_can_upload,
         updated_at         = now()
   where id = p_program_id;
end;
$$;

revoke all on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean
) from public;
grant execute on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean
) to authenticated;

-- And take EXECUTE away from `anon` again. `20260818042938_revoke_anon_execute_round4`
-- did this to the 9-argument form, and a drop-and-recreate loses it: Supabase's
-- `alter default privileges … grant execute on functions to anon, authenticated,
-- service_role` puts an EXPLICIT `anon=X` back on every newly created function,
-- and `revoke … from public` above does not touch an explicit grant to a named
-- role. Without this line the recreate silently re-opens what round 4 closed and
-- the linter's `anon_security_definer_function_executable` fires again.
revoke execute on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean
) from anon;

-- 3. Drop the column itself.
alter table public.programs drop column if exists roster_visible;
