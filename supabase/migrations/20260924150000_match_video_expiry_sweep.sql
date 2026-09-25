-- SwingVision Add video T9 · warn at 11 months, expire at a year. Builds on:
--   20260919045208_create_match_video_attachments  (table, before-update trigger)
--   20260919080217_match_video_attachment_cleanup   (claim / confirm)
--   20260924130000_match_video_remove_attachment    (retired_reason)
--   20260924140000_match_video_last_viewed          (last_viewed_at, expiry_warned_at)
-- Checked against the LIVE definitions (2026-09-24): match_video_attachments
-- has retired_at, cleanup_next_attempt_at and the retired_at_check
-- ((state = 'retired') = (retired_at is not null)); none of the three
-- migrations above is applied yet, and this one must follow them. The
-- before-update trigger allows active → retired and only bumps updated_at.
-- match_video_claim_cleanup already claims a retired row once
-- cleanup_next_attempt_at is due, with collect_final = true.
--
-- THE CLOCK is coalesce(last_viewed_at, activated_at), exactly as
-- 20260924140000 and src/lib/match-video/expiry.ts define it.
--
-- WHO HOLDS THE POLICY. The day counts are PARAMETERS, not literals: the
-- one source is MATCH_VIDEO_EXPIRY_DAYS (365) and MATCH_VIDEO_EXPIRY_WARN_DAYS
-- (30) in src/lib/match-video/expiry.ts, which the cron passes in, so the Film
-- empty state, Settings › Usage and this sweep can never disagree about when a
-- video goes. SQL only bounds them: expiry 30–3650 days, warning 1 day up to
-- one day short of expiry, so a typo cannot turn the sweep into "retire every
-- video now".
--
-- 1. match_video_expire_unwatched(limit, expiry_days)
--    Retires ACTIVE rows whose clock is at least expiry_days old:
--    state = 'retired', retired_reason = 'expired', retired_at = now(),
--    cleanup_next_attempt_at = now(). The row stays — it is the only record
--    of the blob keys — and the existing cleanup sweep deletes both objects.
--    matches, points, shots and match_stats are never written: the statistics
--    outlive the film. Lock order is the one every attachment transaction
--    uses — the match FOR NO KEY UPDATE, then the attachment FOR UPDATE —
--    both SKIP LOCKED, so a sweep never waits on a user's upload or removal
--    and the row is simply taken tomorrow. The predicate is rechecked under
--    the locks: a view that landed in between restarts the clock and the row
--    is left active. Orphans (match_id null) are the cleanup claim's job and
--    are not touched here.
--
-- 2. match_video_claim_expiry_warnings(limit, expiry_days, warn_days)
--    Stamps expiry_warned_at = now() on ACTIVE rows whose clock is at least
--    (expiry_days - warn_days) old, that are not yet due to expire, and whose
--    expiry_warned_at is null — and returns them with what the email needs.
--    Stamp-then-return is the claim: two concurrent sweeps never return the
--    same row, and a row is warned once per clock (match_video_record_view
--    resets expiry_warned_at). The email is sent AFTER this commits and is
--    additionally keyed in notification_sends by claimSend(), so a lost send
--    is the failure mode, never a duplicate — the video can still be kept by
--    anyone who opens it. Only the attachment row is locked, as in
--    match_video_record_view, so it cannot invert the match → attachment
--    order. A row with a null uploader is stamped too (so it is not offered
--    again every day) and the caller skips the send.
--
-- Both are service-role only, security definer, empty search_path. Neither
-- needs a new index: the active set is small (capped per workspace) and is
-- reached through match_video_attachments_one_active_per_match.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. match_video_expire_unwatched
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_expire_unwatched(
  p_limit       integer,
  p_expiry_days integer
)
returns table (
  attachment_id uuid,
  match_id      uuid,
  uploaded_by   uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now    timestamptz := now();
  v_cutoff timestamptz;
  v_cand   record;
  v_row    public.match_video_attachments%rowtype;
  v_done   integer := 0;
begin
  -- Belt and braces on top of the EXECUTE grants.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be 1–100'
      using errcode = '22023', detail = 'bad_limit';
  end if;
  if p_expiry_days is null or p_expiry_days < 30 or p_expiry_days > 3650 then
    raise exception 'expiry must be 30–3650 days'
      using errcode = '22023', detail = 'bad_expiry_days';
  end if;

  v_cutoff := v_now - make_interval(days => p_expiry_days);

  for v_cand in
    select a.id, a.match_id
      from public.match_video_attachments a
     where a.state = 'active'
       and a.match_id is not null
       and coalesce(a.last_viewed_at, a.activated_at) <= v_cutoff
     order by coalesce(a.last_viewed_at, a.activated_at), a.id
     limit p_limit * 4
  loop
    exit when v_done >= p_limit;

    -- Parent first, as every attachment transaction does.
    perform 1 from public.matches m
      where m.id = v_cand.match_id
      for no key update skip locked;
    if not found then
      continue;
    end if;

    select a.* into v_row
      from public.match_video_attachments a
     where a.id = v_cand.id
       for update skip locked;
    if not found then
      continue;
    end if;

    -- Recheck under the locks: replaced, removed or watched in between.
    if v_row.state <> 'active'
       or v_row.match_id is distinct from v_cand.match_id
       or coalesce(v_row.last_viewed_at, v_row.activated_at) > v_cutoff then
      continue;
    end if;

    update public.match_video_attachments a
       set state                   = 'retired',
           retired_reason          = 'expired',
           retired_at              = v_now,
           cleanup_next_attempt_at = v_now
     where a.id = v_row.id;

    v_done := v_done + 1;

    attachment_id := v_row.id;
    match_id      := v_row.match_id;
    uploaded_by   := v_row.uploaded_by;
    return next;
  end loop;
end;
$$;

revoke all on function public.match_video_expire_unwatched(integer, integer) from public, anon, authenticated;
grant execute on function public.match_video_expire_unwatched(integer, integer) to service_role;

comment on function public.match_video_expire_unwatched(integer, integer) is
  'Service-only. Retires up to p_limit ACTIVE attachments whose clock coalesce(last_viewed_at, activated_at) is at least p_expiry_days old: retired_reason = expired, retired_at = now(), cleanup_next_attempt_at = now(), so the cleanup sweep deletes both objects. Returns (attachment_id, match_id, uploaded_by). Locks match then attachment, SKIP LOCKED. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. match_video_claim_expiry_warnings
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_claim_expiry_warnings(
  p_limit       integer,
  p_expiry_days integer,
  p_warn_days   integer
)
returns table (
  attachment_id       uuid,
  match_id            uuid,
  uploaded_by         uuid,
  activated_at        timestamptz,
  last_viewed_at      timestamptz,
  expiry_warned_at    timestamptz,
  player1_name        text,
  player2_name        text,
  match_date          timestamptz,
  program_id          uuid,
  program_school_name text,
  program_team        text,
  uploader_email      text,
  uploader_first_name text,
  uploader_last_name  text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now          timestamptz := now();
  v_expiry_since timestamptz;
  v_warn_since   timestamptz;
begin
  -- Belt and braces on top of the EXECUTE grants.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be 1–100'
      using errcode = '22023', detail = 'bad_limit';
  end if;
  if p_expiry_days is null or p_expiry_days < 30 or p_expiry_days > 3650 then
    raise exception 'expiry must be 30–3650 days'
      using errcode = '22023', detail = 'bad_expiry_days';
  end if;
  if p_warn_days is null or p_warn_days < 1 or p_warn_days >= p_expiry_days then
    raise exception 'warning must be 1 day up to one day short of expiry'
      using errcode = '22023', detail = 'bad_warn_days';
  end if;

  v_expiry_since := v_now - make_interval(days => p_expiry_days);
  v_warn_since   := v_now - make_interval(days => p_expiry_days - p_warn_days);

  -- Not yet due to expire: a row past its expiry is expire's, and an email
  -- announcing a date already gone would be wrong. The FOR UPDATE re-evaluates
  -- the predicate against a row a concurrent view just changed.
  return query
    with due as (
      select a.id
        from public.match_video_attachments a
       where a.state = 'active'
         and a.match_id is not null
         and a.expiry_warned_at is null
         and coalesce(a.last_viewed_at, a.activated_at) <= v_warn_since
         and coalesce(a.last_viewed_at, a.activated_at) >  v_expiry_since
       order by coalesce(a.last_viewed_at, a.activated_at), a.id
       limit p_limit
         for update of a skip locked
    ),
    stamped as (
      update public.match_video_attachments a
         set expiry_warned_at = v_now
        from due
       where a.id = due.id
      returning a.id, a.match_id, a.uploaded_by, a.activated_at,
                a.last_viewed_at, a.expiry_warned_at
    )
    select s.id, s.match_id, s.uploaded_by, s.activated_at, s.last_viewed_at,
           s.expiry_warned_at, m.player1_name, m.player2_name, m.date,
           m.program_id, p.school_name, p.team,
           u.email, u.first_name, u.last_name
      from stamped s
      join public.matches m on m.id = s.match_id
      left join public.programs p on p.id = m.program_id
      left join public.users u on u.id = s.uploaded_by
     order by coalesce(s.last_viewed_at, s.activated_at), s.id;
end;
$$;

revoke all on function public.match_video_claim_expiry_warnings(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.match_video_claim_expiry_warnings(integer, integer, integer) to service_role;

comment on function public.match_video_claim_expiry_warnings(integer, integer, integer) is
  'Service-only. Stamps expiry_warned_at = now() on up to p_limit ACTIVE attachments whose clock coalesce(last_viewed_at, activated_at) is at least (p_expiry_days - p_warn_days) old but under p_expiry_days, and whose expiry_warned_at is null; returns them with the match''s players, date and program, and the uploader''s address and name, for the expiry email. SKIP LOCKED, attachment row only. match_video_record_view resets the stamp.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Assertions — the privilege boundary
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.match_video_expire_unwatched(integer, integer)',
    'public.match_video_claim_expiry_warnings(integer, integer, integer)'
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

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'match_video_attachments'
       and column_name = 'expiry_warned_at'
  ) then
    raise exception 'match_video_attachments.expiry_warned_at missing — apply 20260924140000 first';
  end if;
end
$$;
