-- Extends processing_jobs_guard_storage_keys to the two video keys, which the
-- purge hands to deleteVideoBlob verbatim. trimmed_object_key is server-only.
-- video_object_key is the one the browser writes (its own upload), so a
-- signed-in user may set it only to their own canonical key for this job's
-- match: videos/{auth.uid()}/{match_id}/original[.ext…] (object-keys.ts
-- videoObjectKey; a remux adds a second extension, original.h264.mp4).
-- Existing values are untouched — only a changed value is checked.

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
    if new.results_object_key is not null
       or new.players_object_key is not null
       or new.trajectories_object_key is not null
       or new.trimmed_object_key is not null
       or coalesce(cardinality(new.label_backup_keys), 0) > 0
       or (new.video_object_key is not null and new.video_object_key !~ own_video) then
      raise exception 'Storage keys on a processing job are written by the server only.'
        using errcode = '42501';
    end if;
  elsif new.match_id is distinct from old.match_id
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
