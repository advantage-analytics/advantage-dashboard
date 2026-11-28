-- Let points count as nothing.
--
-- A hand-labelled publish (src/lib/services/labels/apply.ts) now writes each
-- point the labeller marked `let_replayed` as a whole `points` row, strokes
-- and all, so the Video tab can show it: `flags` holds 'let_replayed',
-- `result_type` is 'Let', no pressure flag is set, `rally_length` is null and
-- `won_by_player1` (NOT NULL) is a placeholder, the server. It is no point,
-- so every reader that counts must leave it out:
--
-- 1. calculate_match_stats: every read of `public.points` (96 of them, and
--    6 `public.points.<col>` references) reads a let-free subquery instead.
--    Shots are only ever reached through a point (a join, or a correlated
--    `s.point_id = p.id`), so a let point's strokes go with it.
-- 2. key_moments: the same, on its three reads of `points`.
-- 3. backfill_returns_in_and_net_points: the same, on its six.
-- 4. rebuild_ask_point_facts: the `pts` CTE skips the flag, so no Ask fact
--    row (and so no `ask.point_plays` row) is ever built for one.
-- 5. ask.points and ask.shots: the views the Ask model writes SQL over skip
--    the flag.
-- 6. self_review_save: a player's self-review session is seeded from
--    `points`. A let point is seeded as a `let_replayed` label point, not as a
--    point won by the server, so a self-review republish writes it back as a
--    let point (apply.ts) instead of a point.
--
-- Not changed: self_review_state reads label rows only; match_video_source_
-- timing reads clip times (a let is real video); visible_point_ids /
-- point_in_my_workspace are access checks.
--
-- The repo's migrations run far behind the live database (AGENTS.md), so each
-- object is patched from its LIVE definition. Each patch asserts exactly how
-- many places it changed and refuses to run otherwise. No row carries the
-- flag until the publish change ships, so this is safe to apply ahead of it.
--
-- Dry-run 2026-11-27 (rolled back): with one point of match 1e7f4043 flagged
-- as a let, this SQL gave the same match_stats and key_moments as today's
-- functions with that point deleted.

do $$
declare
  def text := pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure);
  aliased constant text := $re$((?:FROM|JOIN)\s+)public\.points(\s+p\d*\M)$re$;
  bare constant text := $re$((?:FROM|JOIN)\s+)public\.points(?=\s+WHERE)$re$;
  qualified constant text := $re$public\.points\.([a-z_]+)$re$;
  counted constant text :=
    $sql$(SELECT * FROM ONLY public.points WHERE NOT (flags ? 'let_replayed'))$sql$;
  hits int;
begin
  hits := regexp_count(def, aliased);
  if hits <> 45 then
    raise exception 'calculate_match_stats: expected 45 aliased point reads, found %', hits;
  end if;
  hits := regexp_count(def, qualified);
  if hits <> 6 then
    raise exception 'calculate_match_stats: expected 6 public.points.<col> references, found %', hits;
  end if;
  hits := regexp_count(def, bare);
  if hits <> 51 then
    raise exception 'calculate_match_stats: expected 51 bare point reads, found %', hits;
  end if;
  def := regexp_replace(def, aliased, '\1' || counted || '\2', 'g');
  def := regexp_replace(def, qualified, 'points.\1', 'g');
  def := regexp_replace(def, bare, '\1' || counted || ' points', 'g');
  -- Every read of the table now goes through the let-free subquery.
  if regexp_count(def, 'public\.points') <> 96
     or regexp_count(def, 'ONLY public\.points') <> 96 then
    raise exception 'calculate_match_stats: a read of public.points was left unfiltered';
  end if;
  execute def;
end
$$;

do $$
declare
  def text := pg_get_functiondef('public.key_moments(uuid)'::regprocedure);
  aliased constant text := $re$(from\s+)points(\s+p\M)$re$;
  bare constant text := $re$(from\s+)points(?=\s+where)$re$;
  counted constant text :=
    $sql$(select * from only points where not (flags ? 'let_replayed'))$sql$;
  hits int;
begin
  hits := regexp_count(def, aliased);
  if hits <> 1 then
    raise exception 'key_moments: expected 1 aliased point read, found %', hits;
  end if;
  hits := regexp_count(def, bare);
  if hits <> 2 then
    raise exception 'key_moments: expected 2 bare point reads, found %', hits;
  end if;
  def := regexp_replace(def, aliased, '\1' || counted || '\2', 'g');
  def := regexp_replace(def, bare, '\1' || counted || ' points', 'g');
  execute def;
end
$$;

do $$
declare
  def text := pg_get_functiondef('public.backfill_returns_in_and_net_points(uuid)'::regprocedure);
  aliased constant text := $re$((?:FROM|JOIN)\s+)public\.points(\s+p\M)$re$;
  hits int := regexp_count(def, aliased);
begin
  if hits <> 6 then
    raise exception 'backfill_returns_in_and_net_points: expected 6 point reads, found %', hits;
  end if;
  if regexp_count(def, 'public\.points') <> 6 then
    raise exception 'backfill_returns_in_and_net_points: an unexpected public.points reference';
  end if;
  execute regexp_replace(
    def,
    aliased,
    $rep$\1(SELECT * FROM ONLY public.points WHERE NOT (flags ? 'let_replayed'))\2$rep$,
    'g'
  );
end
$$;

do $$
declare
  def text := pg_get_functiondef('public.rebuild_ask_point_facts(uuid[])'::regprocedure);
  pattern constant text := $re$(from public\.points p\s+where p\.match_id = any\(match_ids\))$re$;
  hits int := regexp_count(def, pattern);
begin
  if hits <> 1 then
    raise exception 'rebuild_ask_point_facts: expected the pts read once, found %', hits;
  end if;
  execute regexp_replace(
    def,
    pattern,
    $rep$\1
       and not (p.flags ? 'let_replayed')$rep$
  );
end
$$;

do $$
declare
  def text := pg_get_functiondef('public.self_review_save(uuid,jsonb)'::regprocedure);
  reading constant text :=
    $re$cross join lateral public\.self_review_reading\(p\.result_type\) r\n$re$;
  ended_by constant text :=
    $re$(r\.ending,\n(\s+)case\n)(\s+)(when r\.ending in \('error', 'double_fault'\))$re$;
  hits int;
begin
  hits := regexp_count(def, reading);
  if hits <> 1 then
    raise exception 'self_review_save: expected the seed''s reading once, found %', hits;
  end if;
  hits := regexp_count(def, ended_by);
  if hits <> 1 then
    raise exception 'self_review_save: expected the seed''s ended_by case once, found %', hits;
  end if;
  -- A let point is seeded as the label it was published from.
  def := regexp_replace(
    def,
    reading,
    $rep$cross join lateral (
      select case when p.flags ? 'let_replayed' then 'let_replayed'
                  else rr.ending end as ending,
             rr.error_kind,
             rr.last_stroke
        from public.self_review_reading(p.result_type) rr
    ) r
$rep$
  );
  -- Nobody ends a let.
  def := regexp_replace(
    def,
    ended_by,
    $rep$\1\3when r.ending = 'let_replayed' then null
\3\4$rep$
  );
  execute def;
end
$$;

do $$
declare
  def text := pg_get_viewdef('ask.points'::regclass);
  pattern constant text := $re$(FROM points p_1\s+WHERE )\($re$;
  hits int := regexp_count(def, pattern);
begin
  if hits <> 1 then
    raise exception 'ask.points: expected the points read once, found %', hits;
  end if;
  -- CREATE OR REPLACE keeps the view's grants (ask_reader: SELECT).
  execute 'create or replace view ask.points as '
    || regexp_replace(
      rtrim(def, '; ' || chr(10)),
      pattern,
      $rep$\1(NOT (p_1.flags ? 'let_replayed'::text)) AND ($rep$
    );
end
$$;

do $$
declare
  def text := pg_get_viewdef('ask.shots'::regclass);
  pattern constant text := $re$WHERE \(s\.result IS DISTINCT FROM 'Let'::text\)$re$;
  hits int := regexp_count(def, pattern);
begin
  if hits <> 1 then
    raise exception 'ask.shots: expected the placed CTE filter once, found %', hits;
  end if;
  execute 'create or replace view ask.shots as '
    || regexp_replace(
      rtrim(def, '; ' || chr(10)),
      pattern,
      $rep$WHERE ((s.result IS DISTINCT FROM 'Let'::text) AND (NOT (p.flags ? 'let_replayed'::text)))$rep$
    );
end
$$;
