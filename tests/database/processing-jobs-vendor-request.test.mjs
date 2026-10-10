/** Run: node --test tests/database/processing-jobs-vendor-request.test.mjs
 * Isolated PostgreSQL contract test for `processing_jobs.vendor_request`. The
 * table is the minimal shape the migration touches — not a clone of the live
 * `processing_jobs` — and the migration file is executed byte-for-byte, so its
 * own assertion block runs too.
 *
 * What this proves: a client role (`authenticated`, which holds a table-wide
 * UPDATE/INSERT grant live) can neither insert nor change `vendor_request`,
 * while its other column writes still go through; `service_role` writes it
 * freely; a body still carrying the signed `VideoUrl` or one that is not a
 * JSON object fails the shape CHECK for every role; and the migration is
 * idempotent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261009181357_processing_jobs_vendor_request.sql",
    import.meta.url,
  ),
  "utf8",
);

const JOB = uuid(10);

const BODY = {
  MatchID: uuid(1),
  WebhookUrl: "https://app.example.com/api/webhooks/splitstep",
  InitialTopPlayer: "Top Player",
  InitialBottomPlayer: "Bottom Player",
  StartTime: 12,
  EndTime: 3600,
  SetGameScores: [
    [6, 4],
    [7, 6],
  ],
  FixedCamera: true,
  Ad: false,
};

async function boot() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.processing_jobs (
      id uuid primary key default gen_random_uuid(),
      status text not null default 'pending',
      error_message text
    );
    grant select, insert, update, delete on public.processing_jobs
      to authenticated, service_role;
  `);
  await db.exec(migration);
  await db.query(`insert into public.processing_jobs (id) values ($1)`, [JOB]);
  return db;
}

/** Run `sql` as `role`, always resetting afterwards. */
async function as(db, role, sql, params = []) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const stored = (db) =>
  db
    .query("select vendor_request from public.processing_jobs where id = $1", [
      JOB,
    ])
    .then(({ rows }) => rows[0].vendor_request);

test("service_role records the body", async () => {
  const db = await boot();
  try {
    await as(
      db,
      "service_role",
      "update public.processing_jobs set status = 'submitting', vendor_request = $2 where id = $1",
      [JOB, JSON.stringify(BODY)],
    );
    assert.deepEqual(await stored(db), BODY);
  } finally {
    await db.close();
  }
});

test("authenticated cannot write vendor_request, but its other writes still work", async () => {
  const db = await boot();
  try {
    await assert.rejects(
      as(
        db,
        "authenticated",
        "update public.processing_jobs set vendor_request = $2 where id = $1",
        [JOB, JSON.stringify(BODY)],
      ),
      (err) => err.code === "42501" && /server only/.test(err.message),
    );
    await assert.rejects(
      as(
        db,
        "authenticated",
        "insert into public.processing_jobs (vendor_request) values ($1)",
        [JSON.stringify(BODY)],
      ),
      (err) => err.code === "42501" && /server only/.test(err.message),
    );

    // Once the server has recorded it, a client cannot clear it either.
    await as(
      db,
      "service_role",
      "update public.processing_jobs set vendor_request = $2 where id = $1",
      [JOB, JSON.stringify(BODY)],
    );
    await assert.rejects(
      as(
        db,
        "authenticated",
        "update public.processing_jobs set vendor_request = null where id = $1",
        [JOB],
      ),
      (err) => err.code === "42501" && /server only/.test(err.message),
    );

    // Untouched column → no refusal; an insert without it is fine too.
    await as(
      db,
      "authenticated",
      "update public.processing_jobs set error_message = 'x' where id = $1",
      [JOB],
    );
    await as(
      db,
      "authenticated",
      "insert into public.processing_jobs (status) values ('pending')",
    );
    assert.deepEqual(await stored(db), BODY);
  } finally {
    await db.close();
  }
});

test("a body still carrying VideoUrl, or not an object, fails the shape check", async () => {
  const db = await boot();
  try {
    await assert.rejects(
      as(
        db,
        "service_role",
        "update public.processing_jobs set vendor_request = $2 where id = $1",
        [
          JOB,
          JSON.stringify({ ...BODY, VideoUrl: "https://blob/x?sig=secret" }),
        ],
      ),
      (err) => err.code === "23514",
    );
    await assert.rejects(
      as(
        db,
        "service_role",
        "update public.processing_jobs set vendor_request = '[]'::jsonb where id = $1",
        [JOB],
      ),
      (err) => err.code === "23514",
    );
    assert.equal(await stored(db), null);
  } finally {
    await db.close();
  }
});

test("the migration is idempotent", async () => {
  const db = await boot();
  try {
    await db.exec(migration);
    const { rows } = await db.query(
      `select count(*)::int as n from pg_trigger
        where tgrelid = 'public.processing_jobs'::regclass
          and tgname = 'processing_jobs_guard_vendor_request'`,
    );
    assert.equal(rows[0].n, 1);
  } finally {
    await db.close();
  }
});
