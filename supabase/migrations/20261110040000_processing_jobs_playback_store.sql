-- Where a job's playback copy lives: R2 or Azure (docs/r2-video-storage-plan.md).
--
-- The playback worker writes its copy to Cloudflare R2, where downloads cost
-- nothing, instead of to Azure, which bills every byte a browser plays. Every
-- player reads this column to know which store to sign a URL for.
--
-- Null means Azure: every copy made before this column existed is there, and
-- the readers treat anything but 'r2' as Azure. The webhook writes the column
-- on every `ready` report (`playback-copy.ts`), so a stale value never
-- outlives the copy it described.
--
-- Additive. Apply it BEFORE the code deploys. The app does tolerate its absence
-- (42703 → read and write without it), but until it exists the webhook cannot
-- record that a copy is in R2, so every new copy plays from the upload instead.

alter table public.processing_jobs
  add column if not exists playback_store text
    constraint processing_jobs_playback_store_check
    check (playback_store in ('azure', 'r2'));

comment on column public.processing_jobs.playback_store is
  'Store of playback_object_key: r2, or azure / null (Azure). Written by the playback webhook and the R2 backfill; server only.';

-- Server only, like every other storage column on the row
-- (processing_jobs_guard_storage_keys). authenticated holds table-level
-- INSERT/UPDATE, so a column revoke would not bite; a trigger does.
create or replace function public.processing_jobs_guard_playback_store()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  -- A new upload makes the old copy stale; its store goes with it.
  if tg_op = 'UPDATE' and new.video_object_key is distinct from old.video_object_key
     and new.playback_object_key is not distinct from old.playback_object_key then
    new.playback_store := null;
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.playback_store is not null)
     or (tg_op = 'UPDATE' and new.playback_store is distinct from old.playback_store
         and new.playback_store is not null) then
    raise exception 'A processing job''s playback store is written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.processing_jobs_guard_playback_store() from public, anon, authenticated;

drop trigger if exists processing_jobs_guard_playback_store on public.processing_jobs;
create trigger processing_jobs_guard_playback_store
  before insert or update on public.processing_jobs
  for each row execute function public.processing_jobs_guard_playback_store();
