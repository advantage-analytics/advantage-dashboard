-- Undo is refused once a session leaves 'labelling' (undo_label_op), so its
-- journal is dead weight from the moment it completes. Clear it then; a
-- reopened session starts a fresh journal.

create or replace function public.label_row_history_prune()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.label_row_history where session_id = new.id;
  return null;
end;
$$;

revoke all on function public.label_row_history_prune() from public, anon, authenticated;

create trigger label_sessions_prune_history
  after update of status on public.label_sessions
  for each row
  when (new.status = 'complete' and old.status is distinct from 'complete')
  execute function public.label_row_history_prune();
