-- SwingVision Add video T8 · when a match video was last watched. Builds on:
--   20260919045208_create_match_video_attachments  (table, before-update trigger)
--   20260925023004_match_video_attachment_cap       (active set + usage read)
--   20260925023035_match_video_remove_attachment    (retired_reason)
-- Checked against the LIVE database (2026-09-24): match_video_attachments has
-- activated_at but neither column below; its only trigger,
-- match_video_attachments_before_update, guards the lifecycle and the blob
-- keys and bumps updated_at — none of which a view stamp touches. Neither
-- earlier migration on this branch is applied yet; this one must follow them.
--
-- THE CLOCK. A video's retention clock is
--   coalesce(last_viewed_at, activated_at)
-- and nothing else. last_viewed_at is NOT backfilled: a video nobody has
-- pressed play on since this shipped is measured from its activation, which
-- is what coalesce already says. The arithmetic (365 days, warn at 30) lives
-- in src/lib/match-video/expiry.ts; SQL stores timestamps only.
--
-- expiry_warned_at. When the expiry warning was sent for the CURRENT clock.
-- Written later by the warning job; reset to null by every view, because a
-- view restarts the clock and a warning about the old one no longer applies.
--
-- match_video_record_view(match_id). Service-role only. Stamps the match's
-- ACTIVE attachment and returns it; no active attachment returns no row and
-- writes nothing. It authorizes nobody: the route has already asked RLS
-- whether the caller can see the match (authorizeMatchVisibility) — anyone
-- who can watch the video counts as a view, the same rule T10's "Keep this
-- video" uses. It takes only the attachment row lock (one UPDATE), never the
-- match row, so it cannot invert the match → attachment lock order the other
-- attachment transactions follow.
--
-- Nothing on the playback path calls it. GET /video is documented as
-- write-free, runs on every credential refresh and is rendered on the server
-- without anyone pressing play; the player sends a separate POST on its first
-- `play` event instead.
--
-- USAGE. match_video_workspace_usage also returns last_viewed_at. Adding an
-- OUT column changes the return type, which CREATE OR REPLACE cannot do, so
-- both it and the internal row-set helper are dropped and recreated here, and
-- every grant and comment is restated. match_video_enforce_active_limit only
-- counts the helper's rows, so its body is unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
-- Nullable, no default: catalog-only, no rewrite, no backfill.

alter table public.match_video_attachments
  add column if not exists last_viewed_at timestamptz,
  add column if not exists expiry_warned_at timestamptz;

comment on column public.match_video_attachments.last_viewed_at is
  'When someone who can see the match last started playing this video (match_video_record_view). NULL = never since tracking began. The retention clock is coalesce(last_viewed_at, activated_at).';

comment on column public.match_video_attachments.expiry_warned_at is
  'When the expiry warning was sent for the current retention clock. Reset to NULL by every recorded view.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. match_video_record_view
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_video_record_view(
  p_match_id uuid
)
returns table (
  attachment_id  uuid,
  last_viewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Belt and braces on top of the EXECUTE grants.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     in ('authenticated', 'anon') then
    raise exception 'forbidden'
      using errcode = '42501', detail = 'service_role_only';
  end if;

  if p_match_id is null then
    raise exception 'match is required'
      using errcode = '22023', detail = 'missing_argument';
  end if;

  -- The one-active-per-match partial unique index finds the row. No active
  -- attachment: zero rows, nothing written.
  return query
    update public.match_video_attachments a
       set last_viewed_at   = now(),
           expiry_warned_at = null
     where a.match_id = p_match_id
       and a.state = 'active'
    returning a.id, a.last_viewed_at;
end;
$$;

revoke all on function public.match_video_record_view(uuid) from public, anon, authenticated;
grant execute on function public.match_video_record_view(uuid) to service_role;

comment on function public.match_video_record_view(uuid) is
  'Service-only. Sets last_viewed_at = now() and expiry_warned_at = null on the match''s ACTIVE attachment and returns (attachment_id, last_viewed_at); no active attachment returns no row and writes nothing. Authorizes nobody — the route checks match visibility first. Never writes matches, points, shots or match_stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The active row set and the usage read, with last_viewed_at
-- ─────────────────────────────────────────────────────────────────────────────
-- Bodies as in 20260925023004_match_video_attachment_cap; the only change is
-- the extra column.

drop function if exists public.match_video_workspace_usage(uuid, text, uuid);
drop function if exists public.match_video_workspace_active_attachments(text, uuid);

create function public.match_video_workspace_active_attachments(
  p_workspace_kind text,
  p_workspace_id   uuid
)
returns table (
  attachment_id       uuid,
  match_id            uuid,
  uploaded_by         uuid,
  verified_size_bytes bigint,
  activated_at        timestamptz,
  last_viewed_at      timestamptz,
  player1_name        text,
  player2_name        text,
  match_date          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.match_id, a.uploaded_by, a.verified_size_bytes, a.activated_at,
         a.last_viewed_at, m.player1_name, m.player2_name, m.date
    from public.matches m
    join public.match_video_attachments a
      on a.match_id = m.id and a.state = 'active'
   where p_workspace_kind = 'team'
     and m.program_id = p_workspace_id
  union all
  select a.id, a.match_id, a.uploaded_by, a.verified_size_bytes, a.activated_at,
         a.last_viewed_at, m.player1_name, m.player2_name, m.date
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

create function public.match_video_workspace_usage(
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
  last_viewed_at      timestamptz,
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
           w.activated_at, w.last_viewed_at, w.player1_name, w.player2_name,
           w.match_date
      from public.match_video_workspace_active_attachments(p_workspace_kind, p_workspace_id) w
     order by w.activated_at desc, w.attachment_id;
end;
$$;

revoke all on function public.match_video_workspace_usage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.match_video_workspace_usage(uuid, text, uuid) to service_role;

comment on function public.match_video_workspace_usage(uuid, text, uuid) is
  'Service-only. One row per ACTIVE attachment in the workspace (the same set the cap counts): attachment id, match id, uploaded_by, verified_size_bytes, activated_at, last_viewed_at, and the match''s players and date. Refuses a caller who is not a member of that workspace (workspace_mismatch).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Assertions — the privilege boundary, the columns, the helper still hidden
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.match_video_record_view(uuid)',
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

  v_fn := 'public.match_video_workspace_active_attachments(text, uuid)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: internal helper is executable by an API role', v_fn;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and table_name = 'match_video_attachments'
         and column_name in ('last_viewed_at', 'expiry_warned_at')
         and data_type = 'timestamp with time zone') <> 2 then
    raise exception 'match_video_attachments: last_viewed_at / expiry_warned_at missing';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.oid = 'public.match_video_workspace_usage(uuid, text, uuid)'::regprocedure
       and 'last_viewed_at' = any (p.proargnames)
  ) then
    raise exception 'match_video_workspace_usage: last_viewed_at not returned';
  end if;
end
$$;
