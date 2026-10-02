-- T3 · match_video_attachments — reservation, renewal and cancellation RPCs
-- (the remaining half of plan step 2, "Attachment table and reservation
-- lifecycle"; the table itself is 20260919045208_create_match_video_attachments).
--
-- Three service-role-only transactions over the T2 table:
--
--   match_video_reserve_upload  pending row + server-minted keys, idempotent on
--                               (uploader, client_request_id)
--   match_video_renew_upload    record a fresh upload-SAS expiry on pending work
--   match_video_cancel_upload   retire pending work, idempotently
--
-- WHO MAY CALL. Nobody but the service role. Every function is `security
-- definer` with an empty pinned search path, EXECUTE is revoked from public,
-- anon and authenticated and granted to service_role only. The actor and
-- workspace arguments are NOT taken from a request body: the route handler
-- resolves the signed-in user and `getWorkspaceContext()` and passes them in,
-- and the SQL rechecks everything the plan's shared contracts require —
-- creator, SwingVision provenance, and exact workspace/program membership.
--
-- WORKSPACE. `p_workspace_kind` is 'personal' or 'team' and `p_workspace_id`
-- is `Workspace.id` from src/lib/workspace/types.ts — the actor's own user id
-- for a personal workspace, the program id for a team one. A personal match
-- (program_id null) requires the personal workspace of its creator; a team
-- match requires that exact program AND a current `program_members` row for
-- the actor. Membership is the `program_members` table, never `users.role`.
--
-- LOCK ORDER. Every function locks the parent `matches` row FIRST (`for no
-- key update` — enough to serialize attachment transactions on the same match
-- without blocking the KEY SHARE that inserting an attachment's FK takes) and
-- only then touches `match_video_attachments`. T4 (activation / alignment) and
-- T13 (cleanup) must take the same order.
--
-- ERRORS. `message` is a `MatchVideoErrorCode` from src/lib/match-video/
-- types.ts and `detail` is the slug naming the cause, so a server wrapper can
-- branch on the code without parsing prose. SQLSTATE classes:
--   P0002  match_not_found
--   42501  forbidden, workspace_mismatch (and any non-service caller)
--   55000  stale_attachment, pending_attempt_conflict, mode_conflict
--   22023  malformed arguments (a server bug, never a user-facing code)
--
-- CREDENTIAL ORDER. The upload SAS is minted in application code from the
-- staged key. The route picks the expiry first, passes it in as
-- `p_upload_sas_expires_at`, and only mints the credential after the RPC has
-- committed that expiry — so `upload_sas_expires_at` is never behind a live
-- credential. The RPCs never see or return a URL.
--
-- Idempotent: `create or replace` throughout; grants restated.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Shared authorization — lock the match, then recheck everything
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_authorize_match(
  p_actor_id       uuid,
  p_workspace_kind text,
  p_workspace_id   uuid,
  p_match_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by      uuid;
  v_program_id      uuid;
  v_source_provider text;
begin
  -- Belt and braces on top of the EXECUTE grants: a definer function is only
  -- as safe as its ACL, and an ACL is one careless `grant` away from wrong.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_actor_id is null or p_match_id is null or p_workspace_id is null then
    raise exception 'actor, workspace and match are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;
  if p_workspace_kind is null or p_workspace_kind not in ('personal', 'team') then
    raise exception 'workspace kind must be personal or team'
      using errcode = '22023', detail = 'bad_workspace_kind';
  end if;

  -- Parent row first. FOR NO KEY UPDATE: attachment transactions on the same
  -- match serialize here, while FK inserts (KEY SHARE) are not blocked.
  select m.created_by, m.program_id, m.source_provider
    into v_created_by, v_program_id, v_source_provider
  from public.matches m
  where m.id = p_match_id
  for no key update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_match';
  end if;

  -- Only the person who added the match may change its video.
  if v_created_by is null or v_created_by <> p_actor_id then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_creator';
  end if;

  -- Only SwingVision imports carry source timestamps a video can be aligned to.
  if v_source_provider is distinct from 'swing-vision' then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_swingvision';
  end if;

  -- Exact workspace: the match's own scope, nothing broader.
  if p_workspace_kind = 'personal' then
    if v_program_id is not null then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'team_match_in_personal_workspace';
    end if;
    if p_workspace_id <> p_actor_id then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'personal_workspace_not_actor';
    end if;
  else
    if v_program_id is null then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'personal_match_in_team_workspace';
    end if;
    if v_program_id <> p_workspace_id then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'match_in_other_program';
    end if;
    if not exists (
      select 1 from public.program_members pm
       where pm.program_id = p_workspace_id
         and pm.user_id = p_actor_id
    ) then
      raise exception 'workspace_mismatch'
        using errcode = '42501', detail = 'not_a_member';
    end if;
  end if;
end;
$$;

revoke all on function public.match_video_authorize_match(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_video_authorize_match(uuid, text, uuid, uuid) to service_role;

comment on function public.match_video_authorize_match(uuid, text, uuid, uuid) is
  'Service-only. Locks the parent match FOR NO KEY UPDATE, then rechecks creator, swing-vision provenance and the exact workspace (personal = creator''s own; team = that program + current program_members row). Raises a MatchVideoErrorCode as the message.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reserve
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the row a credential may now be minted for. `reused` is true when
-- an identical retry found its earlier attempt instead of creating one.

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
  p_upload_sas_expires_at   timestamptz
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

revoke all on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz) to service_role;

comment on function public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz) is
  'Service-only. Reserves a pending attachment with server-minted blob keys, the expected active id/version and the client request id, persisting the upload-SAS expiry BEFORE any credential is minted. Identical retries return the same attempt (reused = true); changed metadata under the same request id, or other pending work, is pending_attempt_conflict; a wrong belief about the active attachment is stale_attachment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Renew
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_renew_upload(
  p_actor_id              uuid,
  p_workspace_kind        text,
  p_workspace_id          uuid,
  p_match_id              uuid,
  p_attachment_id         uuid,
  p_upload_sas_expires_at timestamptz
)
returns table (
  attachment_id         uuid,
  staged_blob_key       text,
  upload_sas_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.match_video_attachments%rowtype;
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_attachment_id is null then
    raise exception 'attachment id is required'
      using errcode = '22023', detail = 'missing_attachment_id';
  end if;
  if p_upload_sas_expires_at is null or p_upload_sas_expires_at <= now() then
    raise exception 'upload expiry must be in the future'
      using errcode = '22023', detail = 'bad_upload_expiry';
  end if;

  select a.* into v_row
  from public.match_video_attachments a
  where a.id = p_attachment_id
    and a.match_id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;

  -- Only the attempt's own uploader may extend it.
  if v_row.uploaded_by is distinct from p_actor_id then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_uploader';
  end if;

  -- Retired work never renews; an active asset has no upload to extend.
  if v_row.state <> 'pending' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attempt_' || v_row.state;
  end if;

  -- Once finalization holds the row, the staged object is being verified and
  -- published; issuing another write credential would let bytes change
  -- underneath that verification.
  if v_row.finalize_lease_until is not null and v_row.finalize_lease_until > now() then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalizing';
  end if;

  update public.match_video_attachments a
     set upload_sas_expires_at = greatest(a.upload_sas_expires_at, p_upload_sas_expires_at),
         last_attempt_at       = now()
   where a.id = v_row.id
  returning a.upload_sas_expires_at into p_upload_sas_expires_at;

  return query select v_row.id, v_row.staged_blob_key, p_upload_sas_expires_at;
end;
$$;

revoke all on function public.match_video_renew_upload(uuid, text, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.match_video_renew_upload(uuid, text, uuid, uuid, uuid, timestamptz) to service_role;

comment on function public.match_video_renew_upload(uuid, text, uuid, uuid, uuid, timestamptz) is
  'Service-only. Records a later upload-SAS expiry on the caller''s own PENDING attempt before the credential is minted. Refuses retired/active rows (mode_conflict) and rows under a live finalization lease (pending_attempt_conflict).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cancel
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_cancel_upload(
  p_actor_id       uuid,
  p_workspace_kind text,
  p_workspace_id   uuid,
  p_match_id       uuid,
  p_attachment_id  uuid
)
returns table (
  attachment_id uuid,
  state         text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.match_video_attachments%rowtype;
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_attachment_id is null then
    raise exception 'attachment id is required'
      using errcode = '22023', detail = 'missing_attachment_id';
  end if;

  select a.* into v_row
  from public.match_video_attachments a
  where a.id = p_attachment_id
    and a.match_id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;

  if v_row.uploaded_by is distinct from p_actor_id then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_uploader';
  end if;

  -- Cancelling is for attempts. A published asset is replaced (T4), never
  -- cancelled; retiring it here would leave the match with no video at all.
  if v_row.state = 'active' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attachment_active';
  end if;

  -- Idempotent: cancelling twice is one cancellation.
  if v_row.state = 'retired' then
    return query select v_row.id, v_row.state;
    return;
  end if;

  -- A completion request that holds the row is verifying and publishing it;
  -- let it finish (or its lease lapse) rather than pull the staged object
  -- out from under it.
  if v_row.finalize_lease_until is not null and v_row.finalize_lease_until > now() then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalizing';
  end if;

  -- Retire. The staged key cannot be deleted while a live upload SAS could
  -- still write to it, so the cleanup worker is told to wait for the expiry.
  update public.match_video_attachments a
     set state                   = 'retired',
         retired_at              = now(),
         cleanup_next_attempt_at = greatest(now(), coalesce(a.upload_sas_expires_at, now()))
   where a.id = v_row.id;

  return query select v_row.id, 'retired'::text;
end;
$$;

revoke all on function public.match_video_cancel_upload(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_video_cancel_upload(uuid, text, uuid, uuid, uuid) to service_role;

comment on function public.match_video_cancel_upload(uuid, text, uuid, uuid, uuid) is
  'Service-only. Retires the caller''s own PENDING attempt, idempotently (a retired row returns retired again). Never retires an active asset (mode_conflict). Schedules cleanup for after the last issued upload-SAS expiry.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Assertions — the privilege boundary and lock order hold as written
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn  text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.match_video_authorize_match(uuid, text, uuid, uuid)',
    'public.match_video_reserve_upload(uuid, text, uuid, uuid, text, bigint, text, uuid, uuid, integer, timestamptz)',
    'public.match_video_renew_upload(uuid, text, uuid, uuid, uuid, timestamptz)',
    'public.match_video_cancel_upload(uuid, text, uuid, uuid, uuid)'
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

  select pg_get_functiondef('public.match_video_authorize_match(uuid, text, uuid, uuid)'::regprocedure) into v_def;
  if v_def not like '%for no key update%' then
    raise exception 'match_video_authorize_match: parent match lock missing';
  end if;
end
$$;
