-- SwingVision Add video T4 · the per-workspace match-video cap, enforced in
-- SQL, and the workspace usage read behind it. Builds on:
--   20260919050413_match_video_attachment_reservations (reserve)
--   20260919052002_match_video_attachment_activation   (activate)
-- Both bodies below were copied from the LIVE definitions (pg_get_functiondef,
-- 2026-09-24), which matched those repo files byte for byte; the only change
-- to each is the cap.
--
-- THE CAP. A workspace may hold a bounded number of ACTIVE attachments. The
-- number lives in ONE place — `MATCH_VIDEO_ACTIVE_LIMIT` in
-- src/lib/match-video/limits.ts — and reaches SQL as `p_active_limit`. Nothing
-- here hard-codes it.
--
--   * team      counts active rows whose match has program_id = that team
--   * personal  counts active rows on matches with program_id null created by
--               the actor (the personal workspace id IS the actor's id, which
--               match_video_authorize_match already insists on)
--
-- Only an ADD is counted — a reservation / activation whose expected active
-- identity is null. A REPLACE retires one active row and activates another in
-- the same transaction, so it never changes the count and is never refused
-- for it, even in a workspace that is somehow already over the limit.
--
--   reserve    refuses an add at the limit, BEFORE any credential is minted.
--              A soft gate: two adds on different matches can both reserve.
--   activate   rechecks for adds, which is the gate that holds. The match row
--              lock only serializes work on ONE match, so an add also takes a
--              transaction-scoped advisory lock on the WORKSPACE before it
--              counts: two pending adds in one workspace cannot both go
--              active. Lock order: match row (authorize) → workspace advisory
--              lock → attachment rows. Nothing takes the advisory lock and
--              then a match lock, so the order cannot invert.
--
-- `p_active_limit` DEFAULTS TO NULL = no cap. That keeps a caller that does
-- not yet send it (code deployed before this migration, the existing live-DB
-- specs) working exactly as before; it is not a way around the cap for new
-- code, which always sends the number for the workspace kind. A negative limit
-- is a malformed argument (22023).
--
-- SIGNATURES. Adding a parameter makes a NEW function in Postgres, and two
-- overloads that differ only by a defaulted trailing parameter make PostgREST
-- calls ambiguous. So the old signatures are DROPPED and recreated with the
-- extra parameter, inside this migration's transaction, and every grant and
-- comment is restated.
--
-- ERRORS. attachment_limit_reached is a MatchVideoErrorCode (409). SQLSTATE
-- 55000 (object not in prerequisite state), like the other conflict codes;
-- the route maps on the message, never the SQLSTATE.
--
-- USAGE. `match_video_workspace_usage(actor, kind, id)` returns one row per
-- active attachment in a workspace, for Settings › Usage. Service-role only,
-- refuses a caller who is not a member of that workspace, and reads the SAME
-- row set the cap counts (`match_video_workspace_active_attachments`), so the
-- page and the refusal cannot disagree about what "used" means.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The workspace's active attachments — one predicate for count and usage
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: no authorization of its own. Only the definer functions below
-- call it, after they have authorized the actor; no client role may execute
-- it. Two index-friendly branches instead of an OR: `matches_program_idx` for
-- a team, `idx_matches_created_by_date` for a personal workspace, then the
-- one-active-per-match partial unique index on the attachment side.

create or replace function public.match_video_workspace_active_attachments(
  p_workspace_kind text,
  p_workspace_id   uuid
)
returns table (
  attachment_id       uuid,
  match_id            uuid,
  uploaded_by         uuid,
  verified_size_bytes bigint,
  activated_at        timestamptz,
  player1_name        text,
  player2_name        text,
  match_date          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.match_id, a.uploaded_by, a.verified_size_bytes, a.activated_at,
         m.player1_name, m.player2_name, m.date
    from public.matches m
    join public.match_video_attachments a
      on a.match_id = m.id and a.state = 'active'
   where p_workspace_kind = 'team'
     and m.program_id = p_workspace_id
  union all
  select a.id, a.match_id, a.uploaded_by, a.verified_size_bytes, a.activated_at,
         m.player1_name, m.player2_name, m.date
    from public.matches m
    join public.match_video_attachments a
      on a.match_id = m.id and a.state = 'active'
   where p_workspace_kind = 'personal'
     and m.program_id is null
     and m.created_by = p_workspace_id
$$;

revoke all on function public.match_video_workspace_active_attachments(text, uuid) from public, anon, authenticated, service_role;

comment on function public.match_video_workspace_active_attachments(text, uuid) is
  'Internal, no authorization: the active attachments a workspace''s cap counts (team = matches.program_id; personal = program_id null and created_by = the personal workspace id). Called only by the service-only definer functions after they authorize.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The cap check — shared by reserve and activate
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal. Raises attachment_limit_reached when an add would take the
-- workspace past `p_active_limit`. With `p_lock` it first takes the
-- workspace's transaction-scoped advisory lock, so the count it reads cannot
-- be raced by another add in the same workspace until this transaction ends.

create or replace function public.match_video_enforce_active_limit(
  p_workspace_kind text,
  p_workspace_id   uuid,
  p_active_limit   integer,
  p_lock           boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_active bigint;
begin
  if p_active_limit is null then
    return;
  end if;

  if p_lock then
    perform pg_advisory_xact_lock(hashtextextended(
      'match_video_workspace:' || p_workspace_kind || ':' || p_workspace_id::text, 0));
  end if;

  -- A fresh statement after the lock: under READ COMMITTED it sees every
  -- activation committed by whoever held the lock before us.
  select count(*) into v_active
  from public.match_video_workspace_active_attachments(p_workspace_kind, p_workspace_id);

  if v_active >= p_active_limit then
    raise exception 'attachment_limit_reached'
      using errcode = '55000', detail = 'workspace_at_limit';
  end if;
end;
$$;

revoke all on function public.match_video_enforce_active_limit(text, uuid, integer, boolean) from public, anon, authenticated, service_role;

comment on function public.match_video_enforce_active_limit(text, uuid, integer, boolean) is
  'Internal, no authorization: raises attachment_limit_reached (55000) when the workspace already holds p_active_limit active attachments. p_lock takes the workspace advisory lock first (activation). A null limit is no cap.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reserve — the live body plus the soft cap gate
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz);

create or replace function public.match_video_reserve_upload(
  p_actor_id                uuid,
  p_workspace_kind          text,
  p_workspace_id            uuid,
  p_match_id                uuid,
  p_filename                text,
  p_declared_size_bytes     bigint,
  p_declared_content_type   text,
  p_client_request_id       uuid,
  p_expected_active_id      uuid,
  p_expected_active_version integer,
  p_upload_sas_expires_at   timestamptz,
  p_active_limit            integer default null
)
returns table (
  attachment_id         uuid,
  staged_blob_key       text,
  final_blob_key        text,
  upload_sas_expires_at timestamptz,
  reused                boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id             uuid;
  v_active_id      uuid;
  v_active_version integer;
  v_existing       public.match_video_attachments%rowtype;
  v_ext            text;
  v_staged         text;
  v_final          text;
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_client_request_id is null then
    raise exception 'client request id is required'
      using errcode = '22023', detail = 'missing_client_request_id';
  end if;
  if p_filename is null or length(p_filename) not between 1 and 255 then
    raise exception 'filename must be 1–255 characters'
      using errcode = '22023', detail = 'bad_filename';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes <= 0
     or p_declared_size_bytes > 7999999999 then
    raise exception 'declared size out of range'
      using errcode = '22023', detail = 'bad_declared_size';
  end if;
  if p_declared_content_type is null or length(p_declared_content_type) not between 1 and 255 then
    raise exception 'content type is required'
      using errcode = '22023', detail = 'bad_content_type';
  end if;
  if (p_expected_active_id is null) <> (p_expected_active_version is null) then
    raise exception 'expected active id and version travel together'
      using errcode = '22023', detail = 'bad_expected_active';
  end if;
  if p_upload_sas_expires_at is null or p_upload_sas_expires_at <= now() then
    raise exception 'upload expiry must be in the future'
      using errcode = '22023', detail = 'bad_upload_expiry';
  end if;
  if p_active_limit is not null and p_active_limit < 0 then
    raise exception 'active limit must not be negative'
      using errcode = '22023', detail = 'bad_active_limit';
  end if;

  -- The caller's belief about the active attachment must match reality.
  -- Both null = "no attachment"; anything else is a replacement race.
  select a.id, a.version into v_active_id, v_active_version
  from public.match_video_attachments a
  where a.match_id = p_match_id and a.state = 'active';

  if v_active_id is distinct from p_expected_active_id
     or v_active_version is distinct from p_expected_active_version then
    raise exception 'stale_attachment'
      using errcode = '55000',
            detail  = case when v_active_id is null then 'no_active_attachment'
                           when p_expected_active_id is null then 'attachment_now_active'
                           when v_active_id <> p_expected_active_id then 'active_attachment_replaced'
                           else 'active_version_changed' end;
  end if;

  -- The cap, for an add only. Before the request-id lookup on purpose: an
  -- identical retry of an add reserved while there was room would otherwise
  -- get a fresh credential for bytes that activation is now bound to refuse.
  -- Soft (no workspace lock) — activation is the gate that holds.
  if p_expected_active_id is null then
    perform public.match_video_enforce_active_limit(
      p_workspace_kind, p_workspace_id, p_active_limit, false);
  end if;

  -- Idempotency: the same (uploader, client request id) is the same attempt.
  select a.* into v_existing
  from public.match_video_attachments a
  where a.uploaded_by = p_actor_id
    and a.client_request_id = p_client_request_id
  for update;

  if found then
    if v_existing.state <> 'pending' then
      raise exception 'pending_attempt_conflict'
        using errcode = '55000', detail = 'request_id_' || v_existing.state;
    end if;
    if v_existing.match_id is distinct from p_match_id
       or v_existing.filename <> p_filename
       or v_existing.declared_size_bytes <> p_declared_size_bytes
       or v_existing.declared_content_type <> p_declared_content_type
       or v_existing.expected_active_id is distinct from p_expected_active_id
       or v_existing.expected_active_version is distinct from p_expected_active_version then
      raise exception 'pending_attempt_conflict'
        using errcode = '55000', detail = 'request_id_metadata_changed';
    end if;
    if v_existing.finalize_lease_until is not null
       and v_existing.finalize_lease_until > now() then
      raise exception 'pending_attempt_conflict'
        using errcode = '55000', detail = 'finalizing';
    end if;

    -- Identical retry: same attempt, fresh credential window.
    update public.match_video_attachments a
       set upload_sas_expires_at = greatest(a.upload_sas_expires_at, p_upload_sas_expires_at),
           last_attempt_at       = now()
     where a.id = v_existing.id
    returning a.id, a.staged_blob_key, a.final_blob_key, a.upload_sas_expires_at
         into v_id, v_staged, v_final, p_upload_sas_expires_at;

    return query select v_id, v_staged, v_final, p_upload_sas_expires_at, true;
    return;
  end if;

  -- Different pending work by this uploader on this match must be cancelled
  -- first; the partial unique index is the backstop for the race this lock
  -- ordering already prevents.
  if exists (
    select 1 from public.match_video_attachments a
     where a.match_id = p_match_id
       and a.uploaded_by = p_actor_id
       and a.state = 'pending'
  ) then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'other_pending_attempt';
  end if;

  -- Server-minted keys from the new id; never a URL, never reused. A short,
  -- plain extension is kept so the published object plays with its type.
  v_id  := gen_random_uuid();
  v_ext := lower(substring(p_filename from '\.([A-Za-z0-9]{1,8})$'));
  v_staged := 'match-video/' || p_match_id::text || '/' || v_id::text || '/staged'
              || coalesce('.' || v_ext, '');
  v_final  := 'match-video/' || p_match_id::text || '/' || v_id::text || '/final'
              || coalesce('.' || v_ext, '');

  insert into public.match_video_attachments (
    id, match_id, uploaded_by, state, version,
    filename, declared_size_bytes, declared_content_type,
    staged_blob_key, final_blob_key,
    client_request_id, expected_active_id, expected_active_version,
    upload_sas_expires_at, last_attempt_at
  ) values (
    v_id, p_match_id, p_actor_id, 'pending', 0,
    p_filename, p_declared_size_bytes, p_declared_content_type,
    v_staged, v_final,
    p_client_request_id, p_expected_active_id, p_expected_active_version,
    p_upload_sas_expires_at, now()
  );

  return query select v_id, v_staged, v_final, p_upload_sas_expires_at, false;
end;
$$;

revoke all on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz, integer) to service_role;

comment on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz, integer) is
  'Service-only. Reserves a pending attachment with server-minted blob keys, the expected active id/version and the client request id, persisting the upload-SAS expiry BEFORE any credential is minted. Identical retries return the same attempt (reused = true); changed metadata under the same request id, or other pending work, is pending_attempt_conflict; a wrong belief about the active attachment is stale_attachment. An ADD (expected active id null) in a workspace already holding p_active_limit active attachments is attachment_limit_reached; a replace is never counted; a null limit is no cap.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Activate — the live body plus the locked cap recheck
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision);

create or replace function public.match_video_activate_attachment(
  p_actor_id                     uuid,
  p_workspace_kind               text,
  p_workspace_id                 uuid,
  p_match_id                     uuid,
  p_attachment_id                uuid,
  p_lease_token                  uuid,
  p_confirmed_video_time_seconds numeric,
  p_verified_size_bytes          bigint,
  p_verified_content_type        text,
  p_verified_duration_seconds    double precision,
  p_active_limit                 integer default null
)
returns table (
  attachment_id                uuid,
  version                      integer,
  offset_seconds               double precision,
  confirmed_video_time_seconds numeric,
  duration_seconds             double precision,
  content_type                 text,
  filename                     text,
  previous_active_id           uuid,
  reused                       boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.match_video_attachments%rowtype;
  v_prev     public.match_video_attachments%rowtype;
  v_active_id      uuid;
  v_active_version integer;
  v_plan     record;
  v_now      timestamptz := now();
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_attachment_id is null or p_lease_token is null then
    raise exception 'attachment id and lease token are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;
  if p_confirmed_video_time_seconds is null then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_not_a_time';
  end if;
  if p_active_limit is not null and p_active_limit < 0 then
    raise exception 'active limit must not be negative'
      using errcode = '22023', detail = 'bad_active_limit';
  end if;

  select a.* into v_row
  from public.match_video_attachments a
  where a.id = p_attachment_id and a.match_id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;
  if v_row.uploaded_by is distinct from p_actor_id then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_uploader';
  end if;

  -- Retired work never publishes — its blobs may already be gone.
  if v_row.state = 'retired' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attempt_retired';
  end if;

  -- Idempotent replay of a completion whose 200 was lost: success again,
  -- only while THIS row is still the active one and for the same time.
  -- Never counted against the cap: it is already one of the active rows.
  if v_row.state = 'active' then
    if v_row.confirmed_video_time_seconds <> p_confirmed_video_time_seconds then
      raise exception 'mode_conflict'
        using errcode = '55000', detail = 'attachment_active_other_time';
    end if;
    return query select
      v_row.id, v_row.version, v_row.offset_seconds,
      v_row.confirmed_video_time_seconds, v_row.verified_duration_seconds,
      v_row.verified_content_type, v_row.filename, null::uuid, true;
    return;
  end if;

  -- Pending: the caller must hold a live lease, and must be committing the
  -- inputs that lease froze.
  if v_row.finalize_lease_token is null or v_row.finalize_lease_until is null
     or v_row.finalize_lease_until <= now() then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'lease_not_held';
  end if;
  if v_row.finalize_lease_token <> p_lease_token then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalizing';
  end if;
  if v_row.confirmed_video_time_seconds is distinct from p_confirmed_video_time_seconds then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalization_inputs_changed';
  end if;

  -- Server-verified media metadata. Measured from the published bytes by the
  -- completion service; the client's declaration is never good enough.
  if p_verified_size_bytes is null or p_verified_size_bytes <= 0 then
    raise exception 'empty_file'
      using errcode = '22000', detail = 'verified_size_not_positive';
  end if;
  if p_verified_size_bytes > 7999999999 then
    raise exception 'file_too_large'
      using errcode = '22000', detail = 'verified_size_over_limit';
  end if;
  if p_verified_content_type is null
     or length(p_verified_content_type) not between 1 and 255 then
    raise exception 'unsupported_media'
      using errcode = '22000', detail = 'verified_content_type_missing';
  end if;
  -- (duration is validated by plan_alignment: unsupported_media / video_duration_unusable)

  -- The reservation's belief about the active attachment must still hold.
  select a.id, a.version into v_active_id, v_active_version
  from public.match_video_attachments a
  where a.match_id = p_match_id and a.state = 'active';
  if v_active_id is distinct from v_row.expected_active_id
     or v_active_version is distinct from v_row.expected_active_version then
    raise exception 'stale_attachment'
      using errcode = '55000',
            detail  = case when v_active_id is null then 'no_active_attachment'
                           when v_row.expected_active_id is null then 'attachment_now_active'
                           when v_active_id <> v_row.expected_active_id then 'active_attachment_replaced'
                           else 'active_version_changed' end;
  end if;

  -- The cap, for an add only, under the WORKSPACE lock (taken after the match
  -- lock). This is the check that holds: two pending adds in one workspace —
  -- on the same match or on different ones — serialize here, and the second
  -- counts the first's committed activation.
  if v_row.expected_active_id is null then
    perform public.match_video_enforce_active_limit(
      p_workspace_kind, p_workspace_id, p_active_limit, true);
  end if;

  -- Timing and coverage, recomputed from the source rows inside this
  -- transaction (the match lock keeps them still).
  select * into v_plan from public.match_video_plan_alignment(
    p_match_id, p_confirmed_video_time_seconds, p_verified_duration_seconds);

  -- Retire the previous active row first (the partial unique index allows
  -- one active per match), then activate. Both under the match lock.
  if v_active_id is not null then
    select a.* into v_prev
    from public.match_video_attachments a
    where a.id = v_active_id
    for update;

    update public.match_video_attachments a
       set state                   = 'retired',
           retired_at              = v_now,
           cleanup_next_attempt_at = greatest(v_now, coalesce(a.upload_sas_expires_at, v_now))
     where a.id = v_prev.id;
  end if;

  update public.match_video_attachments a
     set state                        = 'active',
         verified_size_bytes          = p_verified_size_bytes,
         verified_content_type        = p_verified_content_type,
         verified_duration_seconds    = p_verified_duration_seconds,
         confirmed_video_time_seconds = v_plan.confirmed_video_time_seconds,
         offset_seconds               = v_plan.offset_seconds,
         activated_at                 = v_now,
         finalize_lease_token         = null,
         finalize_lease_until         = null,
         last_attempt_at              = v_now
   where a.id = v_row.id
  returning a.* into v_row;

  return query select
    v_row.id, v_row.version, v_row.offset_seconds,
    v_row.confirmed_video_time_seconds, v_row.verified_duration_seconds,
    v_row.verified_content_type, v_row.filename, v_active_id, false;
end;
$$;

revoke all on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision, integer) from public, anon, authenticated;
grant execute on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision, integer) to service_role;

comment on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision, integer) is
  'Service-only. Publishes the caller''s own PENDING attempt under its live finalization lease: requires server-verified size/type/duration and the frozen confirmed time, rechecks the reservation''s expected-active belief, recomputes timing and coverage from the source rows, retires the previous active row and activates this one in one transaction. An ADD rechecks p_active_limit under a workspace advisory lock (attachment_limit_reached); a replace or a replay is never counted; a null limit is no cap. A replay on the still-active row with the same confirmed time is success again (reused = true); a retired row is mode_conflict. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Workspace usage — what Settings › Usage lists
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_workspace_usage(
  p_actor_id       uuid,
  p_workspace_kind text,
  p_workspace_id   uuid
)
returns table (
  attachment_id       uuid,
  match_id            uuid,
  uploaded_by         uuid,
  verified_size_bytes bigint,
  activated_at        timestamptz,
  player1_name        text,
  player2_name        text,
  match_date          timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Same belt and braces as match_video_authorize_match.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_actor_id is null or p_workspace_id is null then
    raise exception 'actor and workspace are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;
  if p_workspace_kind is null or p_workspace_kind not in ('personal', 'team') then
    raise exception 'workspace kind must be personal or team'
      using errcode = '22023', detail = 'bad_workspace_kind';
  end if;

  -- Membership, exactly as authorize_match asks it: a personal workspace is
  -- the actor's own; a team one needs a current program_members row. Any
  -- member may see the list — the page shows who uploaded what, not keys.
  if p_workspace_kind = 'personal' then
    if p_workspace_id <> p_actor_id then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'personal_workspace_not_actor';
    end if;
  elsif not exists (
    select 1 from public.program_members pm
     where pm.program_id = p_workspace_id
       and pm.user_id = p_actor_id
  ) then
    raise exception 'workspace_mismatch'
      using errcode = '42501', detail = 'not_a_member';
  end if;

  return query
    select w.attachment_id, w.match_id, w.uploaded_by, w.verified_size_bytes,
           w.activated_at, w.player1_name, w.player2_name, w.match_date
      from public.match_video_workspace_active_attachments(p_workspace_kind, p_workspace_id) w
     order by w.activated_at desc, w.attachment_id;
end;
$$;

revoke all on function public.match_video_workspace_usage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.match_video_workspace_usage(uuid, text, uuid) to service_role;

comment on function public.match_video_workspace_usage(uuid, text, uuid) is
  'Service-only. One row per ACTIVE attachment in the workspace (the same set the cap counts): attachment id, match id, uploaded_by, verified_size_bytes, activated_at, and the match''s players and date. Refuses a caller who is not a member of that workspace (workspace_mismatch).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Assertions — the privilege boundary, the old signatures gone, the lock
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn  text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz, integer)',
    'public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision, integer)',
    'public.match_video_workspace_usage(uuid, text, uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '%: a client role may execute it', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '%: service_role may not execute it', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
       where p.oid = v_fn::regprocedure
         and p.prosecdef
         and p.proconfig @> array['search_path=""']
    ) then
      raise exception '%: not security definer with an empty search_path', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.match_video_workspace_active_attachments(text, uuid)',
    'public.match_video_enforce_active_limit(text, uuid, integer, boolean)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '%: internal helper is executable by an API role', v_fn;
    end if;
  end loop;

  if to_regprocedure('public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz)') is not null
     or to_regprocedure('public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision)') is not null then
    raise exception 'an uncapped overload survived';
  end if;

  select pg_get_functiondef('public.match_video_enforce_active_limit(text, uuid, integer, boolean)'::regprocedure) into v_def;
  if v_def not like '%pg_advisory_xact_lock%' then
    raise exception 'match_video_enforce_active_limit: workspace lock missing';
  end if;
  select pg_get_functiondef('public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision, integer)'::regprocedure) into v_def;
  if v_def not like '%p_active_limit, true)%' then
    raise exception 'match_video_activate_attachment: cap recheck is not locked';
  end if;
end
$$;
