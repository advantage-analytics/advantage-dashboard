-- SwingVision Add video T5 · removing an ACTIVE match video. Builds on:
--   20260919045208_create_match_video_attachments  (table, state trigger)
--   20260919080217_match_video_attachment_cleanup   (claim / confirm)
--   20260924120000_match_video_attachment_cap       (cap + usage)
-- Checked against the LIVE definitions (2026-09-24): match_video_attachments
-- has retired_at and cleanup_next_attempt_at but no retired_reason; the
-- before-update trigger forbids retired → anything and active → pending, and
-- match_video_cancel_upload refuses an active row with mode_conflict — so
-- until this migration nothing could retire a published video except a
-- replacement.
--
-- WHY A RETIRED ROW, NOT A DELETE. The row is the only record of the blob
-- keys. Retiring it with cleanup_next_attempt_at = now() hands it to the
-- cleanup worker: match_video_claim_cleanup already claims retired rows on
-- their schedule with collect_final = true, deletes both objects, and
-- match_video_confirm_cleanup closes the row. A removal that raced a
-- staged-only sweep of the same (then active) row is rescheduled by confirm
-- ("retired mid-sweep"), never closed, so the final object is still taken on
-- the next claim.
--
-- WHO MAY REMOVE. The row's uploaded_by, or an OWNER or COACH of the match's
-- program (program_members.role). Staff and players remove only their own
-- uploads (decided 2026-09-24). A personal match (program_id null) has no
-- program lead, so only its uploader. This deliberately does NOT call
-- match_video_authorize_match: that gate is creator-only and workspace-exact,
-- and a coach removing a player's video is neither the creator nor
-- necessarily "in" the right workspace. The route asks RLS visibility first;
-- this function rechecks the role itself, under the row locks.
--
-- IDEMPOTENT. A row that is already retired — by an earlier removal, a
-- replacement, a cancellation or the cleanup claim — is returned unchanged:
-- running the removal again does no harm and moves no timestamp. A PENDING
-- attempt is refused (mode_conflict): that is cancellation's job, and it
-- carries the SAS-expiry wait that removal does not need.
--
-- WHAT IT NEVER WRITES. matches, points, shots, match_stats. The match row is
-- locked FOR NO KEY UPDATE (the same parent-first lock order every attachment
-- transaction and the cleanup claim use) and never updated.
--
-- retired_reason. New, nullable, and set only by this function ('removed')
-- and, later, by the retention expiry ('expired'). Rows retired by
-- replacement, cancellation or the cleanup claim keep NULL. A reason may only
-- sit on a retired row; the state trigger already stops a retired row from
-- coming back, so the pair can never disagree.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. retired_reason
-- ─────────────────────────────────────────────────────────────────────────────
-- A nullable column with no default is a catalog-only change; both checks
-- are validated against rows whose new column is NULL, so they pass without
-- rewriting anything.

alter table public.match_video_attachments
  add column if not exists retired_reason text;

alter table public.match_video_attachments
  add constraint match_video_attachments_retired_reason_check
  check (retired_reason is null or retired_reason in ('removed', 'expired'));

alter table public.match_video_attachments
  add constraint match_video_attachments_retired_reason_state_check
  check (retired_reason is null or state = 'retired');

comment on column public.match_video_attachments.retired_reason is
  'Why an ACTIVE video was retired other than by replacement: removed (match_video_remove_attachment) or expired (retention). NULL for replacement, cancellation, cleanup-claim retirement and every non-retired row.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. match_video_remove_attachment
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_remove_attachment(
  p_actor_id      uuid,
  p_match_id      uuid,
  p_attachment_id uuid
)
returns table (
  attachment_id  uuid,
  state          text,
  retired_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_row        public.match_video_attachments%rowtype;
begin
  -- Belt and braces on top of the EXECUTE grants.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_actor_id is null or p_match_id is null or p_attachment_id is null then
    raise exception 'actor, match and attachment are required'
      using errcode = '22023', detail = 'missing_argument';
  end if;

  -- Parent first, FOR NO KEY UPDATE: serializes with reserve / activate /
  -- correct / cleanup-claim on this match, never blocks FK inserts, and is
  -- never followed by an UPDATE of the match.
  select m.program_id into v_program_id
    from public.matches m
   where m.id = p_match_id
     for no key update;

  if not found then
    raise exception 'match_not_found'
      using errcode = 'P0002', detail = 'no_such_match';
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

  -- The uploader, or an owner/coach of THIS match's program. Staff, players
  -- and members of any other program are refused for rows that are not theirs.
  if v_row.uploaded_by is distinct from p_actor_id
     and not (
       v_program_id is not null
       and exists (
         select 1
           from public.program_members pm
          where pm.program_id = v_program_id
            and pm.user_id = p_actor_id
            and pm.role in ('owner', 'coach')
       )
     ) then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'not_uploader_or_program_lead';
  end if;

  -- Removal is for published videos; an attempt is cancelled instead.
  if v_row.state = 'pending' then
    raise exception 'mode_conflict'
      using errcode = '55000', detail = 'attachment_pending';
  end if;

  -- Idempotent: already retired (by anything) is returned as it stands.
  if v_row.state = 'retired' then
    return query select v_row.id, v_row.state, v_row.retired_reason;
    return;
  end if;

  -- Active → retired, due at once. The cleanup predicate still waits out a
  -- staged upload SAS that is somehow live (+5 min), so "now" never lets the
  -- worker delete under a writer; it only means "no backoff".
  update public.match_video_attachments a
     set state                   = 'retired',
         retired_reason          = 'removed',
         retired_at              = now(),
         cleanup_next_attempt_at = now()
   where a.id = v_row.id;

  return query select v_row.id, 'retired'::text, 'removed'::text;
end;
$$;

revoke all on function public.match_video_remove_attachment(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_video_remove_attachment(uuid, uuid, uuid) to service_role;

comment on function public.match_video_remove_attachment(uuid, uuid, uuid) is
  'Service-only. Retires the match''s ACTIVE attachment with retired_reason = removed, retired_at = now() and cleanup_next_attempt_at = now(), so the cleanup worker collects both objects. Allowed for the row''s uploaded_by, or an owner/coach of the match''s program (program_members); everyone else is forbidden. Does not use match_video_authorize_match. A pending row is mode_conflict; an already-retired row is returned unchanged. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Assertions — the privilege boundary and the column
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text := 'public.match_video_remove_attachment(uuid, uuid, uuid)';
begin
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
  if position('match_video_authorize_match' in
       pg_get_functiondef(v_fn::regprocedure)) > 0 then
    raise exception '%: must not use the creator-only gate', v_fn;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'match_video_attachments'
       and column_name = 'retired_reason'
       and data_type = 'text'
  ) then
    raise exception 'match_video_attachments.retired_reason missing';
  end if;
end
$$;
