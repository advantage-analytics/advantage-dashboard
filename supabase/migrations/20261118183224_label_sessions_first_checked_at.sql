-- The day an admin first checked a session, kept for pay.
--
-- The pay report counts a session's video in the range an admin FIRST checked
-- it. checked_at cannot carry that: Reopen and Send back clear it
-- (label_sessions_clear_check_on_reopen), and the next check stamps it again,
-- so a session checked, paid, sent back and re-checked would count twice.
-- first_checked_at is set the first time checked_at is, and never moves again.
--
-- Practice sessions are never checked and never carry it.

alter table public.label_sessions
  add column if not exists first_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'label_sessions_practice_never_first_checked'
       and conrelid = 'public.label_sessions'::regclass
  ) then
    alter table public.label_sessions
      add constraint label_sessions_practice_never_first_checked check (
        kind <> 'practice' or first_checked_at is null
      );
  end if;
end;
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every session checked today was checked once: none has been sent back since
-- the check existed, so its checked_at is its first check. A session under a
-- fresh publish lease makes label_sessions_refuse_while_publishing raise: run
-- the migration again once the publish has finished.

update public.label_sessions
   set first_checked_at = checked_at
 where checked_at is not null
   and first_checked_at is null;

-- ── Stamp ───────────────────────────────────────────────────────────────────
-- Fires on any write to either column. Once set it keeps its value whatever
-- the update says; until then it takes the check being written, if any.

create or replace function public.label_sessions_stamp_first_checked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_checked_at := coalesce(old.first_checked_at, new.checked_at);
  return new;
end;
$$;

revoke execute on function public.label_sessions_stamp_first_checked() from public, anon, authenticated;

create or replace trigger label_sessions_stamp_first_checked
  before update of checked_at, first_checked_at on public.label_sessions
  for each row execute function public.label_sessions_stamp_first_checked();
