-- R2 playback copies waiting to be deleted (docs/r2-video-storage-plan.md).
--
-- The app on Vercel holds only a READ token for R2, by design, so deleting a
-- match or an account cannot remove its playback copy there itself. The purge
-- (purge-match-storage.ts) queues the key here instead, and something that
-- holds the WRITE token drains the queue: the playback worker at the start of
-- every run (through /api/webhooks/playback/deletes, which hands out keys and
-- removes a row only once a HEAD with the read token confirms the object is
-- gone), and `scripts/backfill-playback-to-r2.ts --drain-deletes`.
--
-- Only playback-copy keys can be queued (the check below), so nothing that
-- reaches this table can make the drainer delete an upload, a vendor copy or
-- the sample.
--
-- Server only: RLS on with no policy, and no grant to anon or authenticated.

create table if not exists public.r2_pending_deletes (
  object_key text primary key
    constraint r2_pending_deletes_playback_key_check
    check (object_key ~ '^playback/[^/]+/[^/]+/[^/]+\.mp4$'),
  queued_at timestamptz not null default now(),
  -- Which path queued it ("match delete", "account delete", ...), for the log.
  queued_by text not null,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text
);

comment on table public.r2_pending_deletes is
  'R2 playback copies to delete; queued by the match/account purge, drained with the R2 write token. Server only.';

alter table public.r2_pending_deletes enable row level security;
revoke all on table public.r2_pending_deletes from public, anon, authenticated;
grant select, insert, update, delete on table public.r2_pending_deletes to service_role;

-- Tighten the playback_store guard (20261110043800): a browser may no longer
-- clear the column either. The reset on a new upload is the trigger's own
-- write, so it is exempt; any other change from a client is refused.
create or replace function public.processing_jobs_guard_playback_store()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  reset boolean := false;
begin
  -- A new upload makes the old copy stale; its store goes with it.
  if tg_op = 'UPDATE' and new.video_object_key is distinct from old.video_object_key
     and new.playback_object_key is not distinct from old.playback_object_key then
    new.playback_store := null;
    reset := true;
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.playback_store is not null)
     or (tg_op = 'UPDATE' and not reset
         and new.playback_store is distinct from old.playback_store) then
    raise exception 'A processing job''s playback store is written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.processing_jobs_guard_playback_store() from public, anon, authenticated;
