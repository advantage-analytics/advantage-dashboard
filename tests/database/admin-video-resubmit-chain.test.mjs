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

const refuse = (fn, message = "analysis-already-submitted") =>
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

    // The session PostgREST would set: a server key or a signed-in client.
    const as = (role) =>
      db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role }),
      ]);
    const insertJob = (jobId, from, matchId = match) =>
      db.query(
        "insert into processing_jobs(id,match_id,created_by,status,resubmitted_from_job_id) values($1,$2,$3,'uploaded',$4)",
        [jobId, matchId, id(2), from],
      );
    const setStatus = (jobId, status) =>
      db.query("update processing_jobs set status=$1 where id=$2", [
        status,
        jobId,
      ]);

    // The reserved job itself still moves freely.
    await as("service_role");
    await setStatus(reserved, "completed");

    // A client cannot claim lineage it could have written itself.
    await as("authenticated");
    await refuse(() => insertJob(id(500), reserved));

    // The server's resubmission is admitted, and so are its status writes —
    // from the webhook, and from the athlete (a cancel) while lineage holds.
    await as("service_role");
    await insertJob(id(500), reserved);
    for (const status of ["submitting", "queued", "processing"])
      await setStatus(id(500), status);
    await as("authenticated");
    await setStatus(id(500), "cancelled");

    // A grandchild (a resubmit of the resubmit) is admitted too, and its
    // status writes pass from both sides.
    await as("service_role");
    await insertJob(id(501), id(500));
    await setStatus(id(501), "queued");
    await as("authenticated");
    await setStatus(id(501), "cancelled");

    // A job with no lineage is still a competing analysis.
    await as("service_role");
    await refuse(() => insertJob(id(502), null));

    // An unknown parent id does not count as lineage.
    await refuse(() => insertJob(id(505), id(999)));

    // Moving a job onto the reserved match is refused, even one whose parent
    // field names the reserved job.
    await db.query(
      "insert into matches(id,created_by,match_type) values($1,$2,'Singles')",
      [id(21), id(2)],
    );
    await insertJob(id(503), null, id(21));
    await insertJob(id(504), reserved, id(21));
    for (const jobId of [id(503), id(504)])
      await refuse(() =>
        db.query("update processing_jobs set match_id=$1 where id=$2", [
          match,
          jobId,
        ]),
      );

    // A middle job deleted (ON DELETE SET NULL) breaks the chain: the server
    // can still move the descendant on; a client no longer can.
    await insertJob(id(506), id(501));
    await db.query(
      "update processing_jobs set resubmitted_from_job_id=null where id=$1",
      [id(506)],
    );
    await setStatus(id(506), "queued");
    await as("authenticated");
    await refuse(() => setStatus(id(506), "cancelled"));

    // A spreadsheet on a video-reserved match is still refused.
    await as("service_role");
    await refuse(() =>
      db.query("insert into match_files(match_id) values($1)", [match]),
    );

    // No claims at all (a migration, the SQL editor) is a server session.
    await db.query("select set_config('request.jwt.claims','',false)");
    await insertJob(id(507), reserved);

    const onMatch = (
      await db.query(
        "select count(*)::int n from processing_jobs where match_id=$1",
        [match],
      )
    ).rows[0].n;
    assert.equal(onMatch, 5);
  } finally {
    await db.close();
  }
});
