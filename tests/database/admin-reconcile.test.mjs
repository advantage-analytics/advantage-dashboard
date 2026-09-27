import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { id, setup } from "./fixtures/admin-video-harness.mjs";

test("reconciliation abandons stuck console attempts and completes orphaned file processing", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const role = async (actor, name = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        actor ? id(actor) : "",
      ]);
      if (name !== "owner") await db.exec("set role " + name);
    };
    const refuse = (fn, message) =>
      assert.rejects(fn, (e) => e.message.includes(message));
    const one = async (sql, params = []) =>
      (await db.query(sql, params)).rows[0];
    const count = async (from, params = []) =>
      (await one(`select count(*)::int as n from ${from}`, params)).n;
    // The route supplies the verified session actor; actor 1 is a member
    // admin who never started any of these operations (actor 2 did).
    const reconcile = async (op, mode, actor = 1) =>
      (
        await one(
          "select admin_reconcile_submission_item($1,$2,$3,$4) as data",
          [id(actor), id(op), id(op + 1), mode],
        )
      ).data;
    const videoRequest = {
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
    const submitVideo = async (op, match = null, fingerprint = null) =>
      (
        await one(
          "select admin_submit_match_video($1,$2,$3,$4,$5,$6,$7) as data",
          [id(2), id(op), id(op + 1), id(10), match, fingerprint, videoRequest],
        )
      ).data;
    const fileRequest = (op) => ({
      sha256: "a".repeat(64),
      storagePath: `_admin-console/${id(op)}/${id(op + 1)}/${"a".repeat(64)}.xlsx`,
      fileName: "match.xlsx",
      fileSize: 1234,
      playerId: id(4),
      date: "2026-09-15",
      matchType: "Singles",
      courtType: "Hard",
      parsed: {
        player1_name: "Athlete",
        player2_name: "Opponent",
        score: {
          player1: [6, 7],
          player2: [4, 6],
          player1_tiebreaks: [null, 7],
          player2_tiebreaks: [null, 4],
        },
        result: "Athlete Wins",
        winner: "player1",
        format: { best_of: 3, ad_scoring: true },
      },
    });
    const submitFile = async (op) =>
      (
        await one(
          "select admin_submit_match_file($1,$2,$3,$4,null,null,$5) as data",
          [id(2), id(op), id(op + 1), id(10), fileRequest(op)],
        )
      ).data;
    const preview = async () =>
      (
        await one("select admin_get_analysis_attachment($1,$2) as data", [
          id(10),
          id(20),
        ])
      ).data;
    const prepare = async (op, fingerprint) =>
      (
        await one(
          "select admin_prepare_analysis_attachment($1,$2,$3,$4,$5) as data",
          [id(op), id(op + 1), id(10), id(20), fingerprint],
        )
      ).data;
    const lastAudit = () =>
      one(
        "select program_id,actor_user_id,action,subject_id,details from program_audit_log order by id desc limit 1",
      );

    // A video attachment to the coach's match whose upload died.
    await role(2);
    const fingerprint = (await preview()).fingerprint;
    await prepare(300, fingerprint);
    await role(null, "service_role");
    const attached = await submitVideo(300, id(20), fingerprint);
    await role(null, "owner");
    await db.query(
      "update processing_jobs set status='failed',error_message='upload interrupted' where id=$1",
      [attached.job_id],
    );
    const auditBefore = await count("program_audit_log");

    // Service-only, any CURRENT admin, never a non-admin actor id.
    await role(null, "anon");
    await refuse(() => reconcile(300, "abandon"), "permission denied");
    await role(2);
    await refuse(() => reconcile(300, "abandon"), "permission denied");
    await role(null, "service_role");
    await refuse(() => reconcile(300, "abandon", 3), "admin-required");
    await refuse(() => reconcile(300, "restart"), "mode-invalid");
    await refuse(() => reconcile(999, "abandon"), "operation-not-found");
    await refuse(() => reconcile(300, "complete"), "mode-unsupported");

    const abandoned = await reconcile(300, "abandon");
    assert.deepEqual(abandoned, {
      mode: "abandon",
      kind: "video",
      operationId: id(300),
      itemId: id(301),
      programId: id(10),
      matchId: id(20),
      jobId: attached.job_id,
      fileId: null,
      storagePath: null,
      consoleCreated: false,
    });
    await role(null, "owner");
    assert.equal(
      await count("admin_video_attempts where match_id=$1", [id(20)]),
      0,
    );
    assert.equal(
      await count("admin_analysis_reservations where match_id=$1", [id(20)]),
      0,
    );
    assert.deepEqual(
      await one(
        "select source_provider,analysis_method from matches where id=$1",
        [id(20)],
      ),
      { source_provider: null, analysis_method: "manual" },
    );
    // Closed, not deleted; the recorded error survives.
    assert.deepEqual(
      await one(
        "select status,error_message,external_job_id from processing_jobs where id=$1",
        [attached.job_id],
      ),
      {
        status: "failed",
        error_message: "upload interrupted",
        external_job_id: null,
      },
    );
    const item = await one(
      "select status,error_code,audit_id,match_id,processing_job_id,match_file_id,result from admin_upload_submission_items where operation_id=$1 and item_id=$2",
      [id(300), id(301)],
    );
    assert.equal(item.status, "failed");
    assert.equal(item.error_code, "abandoned");
    assert.equal(item.audit_id, null);
    assert.equal(item.match_id, null);
    assert.equal(item.processing_job_id, null);
    assert.equal(item.match_file_id, null);
    assert.equal(item.result.matchId, id(20)); // admission result kept
    assert.equal(item.result.abandoned.matchId, id(20));
    assert.equal(item.result.abandoned.jobId, attached.job_id);
    assert.equal(item.result.abandoned.actorId, id(1));
    assert.ok(item.result.abandoned.at);
    assert.equal(await count("program_audit_log"), auditBefore + 1);
    const audit = await lastAudit();
    assert.equal(audit.action, "console.submission_reconciled");
    assert.equal(audit.program_id, id(10));
    assert.equal(audit.actor_user_id, id(1));
    assert.equal(audit.subject_id, id(20));
    assert.deepEqual(
      {
        mode: audit.details.mode,
        operation_id: audit.details.operation_id,
        item_id: audit.details.item_id,
        match_id: audit.details.match_id,
        processing_job_id: audit.details.processing_job_id,
      },
      {
        mode: "abandon",
        operation_id: id(300),
        item_id: id(301),
        match_id: id(20),
        processing_job_id: attached.job_id,
      },
    );
    // The match is attachable again: a fresh preparation succeeds.
    await role(2);
    const prepared = await prepare(500, (await preview()).fingerprint);
    assert.equal(prepared.status, "prepared");
    await role(null, "service_role");
    await refuse(() => reconcile(300, "abandon"), "attempt-missing");

    // A console-created match whose job the vendor holds cannot be abandoned.
    const created = await submitVideo(100);
    await role(null, "owner");
    await db.query(
      "update processing_jobs set status='uploaded',video_object_key='actor/match/video.mp4' where id=$1",
      [created.job_id],
    );
    await role(null, "service_role");
    await db.query("select admin_video_access($1,null,$2,'claim')", [
      id(2),
      created.job_id,
    ]);
    await refuse(() => reconcile(100, "abandon"), "attempt-active");
    const reserved = await one(
      "select * from admin_reserve_video_quota($1,$2,600,'2026-09-01',270000,7200)",
      [id(2), created.job_id],
    );
    assert.equal(reserved.ok, true);
    await role(null, "owner");
    await db.query(
      "update processing_jobs set status='failed',external_job_id='vendor-job-1' where id=$1",
      [created.job_id],
    );
    await role(null, "service_role");
    await refuse(() => reconcile(100, "abandon"), "attempt-active");
    await role(null, "owner");
    await db.query(
      "update processing_jobs set external_job_id=null where id=$1",
      [created.job_id],
    );
    await role(null, "service_role");
    await refuse(() => reconcile(100, "abandon"), "quota-held");
    await role(null, "owner");
    await db.query(
      "update processing_usage set released=true where job_id=$1",
      [created.job_id],
    );
    await role(null, "service_role");
    const consoleAbandoned = await reconcile(100, "abandon");
    assert.equal(consoleAbandoned.consoleCreated, true);
    assert.equal(consoleAbandoned.matchId, created.match_id);
    assert.equal(consoleAbandoned.jobId, created.job_id);
    await role(null, "owner");
    // The match row survives for T22's purge + delete, already reverted.
    assert.deepEqual(
      await one(
        "select source_provider,analysis_method from matches where id=$1",
        [created.match_id],
      ),
      { source_provider: null, analysis_method: "manual" },
    );
    assert.deepEqual(
      await one(
        "select status,error_message from processing_jobs where id=$1",
        [created.job_id],
      ),
      { status: "failed", error_message: "abandoned" },
    );
    assert.equal(
      await count("admin_video_attempts where match_id=$1", [created.match_id]),
      0,
    );

    // A file whose process-match run wrote stats but never finished the claim.
    await role(null, "service_role");
    const file = await submitFile(600);
    assert.equal(file.state, "queued");
    await refuse(() => reconcile(600, "complete"), "attempt-not-processing");
    const lease = (
      await one("select admin_claim_match_file($1,$2,true) as data", [
        file.match_id,
        id(2),
      ])
    ).data;
    assert.equal(lease.claimed, true);
    await refuse(() => reconcile(600, "complete"), "analysis-missing");
    await role(null, "owner");
    await db.query("insert into points(match_id) values($1)", [file.match_id]);
    await role(null, "service_role");
    await refuse(() => reconcile(600, "complete"), "analysis-missing");
    await role(null, "owner");
    await db.query("insert into match_stats(match_id) values($1)", [
      file.match_id,
    ]);
    const auditBeforeComplete = await count("program_audit_log");
    await role(null, "service_role");
    const completed = await reconcile(600, "complete");
    assert.deepEqual(completed, {
      mode: "complete",
      kind: "file",
      operationId: id(600),
      itemId: id(601),
      programId: id(10),
      matchId: file.match_id,
      jobId: null,
      fileId: file.file_id,
      storagePath: null,
      consoleCreated: true,
    });
    await role(null, "owner");
    const attempt = await one(
      "select state,completed_at from admin_file_attempts where match_id=$1",
      [file.match_id],
    );
    assert.equal(attempt.state, "completed");
    assert.ok(attempt.completed_at);
    const fileItem = await one(
      "select status,audit_id,match_id,match_file_id,result from admin_upload_submission_items where operation_id=$1",
      [id(600)],
    );
    assert.equal(fileItem.status, "succeeded");
    assert.notEqual(fileItem.audit_id, null);
    assert.equal(fileItem.match_id, file.match_id);
    assert.equal(fileItem.match_file_id, file.file_id);
    assert.equal(fileItem.result.completed.actorId, id(1));
    assert.equal(await count("program_audit_log"), auditBeforeComplete + 1);
    const completeAudit = await lastAudit();
    assert.equal(completeAudit.action, "console.submission_reconciled");
    assert.equal(completeAudit.details.mode, "complete");
    assert.equal(completeAudit.details.match_file_id, file.file_id);
    assert.equal(await count("match_files where id=$1", [file.file_id]), 1);
    await role(null, "service_role");
    await refuse(() => reconcile(600, "complete"), "attempt-completed");
    await refuse(() => reconcile(600, "abandon"), "attempt-completed");

    // A queued file cannot be abandoned once stats exist; without them it can.
    const second = await submitFile(700);
    await role(null, "owner");
    await db.query("insert into points(match_id) values($1)", [
      second.match_id,
    ]);
    await role(null, "service_role");
    await refuse(() => reconcile(700, "abandon"), "analysis-present");
    await role(null, "owner");
    await db.query("delete from points where match_id=$1", [second.match_id]);
    await role(null, "service_role");
    const fileAbandoned = await reconcile(700, "abandon");
    assert.deepEqual(fileAbandoned, {
      mode: "abandon",
      kind: "file",
      operationId: id(700),
      itemId: id(701),
      programId: id(10),
      matchId: second.match_id,
      jobId: null,
      fileId: second.file_id,
      // Read before the match_files delete erased it: the caller's only way
      // to the object, and null for the video abandon and the complete above.
      storagePath: fileRequest(700).storagePath,
      consoleCreated: true,
    });
    await role(null, "owner");
    assert.equal(await count("match_files where id=$1", [second.file_id]), 0);
    assert.equal(
      await count("admin_file_attempts where match_id=$1", [second.match_id]),
      0,
    );
    assert.deepEqual(
      await one(
        "select source_provider,analysis_method from matches where id=$1",
        [second.match_id],
      ),
      { source_provider: null, analysis_method: "manual" },
    );
    const secondItem = await one(
      "select status,error_code,audit_id,match_file_id,result from admin_upload_submission_items where operation_id=$1",
      [id(700)],
    );
    assert.equal(secondItem.status, "failed");
    assert.equal(secondItem.error_code, "abandoned");
    assert.equal(secondItem.audit_id, null);
    assert.equal(secondItem.match_file_id, null);
    assert.equal(secondItem.result.abandoned.fileId, second.file_id);
    assert.equal(
      secondItem.result.abandoned.storagePath,
      fileRequest(700).storagePath,
    );
    assert.equal((await lastAudit()).details.match_file_id, second.file_id);

    // Schedule results are not this RPC's business.
    await db.query(
      "insert into admin_upload_submissions(operation_id,actor_user_id,program_id,kind) values($1,$2,$3,'dual')",
      [id(800), id(2), id(10)],
    );
    await db.query(
      "insert into admin_upload_submission_items(operation_id,item_id,kind,request) values($1,$2,'outcome','{}')",
      [id(800), id(801)],
    );
    await role(null, "service_role");
    await refuse(() => reconcile(800, "abandon"), "kind-unsupported");
  } finally {
    await db.close();
  }
});
