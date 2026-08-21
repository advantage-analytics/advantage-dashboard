-- Close the INSERT half of 20260821144058.
-- Applied live 2026-08-21 as version 20260821232306.
--
-- That migration stopped a client UPDATE from moving a match onto another
-- program's line, and stopped there. But `matches` has exactly one INSERT
-- policy --
--
--   Users can insert own matches :: WITH CHECK (auth.uid() = created_by)
--
-- -- and no INSERT trigger, so the same graft was still one POST away. Instead
-- of re-pointing an existing row, name the other program's `program_id` and
-- the teammate's `event_entry_id` on a NEW row: the policy is satisfied
-- because you are the creator, `readSchedule` renders it under that court, and
-- `dualScore` folds it into the team total.
--
-- Not staff-only either. `program_event_entries` is readable by any member
-- ("Entries are visible to program members"), so any player on the roster can
-- read the entry ids and fabricate a result against their own program's dual.
--
-- == The two columns need DIFFERENT rules ====================================
--
-- `program_id` -- MEMBERSHIP, not staff. A player uploads through the ordinary
-- wizard, which sets `programId` whenever the active workspace is a team
-- (`useUploadMatchWizard`), and `program_settings.players_can_upload` exists
-- precisely to allow that. Requiring staff here would break every player
-- upload, which is the kind of fix that is worse than the bug.
--
-- `event_entry_id` -- STAFF, and the entry must belong to the same program.
-- Only staff ever set it: `/dashboard/team/upload` redirects non-staff, and
-- `recordResult` goes through `requireStaff()`. A player has no legitimate way
-- to attach a match to a scheduled line, so this is where the door closes.
--
-- The service role is exempt throughout, so the webhook, the derivation
-- publisher and every server-side job are unaffected.
--
-- Proved on the live database against a synthetic event and entry, seven
-- checks, all correct, everything removed afterwards:
--
--   member files under OWN program ................. allowed
--   member files under ANOTHER program ............. refused
--   staff attaches to own line ..................... allowed
--   line grafted onto ANOTHER program .............. refused
--   personal upload (program_id null) .............. allowed
--   PLAYER attaches to a scheduled line ............ refused   <- the finding
--   UPDATE re-graft ................................ refused   <- no regression
create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.is_program_staff(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: neither column may move at all. Where a match is filed is decided
  -- when it is created.
  if new.program_id is distinct from old.program_id
     or new.event_entry_id is distinct from old.event_entry_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists matches_block_client_regraft on public.matches;

-- `before insert or update of ...` -- on INSERT the `of` list is ignored and
-- the trigger fires for every row, which is what is wanted: a NULL program_id
-- passes both checks and costs one branch.
create trigger matches_block_client_regraft
  before insert or update of program_id, event_entry_id on public.matches
  for each row
  execute function public.matches_block_client_regraft();

comment on function public.matches_block_client_regraft() is
  'Refuses a client write that files a match under a program it does not belong to, or attaches it to a scheduled line the caller does not run. INSERT: program_id must be one of yours, event_entry_id needs staff and must match program_id. UPDATE: neither column may change.';
