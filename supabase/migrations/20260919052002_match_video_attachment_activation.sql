-- T4 · match_video_attachments — activation, alignment correction and the
-- finalization lease (plan step 3, plus the completion lifecycle of steps 2
-- and 7). Builds on:
--   20260919045208_create_match_video_attachments  (T2: table, constraints, trigger)
--   20260919050413_match_video_attachment_reservations (T3: authorize/reserve/renew/cancel)
--
-- Five service-role-only functions:
--
--   match_video_source_timing        read-only: the imported timeline reduced to
--                                    the facts alignment needs (SQL twin of
--                                    summarizeSourceTiming in
--                                    src/lib/match-video/alignment.ts)
--   match_video_plan_alignment       read-only: offset + coverage for a confirmed
--                                    time and a verified duration (SQL twin of
--                                    planAlignment); shared by the two writers
--   match_video_begin_finalization   acquire/extend the finalization lease and
--                                    FREEZE the completion inputs
--   match_video_release_finalization drop a lease this holder still owns, so a
--                                    failed completion can be retried
--   match_video_activate_attachment  retire the previous active row and publish
--                                    this one, in ONE transaction
--   match_video_correct_alignment    change the saved offset of the active row
--
-- TIMING PARITY. The TypeScript module is the contract; the SQL here must give
-- the same answer for the same rows, and tests/match-video-attachments-db.spec.ts
-- drives both over one fixture to prove it. Three details make that hold:
--   * `points.video_time`, `points.duration` and `shots.video_time` are REAL.
--     PostgREST serialises a real with float4out (shortest round-trip text),
--     and JavaScript then parses that text into a double. A direct
--     `real::double precision` cast widens the binary value instead
--     (12.345 → 12.345000267…), so every read below goes through `::text`
--     first to land on the very same double the application sees.
--   * The required end is a MAX over every known point start, every known
--     point end with a POSITIVE duration, every shot time and the final point's
--     end — not merely the final point's end. Earliest is the MIN over point
--     starts and shot times.
--   * Coverage tolerance is 0.1 s on both sides; the confirmed time is
--     accepted only at millisecond precision (the route parses it with
--     parseConfirmedVideoTime first, and SQL refuses anything finer rather
--     than rounding it a second time by a different rule).
--
-- FINALIZATION LEASE. A completion request calls begin_finalization with a
-- token it minted. The row stores that token and a deadline; while the lease
-- is live, renew and cancel (T3) refuse, a second completion with another
-- token is refused, and the inputs the lease froze — confirmed first-point
-- time and the expected active identity — are what activation is allowed to
-- commit. The same token may re-enter (poll, extend) freely. Activation clears
-- the lease; release_finalization clears it on failure. An expired lease is
-- simply free again: the completion that lost it has no bytes in flight that
-- another completion could not re-verify.
--
-- IDEMPOTENT COMPLETION. A lost 200 makes the client replay completion. If
-- the attachment is already ACTIVE with the same confirmed time, activation
-- returns success again (reused = true) — but only while that row is still
-- the active one. Once a later replacement has retired it the replay is a
-- mode_conflict, never a reactivation.
--
-- LOCK ORDER (same as T3, and T13 must match): the parent `matches` row FIRST
-- via match_video_authorize_match (FOR NO KEY UPDATE), then attachment rows
-- FOR UPDATE. Source rows are only ever READ. Nothing here writes `matches`,
-- `points`, `shots` or `match_stats`.
--
-- ERRORS. As in T3: `message` is a MatchVideoErrorCode, `detail` the slug.
--   P0002  match_not_found
--   42501  forbidden, workspace_mismatch
--   55000  stale_attachment, pending_attempt_conflict, mode_conflict
--   22023  malformed arguments (a server bug)
--   22000  missing_source_timing, invalid_alignment, insufficient_coverage,
--          unsupported_media, empty_file, file_too_large (data / input refusals)
--
-- Idempotent: `create or replace` throughout; grants restated.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Source timing — the SQL twin of summarizeSourceTiming()
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_source_timing(p_match_id uuid)
returns table (
  anchor_point_number         integer,
  anchor_source_seconds       double precision,
  final_point_number          integer,
  required_source_end_seconds double precision,
  earliest_source_seconds     double precision,
  untimed_point_count         integer,
  untimed_shot_count          integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_point_count   bigint;
  v_distinct      bigint;
  v_anchor_number integer;
  v_final_number  integer;
  v_anchor_time   double precision;
  v_final_time    double precision;
  v_final_dur     double precision;
  v_earliest      double precision;
  v_latest        double precision;
  v_untimed_pts   integer;
  v_untimed_shots integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;
  if p_match_id is null then
    raise exception 'match id is required'
      using errcode = '22023', detail = 'missing_argument';
  end if;

  select count(*), count(distinct p.point_number)
    into v_point_count, v_distinct
  from public.points p
  where p.match_id = p_match_id;

  if v_point_count = 0 then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'no_points';
  end if;
  if v_distinct <> v_point_count then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'ambiguous_point_order';
  end if;

  -- A present-but-broken timestamp (NaN, ±Infinity, negative) is corrupt
  -- data, refused outright; a NULL is merely unknown. `NaN < 0` is false in
  -- Postgres, so the text form is what catches the non-finite cases.
  if exists (
    select 1 from public.points p
     where p.match_id = p_match_id
       and p.video_time is not null
       and (p.video_time::text in ('NaN', 'Infinity', '-Infinity') or p.video_time < 0)
  ) then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'point_time_invalid';
  end if;
  if exists (
    select 1 from public.points p
     where p.match_id = p_match_id
       and p.duration is not null
       and (p.duration::text in ('NaN', 'Infinity', '-Infinity') or p.duration < 0)
  ) then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'point_duration_invalid';
  end if;
  if exists (
    select 1 from public.shots s
      join public.points p on p.id = s.point_id
     where p.match_id = p_match_id
       and s.video_time is not null
       and (s.video_time::text in ('NaN', 'Infinity', '-Infinity') or s.video_time < 0)
  ) then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'shot_time_invalid';
  end if;

  -- Anchor = FIRST point by point_number; final = LAST. Never the earliest
  -- timestamp, and never whatever a filter happens to show.
  select p.point_number, p.video_time::text::double precision
    into v_anchor_number, v_anchor_time
  from public.points p
  where p.match_id = p_match_id
  order by p.point_number asc
  limit 1;

  select p.point_number, p.video_time::text::double precision, p.duration::text::double precision
    into v_final_number, v_final_time, v_final_dur
  from public.points p
  where p.match_id = p_match_id
  order by p.point_number desc
  limit 1;

  if v_anchor_time is null then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'missing_first_point_time';
  end if;
  if v_final_time is null then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'missing_final_point_time';
  end if;
  -- The file must contain the final point's END. A zero duration is
  -- "unknown" in this data and unknown is not good enough here.
  if v_final_dur is null or v_final_dur <= 0 then
    raise exception 'missing_source_timing'
      using errcode = '22000', detail = 'missing_final_point_duration';
  end if;

  -- Every KNOWN bound participates: point starts, point ends with a positive
  -- duration, shot times, and the final point's end.
  select
    least(v_anchor_time, min(p.video_time::text::double precision)),
    greatest(
      v_final_time + v_final_dur,
      max(p.video_time::text::double precision),
      max(case when p.duration is not null and p.duration > 0
               then p.video_time::text::double precision + p.duration::text::double precision
          end)
    )
    into v_earliest, v_latest
  from public.points p
  where p.match_id = p_match_id
    and p.video_time is not null;

  select count(*) into v_untimed_pts
  from public.points p
  where p.match_id = p_match_id and p.video_time is null;

  select
    least(v_earliest, min(s.video_time::text::double precision)),
    greatest(v_latest, max(s.video_time::text::double precision))
    into v_earliest, v_latest
  from public.shots s
    join public.points p on p.id = s.point_id
  where p.match_id = p_match_id
    and s.video_time is not null;

  select count(*) into v_untimed_shots
  from public.shots s
    join public.points p on p.id = s.point_id
  where p.match_id = p_match_id and s.video_time is null;

  return query select
    v_anchor_number, v_anchor_time, v_final_number,
    v_latest, v_earliest, v_untimed_pts, v_untimed_shots;
end;
$$;

revoke all on function public.match_video_source_timing(uuid) from public, anon, authenticated;
grant execute on function public.match_video_source_timing(uuid) to service_role;

comment on function public.match_video_source_timing(uuid) is
  'Service-only, read-only. SQL twin of summarizeSourceTiming() in src/lib/match-video/alignment.ts: anchor = first point by point_number, required end = MAX over every known point start, positive point end, shot time and the final point''s end. Reads reals through ::text so it lands on the same double the application parses. Raises missing_source_timing with the TypeScript detail slug.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Alignment — the SQL twin of planAlignment()
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_plan_alignment(
  p_match_id                   uuid,
  p_confirmed_video_time_seconds numeric,
  p_video_duration_seconds     double precision
)
returns table (
  offset_seconds               double precision,
  confirmed_video_time_seconds numeric,
  required_video_start_seconds double precision,
  required_video_end_seconds   double precision,
  video_duration_seconds       double precision,
  tolerance_seconds            double precision,
  anchor_point_number          integer,
  anchor_source_seconds        double precision,
  final_point_number           integer,
  required_source_end_seconds  double precision,
  earliest_source_seconds      double precision,
  untimed_point_count          integer,
  untimed_shot_count           integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  c_tolerance constant double precision := 0.1;   -- COVERAGE_TOLERANCE_SECONDS
  v_timing    record;
  v_confirmed numeric(12, 3);
  v_offset    double precision;
  v_start     double precision;
  v_end       double precision;
begin
  -- Source timing is checked BEFORE the entered time: a match that cannot be
  -- aligned at all should say so rather than blame what the user typed.
  select * into v_timing from public.match_video_source_timing(p_match_id);

  if p_confirmed_video_time_seconds is null then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_not_a_time';
  end if;
  if p_confirmed_video_time_seconds < 0 then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_negative';
  end if;
  -- Millisecond precision is the stored precision. The route already rounded
  -- with parseConfirmedVideoTime; refusing rather than rounding again keeps
  -- one rounding rule in one place.
  if p_confirmed_video_time_seconds <> round(p_confirmed_video_time_seconds, 3) then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_not_milliseconds';
  end if;
  v_confirmed := p_confirmed_video_time_seconds;

  if p_video_duration_seconds is null
     or p_video_duration_seconds::text in ('NaN', 'Infinity', '-Infinity')
     or p_video_duration_seconds <= 0 then
    raise exception 'unsupported_media'
      using errcode = '22000', detail = 'video_duration_unusable';
  end if;
  if v_confirmed::double precision > p_video_duration_seconds then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_past_end';
  end if;

  -- Derived from the source clock every time, never from a stored offset.
  v_offset := v_timing.anchor_source_seconds - v_confirmed::double precision;
  v_start  := v_timing.earliest_source_seconds - v_offset;
  v_end    := v_timing.required_source_end_seconds - v_offset;

  if v_start < -c_tolerance then
    raise exception 'insufficient_coverage'
      using errcode = '22000', detail = 'coverage_before_start';
  end if;
  if v_end > p_video_duration_seconds + c_tolerance then
    raise exception 'insufficient_coverage'
      using errcode = '22000', detail = 'coverage_past_end';
  end if;

  return query select
    v_offset, v_confirmed, v_start, v_end, p_video_duration_seconds, c_tolerance,
    v_timing.anchor_point_number, v_timing.anchor_source_seconds,
    v_timing.final_point_number, v_timing.required_source_end_seconds,
    v_timing.earliest_source_seconds, v_timing.untimed_point_count,
    v_timing.untimed_shot_count;
end;
$$;

revoke all on function public.match_video_plan_alignment(uuid, numeric, double precision) from public, anon, authenticated;
grant execute on function public.match_video_plan_alignment(uuid, numeric, double precision) to service_role;

comment on function public.match_video_plan_alignment(uuid, numeric, double precision) is
  'Service-only, read-only. SQL twin of planAlignment(): offset = anchor source time − confirmed video time; refuses a confirmed time that is negative, finer than milliseconds or past the end, an unusable duration, and coverage outside [−0.1 s, duration + 0.1 s]. Shared by activation and correction so the two can never disagree.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Finalization lease — begin (acquire / extend, freezing the inputs)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_begin_finalization(
  p_actor_id                     uuid,
  p_workspace_kind               text,
  p_workspace_id                 uuid,
  p_match_id                     uuid,
  p_attachment_id                uuid,
  p_lease_token                  uuid,
  p_lease_seconds                integer,
  p_confirmed_video_time_seconds numeric,
  p_expected_active_id           uuid,
  p_expected_active_version      integer
)
returns table (
  attachment_id                uuid,
  state                        text,
  staged_blob_key              text,
  final_blob_key               text,
  source_etag                  text,
  copy_id                      text,
  copy_status                  text,
  confirmed_video_time_seconds numeric,
  finalize_lease_until         timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row            public.match_video_attachments%rowtype;
  v_active_id      uuid;
  v_active_version integer;
  v_until          timestamptz;
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_attachment_id is null or p_lease_token is null then
    raise exception 'attachment id and lease token are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'lease must be 1–3600 seconds'
      using errcode = '22023', detail = 'bad_lease_seconds';
  end if;
  if (p_expected_active_id is null) <> (p_expected_active_version is null) then
    raise exception 'expected active id and version travel together'
      using errcode = '22023', detail = 'bad_expected_active';
  end if;
  if p_confirmed_video_time_seconds is null then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_not_a_time';
  end if;
  if p_confirmed_video_time_seconds < 0 then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_negative';
  end if;
  if p_confirmed_video_time_seconds <> round(p_confirmed_video_time_seconds, 3) then
    raise exception 'invalid_alignment'
      using errcode = '22000', detail = 'confirmed_time_not_milliseconds';
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

  -- An already-published row: no lease to take. The caller decides whether
  -- this is an idempotent replay (activate will say) — nothing changes here.
  if v_row.state = 'active' then
    return query select
      v_row.id, v_row.state, v_row.staged_blob_key, v_row.final_blob_key,
      v_row.source_etag, v_row.copy_id, v_row.copy_status,
      v_row.confirmed_video_time_seconds, v_row.finalize_lease_until;
    return;
  end if;
  if v_row.state = 'retired' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attempt_retired';
  end if;

  -- The completion must agree with its own reservation about what it is
  -- replacing, and that belief must still be true.
  if v_row.expected_active_id is distinct from p_expected_active_id
     or v_row.expected_active_version is distinct from p_expected_active_version then
    raise exception 'stale_attachment'
      using errcode = '55000', detail = 'expected_active_changed';
  end if;
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

  -- CAS on the lease: free, expired, or already mine.
  if v_row.finalize_lease_until is not null
     and v_row.finalize_lease_until > now()
     and v_row.finalize_lease_token is distinct from p_lease_token then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalizing';
  end if;

  -- Frozen input: the same live lease may not change its mind about the
  -- confirmed time between polls. A fresh lease (expired or released) may.
  if v_row.finalize_lease_token = p_lease_token
     and v_row.finalize_lease_until is not null
     and v_row.finalize_lease_until > now()
     and v_row.confirmed_video_time_seconds is distinct from p_confirmed_video_time_seconds then
    raise exception 'pending_attempt_conflict'
      using errcode = '55000', detail = 'finalization_inputs_changed';
  end if;

  v_until := now() + make_interval(secs => p_lease_seconds);

  update public.match_video_attachments a
     set finalize_lease_token         = p_lease_token,
         finalize_lease_until         = v_until,
         confirmed_video_time_seconds = p_confirmed_video_time_seconds,
         last_attempt_at              = now()
   where a.id = v_row.id
  returning a.* into v_row;

  return query select
    v_row.id, v_row.state, v_row.staged_blob_key, v_row.final_blob_key,
    v_row.source_etag, v_row.copy_id, v_row.copy_status,
    v_row.confirmed_video_time_seconds, v_row.finalize_lease_until;
end;
$$;

revoke all on function public.match_video_begin_finalization(uuid, text, uuid, uuid, uuid, uuid, integer, numeric, uuid, integer) from public, anon, authenticated;
grant execute on function public.match_video_begin_finalization(uuid, text, uuid, uuid, uuid, uuid, integer, numeric, uuid, integer) to service_role;

comment on function public.match_video_begin_finalization(uuid, text, uuid, uuid, uuid, uuid, integer, numeric, uuid, integer) is
  'Service-only. Acquires or extends the finalization lease on the caller''s own PENDING attempt (CAS: free, expired, or the same token), freezing the confirmed first-point time; a live lease under another token is pending_attempt_conflict/finalizing, a changed confirmed time under the same live lease is finalization_inputs_changed. Rechecks the reservation''s expected-active belief against reality (stale_attachment). An active row is returned untouched; a retired one is mode_conflict.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Finalization lease — release (failure path)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_release_finalization(
  p_actor_id       uuid,
  p_workspace_kind text,
  p_workspace_id   uuid,
  p_match_id       uuid,
  p_attachment_id  uuid,
  p_lease_token    uuid
)
returns table (
  attachment_id uuid,
  state         text,
  released      boolean
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

  if p_attachment_id is null or p_lease_token is null then
    raise exception 'attachment id and lease token are required'
      using errcode = '22023', detail = 'missing_argument';
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

  -- Only the holder may release, and only a pending row has a lease worth
  -- releasing. Anything else is a no-op, reported as such: a release after
  -- a lost activation response must not disturb the published row.
  if v_row.state <> 'pending' or v_row.finalize_lease_token is distinct from p_lease_token then
    return query select v_row.id, v_row.state, false;
    return;
  end if;

  update public.match_video_attachments a
     set finalize_lease_token = null,
         finalize_lease_until = null
   where a.id = v_row.id;

  return query select v_row.id, v_row.state, true;
end;
$$;

revoke all on function public.match_video_release_finalization(uuid, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_video_release_finalization(uuid, text, uuid, uuid, uuid, uuid) to service_role;

comment on function public.match_video_release_finalization(uuid, text, uuid, uuid, uuid, uuid) is
  'Service-only. Drops the finalization lease on the caller''s own PENDING attempt when the token matches (released = true); otherwise a no-op (released = false). Lets a completion that failed after taking the lease be retried without waiting for expiry.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Activate — retire the previous active row and publish this one, atomically
-- ─────────────────────────────────────────────────────────────────────────────

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
  p_verified_duration_seconds    double precision
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

revoke all on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision) from public, anon, authenticated;
grant execute on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision) to service_role;

comment on function public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision) is
  'Service-only. Publishes the caller''s own PENDING attempt under its live finalization lease: requires server-verified size/type/duration and the frozen confirmed time, rechecks the reservation''s expected-active belief, recomputes timing and coverage from the source rows, retires the previous active row and activates this one in one transaction. A replay on the still-active row with the same confirmed time is success again (reused = true); a retired row is mode_conflict. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Correct alignment — change the saved offset of the active row
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_correct_alignment(
  p_actor_id                     uuid,
  p_workspace_kind               text,
  p_workspace_id                 uuid,
  p_match_id                     uuid,
  p_attachment_id                uuid,
  p_expected_version             integer,
  p_confirmed_video_time_seconds numeric
)
returns table (
  attachment_id                uuid,
  version                      integer,
  offset_seconds               double precision,
  confirmed_video_time_seconds numeric,
  duration_seconds             double precision,
  content_type                 text,
  filename                     text,
  changed                      boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.match_video_attachments%rowtype;
  v_plan record;
begin
  perform public.match_video_authorize_match(
    p_actor_id, p_workspace_kind, p_workspace_id, p_match_id);

  if p_attachment_id is null or p_expected_version is null then
    raise exception 'attachment id and expected version are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;

  select a.* into v_row
  from public.match_video_attachments a
  where a.id = p_attachment_id and a.match_id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;

  -- Only a published asset has an alignment to correct.
  if v_row.state <> 'active' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attachment_' || v_row.state;
  end if;

  -- Optimistic concurrency on the version a second tab may have bumped.
  if v_row.version <> p_expected_version then
    raise exception 'stale_attachment'
      using errcode = '55000', detail = 'active_version_changed';
  end if;

  -- Always from the source clock and the SAVED verified duration; never from
  -- the previous offset, so repeated corrections cannot drift.
  select * into v_plan from public.match_video_plan_alignment(
    p_match_id, p_confirmed_video_time_seconds, v_row.verified_duration_seconds);

  -- A no-op correction leaves the row — and its version — alone.
  if v_row.confirmed_video_time_seconds = v_plan.confirmed_video_time_seconds
     and v_row.offset_seconds = v_plan.offset_seconds then
    return query select
      v_row.id, v_row.version, v_row.offset_seconds,
      v_row.confirmed_video_time_seconds, v_row.verified_duration_seconds,
      v_row.verified_content_type, v_row.filename, false;
    return;
  end if;

  update public.match_video_attachments a
     set confirmed_video_time_seconds = v_plan.confirmed_video_time_seconds,
         offset_seconds               = v_plan.offset_seconds,
         version                      = a.version + 1,
         last_attempt_at              = now()
   where a.id = v_row.id
  returning a.* into v_row;

  return query select
    v_row.id, v_row.version, v_row.offset_seconds,
    v_row.confirmed_video_time_seconds, v_row.verified_duration_seconds,
    v_row.verified_content_type, v_row.filename, true;
end;
$$;

revoke all on function public.match_video_correct_alignment(uuid, text, uuid, uuid, uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.match_video_correct_alignment(uuid, text, uuid, uuid, uuid, integer, numeric) to service_role;

comment on function public.match_video_correct_alignment(uuid, text, uuid, uuid, uuid, integer, numeric) is
  'Service-only. Re-aligns the ACTIVE attachment from the source rows and its SAVED verified duration, updating confirmed time, offset and version (+1) atomically under an expected-version CAS (stale_attachment/active_version_changed). A no-op correction returns changed = false without bumping the version. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Assertions — privilege boundary, lock order and read-only source rows
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn  text;
  v_def text;
begin
  foreach v_fn in array array[
    'public.match_video_source_timing(uuid)',
    'public.match_video_plan_alignment(uuid, numeric, double precision)',
    'public.match_video_begin_finalization(uuid, text, uuid, uuid, uuid, uuid, integer, numeric, uuid, integer)',
    'public.match_video_release_finalization(uuid, text, uuid, uuid, uuid, uuid)',
    'public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision)',
    'public.match_video_correct_alignment(uuid, text, uuid, uuid, uuid, integer, numeric)'
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

    select pg_get_functiondef(v_fn::regprocedure) into v_def;
    -- Source rows are read, never written.
    if v_def ~* '(update|insert\s+into|delete\s+from)\s+public\.(points|shots|matches|match_stats)\M' then
      raise exception '%: writes an imported-data table', v_fn;
    end if;
  end loop;

  -- Writers take the parent match lock (through authorize) before any
  -- attachment row.
  foreach v_fn in array array[
    'public.match_video_begin_finalization(uuid, text, uuid, uuid, uuid, uuid, integer, numeric, uuid, integer)',
    'public.match_video_release_finalization(uuid, text, uuid, uuid, uuid, uuid)',
    'public.match_video_activate_attachment(uuid, text, uuid, uuid, uuid, uuid, numeric, bigint, text, double precision)',
    'public.match_video_correct_alignment(uuid, text, uuid, uuid, uuid, integer, numeric)'
  ] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_def;
    if position('match_video_authorize_match' in v_def) = 0
       or position('match_video_authorize_match' in v_def) > position('for update' in v_def) then
      raise exception '%: attachment row locked before the parent match', v_fn;
    end if;
  end loop;
end
$$;
