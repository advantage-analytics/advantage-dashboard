-- T2 · match_video_attachments — persistence and privilege boundary for
-- SwingVision video attachment (plan step 2, "Persistence and lifecycle").
--
-- A SwingVision match is imported from a spreadsheet; its points and shots
-- carry timestamps from a recording the platform never received. Attaching a
-- video later stores ONE offset between that source clock and the uploaded
-- file. This table is the durable record of every attempt to do so. The
-- lifecycle is `src/lib/match-video/types.ts`'s `MATCH_VIDEO_STATES`:
--
--   pending  reserved; credentials may be issued; bytes may be arriving;
--            publication (an Azure server-side copy) may be in progress
--   active   published and serving playback — at most one per match
--   retired  superseded or cancelled; keys kept until the cleanup worker
--            has deleted the blobs
--
-- Transitions are one-way (pending → active → retired, pending → retired).
-- The trigger below refuses anything else: a retired row's blobs are already
-- eligible for deletion, so reactivating it would publish a file that may no
-- longer exist.
--
-- What is deliberately NOT here:
--   * No bearer URL. Only blob KEYS are stored; SAS URLs are minted per
--     request from the key and only their EXPIRY is recorded. A check
--     constraint refuses a key that looks like a URL or carries a query
--     string, so a caller cannot smuggle a credential in through the key.
--   * No client-side access of any kind. RLS is enabled with no policy and
--     every client role's privileges are revoked. Typed server readers
--     enforce caller authorization before using the admin client, and the
--     mutation RPCs (T3/T4, separate migrations) are service-role-only.
--   * No reservation / activation / alignment RPCs — those are T3 and T4.
--
-- Foreign keys are NULLABLE with `on delete set null`, on purpose:
--   * `match_id`  — deleting a match must not erase the row, because the
--                   row is what the cleanup worker uses to find the blobs.
--   * `uploaded_by` — an uploader deleting their account must neither be
--                   blocked by this table (cascade from auth.users → users
--                   would otherwise fail) nor take a team's retained footage
--                   with them. A null uploader alone never makes an active
--                   asset collectible.
--
-- Idempotent: every statement is guarded.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.match_video_attachments (
  id                            uuid primary key default gen_random_uuid(),

  -- Identity / ownership. Both nullable, both set null on delete — see header.
  match_id                      uuid references public.matches (id) on delete set null,
  uploaded_by                   uuid references public.users (id) on delete set null,

  -- Lifecycle.
  state                         text not null default 'pending',
  -- Increments on every alignment change so a second tab can notice its own
  -- view went stale. Starts at 0 on reservation.
  version                       integer not null default 0,

  -- What the client declared about the file. Advisory until verified.
  filename                      text not null,
  declared_size_bytes           bigint not null,
  declared_content_type         text not null,

  -- What the server measured after the bytes landed. Required to activate.
  verified_size_bytes           bigint,
  verified_content_type         text,
  verified_duration_seconds     double precision,

  -- Alignment. `confirmed_video_time_seconds` is the video-clock position of
  -- the first point's serve contact (millisecond precision);
  -- `offset_seconds = firstSourceTime - confirmedVideoTime`.
  confirmed_video_time_seconds  numeric(12, 3),
  offset_seconds                double precision,

  -- Storage. Keys are generated server-side from the attachment id and never
  -- reused. The staged key receives the upload; the final key is the
  -- immutable published object. Neither is ever a URL.
  staged_blob_key               text not null,
  final_blob_key                text not null,

  -- Server-side copy (publication) bookkeeping. `copy_status` is the
  -- substate a pending row is in while publication runs; completion retries
  -- poll the existing copy instead of starting another.
  source_etag                   text,
  copy_id                       text,
  copy_status                   text,
  copy_started_at               timestamptz,

  -- Idempotency. A reservation retried with the same client request id is
  -- the same attempt; the same id with different metadata is a conflict.
  client_request_id             uuid not null,

  -- The active attachment the caller believed in when reserving (optimistic
  -- concurrency). Both null = "I believe this match has no attachment".
  expected_active_id            uuid,
  expected_active_version       integer,

  -- Latest upload-SAS expiry. Persisted BEFORE the credential is returned;
  -- a retired staging key cannot be deleted until this has passed.
  upload_sas_expires_at         timestamptz,

  -- Finalization lease: the completion request that holds the row while it
  -- verifies and publishes. Token identifies the holder; until bounds it.
  finalize_lease_token          uuid,
  finalize_lease_until          timestamptz,

  -- Cleanup lease / retry metadata for the deletion worker.
  cleanup_lease_token           uuid,
  cleanup_lease_until           timestamptz,
  cleanup_attempts              integer not null default 0,
  cleanup_next_attempt_at       timestamptz,
  cleanup_last_error            text,
  cleaned_up_at                 timestamptz,

  -- Timing.
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  -- When the most recent reservation / renewal / completion attempt started.
  last_attempt_at               timestamptz not null default now(),
  activated_at                  timestamptz,
  retired_at                    timestamptz
);

comment on table public.match_video_attachments is
  'One row per attempt to attach a video to a SwingVision match. Server-only: no RLS policy and no grant to any client role; readers and RPCs run as service_role. Blob KEYS only — never a URL. match_id / uploaded_by are set null on delete so the keys survive for cleanup.';

comment on column public.match_video_attachments.state is
  'pending → active → retired, or pending → retired. One-way; enforced by trigger.';
comment on column public.match_video_attachments.version is
  'Bumped on every alignment change; clients send it back as expected_version.';
comment on column public.match_video_attachments.offset_seconds is
  'firstSourceTime - confirmedVideoTime. Applied at playback; imported data is never rewritten.';
comment on column public.match_video_attachments.staged_blob_key is
  'Write target for the upload SAS. Derived from id; never a URL; never reused.';
comment on column public.match_video_attachments.final_blob_key is
  'Immutable published object. Derived from id; never a URL; never reused.';
comment on column public.match_video_attachments.upload_sas_expires_at is
  'Expiry of the most recently issued upload SAS. Written before the URL is returned.';
comment on column public.match_video_attachments.client_request_id is
  'Client-generated UUID; unique per uploader so a retried reservation is the same attempt.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Check constraints
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_state_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_state_check
      check (state in ('pending', 'active', 'retired'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_version_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_version_check
      check (version >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_filename_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_filename_check
      check (length(filename) between 1 and 255);
  end if;

  -- 7,999,999,999 bytes is the plan's hard cap ("under 8 GB").
  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_declared_size_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_declared_size_check
      check (declared_size_bytes > 0 and declared_size_bytes <= 7999999999);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_verified_size_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_verified_size_check
      check (verified_size_bytes is null
             or (verified_size_bytes > 0 and verified_size_bytes <= 7999999999));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_duration_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_duration_check
      check (verified_duration_seconds is null or verified_duration_seconds > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_confirmed_time_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_confirmed_time_check
      check (confirmed_video_time_seconds is null or confirmed_video_time_seconds >= 0);
  end if;

  -- No bearer URLs: a key is a path, not a URL, and never carries a query.
  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_staged_key_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_staged_key_check
      check (length(staged_blob_key) between 1 and 1024
             and staged_blob_key !~ '^[A-Za-z][A-Za-z0-9+.-]*://'
             and staged_blob_key !~ '[?#]');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_final_key_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_final_key_check
      check (length(final_blob_key) between 1 and 1024
             and final_blob_key !~ '^[A-Za-z][A-Za-z0-9+.-]*://'
             and final_blob_key !~ '[?#]');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_keys_differ_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_keys_differ_check
      check (staged_blob_key <> final_blob_key);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_copy_status_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_copy_status_check
      check (copy_status is null
             or copy_status in ('pending', 'success', 'aborted', 'failed'));
  end if;

  -- Expected-active identity and version travel together.
  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_expected_active_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_expected_active_check
      check ((expected_active_id is null) = (expected_active_version is null)
             and (expected_active_version is null or expected_active_version >= 0));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_cleanup_attempts_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_cleanup_attempts_check
      check (cleanup_attempts >= 0);
  end if;

  -- An active row always carries server-verified metadata and a saved
  -- alignment. Activation (T4) is what fills these; nothing can publish a
  -- row whose duration was never measured.
  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_active_verified_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_active_verified_check
      check (state <> 'active'
             or (verified_size_bytes is not null
                 and verified_content_type is not null
                 and verified_duration_seconds is not null
                 and confirmed_video_time_seconds is not null
                 and offset_seconds is not null
                 and activated_at is not null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_video_attachments_retired_at_check') then
    alter table public.match_video_attachments
      add constraint match_video_attachments_retired_at_check
      check ((state = 'retired') = (retired_at is not null));
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- One active attachment per match. Partial on a non-null match: rows whose
-- match was deleted are orphans awaiting cleanup, not competitors.
create unique index if not exists match_video_attachments_one_active_per_match
  on public.match_video_attachments (match_id)
  where state = 'active' and match_id is not null;

-- One pending attempt per match per uploader. A second reservation from the
-- same person for the same match must reuse or cancel the first.
create unique index if not exists match_video_attachments_one_pending_per_uploader
  on public.match_video_attachments (match_id, uploaded_by)
  where state = 'pending' and match_id is not null and uploaded_by is not null;

-- Idempotent reservation: the same (uploader, client request) is the same
-- attempt. Nulls compare distinct, so rows whose uploader was nulled by
-- account deletion never collide.
create unique index if not exists match_video_attachments_uploader_request_key
  on public.match_video_attachments (uploaded_by, client_request_id);

-- Keys are minted from the id and never reused; make that a fact.
create unique index if not exists match_video_attachments_staged_blob_key_key
  on public.match_video_attachments (staged_blob_key);
create unique index if not exists match_video_attachments_final_blob_key_key
  on public.match_video_attachments (final_blob_key);

-- Readers: everything for a match, newest first.
create index if not exists match_video_attachments_match_id_idx
  on public.match_video_attachments (match_id, created_at desc)
  where match_id is not null;

-- Cleanup worker: retired rows whose blobs are still there.
create index if not exists match_video_attachments_cleanup_due_idx
  on public.match_video_attachments (cleanup_next_attempt_at)
  where state = 'retired' and cleaned_up_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Triggers — updated_at, and one-way lifecycle
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_attachments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'retired' and new.state <> 'retired' then
    raise exception 'match_video_attachments: a retired attachment cannot be reactivated (% → %)',
      old.state, new.state
      using errcode = 'P0001';
  end if;

  if old.state = 'active' and new.state = 'pending' then
    raise exception 'match_video_attachments: an active attachment cannot return to pending'
      using errcode = 'P0001';
  end if;

  -- Keys are immutable once minted; a swapped key would orphan a blob.
  if new.staged_blob_key <> old.staged_blob_key
     or new.final_blob_key <> old.final_blob_key then
    raise exception 'match_video_attachments: blob keys are immutable'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.match_video_attachments_before_update() from public, anon, authenticated;

drop trigger if exists match_video_attachments_before_update on public.match_video_attachments;
create trigger match_video_attachments_before_update
  before update on public.match_video_attachments
  for each row execute function public.match_video_attachments_before_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Privilege boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS on, no policy: with nothing granted this is belt and braces, but it
-- means a future `grant select` cannot silently open the table to every
-- signed-in user — a policy would still have to be written on purpose.

alter table public.match_video_attachments enable row level security;

revoke all on public.match_video_attachments from public, anon, authenticated;
grant all on public.match_video_attachments to service_role;
