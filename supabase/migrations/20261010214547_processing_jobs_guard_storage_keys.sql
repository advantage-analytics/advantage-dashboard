-- A signed-in user may update their own processing_jobs row (policy "Users
-- can update own processing jobs", with table-wide column grants), and the
-- match purge (matches/purge-match-storage.ts) hands the row's recorded
-- results-bucket keys to a service-role remove. So the row's match and those
-- keys are server-written only: the browser never sets them, and a user who
-- could would point the purge at another athlete's files.
--
-- Checked against the role, not by revoking column grants: the table grant is
-- broad on purpose (status, progress, error fields are written from the
-- browser), and an INSERT must not carry keys either.

create or replace function public.processing_jobs_guard_storage_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.results_object_key is not null
       or new.players_object_key is not null
       or new.trajectories_object_key is not null
       or coalesce(cardinality(new.label_backup_keys), 0) > 0 then
      raise exception 'Storage keys on a processing job are written by the server only.'
        using errcode = '42501';
    end if;
  elsif new.match_id is distinct from old.match_id
     or new.results_object_key is distinct from old.results_object_key
     or new.players_object_key is distinct from old.players_object_key
     or new.trajectories_object_key is distinct from old.trajectories_object_key
     or new.label_backup_keys is distinct from old.label_backup_keys then
    raise exception 'A processing job''s match and storage keys are written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.processing_jobs_guard_storage_keys() from public, anon, authenticated;

create trigger processing_jobs_guard_storage_keys
  before insert or update on public.processing_jobs
  for each row execute function public.processing_jobs_guard_storage_keys();
