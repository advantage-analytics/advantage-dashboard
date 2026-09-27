import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/admin-video-harness.mjs";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("video admission preserves coach results, serializes jobs, and guards state", async () => {
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
    const submit = async (
      actor = 2,
      op = 100,
      match = null,
      fp = null,
      req = request,
      program = 10,
    ) =>
      (
        await db.query(
          "select admin_submit_match_video($1,$2,$3,$4,$5,$6,$7) as data",
          [id(actor), id(op), id(op + 1), id(program), match, fp, req],
        )
      ).rows[0].data;
    const access = async (
      job,
      action = "read",
      actor = 2,
      match = null,
      blob = null,
    ) =>
      (
        await db.query("select admin_video_access($1,$2,$3,$4,$5) as data", [
          id(actor),
          match,
          job,
          action,
          blob,
        ])
      ).rows[0].data;
    await role(2);
    await refuse(() => submit(), "permission denied");
    await role(null, "service_role");
    await refuse(() => submit(3), "admin-required");
    const created = await submit();
    assert.deepEqual(await submit(), created);
    await refuse(() => submit(1), "Operation identity conflict");
    await refuse(
      () => submit(2, 100, null, null, { ...request, endSeconds: 620 }),
      "Item identity conflict",
    );
    const member = await submit(1, 200);
    assert.equal((await access(member.job_id, "read", 1)).programId, id(10));
    assert.equal((await access(created.job_id)).programId, id(10));
    await refuse(() => access(created.job_id, "read", 3), "admin-required");
    await refuse(() => access(created.job_id, "read", 1), "admin-required");
    await refuse(
      () => access(created.job_id, "read", 2, id(20)),
      "video-linkage-mismatch",
    );
    await role(2);
    const preview = (
      await db.query("select admin_get_analysis_attachment($1,$2) as data", [
        id(10),
        id(20),
      ])
    ).rows[0].data;
    await db.query("select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)", [
      id(300),
      id(301),
      id(10),
      id(20),
      preview.fingerprint,
    ]);
    await role(null, "service_role");
    await refuse(
      () => submit(2, 300, id(20), preview.fingerprint, request, 11),
      "Operation identity conflict",
    );
    await refuse(
      () =>
        submit(2, 300, id(20), preview.fingerprint, {
          ...request,
          adScoring: false,
        }),
      "scoring-mismatch",
    );
    const attached = await submit(2, 300, id(20), preview.fingerprint);
    assert.deepEqual(
      await submit(2, 300, id(20), preview.fingerprint),
      attached,
    );
    await access(attached.job_id, "blob", 2, null, "actor/match/video.mp4");
    await role(null, "owner");
    const match = (
      await db.query("select to_jsonb(m) as data from matches m where id=$1", [
        id(20),
      ])
    ).rows[0].data;
    assert.deepEqual(
      { ...match, source_provider: null, analysis_method: "manual" },
      preview.match,
    );
    await refuse(
      () => db.query("update matches set score='{}' where id=$1", [id(20)]),
      "recorded-result-protected",
    );
    await refuse(
      () =>
        db.query(
          "insert into processing_jobs(match_id,created_by,status) values($1,$2,'uploading')",
          [id(20), id(2)],
        ),
      "analysis-already-submitted",
    );
    await refuse(
      () => db.query("insert into match_files(match_id) values($1)", [id(20)]),
      "analysis-already-submitted",
    );
    await db.query(
      "insert into processing_jobs(id,status) values($1,'failed')",
      [id(999)],
    );
    await db.query("delete from processing_jobs where id=$1", [id(999)]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from processing_jobs where id=$1",
          [id(999)],
        )
      ).rows[0].n,
      0,
    );
    await refuse(
      () =>
        db.query(
          "update program_event_entries set opponent_labels=ARRAY['Changed'] where id=$1",
          [id(30)],
        ),
      "recorded-entry-protected",
    );
    await db.exec(
      "grant select,update,delete on processing_jobs to authenticated",
    );
    await role(2);
    await refuse(
      () =>
        db.query("update processing_jobs set created_by=$1 where id=$2", [
          id(1),
          attached.job_id,
        ]),
      "video-job-protected",
    );
    await refuse(
      () =>
        db.query(
          "update processing_jobs set initial_top_player_is_player1=true where id=$1",
          [attached.job_id],
        ),
      "video-job-protected",
    );
    await refuse(
      () =>
        db.query("update processing_jobs set status='queued' where id=$1", [
          attached.job_id,
        ]),
      "video-state-protected",
    );
    await refuse(
      () =>
        db.query("delete from processing_jobs where id=$1", [attached.job_id]),
      "video-job-protected",
    );
    await db.query(
      "update processing_jobs set start_time_seconds=0,end_time_seconds=600,billable_seconds=600,upload_progress_percent=20 where id=$1",
      [attached.job_id],
    );
    await db.query(
      "update processing_jobs set status='uploaded',video_object_key='actor/match/video.mp4',upload_progress_percent=100 where id=$1",
      [attached.job_id],
    );
    await refuse(
      () =>
        db.query(
          "update processing_jobs set start_time_seconds=1 where id=$1",
          [attached.job_id],
        ),
      "invalid-remux-window",
    );
    await role(null, "service_role");
    await access(attached.job_id, "claim");
    const reserve = async (seconds = 600, job = attached.job_id) =>
      (
        await db.query(
          "select * from admin_reserve_video_quota($1,$2,$3,'2026-09-01',270000,7200)",
          [id(2), job, seconds],
        )
      ).rows[0];
    await role(null, "owner");
    await db.query("update program_players set archived_at=now() where id=$1", [
      id(4),
    ]);
    await role(null, "service_role");
    await refuse(() => reserve(), "athlete-ineligible");
    await role(null, "owner");
    await db.query("update program_players set archived_at=null where id=$1", [
      id(4),
    ]);
    await role(null, "service_role");
    await refuse(() => reserve(601), "invalid-video-reservation");
    assert.deepEqual(await reserve(), {
      ok: true,
      used_seconds: 600,
      cap_seconds: 270000,
    });
    await refuse(() => reserve(), "video-quota-already-reserved");

    await refuse(
      () => access(attached.job_id, "claim"),
      "video-already-claimed",
    );
    await refuse(
      () => access(attached.job_id, "upload"),
      "video-not-uploadable",
    );
    await role(null, "owner");
    const usage = (
      await db.query(
        "select account_id,account_type,created_by,reserved_seconds from processing_usage",
      )
    ).rows;
    assert.deepEqual(usage, [
      {
        account_id: id(10),
        account_type: "program",
        created_by: id(2),
        reserved_seconds: 600,
      },
    ]);
    await db.query(
      "update processing_jobs set status='completed' where id=$1",
      [attached.job_id],
    );
    const state = async () =>
      (
        await db.query(
          "select result->>'state' as state from admin_upload_submission_items where operation_id=$1",
          [id(300)],
        )
      ).rows[0].state;
    assert.equal(await state(), "stats_pending");
    await db.query(
      "update processing_jobs set derivation_version=1 where id=$1",
      [attached.job_id],
    );
    assert.equal(await state(), "completed");
    assert.equal(
      (await db.query("select count(*)::int n from processing_jobs")).rows[0].n,
      3,
    );
    assert.equal(
      (await db.query("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      3,
    );
    await db.query(
      "insert into program_players values($1,$2,null,null,null,'Club','Athlete')",
      [id(5), id(11)],
    );
    await role(null, "service_role");
    const club = await submit(
      2,
      400,
      null,
      null,
      { ...request, playerId: id(5) },
      11,
    );
    await role(null, "owner");
    await db.query("update processing_jobs set status='uploaded' where id=$1", [
      club.job_id,
    ]);
    await role(null, "service_role");
    await access(club.job_id, "claim");
    assert.deepEqual(await reserve(600, club.job_id), {
      ok: true,
      used_seconds: 600,
      cap_seconds: 7200,
    });
    await role(null, "owner");
    assert.deepEqual(
      (
        await db.query(
          "select account_id,account_type from processing_usage where job_id=$1",
          [club.job_id],
        )
      ).rows[0],
      { account_id: id(11), account_type: "program" },
    );
    await db.query("update programs set status='claim_pending' where id=$1", [
      id(10),
    ]);
    await role(null, "service_role");
    await refuse(() => access(created.job_id), "program-inactive");
  } finally {
    await db.close();
  }
});
