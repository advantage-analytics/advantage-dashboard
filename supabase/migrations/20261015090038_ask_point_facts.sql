-- ask.point_plays: the serve, the return, the two plus ones and the last two
-- shots of every point, picked out ONCE per point instead of once per query.
--
-- Three of Ask's server-written answers — the serve +1 breakdown
-- (serve-plus-one.ts), the losing and winning plays (plays.ts) and the shot
-- pattern (pattern.ts) — each derived the same per-point facts at query time
-- with window functions over ask.shots joined to ask.points: which serve was
-- played, which stroke was the return, the stroke at shot 3 and at shot 4,
-- the last shot and the one before it. Shots are written in batches and
-- never updated in place, so those facts are static once a match is
-- processed (docs/ask-improvement-roadmap.md, 2.3).
--
-- This migration adds:
--
--   public.ask_point_facts   one row per public.points row, SEAT-relative
--                            (player 1 / player 2), keyed on point_id and
--                            cascading from it; nothing but its owner may
--                            read it.
--   rebuild_ask_point_facts  one set-based upsert that recomputes the rows
--                            of the given matches. Backfilled here for every
--                            match, then kept current by statement-level
--                            triggers on points and shots (insert, update,
--                            delete) over transition tables.
--   ask.point_plays          the fifth ask view: the facts with every seat
--                            turned to the viewer (i_served, i_won,
--                            return_mine, p1s_mine, p1r_mine, last_mine,
--                            prev_mine) and each referenced shot's direction
--                            read from ask.shots, which already resolves the
--                            hitter's hand for the viewer. ask_reader reads
--                            it and nobody else.
--
-- The three templates now read ask.point_plays with plain filters and
-- group-bys, and ask.shots only for what is still per shot (the losing
-- plays' miss rates; a pattern's Custom or Then shot). schema.ts and
-- sql-guard.ts know the view; the plan prompts (prompts.ts) still have to
-- name it.
--
-- Rules restated here, each with its twin named beside it in the body:
-- ask.points's court and per-set game numbering; the Video filter's serve
-- played, return, Hit 3 and Hit 4 (match-filters/model.ts,
-- serve-return-shots.ts); strokeOf()'s stroke priority; ask.match_stats's
-- rally bands. Two choices the per-query code could not make and this one
-- must, because a table holds ONE row per point:
--
--   - SwingVision stores a faulted first serve at the same shot number as
--     the second serve (1,743 points). A window over shot_number saw two
--     "last" shots on every double fault (206 points) and counted the point
--     twice in the losing and winning plays; here the second serve is the
--     later ball, so a double fault is one lost point and the ball before a
--     missed return is the serve that was in play.
--   - Whose serve a point is reads points.server_is_player1 (i_served), as
--     the Video filter does (model.ts: point.serverIsPlayer1), not the
--     serve shot's is_player1 as the old serve +1 did. The two differ on 20
--     points, none of them the measured viewer's.
--
-- Not unique on (match_id, point_number), against the brief: one match
-- stores 14 points all numbered 1 (see the index below).
--
-- Applied to the live database on 2026-10-15 as version 20261015090038
-- (`ask_point_facts`) through the Supabase MCP. The first attempt was
-- refused whole ("transition tables cannot be specified for triggers with
-- column lists"), so the two update triggers fire on any update; and the
-- view's direction lookup was recreated twice more in the same session:
-- five per-column joins became the one grouped subquery below (so a query
-- reading two directions builds ask.shots once, not twice), and
-- last_shot_number was appended (so the losing plays, which scan ask.shots
-- anyway, need not have the view scan it again). This file holds the final
-- definitions. VERIFIED: see the end of this file.

-- ── 1. The facts, one row per point ─────────────────────────────────────────

create table if not exists public.ask_point_facts (
  point_id           uuid primary key references public.points(id) on delete cascade,
  match_id           uuid not null,
  point_number       integer not null,
  set_number         integer not null,
  -- Counting from 1 within each set, as ask.points shows it (the table's
  -- game_number counts through the whole match).
  game_number        integer not null,
  server_is_player1  boolean not null,
  won_by_player1     boolean not null,
  -- ask.points.court's rule, restated in rebuild_ask_point_facts().
  court              text not null check (court in ('Deuce', 'Ad')),
  rally_length       integer,
  rally_band         text check (rally_band in ('short', 'medium', 'long')),
  result_type        text,
  has_shots          boolean not null,
  -- The serve that started the rally: the second serve when there was one,
  -- else the first (the Video filter's pickServeShotBy).
  serve_shot_number  integer,
  serve_type         text,
  serve_zone         text,
  serve_result       text,
  had_second_serve   boolean not null,
  -- The return: the first stroke (not a serve, not a feed), and only when
  -- one stroke alone holds that shot number.
  return_shot_number integer,
  return_is_player1  boolean,
  return_shot_type   text,
  return_stroke      text,
  return_zone        text,
  return_result      text,
  -- The server's plus one: the stroke at shot 3 (the Video filter's Hit 3).
  p1s_shot_number    integer,
  p1s_is_player1     boolean,
  p1s_shot_type      text,
  p1s_stroke         text,
  p1s_result         text,
  -- The returner's plus one: the stroke at shot 4 (Hit 4).
  p1r_shot_number    integer,
  p1r_is_player1     boolean,
  p1r_shot_type      text,
  p1r_stroke         text,
  p1r_result         text,
  -- The last shot of the point and the one before it.
  last_shot_number   integer,
  last_is_player1    boolean,
  last_shot_type     text,
  last_stroke        text,
  last_result        text,
  prev_shot_number   integer,
  prev_is_player1    boolean,
  prev_shot_type     text
);

-- Not unique: match 0cb1637b-1b12-4b1c-8155-59732e322c4c (a June 2026
-- SwingVision test import) stores 14 points all numbered 1. A unique
-- constraint here would have failed the backfill and, after it, made every
-- write to that match fail inside the trigger. point_id is the key; this
-- index serves the view's scope filter and its joins.
create index if not exists ask_point_facts_match_point
  on public.ask_point_facts (match_id, point_number);

comment on table public.ask_point_facts is
  'One row per public.points row with the shots that matter already picked out, SEAT-relative (player 1 / player 2, never the viewer). Maintained by triggers on points and shots through rebuild_ask_point_facts(); read only through ask.point_plays, which turns every seat to the viewer.';

-- No API role can read it: the view is the only reader, and it reads as its
-- owner. Supabase's default privileges in public would have handed
-- authenticated and service_role every right; taken back here. RLS is on
-- with no policy so the security advisor has nothing to say about a public
-- table without it — the owner (postgres) bypasses RLS, so the view and the
-- rebuild are unaffected.
revoke all on public.ask_point_facts from public, anon, authenticated, service_role;
alter table public.ask_point_facts enable row level security;

-- ── 2. The rules, as functions ──────────────────────────────────────────────

-- strokeOf() (match-filters/model.ts): overhead or smash first, then volley,
-- then forehand, then backhand, so "Forehand Volley" is a volley.
create or replace function ask_private.stroke_of(label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when l like '%overhead%' or l like '%smash%' then 'Overhead'
    when l like '%volley%' then 'Volley'
    when l like '%forehand%' then 'Forehand'
    when l like '%backhand%' then 'Backhand'
  end
  from (select lower(coalesce(label, '')) as l) as t;
$$;

-- The return's stroke, by the Video filter's Return › Stroke rule: the
-- label containing forehand or backhand.
create or replace function ask_private.return_stroke_of(label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when l like '%forehand%' then 'Forehand'
    when l like '%backhand%' then 'Backhand'
  end
  from (select lower(coalesce(label, '')) as l) as t;
$$;

-- Recompute every row for the given matches: one set-based upsert. Written
-- as an upsert rather than delete-then-insert so that two transactions
-- rebuilding the same match (a resubmitted video and a label publish, say)
-- serialise on the row instead of one failing with a duplicate key; a row
-- whose point is gone is removed by the foreign key's cascade, so nothing
-- is ever stale.
create or replace function public.rebuild_ask_point_facts(match_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  if match_ids is null or cardinality(match_ids) = 0 then
    return 0;
  end if;

  insert into public.ask_point_facts as f (
    point_id, match_id, point_number, set_number, game_number,
    server_is_player1, won_by_player1, court, rally_length, rally_band,
    result_type, has_shots,
    serve_shot_number, serve_type, serve_zone, serve_result, had_second_serve,
    return_shot_number, return_is_player1, return_shot_type, return_stroke,
    return_zone, return_result,
    p1s_shot_number, p1s_is_player1, p1s_shot_type, p1s_stroke, p1s_result,
    p1r_shot_number, p1r_is_player1, p1r_shot_type, p1r_stroke, p1r_result,
    last_shot_number, last_is_player1, last_shot_type, last_stroke, last_result,
    prev_shot_number, prev_is_player1, prev_shot_type
  )
  with pts as (
    -- ask.points's game renumbering and court rule, over the whole match.
    select p.id as point_id,
           p.match_id,
           p.point_number,
           p.set_number,
           p.game_number
             - min(p.game_number) over (partition by p.match_id, p.set_number)
             + 1 as game_number,
           p.server_is_player1,
           p.won_by_player1,
           p.rally_length,
           p.result_type,
           bool_or(coalesce(p.point_score, '0-0') <> '0-0')
             over (partition by p.match_id) as has_point_score,
           row_number() over (
             partition by p.match_id, p.set_number, p.game_number
             order by p.point_number
           ) - 1 as index_in_game,
           case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 1)))
             when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
           end as rung_a,
           case upper(btrim(split_part(coalesce(p.point_score, ''), '-', 2)))
             when '0' then 0 when '15' then 1 when '30' then 2 when '40' then 3 when 'AD' then 4
           end as rung_b
      from public.points p
     where p.match_id = any(match_ids)
  ),
  raw as (
    select s.point_id,
           s.id,
           s.shot_number,
           s.is_player1,
           s.shot_type,
           s.zone,
           s.result,
           coalesce(s.shot_type, '') not in ('First Serve', 'Second Serve', 'Feed') as is_stroke,
           bool_or(s.shot_type = 'Second Serve') over (partition by s.point_id) as had_second
      from public.shots s
      join pts on pts.point_id = s.point_id
  ),
  numbered as (
    select raw.*,
           -- SwingVision stores a faulted first serve at the SAME number as
           -- the second serve (1,743 points today). Within a shot number
           -- that fault sorts first, so the second serve is the later ball
           -- — the last shot of a double fault, the shot before a missed
           -- return — and never the first serve.
           case when raw.shot_type = 'First Serve' and raw.had_second then 0 else 1 end as tie,
           min(case when raw.is_stroke then raw.shot_number end)
             over (partition by raw.point_id) as first_stroke,
           count(*) filter (where raw.is_stroke)
             over (partition by raw.point_id, raw.shot_number) as strokes_here
      from raw
  ),
  roled as (
    select n.*,
           n.shot_type = 'Second Serve'
             or (n.shot_type = 'First Serve' and not n.had_second) as is_played_serve,
           n.is_stroke and n.shot_number = n.first_stroke and n.strokes_here = 1 as is_return,
           n.is_stroke and n.shot_number = 3 as is_serve_plus_one,
           n.is_stroke and n.shot_number = 4 as is_return_plus_one,
           row_number() over (
             partition by n.point_id
             order by n.shot_number desc, n.tie desc, n.id desc
           ) as from_end
      from numbered n
  ),
  per_point as (
    select r.point_id,
           bool_or(r.shot_type = 'Second Serve') as had_second_serve,
           -- The played serve. Four video points store a First Serve at 0
           -- and again at 1 with no second serve; the one at the higher
           -- number is the rally's.
           (array_agg(r.shot_number order by r.shot_number desc, r.id desc) filter (where r.is_played_serve))[1] as serve_shot_number,
           (array_agg(r.shot_type   order by r.shot_number desc, r.id desc) filter (where r.is_played_serve))[1] as serve_type,
           (array_agg(r.zone        order by r.shot_number desc, r.id desc) filter (where r.is_played_serve))[1] as serve_zone,
           (array_agg(r.result      order by r.shot_number desc, r.id desc) filter (where r.is_played_serve))[1] as serve_result,
           -- The return is one row by construction (strokes_here = 1).
           min(r.shot_number) filter (where r.is_return) as return_shot_number,
           bool_or(r.is_player1) filter (where r.is_return) as return_is_player1,
           min(r.shot_type) filter (where r.is_return) as return_shot_type,
           min(r.zone) filter (where r.is_return) as return_zone,
           min(r.result) filter (where r.is_return) as return_result,
           -- The two plus ones: one row each today; the lowest id if ever two.
           (array_agg(r.shot_number order by r.id) filter (where r.is_serve_plus_one))[1] as p1s_shot_number,
           (array_agg(r.is_player1  order by r.id) filter (where r.is_serve_plus_one))[1] as p1s_is_player1,
           (array_agg(r.shot_type   order by r.id) filter (where r.is_serve_plus_one))[1] as p1s_shot_type,
           (array_agg(r.result      order by r.id) filter (where r.is_serve_plus_one))[1] as p1s_result,
           (array_agg(r.shot_number order by r.id) filter (where r.is_return_plus_one))[1] as p1r_shot_number,
           (array_agg(r.is_player1  order by r.id) filter (where r.is_return_plus_one))[1] as p1r_is_player1,
           (array_agg(r.shot_type   order by r.id) filter (where r.is_return_plus_one))[1] as p1r_shot_type,
           (array_agg(r.result      order by r.id) filter (where r.is_return_plus_one))[1] as p1r_result,
           -- The last shot and the one before it, by from_end.
           min(r.shot_number) filter (where r.from_end = 1) as last_shot_number,
           bool_or(r.is_player1) filter (where r.from_end = 1) as last_is_player1,
           min(r.shot_type) filter (where r.from_end = 1) as last_shot_type,
           min(r.result) filter (where r.from_end = 1) as last_result,
           min(r.shot_number) filter (where r.from_end = 2) as prev_shot_number,
           bool_or(r.is_player1) filter (where r.from_end = 2) as prev_is_player1,
           min(r.shot_type) filter (where r.from_end = 2) as prev_shot_type
      from roled r
     group by r.point_id
  )
  select p.point_id,
         p.match_id,
         p.point_number,
         p.set_number,
         p.game_number,
         p.server_is_player1,
         p.won_by_player1,
         case
           when p.has_point_score and p.rung_a is not null and p.rung_b is not null
             then case when (p.rung_a + p.rung_b) % 2 = 0 then 'Deuce' else 'Ad' end
           else case when p.index_in_game % 2 = 0 then 'Deuce' else 'Ad' end
         end as court,
         p.rally_length,
         case
           when p.rally_length between 1 and 4 then 'short'
           when p.rally_length between 5 and 9 then 'medium'
           when p.rally_length >= 10 then 'long'
         end as rally_band,
         p.result_type,
         pp.point_id is not null as has_shots,
         pp.serve_shot_number,
         pp.serve_type,
         pp.serve_zone,
         pp.serve_result,
         coalesce(pp.had_second_serve, false),
         pp.return_shot_number,
         pp.return_is_player1,
         pp.return_shot_type,
         ask_private.return_stroke_of(pp.return_shot_type),
         pp.return_zone,
         pp.return_result,
         pp.p1s_shot_number,
         pp.p1s_is_player1,
         pp.p1s_shot_type,
         ask_private.stroke_of(pp.p1s_shot_type),
         pp.p1s_result,
         pp.p1r_shot_number,
         pp.p1r_is_player1,
         pp.p1r_shot_type,
         ask_private.stroke_of(pp.p1r_shot_type),
         pp.p1r_result,
         pp.last_shot_number,
         pp.last_is_player1,
         pp.last_shot_type,
         ask_private.stroke_of(pp.last_shot_type),
         pp.last_result,
         pp.prev_shot_number,
         pp.prev_is_player1,
         pp.prev_shot_type
    from pts p
    left join per_point pp on pp.point_id = p.point_id
  on conflict (point_id) do update set
    match_id           = excluded.match_id,
    point_number       = excluded.point_number,
    set_number         = excluded.set_number,
    game_number        = excluded.game_number,
    server_is_player1  = excluded.server_is_player1,
    won_by_player1     = excluded.won_by_player1,
    court              = excluded.court,
    rally_length       = excluded.rally_length,
    rally_band         = excluded.rally_band,
    result_type        = excluded.result_type,
    has_shots          = excluded.has_shots,
    serve_shot_number  = excluded.serve_shot_number,
    serve_type         = excluded.serve_type,
    serve_zone         = excluded.serve_zone,
    serve_result       = excluded.serve_result,
    had_second_serve   = excluded.had_second_serve,
    return_shot_number = excluded.return_shot_number,
    return_is_player1  = excluded.return_is_player1,
    return_shot_type   = excluded.return_shot_type,
    return_stroke      = excluded.return_stroke,
    return_zone        = excluded.return_zone,
    return_result      = excluded.return_result,
    p1s_shot_number    = excluded.p1s_shot_number,
    p1s_is_player1     = excluded.p1s_is_player1,
    p1s_shot_type      = excluded.p1s_shot_type,
    p1s_stroke         = excluded.p1s_stroke,
    p1s_result         = excluded.p1s_result,
    p1r_shot_number    = excluded.p1r_shot_number,
    p1r_is_player1     = excluded.p1r_is_player1,
    p1r_shot_type      = excluded.p1r_shot_type,
    p1r_stroke         = excluded.p1r_stroke,
    p1r_result         = excluded.p1r_result,
    last_shot_number   = excluded.last_shot_number,
    last_is_player1    = excluded.last_is_player1,
    last_shot_type     = excluded.last_shot_type,
    last_stroke        = excluded.last_stroke,
    last_result        = excluded.last_result,
    prev_shot_number   = excluded.prev_shot_number,
    prev_is_player1    = excluded.prev_is_player1,
    prev_shot_type     = excluded.prev_shot_type;

  get diagnostics written = row_count;
  return written;
end
$$;

comment on function public.rebuild_ask_point_facts(uuid[]) is
  'Recompute public.ask_point_facts for the given matches in one set-based upsert; returns the rows written. Fired by the statement triggers on points and shots; callable by service_role for a manual rebuild.';

-- public's default privileges hand EXECUTE to authenticated and
-- service_role; a signed-in user has no business rebuilding anything.
revoke all on function public.rebuild_ask_point_facts(uuid[]) from public, anon, authenticated;
grant execute on function public.rebuild_ask_point_facts(uuid[]) to service_role;

-- ── 3. Maintenance: statement triggers with transition tables ───────────────
--
-- Rows in points and shots are inserted and deleted in batches and never
-- updated in place (import_match_rows, persistTranscript, the label publish
-- and restore paths), so each trigger fires once per statement and rebuilds
-- the matches that statement touched. An UPDATE is covered too: the one-off
-- data repairs this repo has shipped (swingvision_shot_zone_own_contact,
-- flip_rudy_quan_forehand_backhand) were UPDATEs, and would otherwise leave
-- the facts behind the shots. Not UPDATE OF a column list — Postgres allows
-- no transition table on those — so any update statement on either table
-- rebuilds its matches, one small upsert each. Both
-- functions are SECURITY DEFINER so that whoever writes points or shots —
-- service_role, or a user through RLS — can maintain a table nobody but the
-- owner may touch. EXECUTE on a trigger function is checked at CREATE
-- TRIGGER, not at fire time, so they need no grants.

create or replace function ask_private.points_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rebuild_ask_point_facts(
    (select array_agg(distinct c.match_id) from changed c));
  return null;
end
$$;

create or replace function ask_private.shots_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A cascaded delete (the point is gone) finds no match here; the points
  -- trigger has already rebuilt that match.
  perform public.rebuild_ask_point_facts(
    (select array_agg(distinct p.match_id)
       from changed c
       join public.points p on p.id = c.point_id));
  return null;
end
$$;

create or replace trigger ask_point_facts_points_insert
  after insert on public.points
  referencing new table as changed
  for each statement execute function ask_private.points_changed();

create or replace trigger ask_point_facts_points_delete
  after delete on public.points
  referencing old table as changed
  for each statement execute function ask_private.points_changed();

create or replace trigger ask_point_facts_points_update
  after update on public.points
  referencing new table as changed
  for each statement execute function ask_private.points_changed();

create or replace trigger ask_point_facts_shots_insert
  after insert on public.shots
  referencing new table as changed
  for each statement execute function ask_private.shots_changed();

create or replace trigger ask_point_facts_shots_delete
  after delete on public.shots
  referencing old table as changed
  for each statement execute function ask_private.shots_changed();

create or replace trigger ask_point_facts_shots_update
  after update on public.shots
  referencing new table as changed
  for each statement execute function ask_private.shots_changed();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────

do $$
declare
  written integer;
  expected integer;
begin
  written := public.rebuild_ask_point_facts(array(select id from public.matches));
  select count(*) into expected from public.points;
  if written <> expected then
    raise exception 'ask_point_facts backfill wrote % rows for % points', written, expected;
  end if;
end
$$;

-- ── 5. The view: every seat turned to the viewer ────────────────────────────

create or replace view ask.point_plays as
with mine as (
  select match_id, me_is_player1
    from ask.my_matches()
   where me_is_player1 is not null
),
-- Where each referenced shot went, read from ask.shots so that direction
-- (inside out and inside in need the hitter's hand) is computed in one
-- place. One row per point, so the join below can match at most one row
-- and the planner drops it for a query that reads no *_direction column
-- (NOT MATERIALIZED; grouped on the join key); a query that reads one or
-- all five builds ask.shots exactly once. Each shot is matched on its
-- number, its label and its hitter: SwingVision stores both serves of a
-- point at one number, and a handful of video points stack several strokes
-- at 0, so the number alone is not a key; min() settles the thirteen
-- points that carry the same label by the same hitter twice at one number.
dirs as not materialized (
  select f.point_id,
         min(s.direction) filter (where s.shot_number = f.return_shot_number
           and coalesce(s.shot_type, '') = coalesce(f.return_shot_type, '')
           and s.mine = (f.return_is_player1 = mm.me_is_player1)) as return_direction,
         min(s.direction) filter (where s.shot_number = f.p1s_shot_number
           and coalesce(s.shot_type, '') = coalesce(f.p1s_shot_type, '')
           and s.mine = (f.p1s_is_player1 = mm.me_is_player1)) as p1s_direction,
         min(s.direction) filter (where s.shot_number = f.p1r_shot_number
           and coalesce(s.shot_type, '') = coalesce(f.p1r_shot_type, '')
           and s.mine = (f.p1r_is_player1 = mm.me_is_player1)) as p1r_direction,
         min(s.direction) filter (where s.shot_number = f.last_shot_number
           and coalesce(s.shot_type, '') = coalesce(f.last_shot_type, '')
           and s.mine = (f.last_is_player1 = mm.me_is_player1)) as last_direction,
         min(s.direction) filter (where s.shot_number = f.prev_shot_number
           and coalesce(s.shot_type, '') = coalesce(f.prev_shot_type, '')
           and s.mine = (f.prev_is_player1 = mm.me_is_player1)) as prev_direction
    from public.ask_point_facts f
    join ask.my_matches() mm on mm.match_id = f.match_id
    join ask.shots s on s.match_id = f.match_id and s.point_number = f.point_number
   group by f.point_id
)
select f.match_id,
       f.set_number,
       f.game_number,
       f.point_number,
       f.server_is_player1 = mine.me_is_player1 as i_served,
       f.won_by_player1 = mine.me_is_player1 as i_won,
       f.court,
       f.rally_length,
       f.rally_band,
       f.result_type,
       f.has_shots,
       f.serve_type,
       f.serve_zone,
       f.serve_result,
       f.had_second_serve,
       f.return_is_player1 = mine.me_is_player1 as return_mine,
       f.return_stroke,
       f.return_zone,
       d.return_direction,
       f.return_result,
       f.p1s_is_player1 = mine.me_is_player1 as p1s_mine,
       f.p1s_stroke,
       d.p1s_direction,
       f.p1s_result,
       f.p1r_is_player1 = mine.me_is_player1 as p1r_mine,
       f.p1r_stroke,
       d.p1r_direction,
       f.p1r_result,
       f.last_is_player1 = mine.me_is_player1 as last_mine,
       f.last_shot_type,
       f.last_stroke,
       d.last_direction,
       f.last_result,
       f.prev_is_player1 = mine.me_is_player1 as prev_mine,
       f.prev_shot_type,
       d.prev_direction,
       -- Last, so that a query which has already scanned ask.shots (the
       -- losing plays, for its miss rates) can take the last shot's
       -- direction from its own pass rather than have this view build
       -- ask.shots a second time.
       f.last_shot_number
  from public.ask_point_facts f
  join mine on mine.match_id = f.match_id
  left join dirs d on d.point_id = f.point_id;

comment on view ask.point_plays is
  'Every point of the viewer''s own personal matches, one row each, with the shots that matter already picked out — the serve, the return, each side''s plus one (the third and fourth shots) and the last two shots — and every hitter turned to the viewer (i_served, i_won, return_mine, p1s_mine, p1r_mine, last_mine, prev_mine). Join to ask.points on match_id and point_number for the pressure flags.';
comment on column ask.point_plays.match_id is 'The match this point belongs to; join to ask.matches.match_id.';
comment on column ask.point_plays.set_number is 'Which set the point was played in, counting from 1.';
comment on column ask.point_plays.game_number is 'Which game of that set the point was played in, counting from 1 within each set.';
comment on column ask.point_plays.point_number is 'The point''s position in the whole match, counting from 1; joins to ask.points.point_number and ask.shots.point_number within the same match_id.';
comment on column ask.point_plays.i_served is 'True when the viewer served this point, false when the opponent did.';
comment on column ask.point_plays.i_won is 'True when the viewer won this point, false when the opponent did.';
comment on column ask.point_plays.court is 'The service court the point was played from: Deuce or Ad, the same as ask.points.court.';
comment on column ask.point_plays.rally_length is 'Number of shots in the point, the serve included; null when not recorded.';
comment on column ask.point_plays.rally_band is 'The rally''s length band, as ask.match_stats counts them: short (1–4 shots), medium (5–9) or long (10 or more); null when the length is not recorded.';
comment on column ask.point_plays.result_type is 'How the point ended, as ask.points.result_type: Ace, Double Fault, Forehand Winner, Backhand Unforced Error and the like, naming the stroke that ended the point by whoever hit it; null when unknown.';
comment on column ask.point_plays.has_shots is 'True when the point has shot-by-shot data (rows in ask.shots). When false, every serve, return, plus-one and last-shot column of this row is null: the point was not recorded shot by shot, it did not have no shots.';
comment on column ask.point_plays.serve_type is 'Which serve started the rally: First Serve, or Second Serve after a fault; null when no serve is recorded.';
comment on column ask.point_plays.serve_zone is 'Where that serve was aimed: Wide, Body or T; null when not recorded.';
comment on column ask.point_plays.serve_result is 'Whether that serve landed: In, Out or Net. A Second Serve that is Out or Net is a double fault; null when not recorded.';
comment on column ask.point_plays.had_second_serve is 'True when the point needed a second serve (the first serve was a fault), false otherwise.';
comment on column ask.point_plays.return_mine is 'True when the viewer hit the return (the first stroke after the serve, in or out), false when the opponent did; null when the point ended on the serve — an ace, a service winner, a double fault — or no return can be told apart.';
comment on column ask.point_plays.return_stroke is 'The return''s stroke: Forehand or Backhand; null when there was no return or its stroke is not one of those.';
comment on column ask.point_plays.return_zone is 'Where the return was aimed, as stored: Crosscourt, Down the Line or Middle; null when not recorded.';
comment on column ask.point_plays.return_direction is 'Where the return went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.';
comment on column ask.point_plays.return_result is 'Whether the return landed: In, Out or Net; null when not recorded.';
comment on column ask.point_plays.p1s_mine is 'The serve plus one is the third shot of the point, the server''s first ball after the return. True when the viewer hit it, false when the opponent did; null when the point ended before it.';
comment on column ask.point_plays.p1s_stroke is 'The serve plus one''s stroke: Forehand, Backhand, Volley or Overhead; null when the point ended before it or the stroke is unknown.';
comment on column ask.point_plays.p1s_direction is 'Where the serve plus one went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.';
comment on column ask.point_plays.p1s_result is 'Whether the serve plus one landed: In, Out or Net; null when not recorded.';
comment on column ask.point_plays.p1r_mine is 'The return plus one is the fourth shot of the point, the returner''s first ball after the serve plus one. True when the viewer hit it, false when the opponent did; null when the point ended before it.';
comment on column ask.point_plays.p1r_stroke is 'The return plus one''s stroke: Forehand, Backhand, Volley or Overhead; null when the point ended before it or the stroke is unknown.';
comment on column ask.point_plays.p1r_direction is 'Where the return plus one went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.';
comment on column ask.point_plays.p1r_result is 'Whether the return plus one landed: In, Out or Net; null when not recorded.';
comment on column ask.point_plays.last_mine is 'True when the viewer hit the last shot of the point, false when the opponent did; null when the point has no shots.';
comment on column ask.point_plays.last_shot_type is 'The last shot''s stroke as stored, as ask.shots.shot_type: First Serve, Second Serve, Forehand, Backhand, Volley, Overhead or a rarer label; null when unknown.';
comment on column ask.point_plays.last_stroke is 'The last shot''s stroke, grouped: Forehand, Backhand, Volley or Overhead; null when it was a serve or its label is unknown.';
comment on column ask.point_plays.last_direction is 'Where the last shot went, as ask.shots.direction names it: for a serve Wide, Body or T; otherwise Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.';
comment on column ask.point_plays.last_result is 'Whether the last shot landed: In (a winner, or a ball the other side could not return) or Out or Net (an error by whoever hit it); null when not recorded.';
comment on column ask.point_plays.prev_mine is 'True when the viewer hit the shot before the last, false when the opponent did; null when the point had fewer than two shots.';
comment on column ask.point_plays.prev_shot_type is 'The stroke of the shot before the last, as stored (ask.shots.shot_type); null when there was none or it is unknown.';
comment on column ask.point_plays.prev_direction is 'Where the shot before the last went, as ask.shots.direction names it; null when not recorded. When last_mine is false and last_result is Out or Net, this is the viewer''s ball that drew the opponent''s error.';
comment on column ask.point_plays.last_shot_number is 'The last shot''s number within the point, as ask.shots.shot_number: join ask.shots on match_id, point_number and shot_number for anything else about that shot, such as its speed or spin; null when the point has no shots.';

-- The reader and nobody else, as the other four views.
revoke all on ask.point_plays from public, anon, authenticated;
grant select on ask.point_plays to ask_reader;

-- ── 6. Assertions ───────────────────────────────────────────────────────────

do $$
declare
  n_facts integer;
  n_points integer;
  n_comments integer;
  n_columns integer;
  r text;
begin
  select count(*) into n_facts from public.ask_point_facts;
  select count(*) into n_points from public.points;
  if n_facts <> n_points then
    raise exception 'ask_point_facts has % rows for % points', n_facts, n_points;
  end if;

  if not has_table_privilege('ask_reader', 'ask.point_plays', 'select') then
    raise exception 'ask_reader cannot read ask.point_plays';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'ask.point_plays', 'select') then
      raise exception '% can read ask.point_plays', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role', 'ask_reader'] loop
    if has_table_privilege(r, 'public.ask_point_facts', 'select')
       or has_table_privilege(r, 'public.ask_point_facts', 'insert')
       or has_table_privilege(r, 'public.ask_point_facts', 'update')
       or has_table_privilege(r, 'public.ask_point_facts', 'delete') then
      raise exception '% holds a privilege on public.ask_point_facts', r;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.rebuild_ask_point_facts(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.rebuild_ask_point_facts(uuid[])', 'execute') then
    raise exception 'a client role may execute rebuild_ask_point_facts';
  end if;

  select count(*) into n_columns
    from information_schema.columns
   where table_schema = 'ask' and table_name = 'point_plays';
  select count(*) into n_comments
    from pg_description d
    join pg_class c on c.oid = d.objoid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'ask' and c.relname = 'point_plays' and d.objsubid > 0;
  if n_columns <> 37 or n_comments <> 37 then
    raise exception 'ask.point_plays has % columns and % comments, expected 37', n_columns, n_comments;
  end if;

  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname in ('points', 'shots') and t.tgname like 'ask_point_facts_%') <> 6 then
    raise exception 'the six ask_point_facts triggers are not all present';
  end if;
end
$$;

-- VERIFIED on the live database, 2026-10-15, after the migration ran, as
-- postgres unless said otherwise:
--
-- Backfill. rebuild_ask_point_facts(every match) wrote 7,518 rows for 7,518
-- points in 93 matches (69 with points); 7,433 rows have shots, 7,341 a
-- played serve (2,695 of them a second serve), 6,840 a return, 5,439 a serve
-- plus one, 4,208 a return plus one; 244 points end on a double fault. Every
-- set's game_number starts at 1.
--
-- Triggers. In one rolled-back transaction: inserting a point into a test
-- match raised its facts count 14 → 15 (has_shots false); inserting its
-- three shots (First Serve Wide In; Forehand Crosscourt In by the other
-- side; Backhand Down the Line Net) rewrote the row as has_shots true, court
-- Ad (from 30-15), band short, serve First Serve/Wide/In, return 2 by the
-- opponent/Forehand/Crosscourt, plus one 3/Backhand/Net, last 3/Backhand/
-- Net, previous 2/Forehand; deleting the point took the row with it (14).
-- Read: import_match_rows inserts points then shots in one transaction (two
-- firings); persistTranscript deletes derived points (the cascade removes
-- the facts, the points trigger rebuilds what remains), inserts points,
-- inserts shots (three firings); the label publish and restore paths insert
-- in chunks of 200 (one firing per chunk, each a full rebuild of the match,
-- milliseconds). Not covered: TRUNCATE, and a session that disables
-- triggers — neither has a path.
--
-- Timing, the viewer with the most personal matches (18 of 93; 2,310
-- points, 12,860 shots), warm cache, EXPLAIN ANALYZE execution time of the
-- exact statement ask.exec_query runs:
--
--   serve +1 breakdown (serve, mine)    146.3 ms  →   96.9 ms
--   losing plays (mine)                 108.6 ms  →   96.9 ms
--
-- Where the time goes now: a query that reads no *_direction column never
-- touches ask.shots (the planner drops the join: a count of points won by
-- serve zone shows no shots scan at all, 31 ms); one that reads any
-- direction builds ask.shots once, and that build (about 75 ms of each
-- figure above: the placed/inferred CTEs that resolve the hitter's hand per
-- viewer over every forehand's contact half) is the remaining cost. The
-- losing plays were 152 ms when they read last_direction from the view on
-- top of their own ask.shots pass — two builds — which is why
-- last_shot_number is exposed and they take the direction from their own
-- pass. Precomputing each referenced shot's half and the inferred hand per
-- (match, seat) would take every figure above to a few milliseconds; left
-- for a later migration because it would restate ask.shots's direction
-- rule in a second place.
--
-- Parity, the same viewer, each pair run through public.ask_run_query and
-- compared as a sorted set of rows: five serve +1 shapes (serve/mine/any,
-- serve/mine/second by side, serve/opponent/any on deuce, return/mine/first
-- by side, return/opponent/second on ad) identical, 14 rows each; five
-- pattern shapes (serve wide then down the line within three, forehand
-- crosscourt then down the line, return only, return plus one, ad-court
-- server only) identical, 18 rows each. The losing and winning plays differ
-- as designed: points lost 1,154 → 1,102 (mine) and 1,259 → 1,208
-- (opponent) — the 52 and 51 double faults the old window counted twice —
-- and the serve credited with drawing a missed return is the second serve
-- where there was one (a "Second Serve T, 15 errors drawn" row the old
-- query spread over First Serve rows). 25 rows and 13 rows either way.
--
-- The view against ask.points, same viewer: 2,310 rows each, 0 rows where
-- i_served, i_won, court, set_number, game_number, rally_length or
-- result_type differ; has_shots agrees with ask.shots on every row; every
-- p1s_direction, last_direction and return_direction equals the direction
-- of the shot it names in ask.shots.
--
-- Privileges, by the assertions above: ask_reader SELECT on ask.point_plays
-- and nothing on public.ask_point_facts; anon and authenticated nothing on
-- either; rebuild_ask_point_facts executable by service_role only among the
-- client roles. 37 columns, 37 comments.
--
-- Not run: tests/ask-views-parity.spec.ts (its new ask.point_plays case) is
-- a live-DB spec that skips against the production project.
