-- process-match: points, shots and match_stats land in one transaction, or not
-- at all (T18 — intent 1, the function layer, merged with intent 2: the
-- pr-check low findings at supabase/functions/process-match/index.ts:226 and
-- the non-transactional inserts at ~361/377/394 — plus T9's follow-up 1,
-- "a guard, not a lock").
--
-- Until now the edge function wrote a match in four statements from the Deno
-- runtime: insert `points` (returning ids), insert `shots`, rpc
-- `calculate_match_stats`, rpc `backfill_returns_in_and_net_points`. Two
-- failure shapes followed:
--
--   1. A run that died after the points insert left points with no shots and
--      no `match_stats` row, and every later invoke answered 409 from the T9
--      pre-check (`points` has a row) — a stuck match with no way back short
--      of hand-run SQL.
--   2. Two concurrent invokes both passed the `.limit(1)` pre-check (a
--      check-then-act; T17's `match_files_one_per_match` closes the same race
--      one layer up, at /api/upload) and both inserted, doubling every
--      statistic.
--
-- `import_match_rows` runs all four inside one function call — one
-- transaction — under a per-match, transaction-scoped advisory lock. In order:
--
--   perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0))
--     precedent 20260925023004_match_video_attachment_cap.sql:132. The second
--     of two concurrent runs waits here until the first commits or rolls back;
--     under READ COMMITTED the fresh statement after the lock sees every row
--     the previous holder committed.
--   raise unique_violation (SQLSTATE 23505) if `points` already has a row for
--     the match — the same SQLSTATE `match_files_one_per_match` produces, so
--     the edge function maps it, and only it, to the pre-check's 409.
--   insert `points`, then `shots`, through jsonb_to_recordset with EXPLICIT
--     column lists equal to the keys buildPointInserts / buildShotInserts emit
--     (plus `id` on points, which the edge function now assigns with
--     crypto.randomUUID() before the call so the shots can reference their
--     points before anything is written). Columns not named keep their
--     defaults exactly as they did under the PostgREST insert — points:
--     created_at, is_pressure_point, saved, derived, flags; shots: id,
--     created_at, derived, flags, bounce_video_time. Every row VALUE is what
--     the edge function computed; this function computes, remaps and keys
--     nothing, and `is_player1` still arrives from the Settings "Host Team"
--     cell.
--   perform calculate_match_stats(p_match_id) — CALLED, never edited or
--     redefined (docs/ui-revamp-guardrails.md §2). It upserts
--     ON CONFLICT (match_id, is_player1), unchanged.
--   perform backfill_returns_in_and_net_points(p_match_id) — likewise.
--
-- A failure anywhere rolls back the lot, so a match has points, shots AND
-- match_stats or none of them, and the T9 pre-check does not refuse the
-- re-run. The two `functions.invoke` calls that follow (generate-key-moments,
-- generate-insights) are HTTP and stay outside the transaction, in the edge
-- function.
--
-- search_path = 'public', not '' (the reasoning of 20260926231753, T7): both
-- callees run inside this function, and a nested call inherits the caller's
-- path. Live on 2026-09-26 (pg_proc, via the Supabase MCP) both are plain
-- INVOKER plpgsql with proconfig = {search_path=public} and schema-qualify
-- every table they read, so they pin their own resolution regardless;
-- 'public' keeps all three functions on one path, and this body qualifies
-- every reference of its own.
--
-- security INVOKER: it runs as the caller. EXECUTE is revoked from public,
-- anon and authenticated and granted to service_role only — the one caller is
-- process-match's service-role client, which bypasses RLS on points, shots and
-- match_stats exactly as its four separate statements did. A user token cannot
-- reach it, so no client-callable write path is added.
--
-- Column lists read live on 2026-09-26 (information_schema.columns) — points:
-- id uuid default gen_random_uuid(); match_id uuid; point_number, set_number,
-- game_number integer; set_score, game_score, point_score text;
-- server_is_player1, won_by_player1 boolean; is_break_point, is_set_point,
-- is_match_point boolean default false; rally_length integer; result_type
-- text; video_time, duration real. shots: point_id uuid; shot_number integer;
-- is_player1 boolean; shot_type, spin_type text; speed_mph, contact_x,
-- contact_y, landing_x, landing_y double precision; result text; video_time
-- real; zone text.
--
-- Statement time: service_role has no rolconfig and no pg_db_role_setting row
-- (read 2026-09-26), so nothing pins a statement_timeout on it; the ceiling it
-- can inherit is the PostgREST login role authenticator's statement_timeout=8s
-- and lock_timeout=8s. pg_stat_statements the same day: calculate_match_stats
-- through PostgREST mean 79–96 ms, max 1.07 s; as a direct SELECT mean 64 ms.
-- The two set-based inserts (a three-set match is ~300 points and ~1,000
-- shots) are milliseconds, so the whole call sits well inside 8 s.
-- lock_timeout bounds the advisory wait: a second run blocked behind a first
-- that somehow ran past 8 s fails with 55P03 — a 500 with nothing persisted —
-- and its retry lands on the 409.
--
-- Live on 2026-09-26, immediately before apply: 26 matches have points, 0 of
-- them lack a match_stats row (the stuck state this prevents), and
-- to_regprocedure('public.import_match_rows(uuid, jsonb, jsonb)') is null.
-- Applying this reads and writes no existing row.
--
-- Applied to the live database via the Supabase MCP as `import_match_rows`;
-- this file carries the version the live project recorded on apply.

create or replace function public.import_match_rows(
  p_match_id uuid,
  p_points   jsonb,
  p_shots    jsonb
)
returns void
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  -- Serialise runs for one match: the second waits for the first's
  -- transaction to end, then sees its rows in the check below.
  perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  if exists (select 1 from public.points where match_id = p_match_id) then
    raise exception 'match % already has points', p_match_id
      using errcode = 'unique_violation';
  end if;

  insert into public.points (
    id, match_id, point_number, set_number, game_number,
    set_score, game_score, point_score,
    server_is_player1, won_by_player1, rally_length, result_type,
    is_break_point, is_set_point, is_match_point,
    video_time, duration
  )
  select
    r.id, r.match_id, r.point_number, r.set_number, r.game_number,
    r.set_score, r.game_score, r.point_score,
    r.server_is_player1, r.won_by_player1, r.rally_length, r.result_type,
    r.is_break_point, r.is_set_point, r.is_match_point,
    r.video_time, r.duration
  from jsonb_to_recordset(coalesce(p_points, '[]'::jsonb)) as r(
    id                uuid,
    match_id          uuid,
    point_number      integer,
    set_number        integer,
    game_number       integer,
    set_score         text,
    game_score        text,
    point_score       text,
    server_is_player1 boolean,
    won_by_player1    boolean,
    rally_length      integer,
    result_type       text,
    is_break_point    boolean,
    is_set_point      boolean,
    is_match_point    boolean,
    video_time        real,
    duration          real
  );

  insert into public.shots (
    point_id, shot_number, is_player1, shot_type, spin_type,
    speed_mph, contact_x, contact_y, landing_x, landing_y,
    result, video_time, zone
  )
  select
    r.point_id, r.shot_number, r.is_player1, r.shot_type, r.spin_type,
    r.speed_mph, r.contact_x, r.contact_y, r.landing_x, r.landing_y,
    r.result, r.video_time, r.zone
  from jsonb_to_recordset(coalesce(p_shots, '[]'::jsonb)) as r(
    point_id    uuid,
    shot_number integer,
    is_player1  boolean,
    shot_type   text,
    spin_type   text,
    speed_mph   double precision,
    contact_x   double precision,
    contact_y   double precision,
    landing_x   double precision,
    landing_y   double precision,
    result      text,
    video_time  real,
    zone        text
  );

  perform public.calculate_match_stats(p_match_id);
  perform public.backfill_returns_in_and_net_points(p_match_id);
end;
$$;

revoke execute on function public.import_match_rows(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_match_rows(uuid, jsonb, jsonb) to service_role;

comment on function public.import_match_rows(uuid, jsonb, jsonb) is
  'Service-only (process-match). One transaction under the match''s advisory lock: refuses a match that already has points (unique_violation), inserts p_points and p_shots as given, then calculate_match_stats and backfill_returns_in_and_net_points. Nothing persists unless all of it does.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn  text := 'public.import_match_rows(uuid, jsonb, jsonb)';
  v_def text;
begin
  if to_regprocedure(v_fn) is null then
    raise exception '%: function is missing', v_fn;
  end if;

  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '%: anon may execute it', v_fn;
  end if;

  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '%: authenticated may execute it', v_fn;
  end if;

  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: service_role may not execute it', v_fn;
  end if;

  if exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.prosecdef
  ) then
    raise exception '%: must be security invoker', v_fn;
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.proconfig @> array['search_path=public']
  ) then
    raise exception '%: search_path is not pinned to public', v_fn;
  end if;

  select pg_get_functiondef(v_fn::regprocedure) into v_def;
  if v_def not like '%pg_advisory_xact_lock%' then
    raise exception '%: per-match advisory lock missing', v_fn;
  end if;
  if v_def not like '%calculate_match_stats%'
     or v_def not like '%backfill_returns_in_and_net_points%' then
    raise exception '%: does not call both stats functions', v_fn;
  end if;
end
$$;
