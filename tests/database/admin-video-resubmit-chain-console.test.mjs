import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setup, id } from "./fixtures/admin-video-harness.mjs";

const migrations = [
  "20261110013000_admin_video_allow_resubmit_chain.sql",
  "20261110063746_admin_video_resubmit_chain_console.sql",
];

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

async function harness() {
  const db = new PGlite();
  await setup(db);
  // Live columns the harness snapshot predates.
  await db.exec(`
    alter table processing_jobs add column resubmitted_from_job_id uuid;
    alter table processing_jobs add column created_at timestamptz not null default clock_timestamp();
    alter table admin_upload_submissions add column personal_user_id uuid;
  `);
  for (const name of migrations)
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );

  const submit = async (op) => {
    await db.exec("set role service_role");
    const attempt = (
      await db.query(
        "select admin_submit_match_video($1,$2,$3,$4,null,null,$5) as data",
        [id(2), id(op), id(op + 1), id(10), request],
      )
    ).rows[0].data;
    await db.exec("reset role");
    return attempt;
  };
  // A server session (resubmitJob, the webhook).
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  const insertJob = (jobId, matchId, from, status = "uploaded") =>
    db.query(
      "insert into processing_jobs(id,match_id,created_by,status,resubmitted_from_job_id) values($1,$2,$3,$4,$5)",
      [jobId, matchId, id(2), status, from],
    );
  const setStatus = (jobId, status, extra = "") =>
    db.query(`update processing_jobs set status=$1${extra} where id=$2`, [
      status,
      jobId,
    ]);
  // A live job on ANOTHER match whose lineage points at `from`.
  const insertForeignJob = async (jobId, from) => {
    await db.query(
      "insert into matches(id,created_by,match_type) values($1,$2,'Singles')",
      [id(21), id(2)],
    );
    await insertJob(jobId, id(21), from, "processing");
  };
  const analysisMethod = async (matchId) =>
    (
      await db.query("select analysis_method from matches where id=$1", [
        matchId,
      ])
    ).rows[0].analysis_method;
  const reconcile = (op) =>
    db.query(
      "select admin_reconcile_submission_item($1,$2,$3,'abandon') as data",
      [id(1), id(op), id(op + 1)],
    );
  const item = async (op) =>
    (
      await db.query(
        "select status,error_code,result from admin_upload_submission_items where operation_id=$1 and item_id=$2",
        [id(op), id(op + 1)],
      )
    ).rows[0];
  return {
    db,
    submit,
    insertJob,
    insertForeignJob,
    analysisMethod,
    setStatus,
    reconcile,
    item,
  };
}

const refuse = (fn, message) =>
  assert.rejects(fn, (e) => e.message.includes(message));

test("abandon refuses while a resubmission of the reserved job is live", async () => {
  const h = await harness();
  try {
    const attempt = await h.submit(300);
    const match = attempt.match_id;
    const reserved = attempt.job_id;
    // The reserved upload died; the server retried it, and retried that.
    await h.setStatus(
      reserved,
      "failed",
      ",error_message='upload interrupted'",
    );
    await h.insertJob(id(500), match, reserved, "failed");
    await h.insertJob(id(501), match, id(500), "queued");

    // A live grandchild keeps the attempt active.
    for (const status of ["queued", "processing", "uploaded", "pending"]) {
      await h.setStatus(id(501), status);
      await refuse(() => h.reconcile(300), "attempt-active");
    }
    // Nothing moved.
    assert.equal((await h.item(300)).status, "succeeded");
    assert.equal(await h.analysisMethod(match), "ai");

    // A live job on ANOTHER match with lineage to the reserved job is not a
    // descendant on this match.
    await h.insertForeignJob(id(510), reserved);

    // Once the grandchild is terminal, abandon goes through (the other
    // terminal states are covered below).
    await h.setStatus(id(501), "failed");
    const done = (await h.reconcile(300)).rows[0].data;
    assert.equal(done.jobId, reserved);
    assert.equal((await h.item(300)).status, "failed");
    assert.equal((await h.item(300)).error_code, "abandoned");
    assert.equal(await h.analysisMethod(match), "manual");
  } finally {
    await h.db.close();
  }
});

test("each terminal descendant state allows abandon", async () => {
  for (const [n, status] of [
    "completed",
    "derivation_failed",
    "cancelled",
  ].entries()) {
    const h = await harness();
    try {
      const op = 300 + n * 10;
      const attempt = await h.submit(op);
      await h.setStatus(attempt.job_id, "failed");
      await h.insertJob(id(600), attempt.match_id, attempt.job_id, "queued");
      await refuse(() => h.reconcile(op), "attempt-active");
      await h.setStatus(id(600), status);
      await h.reconcile(op);
      assert.equal((await h.item(op)).error_code, "abandoned");
    } finally {
      await h.db.close();
    }
  }
});

test("the console item mirrors the newest job of the reserved job's chain", async () => {
  const h = await harness();
  try {
    const attempt = await h.submit(300);
    const match = attempt.match_id;
    const reserved = attempt.job_id;
    const state = async () => (await h.item(300)).result;

    // With no descendant it is the reserved job, as before.
    await h.setStatus(reserved, "queued");
    assert.equal((await state()).state, "queued");
    assert.equal((await state()).stateJobId, reserved);
    await h.setStatus(reserved, "completed", ",derivation_version=1");
    assert.equal((await state()).state, "completed");

    // A reprocess shows its own state from the moment it is inserted.
    await h.insertJob(id(500), match, reserved, "uploaded");
    let r = await state();
    assert.equal(r.state, "uploaded");
    assert.equal(r.stateJobId, id(500));
    assert.equal(r.jobId, reserved, "jobId stays the reserved job");

    await h.setStatus(id(500), "processing");
    assert.equal((await state()).state, "processing");

    // A late write to the older reserved job no longer overwrites it.
    await h.db.query(
      "update processing_jobs set error_message='late webhook' where id=$1",
      [reserved],
    );
    r = await state();
    assert.equal(r.state, "processing");
    assert.equal(r.stateJobId, id(500));
    assert.equal((await h.item(300)).error_code, null);

    // completed without derived stats reads stats_pending, then completed.
    await h.setStatus(id(500), "completed");
    assert.equal((await state()).state, "stats_pending");
    await h.db.query(
      "update processing_jobs set derivation_version=2 where id=$1",
      [id(500)],
    );
    assert.equal((await state()).state, "completed");

    // A grandchild takes over, and its error is the item's error.
    await h.insertJob(id(501), match, id(500), "queued");
    await h.setStatus(id(501), "failed", ",error_message='vendor rejected'");
    r = await state();
    assert.equal(r.state, "failed");
    assert.equal(r.stateJobId, id(501));
    assert.equal((await h.item(300)).error_code, "vendor rejected");
    await h.setStatus(id(500), "completed");
    assert.equal((await state()).stateJobId, id(501));

    // A job on another match naming the reserved job never speaks for it.
    await h.insertForeignJob(id(510), reserved);
    assert.equal((await state()).stateJobId, id(501));

    // The item stays succeeded throughout.
    assert.equal((await h.item(300)).status, "succeeded");
  } finally {
    await h.db.close();
  }
});
