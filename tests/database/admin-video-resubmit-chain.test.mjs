import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setup, id } from "./fixtures/admin-video-harness.mjs";

const migration = "20261110013000_admin_video_allow_resubmit_chain.sql";

const request = {
  playerId: id(4),
  opponentName: "Opponent",
  score: { player1: [6, 7], player2: [4, 6] },
  date: "2026-09-15",
  courtType: "Hard",
  bestOf: 3,
  startSeconds: 10,
  endSeconds: 610,
  initialTopPlayerIsPlayer1: false,
  adScoring: true,
  fixedCamera: false,
};

const refuse = (fn, message) =>
  assert.rejects(fn, (e) => e.message.includes(message));

test("a resubmission of a console-reserved video job is not a competing analysis", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(
      "alter table processing_jobs add column resubmitted_from_job_id uuid",
    );
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + migration, import.meta.url),
        "utf8",
      ),
    );

    await db.exec("set role service_role");
    const attempt = (
      await db.query(
        "select admin_submit_match_video($1,$2,$3,$4,null,null,$5) as data",
        [id(2), id(100), id(101), id(10), request],
      )
    ).rows[0].data;
    await db.exec("reset role");
    const match = attempt.match_id;
    const reserved = attempt.job_id;

    const insertJob = (jobId, from, matchId = match) =>
      db.query(
        "insert into processing_jobs(id,match_id,created_by,status,resubmitted_from_job_id) values($1,$2,$3,'uploaded',$4)",
        [jobId, matchId, id(2), from],
      );

    // The reserved job itself still moves freely.
    await db.query(
      "update processing_jobs set status='completed' where id=$1",
      [reserved],
    );

    // A child of the reserved job is admitted, and so are its status writes.
    await insertJob(id(500), reserved);
    for (const status of ["submitting", "queued", "processing", "completed"])
      await db.query("update processing_jobs set status=$1 where id=$2", [
        status,
        id(500),
      ]);

    // A grandchild (a resubmit of the resubmit) is admitted too.
    await insertJob(id(501), id(500));

    // A job with no lineage is still a competing analysis.
    await refuse(() => insertJob(id(502), null), "analysis-already-submitted");

    // So is one claiming a parent on another match.
    await db.query(
      "insert into matches(id,created_by,match_type) values($1,$2,'Singles')",
      [id(21), id(2)],
    );
    await insertJob(id(503), null, id(21));
    await refuse(
      () => insertJob(id(504), id(503)),
      "analysis-already-submitted",
    );

    // An unknown parent id does not count as lineage.
    await refuse(
      () => insertJob(id(505), id(999)),
      "analysis-already-submitted",
    );

    // Moving an unrelated job onto the reserved match is still refused.
    await refuse(
      () =>
        db.query("update processing_jobs set match_id=$1 where id=$2", [
          match,
          id(503),
        ]),
      "analysis-already-submitted",
    );

    // A spreadsheet on a video-reserved match is still refused.
    await refuse(
      () => db.query("insert into match_files(match_id) values($1)", [match]),
      "analysis-already-submitted",
    );

    const children = (
      await db.query(
        "select count(*)::int n from processing_jobs where match_id=$1",
        [match],
      )
    ).rows[0].n;
    assert.equal(children, 3);
  } finally {
    await db.close();
  }
});
