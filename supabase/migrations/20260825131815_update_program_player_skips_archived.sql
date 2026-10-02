-- `update_program_player` refuses an archived row.
--
-- 20260822090700 gave the edit path this row lookup:
--
--     where id = p_player_id and merged_into_id is null
--
-- while `archive_program_player`, forty lines below it in the same file, checks
-- `archived_at is null` as well. The asymmetry was not deliberate. This
-- function is SECURITY DEFINER and granted to `authenticated`, so anything
-- holding a session can call it directly -- a browser console, curl, any API
-- client -- and the only thing standing between a staff member and a
-- successful write to a player who has left the program was the pre-flight
-- SELECT in `roster-actions.ts`, on the far side of the network. A guard a
-- caller can skip is not a guard.
--
-- What it bought is small and worth stating plainly: staff on their own
-- roster, rewriting five columns of a row nobody on the page can see, with an
-- audit row recorded for it. Nothing crosses a program boundary --
-- `is_program_staff` is checked against the program read off the row, never an
-- argument. But it is a real write to a row the product treats as gone, it is
-- invisible on every screen, and it can occupy an address the partial unique
-- index over live rows would otherwise have kept free for the graduating
-- senior's replacement. It closes here, in the one place every caller has to
-- come through.
--
-- The body is otherwise 20260822090700's, unchanged: the same signature and
-- defaults, `security definer` with `set search_path = ''`, the same four
-- guards and the same sentences they raise. Those sentences are product copy,
-- not diagnostics -- `roster-actions.ts` hands 42501 and 22023 messages
-- straight to the coach -- so rewording one would be a UI change wearing a
-- migration's clothes.
--
-- Still silent on a row it cannot find, and that part is deliberate. Raising
-- would hand `describeUpdateFailure()` a string it has never seen, which it
-- passes through verbatim with `gone: false`: a raw sentence in the dialog
-- beside a Save button that can never succeed. Returning instead puts the one
-- narrow case left -- archived between the pre-flight read and this call --
-- where the existing "clicking twice is ordinary" case already lands, and
-- leaves the friendly "no longer on this roster" state to the pre-flight read,
-- which is the only side that can tell the two apart. `archive_program_player`
-- returns on the same condition for the same reason.
--
-- No re-grant below, on purpose. `create or replace` reuses the pg_proc row,
-- so the ACL granted in 20260822090700 survives untouched;
-- `accept_program_invite` is the proof in this database -- granted to
-- `authenticated` once in 20260820151500, replaced with no grant of any kind in
-- 20260822120100, and still `authenticated=X/postgres` today.
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

  -- `archived_at is null` is the whole of this migration. Same three
  -- conditions `archive_program_player` finds its row on.
  select program_id into v_program
    from public.program_players
   where id = p_player_id
     and merged_into_id is null
     and archived_at is null;

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
