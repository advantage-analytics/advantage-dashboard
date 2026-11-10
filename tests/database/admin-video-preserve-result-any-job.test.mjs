import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "./fixtures/admin-video-harness.mjs";
import { consoleHarness } from "./fixtures/admin-video-console-harness.mjs";

const migrations = [
  "20261110013000_admin_video_allow_resubmit_chain.sql",
  "20261110063746_admin_video_resubmit_chain_console.sql",
  "20261110074526_admin_video_console_followups.sql",
  "20261110082322_preserve_video_result_any_job.sql",
];
// `upTo` stops before a migration, so a test can apply it later itself.
async function harness(upTo = migrations.length) {
  const base = await consoleHarness(migrations, upTo);
  const { db } = base;
  const edit = (matchId, set) =>
    db.query(`update matches set ${set} where id=$1`, [matchId]);
  const field = async (matchId, column) =>
    (
      await db.query(`select ${column} as v from matches where id=$1`, [
        matchId,
      ])
    ).rows[0].v;
  return { ...base, edit, field };
}

const refuse = (fn, message) =>
  assert.rejects(fn, (e) => e.message.includes(message));

// One edit per protected group the trigger checks.
const edits = [
  `score='{"sets":[[6,0]]}'`,
  "player1_name='Someone else'",
  "date='2026-01-01'",
  `format='{"ad_scoring":false}'`,
  "source_provider='swingvision'",
  "analysis_method='manual'",
];

test("a live retry protects the recorded result after the reserved job ended", async () => {
  for (const ended of ["failed", "completed"]) {
    const h = await harness();
    try {
      const attempt = await h.submit(300);
      const match = attempt.match_id;
      const reserved = attempt.job_id;
      await h.setStatus(
        reserved,
        ended,
        ended === "completed" ? ",derivation_version=1" : "",
      );
      // Nothing live: edits go through.
      await h.edit(match, "round='QF'");
      await h.insertJob(id(500), match, reserved, "queued");

      for (const status of ["pending", "uploaded", "queued", "processing"]) {
        await h.setStatus(id(500), status);
        for (const set of edits)
          await refuse(() => h.edit(match, set), "recorded-result-protected");
      }
      // Completed but not yet derived is still mid-analysis.
      await h.setStatus(id(500), "completed");
      for (const set of edits)
        await refuse(() => h.edit(match, set), "recorded-result-protected");
      // An orphaned grandchild (lineage cleared) still counts.
      await h.setStatus(id(500), "failed");
      await h.insertJob(id(501), match, id(500), "processing");
      await h.db.query(
        "update processing_jobs set resubmitted_from_job_id=null where id=$1",
        [id(501)],
      );
      await refuse(() => h.edit(match, edits[0]), "recorded-result-protected");
      // Fields outside the recorded result stay editable.
      await h.edit(match, "private=true");
      assert.equal(await h.field(match, "private"), true);

      // Every job ended: the match is editable again.
      for (const [status, extra] of [
        ["completed", ",derivation_version=2"],
        ["derivation_failed", ""],
        ["cancelled", ""],
        ["failed", ""],
      ]) {
        await h.setStatus(id(501), status, extra);
        await h.edit(match, "player1_name='Renamed'");
        assert.equal(await h.field(match, "player1_name"), "Renamed");
        await h.edit(match, "player1_name='Athlete'");
      }
    } finally {
      await h.db.close();
    }
  }
});

test("before the migration a live retry did not protect the match", async () => {
  const h = await harness(migrations.length - 1);
  try {
    const attempt = await h.submit(300);
    await h.setStatus(attempt.job_id, "failed");
    await h.insertJob(id(500), attempt.match_id, attempt.job_id, "processing");
    await h.edit(attempt.match_id, "player1_name='Edited'");
    assert.equal(await h.field(attempt.match_id, "player1_name"), "Edited");

    await h.load(migrations.at(-1));
    await refuse(
      () => h.edit(attempt.match_id, "player1_name='Again'"),
      "recorded-result-protected",
    );
  } finally {
    await h.db.close();
  }
});

test("the reserved job alone still protects the match", async () => {
  const h = await harness();
  try {
    const attempt = await h.submit(300);
    await h.setStatus(attempt.job_id, "processing");
    for (const set of edits)
      await refuse(
        () => h.edit(attempt.match_id, set),
        "recorded-result-protected",
      );
  } finally {
    await h.db.close();
  }
});

test("a live job on a match without a console attempt is not this guard's", async () => {
  const h = await harness();
  try {
    // id(20) is the harness's manual match, no admin_video_attempts row.
    await h.insertJob(id(600), id(20), null, "processing");
    await h.edit(id(20), "player1_name='Edited'");
    assert.equal(await h.field(id(20), "player1_name"), "Edited");
  } finally {
    await h.db.close();
  }
});

test("abandon still writes analysis_method='manual' under the wider guard", async () => {
  const h = await harness();
  try {
    const attempt = await h.submit(300);
    const match = attempt.match_id;
    // The reserved job is live (uploaded) when abandon runs: abandon fails it
    // before touching the match.
    assert.equal(await h.field(match, "analysis_method"), "ai");
    await h.reconcile(300);
    assert.equal(await h.field(match, "analysis_method"), "manual");
    assert.equal(await h.field(match, "source_provider"), null);
  } finally {
    await h.db.close();
  }
});

test("abandon after a retry ended still passes", async () => {
  const h = await harness();
  try {
    const attempt = await h.submit(300);
    const match = attempt.match_id;
    await h.setStatus(attempt.job_id, "failed");
    await h.insertJob(id(500), match, attempt.job_id, "queued");
    await refuse(() => h.reconcile(300), "attempt-active");
    await h.setStatus(id(500), "cancelled");
    await h.reconcile(300);
    assert.equal(await h.field(match, "analysis_method"), "manual");
  } finally {
    await h.db.close();
  }
});
