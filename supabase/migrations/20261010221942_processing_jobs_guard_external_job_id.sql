-- Extends processing_jobs_guard_storage_keys to external_job_id, which a
-- signed-in client could still set on its own job.
--
-- The vendor's job id is what record_splitstep_webhook() matches deliveries
-- on, what adoptOrphanedDeliveries() adopts by, and what the cancel route
-- sends DELETE to at the vendor. The unique index
-- (processing_jobs_external_job_id_key) stops a client taking an id another
-- row already holds, but not one no row holds yet — an orphaned delivery's,
-- or a job's in the window before /api/splitstep/jobs records it. A row that
-- claimed one would receive that delivery's analysis and could cancel that
-- job at the vendor. Only the server writes it (/api/splitstep/jobs through
-- the admin client; the admin console's SECURITY DEFINER RPCs), so a client
-- write is refused outright.
--
-- Body otherwise identical to 20261010215308_processing_jobs_guard_video_keys.
--
-- NOT YET APPLIED to the live project. Apply via the Supabase MCP as
-- `processing_jobs_guard_external_job_id`, then rename this file to the
-- version the live project records.

create or replace function public.processing_jobs_guard_storage_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own_video text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- The one key the browser writes: its own upload, under its own uid and
  -- this job's match (splitstep/object-keys.ts videoObjectKey).
  own_video := '^videos/' || coalesce((select auth.uid())::text, '-') || '/'
    || coalesce(new.match_id::text, '-') || '/original(\.[A-Za-z0-9]+)*$';
  if tg_op = 'INSERT' then
    if new.external_job_id is not null
       or new.results_object_key is not null
       or new.players_object_key is not null
       or new.trajectories_object_key is not null
       or new.trimmed_object_key is not null
       or coalesce(cardinality(new.label_backup_keys), 0) > 0
       or (new.video_object_key is not null and new.video_object_key !~ own_video) then
      raise exception 'Storage keys on a processing job are written by the server only.'
        using errcode = '42501';
    end if;
  elsif new.match_id is distinct from old.match_id
     or new.external_job_id is distinct from old.external_job_id
     or new.results_object_key is distinct from old.results_object_key
     or new.players_object_key is distinct from old.players_object_key
     or new.trajectories_object_key is distinct from old.trajectories_object_key
     or new.trimmed_object_key is distinct from old.trimmed_object_key
     or new.label_backup_keys is distinct from old.label_backup_keys
     or (new.video_object_key is distinct from old.video_object_key
         and new.video_object_key is not null
         and new.video_object_key !~ own_video) then
    raise exception 'A processing job''s match and storage keys are written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.processing_jobs_guard_storage_keys() from public, anon, authenticated;
