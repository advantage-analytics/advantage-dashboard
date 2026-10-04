/** Run: node --test tests/database/processing-usage-job-id-unique.test.mjs
 * Isolated PostgreSQL contract test for the one-reservation-per-job index
 * (API audit T6). The table is the minimal shape the index reads — id and
 * job_id — not a clone of the live `processing_usage`; the migration file is
 * executed byte-for-byte, so its own assertions run too. What this proves is
 * the SQLSTATE the reserve RPCs will raise on a double submit (23505, which
 * `reserveQuota()` turns into a thrown Error and T10 maps to a 409), and that
 * null job ids stay outside the rule. Concurrent multi-connection behavior is
 * not exercised here — PGlite serializes one connection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260929220437_processing_usage_job_id_unique.sql",
    import.meta.url,
  ),
  "utf8",
);

test("processing_usage admits one row per job_id and any number with a null job_id", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table public.processing_usage (id uuid primary key, job_id uuid);",
    );
    await db.exec(migration);

    const insert = (id, jobId) =>
      db.query(
        "insert into public.processing_usage (id, job_id) values ($1, $2)",
        [id, jobId],
      );

    // Two rows sharing a job_id: the second is the double submit and fails
    // on the unique index, matched on SQLSTATE — never on the message.
    await insert(uuid(1), uuid(100));
    await assert.rejects(insert(uuid(2), uuid(100)), (error) => {
      assert.equal(error.code, "23505");
      assert.match(error.message, /processing_usage_job_id_key/);
      return true;
    });

    // Two rows with no job_id at all: outside the partial predicate, so both
    // land.
    await insert(uuid(3), null);
    await insert(uuid(4), null);

    const { rows } = await db.query(
      "select count(*)::int as total, count(job_id)::int as with_job from public.processing_usage",
    );
    assert.deepEqual(rows, [{ total: 3, with_job: 1 }]);

    // Re-running the migration is a no-op (`if not exists`), and its own
    // assertion block still finds the index.
    await db.exec(migration);
    const { rows: indexes } = await db.query(
      "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'processing_usage' and indexname = 'processing_usage_job_id_key'",
    );
    assert.equal(indexes.length, 1);
    assert.equal(
      indexes[0].indexdef,
      "CREATE UNIQUE INDEX processing_usage_job_id_key ON public.processing_usage USING btree (job_id) WHERE (job_id IS NOT NULL)",
    );
  } finally {
    await db.close();
  }
});
