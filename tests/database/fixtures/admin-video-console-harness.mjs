import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setup, id } from "./admin-video-harness.mjs";

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

const load = async (db, name) =>
  db.exec(
    await readFile(
      new URL("../../../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );

/**
 * The admin video harness plus the live columns its snapshot predates, with
 * `migrations` applied in order and the helpers the console specs share.
 * `upTo` stops before a migration, so a test can apply it later via `load`.
 */
export async function consoleHarness(migrations, upTo = migrations.length) {
  const db = new PGlite();
  await setup(db);
  // Live columns the harness snapshot predates, with live's defaults: jobs
  // written in one transaction share `now()`.
  await db.exec(`
    alter table processing_jobs add column resubmitted_from_job_id uuid;
    alter table processing_jobs add column created_at timestamptz not null default now();
    alter table admin_upload_submissions add column personal_user_id uuid;
  `);
  for (const name of migrations.slice(0, upTo)) await load(db, name);

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
  const reconcile = (op) =>
    db.query(
      "select admin_reconcile_submission_item($1,$2,$3,'abandon') as data",
      [id(1), id(op), id(op + 1)],
    );
  return {
    db,
    load: (name) => load(db, name),
    submit,
    insertJob,
    setStatus,
    reconcile,
  };
}
