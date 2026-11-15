-- Leaving 'complete' clears the admin's check. label_sessions_checked_needs_complete
-- allows checked_at only on a complete session, and the label_publish_check
-- backfill stamped checked_at on every session completed before it. The Reopen
-- deployed before that migration sets only status and completed_at, so without
-- this it is refused on those sessions. Code that already clears the check
-- (Reopen and Send back on this branch) is unaffected.

create or replace function public.label_sessions_clear_check_on_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'complete' and new.status is distinct from 'complete' then
    new.checked_at := null;
    new.checked_by := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.label_sessions_clear_check_on_reopen() from public, anon, authenticated;

create or replace trigger label_sessions_clear_check_on_reopen
  before update of status on public.label_sessions
  for each row execute function public.label_sessions_clear_check_on_reopen();
