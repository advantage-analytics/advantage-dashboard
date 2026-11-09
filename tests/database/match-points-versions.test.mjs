import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/**
 * `match_points_versions` (20261109120000): the counter the season points
 * cache (`src/lib/data/season-points-cache.ts`) keys on. Every write to a
 * match's points or shots must move it, or a cached season would keep
 * showing points that have since been relabelled; and a viewer must see a
 * version only for a match they can read.
 */

const MIGRATION = "20261109120000_match_points_versions.sql";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c"; // no points at migration time
const PA1 = "00000000-0000-4000-8000-0000000000a1";
const PA2 = "00000000-0000-4000-8000-0000000000a2";
const PB1 = "00000000-0000-4000-8000-0000000000b1";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table matches(id uuid primary key, visible boolean not null default true);
    -- matches' own RLS lets this viewer read every match; the POINTS rule
    -- (live: points' policy over visible_match_ids()) is narrower, reduced
    -- here to the flag. The version policy must follow the points rule.
    alter table matches enable row level security;
    create policy matches_all on matches for select to authenticated using (true);
    grant select on matches to authenticated;
    create function public.visible_match_ids() returns setof uuid
      language sql stable security definer set search_path = ''
      as $$ select id from public.matches where visible $$;
    create table points(id uuid primary key, match_id uuid not null references matches(id) on delete cascade, point_number int);
    create table shots(id uuid primary key default gen_random_uuid(), point_id uuid not null references points(id) on delete cascade, shot_number int, zone text);
    insert into matches(id) values ('${A}'), ('${B}'), ('${C}');
    insert into points values ('${PA1}', '${A}', 1), ('${PA2}', '${A}', 2), ('${PB1}', '${B}', 1);
    insert into shots(point_id, shot_number) values ('${PA1}', 1), ('${PA1}', 2), ('${PB1}', 1);
  `);
  await db.exec(
    await readFile(
      new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url),
      "utf8",
    ),
  );
  return db;
}

async function versions(db) {
  const { rows } = await db.query(
    "select match_id, version::int as version from match_points_versions order by match_id",
  );
  return Object.fromEntries(rows.map((r) => [r.match_id, r.version]));
}

async function withDb(fn) {
  const db = await fixture();
  try {
    await fn(db);
  } finally {
    await db.close();
  }
}

test("the backfill starts every match with points at 1, and none without", () =>
  withDb(async (db) => {
    assert.deepEqual(await versions(db), { [A]: 1, [B]: 1 });
  }));

test("inserting, updating and deleting points bumps only their match, once per statement", () =>
  withDb(async (db) => {
    await db.exec(
      `insert into points values (gen_random_uuid(), '${A}', 3), (gen_random_uuid(), '${A}', 4)`,
    );
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 1 });
    await db.exec(
      `update points set point_number = point_number where match_id = '${B}'`,
    );
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 2 });
    await db.exec(`delete from points where id = '${PA2}'`);
    assert.deepEqual(await versions(db), { [A]: 3, [B]: 2 });
  }));

test("a match's first points create its row", () =>
  withDb(async (db) => {
    await db.exec(`insert into points values (gen_random_uuid(), '${C}', 1)`);
    assert.equal((await versions(db))[C], 1);
  }));

test("inserting, updating and deleting shots bumps the match they belong to", () =>
  withDb(async (db) => {
    await db.exec(
      `insert into shots(point_id, shot_number) values ('${PB1}', 2)`,
    );
    assert.deepEqual(await versions(db), { [A]: 1, [B]: 2 });
    await db.exec(`update shots set zone = 'wide' where point_id = '${PA1}'`);
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 2 });
    await db.exec(`delete from shots where point_id = '${PA1}'`);
    assert.deepEqual(await versions(db), { [A]: 3, [B]: 2 });
  }));

test("a row moved between matches bumps both", () =>
  withDb(async (db) => {
    await db.exec(`update points set match_id = '${B}' where id = '${PA2}'`);
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 2 });
    await db.exec(
      `update shots set point_id = '${PA2}' where point_id = '${PB1}'`,
    );
    // PA2 now sits in B, PB1 in B: one bump for B.
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 3 });
  }));

test("deleting a match cascades through its points without failing, and drops its row", () =>
  withDb(async (db) => {
    await db.exec(`delete from matches where id = '${A}'`);
    assert.deepEqual(await versions(db), { [B]: 1 });
  }));

test("a viewer reads a version only for a match whose points they can read — not merely the match — and writes none", () =>
  withDb(async (db) => {
    await db.exec(`update matches set visible = false where id = '${B}'`);
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(
        "select match_id from match_points_versions",
      );
      assert.deepEqual(
        rows.map((r) => r.match_id),
        [A],
      );
      await assert.rejects(
        db.exec(
          `update match_points_versions set version = 99 where match_id = '${A}'`,
        ),
      );
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role anon");
    try {
      await assert.rejects(db.query("select * from match_points_versions"));
    } finally {
      await db.exec("reset role");
    }
  }));

test("the policy is the points rule, and the bump writes rows in match_id order", async () => {
  const sql = await readFile(
    new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url),
    "utf8",
  );
  assert.match(
    sql,
    /using \(match_id in \(select public\.visible_match_ids\(\)\)\)/,
  );
  assert.doesNotMatch(sql, /m\.id = match_id\b/);
  assert.match(sql, /order by u\.match_id\s+on conflict/);
});

test("one statement over several matches bumps each once", () =>
  withDb(async (db) => {
    await db.exec(
      `update shots set zone = 'x' where point_id in ('${PA1}', '${PB1}')`,
    );
    assert.deepEqual(await versions(db), { [A]: 2, [B]: 2 });
  }));
