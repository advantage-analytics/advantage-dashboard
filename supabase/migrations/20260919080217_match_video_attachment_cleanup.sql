-- T13 · match_video_attachments — cleanup claim and fencing transactions
-- (the database half of plan step 9, "Durable cleanup worker and schedule";
-- the worker is T14, its schedule T15, deletion integration T16). Builds on:
--   20260919045208_create_match_video_attachments     (T2: table, trigger, cleanup columns)
--   20260919050413_match_video_attachment_reservations (T3: authorize/reserve/renew/cancel)
--   20260919052002_match_video_attachment_activation   (T4: finalization lease, activate)
--
-- Three service-role-only transactions and two private helpers:
--
--   match_video_claim_cleanup    lease up to 50 collectible rows for one worker
--                                token, retiring abandoned pending work and
--                                orphans IN THE SAME TRANSACTION (the fence)
--   match_video_confirm_cleanup  the worker deleted what the claim told it to
--   match_video_fail_cleanup     the worker could not; keep the keys, back off
--   match_video_cleanup_collectible   (private) the eligibility predicate
--   match_video_lock_for_cleanup      (private) parent-first row lock for settle
--
-- WHAT IS COLLECTIBLE. A row is a candidate only while `cleaned_up_at` is
-- null, no other worker's cleanup lease is live, and the STAGED rule holds:
-- the latest upload-SAS expiry plus five minutes has passed (a writer whose
-- credential is still valid must never have its target deleted underneath
-- it). Then, by state:
--
--   retired            both keys, on the row's own retry schedule
--                      (`cleanup_next_attempt_at`, seeded by cancel/activate)
--   orphan             `match_id` null in ANY state: the match is gone, nothing
--                      can play or publish it — retired by the claim, both keys
--   pending + match    only after 24 hours idle on `last_attempt_at` (reserve,
--                      renew and begin_finalization all bump it) and with no
--                      live finalization lease — retired by the claim, both keys
--   active + match     the STAGED key only. `collect_final` is never true for an
--                      active row that still has its match. A null `uploaded_by`
--                      appears nowhere in this predicate on purpose: when an
--                      uploader's account is deleted the team keeps the match and
--                      its playable video, and the final key stays put.
--
-- THE FENCE. A claim on a pending or orphaned row sets `state = 'retired'` in
-- the same transaction that takes the cleanup lease. From then on T3's renew
-- and T4's begin_finalization / activate refuse with mode_conflict
-- (attempt_retired), reserve refuses the same client request id, and the T2
-- trigger refuses retired → anything. A worker claim can therefore never turn
-- into a late activation, and an activation that commits first leaves nothing
-- for the claim to take (the scan is re-evaluated under the row lock).
--
-- SHED MARKER. After an active row's staged key is confirmed gone, its
-- `cleanup_next_attempt_at` is set to 'infinity' so the daily sweep stops
-- re-deleting a blob that is not there. Both T3 cancel and T4 activation
-- overwrite that column when they retire the row, so the final key is
-- scheduled normally the moment the row stops being active. `cleaned_up_at`
-- keeps its one meaning — every tracked object is gone — and is set only on
-- retired rows.
--
-- LOCK ORDER (same as T3/T4): the parent `matches` row FIRST — `for no key
-- update`, and in the claim `skip locked`, so a match with an attachment
-- transaction in flight is left for the next sweep rather than waited on —
-- then the attachment row `for update`. Nothing here writes `matches`.
--
-- FOR T14. The claim returns `copy_id` / `copy_status` with both keys and a
-- per-key `collect_staged` / `collect_final`, so the worker can abort a
-- server-side copy that T10 left in flight (storage refuses to delete a blob
-- with a pending copy, 409 PendingCopyOperation) before it deletes, and can
-- recheck `version` at settle time. Absence of a blob is a successful delete.
--
-- ERRORS. 42501 for any client role; 22023 for malformed arguments (a server
-- bug); P0002 for an unknown attachment at settle. Lease and version races
-- are answered in the row (`outcome`), never raised, so a worker keeps going.
--
-- Idempotent: `create or replace` throughout; grants restated. Additive: no
-- table, column, index or existing function is changed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Eligibility predicate (private)
-- ─────────────────────────────────────────────────────────────────────────────
-- Evaluated twice per candidate: once in the scan, again on the locked row,
-- because a renewal, activation or cancel may have landed in between.

create or replace function public.match_video_cleanup_collectible(
  a     public.match_video_attachments,
  p_now timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select a.cleaned_up_at is null
     and (a.cleanup_lease_until is null or a.cleanup_lease_until <= p_now)
     -- Staged rule: the last write credential must be dead, plus clock skew.
     and (a.upload_sas_expires_at is null
          or a.upload_sas_expires_at + interval '5 minutes' <= p_now)
     and (
          -- Retired: on its own retry schedule.
          (a.state = 'retired'
             and (a.cleanup_next_attempt_at is null or a.cleanup_next_attempt_at <= p_now))
          -- Orphan (match deleted), not yet retired: first encounter, no
          -- schedule to respect — the claim retires it and it joins the
          -- retired branch for any retry.
       or (a.match_id is null and a.state <> 'retired'
             and (a.finalize_lease_until is null or a.finalize_lease_until <= p_now))
          -- Abandoned pending work: idle a full day and nobody finalizing.
       or (a.state = 'pending' and a.match_id is not null
             and (a.finalize_lease_until is null or a.finalize_lease_until <= p_now)
             and a.last_attempt_at <= p_now - interval '24 hours'
             and (a.cleanup_next_attempt_at is null or a.cleanup_next_attempt_at <= p_now))
          -- Active with its match: the staged key only (see collect_final).
       or (a.state = 'active' and a.match_id is not null
             and (a.cleanup_next_attempt_at is null or a.cleanup_next_attempt_at <= p_now))
     )
$$;

revoke all on function public.match_video_cleanup_collectible(public.match_video_attachments, timestamptz) from public, anon, authenticated;

comment on function public.match_video_cleanup_collectible(public.match_video_attachments, timestamptz) is
  'Private. True when the cleanup worker may take this row now: not cleaned up, no live cleanup lease, upload SAS expiry + 5 min passed, and (retired on schedule | orphaned | pending idle 24h with no finalization lease | active — staged key only). Never looks at uploaded_by.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Claim
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_claim_cleanup(
  p_worker_token  uuid,
  p_lease_seconds integer,
  p_limit         integer
)
returns table (
  attachment_id       uuid,
  match_id            uuid,
  state               text,
  version             integer,
  staged_blob_key     text,
  final_blob_key      text,
  copy_id             text,
  copy_status         text,
  collect_staged      boolean,
  collect_final       boolean,
  cleanup_lease_until timestamptz,
  cleanup_attempts    integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now     timestamptz := now();
  v_until   timestamptz;
  v_cand    record;
  v_row     public.match_video_attachments%rowtype;
  v_retire  boolean;
  v_claimed integer := 0;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_worker_token is null then
    raise exception 'worker token is required'
      using errcode = '22023', detail = 'missing_worker_token';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'lease must be 1–3600 seconds'
      using errcode = '22023', detail = 'bad_lease_seconds';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit must be 1–50'
      using errcode = '22023', detail = 'bad_limit';
  end if;

  v_until := v_now + make_interval(secs => p_lease_seconds);

  -- Candidates, oldest business first: already-retired rows, then orphans,
  -- then the rest. Over-fetch so rows skipped for a lock do not starve the
  -- batch; the exit below still caps what is claimed.
  for v_cand in
    select a.id, a.match_id
      from public.match_video_attachments a
     where public.match_video_cleanup_collectible(a, v_now)
     order by case when a.state = 'retired' then 0
                   when a.match_id is null then 1
                   else 2 end,
              coalesce(a.cleanup_next_attempt_at, a.retired_at, a.last_attempt_at),
              a.id
     limit p_limit * 4
  loop
    exit when v_claimed >= p_limit;

    -- Parent first. A match under an attachment transaction (T3/T4 hold it
    -- FOR NO KEY UPDATE) is skipped this sweep, never waited on; a match
    -- deleted since the scan leaves an orphan for the next sweep.
    if v_cand.match_id is not null then
      perform 1 from public.matches m
        where m.id = v_cand.match_id
        for no key update skip locked;
      if not found then
        continue;
      end if;
    end if;

    select a.* into v_row
      from public.match_video_attachments a
     where a.id = v_cand.id
       for update skip locked;
    if not found then
      continue;
    end if;

    -- The scan ran before the locks; the row may have moved on.
    if not public.match_video_cleanup_collectible(v_row, v_now) then
      continue;
    end if;

    -- Pending work and orphans are retired HERE, under the lease, so no later
    -- renewal, finalization or activation can find a pending row. An active
    -- row that still has its match keeps its state: only staging is shed.
    v_retire := v_row.match_id is null or v_row.state = 'pending';

    if v_retire then
      update public.match_video_attachments a
         set state                = 'retired',
             retired_at           = coalesce(a.retired_at, v_now),
             finalize_lease_token = null,
             finalize_lease_until = null,
             cleanup_lease_token  = p_worker_token,
             cleanup_lease_until  = v_until
       where a.id = v_row.id
      returning a.* into v_row;
    else
      update public.match_video_attachments a
         set cleanup_lease_token = p_worker_token,
             cleanup_lease_until = v_until
       where a.id = v_row.id
      returning a.* into v_row;
    end if;

    v_claimed := v_claimed + 1;

    attachment_id       := v_row.id;
    match_id            := v_row.match_id;
    state               := v_row.state;
    version             := v_row.version;
    staged_blob_key     := v_row.staged_blob_key;
    final_blob_key      := v_row.final_blob_key;
    copy_id             := v_row.copy_id;
    copy_status         := v_row.copy_status;
    collect_staged      := true;
    collect_final       := v_row.state = 'retired';
    cleanup_lease_until := v_row.cleanup_lease_until;
    cleanup_attempts    := v_row.cleanup_attempts;
    return next;
  end loop;
end;
$$;

revoke all on function public.match_video_claim_cleanup(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.match_video_claim_cleanup(uuid, integer, integer) to service_role;

comment on function public.match_video_claim_cleanup(uuid, integer, integer) is
  'Service-only. Leases at most p_limit (≤ 50) collectible attachment rows for p_worker_token, locking each parent match FOR NO KEY UPDATE SKIP LOCKED before its row. Retires pending work idle 24h and orphaned rows in the same transaction (the fence against late activation/renewal). collect_final is true only for retired rows; an active row with its match sheds only its staged key. Returns copy_id/copy_status so the worker can abort an in-flight copy before deleting.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Parent-first lock for settle (private)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_lock_for_cleanup(p_attachment_id uuid)
returns public.match_video_attachments
language plpgsql
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_row      public.match_video_attachments%rowtype;
begin
  select a.match_id into v_match_id
    from public.match_video_attachments a
   where a.id = p_attachment_id;
  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;

  if v_match_id is not null then
    perform 1 from public.matches m where m.id = v_match_id for no key update;
  end if;

  select a.* into v_row
    from public.match_video_attachments a
   where a.id = p_attachment_id
     for update;
  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_attachment';
  end if;
  return v_row;
end;
$$;

revoke all on function public.match_video_lock_for_cleanup(uuid) from public, anon, authenticated;

comment on function public.match_video_lock_for_cleanup(uuid) is
  'Private. Locks the attachment''s parent match FOR NO KEY UPDATE (when it still has one) and then the row FOR UPDATE, returning the locked row.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Confirm — the worker deleted what the claim told it to
-- ─────────────────────────────────────────────────────────────────────────────
-- Outcomes (never raised, so a batch keeps moving):
--   cleaned_up       retired row, final collected: every object is gone
--   staged_shed      active row: staging gone, final untouched, sweep parked
--   rescheduled      the row was retired between claim and confirm while the
--                    worker had collected staging only; the final key is due now
--   lease_lost       expired or another worker's — nothing recorded
--   version_changed  the row changed under the worker — lease released, nothing
--                    else recorded; a fresh claim re-evaluates it

create or replace function public.match_video_confirm_cleanup(
  p_attachment_id    uuid,
  p_lease_token      uuid,
  p_expected_version integer,
  p_collected_final  boolean
)
returns table (
  attachment_id           uuid,
  state                   text,
  outcome                 text,
  cleaned_up_at           timestamptz,
  cleanup_next_attempt_at timestamptz,
  cleanup_attempts        integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.match_video_attachments%rowtype;
  v_now timestamptz := now();
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;
  if p_attachment_id is null or p_lease_token is null
     or p_expected_version is null or p_collected_final is null then
    raise exception 'attachment id, lease token, expected version and collected_final are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;

  v_row := public.match_video_lock_for_cleanup(p_attachment_id);

  if v_row.cleanup_lease_token is distinct from p_lease_token
     or v_row.cleanup_lease_until is null
     or v_row.cleanup_lease_until <= v_now then
    return query select v_row.id, v_row.state, 'lease_lost'::text,
      v_row.cleaned_up_at, v_row.cleanup_next_attempt_at, v_row.cleanup_attempts;
    return;
  end if;

  if v_row.version <> p_expected_version then
    update public.match_video_attachments a
       set cleanup_lease_token = null,
           cleanup_lease_until = null
     where a.id = v_row.id
    returning a.* into v_row;
    return query select v_row.id, v_row.state, 'version_changed'::text,
      v_row.cleaned_up_at, v_row.cleanup_next_attempt_at, v_row.cleanup_attempts;
    return;
  end if;

  -- The claim never asks for an active row's final key. A worker reporting
  -- one collected has deleted a served asset: say so loudly.
  if v_row.state = 'active' and p_collected_final then
    raise exception 'an active attachment''s final key must never be collected'
      using errcode = '22023', detail = 'active_final_collected';
  end if;

  if v_row.state = 'active' then
    update public.match_video_attachments a
       set cleanup_next_attempt_at = 'infinity',
           cleanup_last_error      = null,
           cleanup_lease_token     = null,
           cleanup_lease_until     = null
     where a.id = v_row.id
    returning a.* into v_row;
    return query select v_row.id, v_row.state, 'staged_shed'::text,
      v_row.cleaned_up_at, v_row.cleanup_next_attempt_at, v_row.cleanup_attempts;
    return;
  end if;

  -- Retired (a claimed row is never pending). Only a confirmed final delete
  -- closes it; staging-only means the row was retired mid-sweep.
  if p_collected_final then
    update public.match_video_attachments a
       set cleaned_up_at       = v_now,
           cleanup_last_error  = null,
           cleanup_lease_token = null,
           cleanup_lease_until = null
     where a.id = v_row.id
    returning a.* into v_row;
    return query select v_row.id, v_row.state, 'cleaned_up'::text,
      v_row.cleaned_up_at, v_row.cleanup_next_attempt_at, v_row.cleanup_attempts;
    return;
  end if;

  update public.match_video_attachments a
     set cleanup_next_attempt_at = v_now,
         cleanup_lease_token     = null,
         cleanup_lease_until     = null
   where a.id = v_row.id
  returning a.* into v_row;
  return query select v_row.id, v_row.state, 'rescheduled'::text,
    v_row.cleaned_up_at, v_row.cleanup_next_attempt_at, v_row.cleanup_attempts;
end;
$$;

revoke all on function public.match_video_confirm_cleanup(uuid, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_video_confirm_cleanup(uuid, uuid, integer, boolean) to service_role;

comment on function public.match_video_confirm_cleanup(uuid, uuid, integer, boolean) is
  'Service-only. Under a live cleanup lease and matching version: a retired row with its final key collected is cleaned_up; an active row has its staged key shed (cleanup_next_attempt_at = infinity, final untouched); a retired row with staging only is rescheduled now. lease_lost / version_changed are outcomes, not errors. Refuses (22023) a report that an ACTIVE row''s final key was collected.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fail — keep the keys, count the failure, back off
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_fail_cleanup(
  p_attachment_id       uuid,
  p_lease_token         uuid,
  p_error               text,
  p_retry_after_seconds integer
)
returns table (
  attachment_id           uuid,
  state                   text,
  outcome                 text,
  cleanup_attempts        integer,
  cleanup_next_attempt_at timestamptz,
  cleanup_last_error      text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.match_video_attachments%rowtype;
  v_now   timestamptz := now();
  v_delay interval;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;
  if p_attachment_id is null or p_lease_token is null then
    raise exception 'attachment id and lease token are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;
  if p_retry_after_seconds is not null
     and (p_retry_after_seconds < 1 or p_retry_after_seconds > 604800) then
    raise exception 'retry_after must be 1 second to 7 days'
      using errcode = '22023', detail = 'bad_retry_after';
  end if;

  v_row := public.match_video_lock_for_cleanup(p_attachment_id);

  if v_row.cleanup_lease_token is distinct from p_lease_token
     or v_row.cleanup_lease_until is null
     or v_row.cleanup_lease_until <= v_now then
    return query select v_row.id, v_row.state, 'lease_lost'::text,
      v_row.cleanup_attempts, v_row.cleanup_next_attempt_at, v_row.cleanup_last_error;
    return;
  end if;

  -- Exponential backoff from 10 minutes, capped at a day (the sweep is
  -- daily anyway), unless the worker knows better.
  v_delay := coalesce(
    make_interval(secs => p_retry_after_seconds),
    least(interval '24 hours',
          interval '5 minutes' * power(2, least(v_row.cleanup_attempts + 1, 9))));

  update public.match_video_attachments a
     set cleanup_attempts        = a.cleanup_attempts + 1,
         cleanup_last_error      = left(coalesce(nullif(p_error, ''), 'unknown'), 1000),
         cleanup_next_attempt_at = v_now + v_delay,
         cleanup_lease_token     = null,
         cleanup_lease_until     = null
   where a.id = v_row.id
  returning a.* into v_row;

  return query select v_row.id, v_row.state, 'failed'::text,
    v_row.cleanup_attempts, v_row.cleanup_next_attempt_at, v_row.cleanup_last_error;
end;
$$;

revoke all on function public.match_video_fail_cleanup(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.match_video_fail_cleanup(uuid, uuid, text, integer) to service_role;

comment on function public.match_video_fail_cleanup(uuid, uuid, text, integer) is
  'Service-only. Under a live cleanup lease: increments cleanup_attempts, records the error, schedules the next attempt (explicit seconds, else 10 min doubling to a 24 h cap) and releases the lease. Never touches state, keys or cleaned_up_at — a failed delete retains everything for the retry. lease_lost is an outcome, not an error.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Assertions — privilege boundary, lock order, and no claim-to-activation
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn  text;
  v_def text;
begin
  -- Public surface: service_role only.
  foreach v_fn in array array[
    'public.match_video_claim_cleanup(uuid, integer, integer)',
    'public.match_video_confirm_cleanup(uuid, uuid, integer, boolean)',
    'public.match_video_fail_cleanup(uuid, uuid, text, integer)'
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
    if v_def ~* '(update|insert\s+into|delete\s+from)\s+public\.(points|shots|matches|match_stats)\M' then
      raise exception '%: writes an imported-data table', v_fn;
    end if;
  end loop;

  -- Private helpers: no client role, and not even service_role directly.
  foreach v_fn in array array[
    'public.match_video_cleanup_collectible(public.match_video_attachments, timestamptz)',
    'public.match_video_lock_for_cleanup(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '%: a client role may execute it', v_fn;
    end if;
  end loop;

  -- Lock order: the parent match before any attachment row, in both the
  -- claim and the settle helper.
  select pg_get_functiondef('public.match_video_claim_cleanup(uuid, integer, integer)'::regprocedure) into v_def;
  if position('for no key update skip locked' in v_def) = 0
     or position('for no key update skip locked' in v_def) > position('for update skip locked' in v_def) then
    raise exception 'match_video_claim_cleanup: attachment row locked before the parent match';
  end if;
  -- A claim only ever retires; it can never publish.
  if v_def ~* 'set\s+state\s*=\s*''(active|pending)''' then
    raise exception 'match_video_claim_cleanup: writes a non-retired state';
  end if;

  select pg_get_functiondef('public.match_video_lock_for_cleanup(uuid)'::regprocedure) into v_def;
  if position('for no key update' in v_def) = 0
     or position('for no key update' in v_def) > position('for update' in v_def) then
    raise exception 'match_video_lock_for_cleanup: attachment row locked before the parent match';
  end if;

  -- The eligibility predicate never consults the uploader.
  select pg_get_functiondef('public.match_video_cleanup_collectible(public.match_video_attachments, timestamptz)'::regprocedure) into v_def;
  if v_def ~* 'uploaded_by' then
    raise exception 'match_video_cleanup_collectible: eligibility depends on uploaded_by';
  end if;
end
$$;
