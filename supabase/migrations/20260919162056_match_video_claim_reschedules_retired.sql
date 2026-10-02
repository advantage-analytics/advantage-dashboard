-- The cleanup claim retires a row without rescheduling it, which strands a
-- published video in Azure forever.
--
-- `20260919080217_match_video_attachment_cleanup.sql` says, at the top, that
-- "Both T3 cancel and T4 activation overwrite that column when they retire the
-- row, so the final key is scheduled normally the moment the row stops being
-- active." Cancel does (`...reservations.sql:472`) and activation does
-- (`...activation.sql:707`). The CLAIM's own retire branch does not — it sets
-- state, `retired_at` and the two leases, and leaves `cleanup_next_attempt_at`
-- at whatever it held.
--
-- That is only ever a problem because of one legitimate value: `'infinity'`,
-- which `match_video_confirm_cleanup` writes to park an ACTIVE row after it
-- has shed its staging and has nothing further to collect.
--
--   1. An active row sheds staging  → `cleanup_next_attempt_at = 'infinity'`.
--   2. Its match is deleted         → `match_id` null, state still 'active'.
--   3. A sweep's ORPHAN branch does not read `cleanup_next_attempt_at`, so the
--      row is collectible; the claim retires it and hands the worker
--      `collect_final = true`.
--   4. The worker dies before `confirm_cleanup` or `fail_cleanup`. The lease
--      lapses. This is the ordinary crash the retry machinery exists for.
--   5. The row is now `retired` with `cleanup_next_attempt_at = 'infinity'`.
--      The RETIRED branch requires `cleanup_next_attempt_at <= now()`, and
--      infinity never is. The ORPHAN branch now requires `state <> 'retired'`.
--      No branch will ever match again.
--
-- The row reads as cleanly retired — no error, no `cleanup_attempts`, nothing
-- in any log — while a full-length match video, up to the 8 GB cap, sits in
-- the container with nothing left that will ever look for it. `fail_cleanup`
-- would have rescued it; the crash path is the one that cannot.
--
-- The fix is the clause cancel and activation already carry: schedule the row
-- from the last SAS expiry, so a writer holding a live credential still keeps
-- its margin. Everything else in the function is reproduced unchanged —
-- plpgsql has no way to amend one statement.
--
-- Applied to the live project twice, deliberately. The first apply flattened
-- the two en-dashes in the range messages ("1–3600", "1–50") to hyphens, which
-- `tests/match-video-attachments-db.spec.ts` asserts verbatim and caught. The
-- second, `..._messages`, re-applied this file's exact text. A fresh
-- environment needs only THIS file; the second migration is a no-op against it.
--
-- No backfill: the table is empty (verified, 0 rows), so nothing is stranded
-- yet. A deployment that already had rows would want
--   update public.match_video_attachments
--      set cleanup_next_attempt_at = greatest(now(), coalesce(upload_sas_expires_at, now()))
--    where state = 'retired' and cleaned_up_at is null
--      and cleanup_next_attempt_at = 'infinity';
-- which is safe to run repeatedly.

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
             cleanup_lease_until  = v_until,
             -- THE FIX. Without this an active row parked at 'infinity' by a
             -- staged-only shed keeps that value through its retirement, and
             -- the retired branch's `cleanup_next_attempt_at <= now()` can
             -- never be true again. Same clause cancel and activation use, so
             -- a writer whose upload SAS is still live keeps its margin.
             cleanup_next_attempt_at =
               greatest(v_now, coalesce(a.upload_sas_expires_at, v_now))
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

revoke all on function public.match_video_claim_cleanup(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.match_video_claim_cleanup(uuid, integer, integer)
  to service_role;

comment on function public.match_video_claim_cleanup(uuid, integer, integer) is
  'Leases at most 50 collectible attachments, retiring pending and orphaned '
  'work under the lease so no later renewal, finalization or activation can '
  'find it. Every retire also reschedules the row, so a value of ''infinity'' '
  'parked by a staged-only shed cannot survive into retirement and strand the '
  'published blob.';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'match_video_claim_cleanup';

  -- The property this migration exists to restore: every branch that retires
  -- a row also reschedules it. Asserted on the text because the failure is an
  -- ABSENT statement, which nothing else can observe.
  if v_def not like '%cleanup_next_attempt_at =%' then
    raise exception
      'match_video_claim_cleanup retires without rescheduling — a row parked '
      'at infinity would never be collectible again';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.match_video_claim_cleanup(uuid, integer, integer)',
       'execute')
     or has_function_privilege(
       'authenticated',
       'public.match_video_claim_cleanup(uuid, integer, integer)',
       'execute')
     or has_function_privilege(
       'anon',
       'public.match_video_claim_cleanup(uuid, integer, integer)',
       'execute') then
    raise exception 'match_video_claim_cleanup privileges are wrong';
  end if;
end;
$$;
