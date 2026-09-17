import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { postgresHarness, overlapping } from "../fixtures/postgres-harness.mjs";

test("deletion and console admission serialize in both orders", async () => {
  const h = await postgresHarness();
  try {
    const db = h.db;
    await db.exec(
      "create schema admin_uploads_private; create table users(id uuid primary key); create table matches(id uuid primary key); create table processing_jobs(id uuid,created_by uuid); create table admin_upload_submissions(actor_user_id uuid);",
    );
    for (const table of [
      "admin_upload_submission_items",
      "admin_analysis_reservations",
      "admin_file_attempts",
      "admin_video_attempts",
    ])
      await db.exec(`create table ${table}(match_id uuid,job_id uuid)`);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/20260917072323_guard_admin_match_storage_purge.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = await h.connect();
    const b = await h.connect();
    for (const kind of ["match", "actor"]) {
      for (const deletionFirst of [true, false]) {
        const id = `00000000-0000-4000-8000-${String(kind === "match" ? (deletionFirst ? 1 : 2) : deletionFirst ? 3 : 4).padStart(12, "0")}`;
        await db.exec(
          `insert into ${kind === "match" ? "matches" : "users"} values('${id}')`,
        );
        const claim =
          kind === "match"
            ? `select admin_claim_match_storage_purge(array['${id}'::uuid]) as allowed`
            : `select admin_claim_actor_deletion('${id}') as allowed`;
        const admit =
          kind === "match"
            ? `insert into admin_analysis_reservations(match_id) values('${id}')`
            : `insert into admin_upload_submissions(actor_user_id) values('${id}')`;
        const { winner, loser } = await overlapping(
          a,
          b,
          db,
          () => a.query(deletionFirst ? claim : admit),
          () => b.query(deletionFirst ? admit : claim),
        );
        if (deletionFirst) {
          assert.equal(winner.rows[0].allowed, true);
          assert.match(loser.error?.message ?? "", /deletion-in-progress/);
        } else {
          assert.equal(loser.value.rows[0].allowed, false);
        }
      }
    }
  } finally {
    await h.close();
  }
});
