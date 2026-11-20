/** Run: node --test tests/database/cancel-processing-job.test.mjs
 * Isolated PostgreSQL contract test for `cancel_processing_job` (cancel
 * queued analysis, T1). The tables are the minimal shape the RPC and the
 * migration's constraint block read — not clones of the live
 * `processing_jobs` / `processing_usage` — and the admin guard functions the
 * migration re-creates need only the row types they declare to exist. The
 * migration file is executed byte-for-byte, so its own assertion blocks run
 * too (constraint admits `cancelled`, rank 9, service_role-only ACL). The
 * follow-up migration that narrows the RPC to `submitting | queued` is
 * applied on top, as it is live, and its assertion blocks run as well.
 *
 * What this proves: the RPC flips a cancellable job the caller owns and
 * releases its quota row in the same call; a job owned by someone else, a job
 * the vendor already started (`processing`) and a job already terminal are
 * all left alone (null return, usage untouched);
 * and the migration is idempotent. PGlite serializes one connection, so no
 * concurrent-cancel behaviour is exercised here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260930062236_processing_jobs_cancelled.sql",
    import.meta.url,
  ),
  "utf8",
);
const narrowing = await readFile(
  new URL(
    "../../supabase/migrations/20260930083017_cancel_processing_job_queued_only.sql",
    import.meta.url,
  ),
  "utf8",
);

const OWNER = uuid(1);
const STRANGER = uuid(2);
const QUEUED_JOB = uuid(10);
const STRANGERS_JOB = uuid(11);
const COMPLETED_JOB = uuid(12);
const PROCESSING_JOB = uuid(13);

async function boot() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema admin_uploads_private;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_admin() returns boolean language sql as $$ select false $$;
    -- Row types the re-created admin guard declares; never read here.
    create table public.matches (id uuid primary key);
    create table public.programs (id uuid primary key);
    create table public.program_event_entries (id uuid primary key);
    create table public.processing_jobs (
      id uuid primary key default gen_random_uuid(),
      created_by uuid,
      status text not null default 'pending'
        constraint processing_jobs_status_check check (status in (
          'pending','uploading','uploaded','submitting','queued','processing',
          'deriving','completed','failed','derivation_failed')),
      completed_at timestamptz,
      error_code text
    );
    create table public.processing_usage (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null,
      released boolean not null default false
    );
  `);
  await db.exec(migration);
  await db.exec(narrowing);
  return db;
}

async function seed(db) {
  await db.query(
    `insert into public.processing_jobs (id, created_by, status) values
       ($1, $4, 'queued'),
       ($2, $5, 'queued'),
       ($3, $4, 'completed'),
       ($6, $4, 'processing')`,
    [QUEUED_JOB, STRANGERS_JOB, COMPLETED_JOB, OWNER, STRANGER, PROCESSING_JOB],
  );
  await db.query(
    `insert into public.processing_usage (job_id) values ($1), ($2), ($3), ($4)`,
    [QUEUED_JOB, STRANGERS_JOB, COMPLETED_JOB, PROCESSING_JOB],
  );
}

const cancel = (db, jobId, userId) =>
  db
    .query("select public.cancel_processing_job($1, $2) as status", [
      jobId,
      userId,
    ])
    .then(({ rows }) => rows[0].status);

const jobRow = (db, jobId) =>
  db
    .query(
      "select status, error_code, completed_at is not null as completed from public.processing_jobs where id = $1",
      [jobId],
    )
    .then(({ rows }) => rows[0]);

const released = (db, jobId) =>
  db
    .query("select released from public.processing_usage where job_id = $1", [
      jobId,
    ])
    .then(({ rows }) => rows[0].released);

test("a queued job owned by the caller is cancelled and its quota row released", async () => {
  const db = await boot();
  try {
    await seed(db);

    assert.equal(await cancel(db, QUEUED_JOB, OWNER), "cancelled");
    assert.deepEqual(await jobRow(db, QUEUED_JOB), {
      status: "cancelled",
      error_code: "CANCELLED",
      completed: true,
    });
    assert.equal(await released(db, QUEUED_JOB), true);

    // Second call on the now-terminal job: nothing matches, nothing changes.
    assert.equal(await cancel(db, QUEUED_JOB, OWNER), null);
  } finally {
    await db.close();
  }
});

test("another user's job returns null and its usage stays reserved", async () => {
  const db = await boot();
  try {
    await seed(db);

    assert.equal(await cancel(db, STRANGERS_JOB, OWNER), null);
    assert.deepEqual(await jobRow(db, STRANGERS_JOB), {
      status: "queued",
      error_code: null,
      completed: false,
    });
    assert.equal(await released(db, STRANGERS_JOB), false);
  } finally {
    await db.close();
  }
});

test("a completed job returns null and is left untouched", async () => {
  const db = await boot();
  try {
    await seed(db);

    assert.equal(await cancel(db, COMPLETED_JOB, OWNER), null);
    assert.deepEqual(await jobRow(db, COMPLETED_JOB), {
      status: "completed",
      error_code: null,
      completed: false,
    });
    assert.equal(await released(db, COMPLETED_JOB), false);
  } finally {
    await db.close();
  }
});

test("a processing job is not cancelled and its usage stays reserved", async () => {
  const db = await boot();
  try {
    await seed(db);

    // The vendor has started work: the route refuses it, and so does the RPC.
    assert.equal(await cancel(db, PROCESSING_JOB, OWNER), null);
    assert.deepEqual(await jobRow(db, PROCESSING_JOB), {
      status: "processing",
      error_code: null,
      completed: false,
    });
    assert.equal(await released(db, PROCESSING_JOB), false);
  } finally {
    await db.close();
  }
});

test("the migration is idempotent and pins rank, constraint and ACL", async () => {
  const db = await boot();
  try {
    // Re-running both is a no-op: the constraint block returns early, the
    // column is `if not exists`, the functions are `create or replace`. The
    // narrowing migration runs last, so the RPC ends on submitting|queued.
    await db.exec(migration);
    await db.exec(narrowing);

    const {
      rows: [facts],
    } = await db.query(`
      select
        (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.processing_jobs'::regclass
            and conname = 'processing_jobs_status_check') as constraint_def,
        public.splitstep_status_rank('cancelled') as cancelled_rank,
        public.splitstep_status_rank('derivation_failed') as derivation_failed_rank,
        (select count(*)::int from pg_constraint
          where conrelid = 'public.processing_jobs'::regclass
            and conname = 'processing_jobs_status_check') as constraint_count,
        (select count(*)::int from information_schema.columns
          where table_schema = 'public' and table_name = 'processing_jobs'
            and column_name = 'vendor_started_at'
            and data_type = 'timestamp with time zone') as vendor_started_at,
        has_function_privilege('service_role', 'public.cancel_processing_job(uuid,uuid)', 'EXECUTE') as service_role_can,
        has_function_privilege('anon', 'public.cancel_processing_job(uuid,uuid)', 'EXECUTE') as anon_can,
        has_function_privilege('authenticated', 'public.cancel_processing_job(uuid,uuid)', 'EXECUTE') as authenticated_can
    `);

    assert.match(facts.constraint_def, /'cancelled'::text/);
    assert.equal(facts.constraint_count, 1);
    assert.equal(facts.cancelled_rank, 9);
    assert.ok(facts.cancelled_rank > facts.derivation_failed_rank);
    assert.equal(facts.vendor_started_at, 1);
    assert.equal(facts.service_role_can, true);
    assert.equal(facts.anon_can, false);
    assert.equal(facts.authenticated_can, false);

    // The constraint really rejects anything outside the list.
    await assert.rejects(
      db.query(
        "insert into public.processing_jobs (id, created_by, status) values ($1, $2, 'bogus')",
        [uuid(99), OWNER],
      ),
      (error) => {
        assert.equal(error.code, "23514");
        return true;
      },
    );
  } finally {
    await db.close();
  }
});
