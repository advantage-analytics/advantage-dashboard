-- A playback copy of each upload: index first, H.264 1080p, AAC, a keyframe at
-- least every ~2 s, on the upload's own timeline. Made by the Azure playback
-- worker (workers/playback) and reported through /api/video/playback; the
-- players prefer it over the upload and the vendor's silent re-encode.
--
-- Server-written only, like every other storage key on the row: the guard
-- below refuses a browser write, so a viewer cannot point the copy at another
-- blob and have the server sign it. A new upload clears the copy, whoever
-- writes it, so a stale copy of the old file never plays.

alter table public.processing_jobs
  add column if not exists playback_object_key text,
  add column if not exists playback_status text,
  add column if not exists playback_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'processing_jobs_playback_status_check'
      and conrelid = 'public.processing_jobs'::regclass
  ) then
    alter table public.processing_jobs
      add constraint processing_jobs_playback_status_check
      check (playback_status is null or playback_status in ('processing', 'ready', 'failed'));
  end if;
end $$;

comment on column public.processing_jobs.playback_object_key is
  'Blob name of the playback copy (playback/...). Set by the playback worker callback only.';
comment on column public.processing_jobs.playback_status is
  'processing | ready | failed — the playback worker''s last report. Null: never queued.';

create or replace function public.processing_jobs_guard_storage_keys()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  own_video text;
begin
  -- A new upload makes any copy of the old one stale, whoever writes it.
  if tg_op = 'UPDATE' and new.video_object_key is distinct from old.video_object_key
     and new.playback_object_key is not distinct from old.playback_object_key then
    new.playback_object_key := null;
    new.playback_status := null;
    new.playback_error := null;
  end if;

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
       or new.playback_object_key is not null
       or new.playback_status is not null
       or new.playback_error is not null
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
     or (new.playback_object_key is distinct from old.playback_object_key
         and new.playback_object_key is not null)
     or (new.playback_status is distinct from old.playback_status
         and new.playback_status is not null)
     or (new.playback_error is distinct from old.playback_error
         and new.playback_error is not null)
     or new.label_backup_keys is distinct from old.label_backup_keys
     or (new.video_object_key is distinct from old.video_object_key
         and new.video_object_key is not null
         and new.video_object_key !~ own_video) then
    raise exception 'A processing job''s match and storage keys are written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
