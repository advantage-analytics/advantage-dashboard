import { test } from "node:test";
import assert from "node:assert/strict";
import {
  postgresHarness,
  role,
  overlapping,
} from "../fixtures/postgres-harness.mjs";
import {
  setup as videoSetup,
  id as videoId,
} from "../fixtures/admin-video-harness.mjs";
import {
  setup as scheduleSetup,
  id,
} from "../fixtures/admin-schedule-harness.mjs";
import {
  dualRequest,
  tournamentRequest,
} from "../fixtures/admin-result-requests.mjs";

const data = async (db, sql, params) =>
  (await db.query(sql, params)).rows[0].data;
const expectError = (result, message) =>
  assert.match(result.error?.message ?? "", new RegExp(message));
const videoRequest = {
  playerId: videoId(4),
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
const fileRequest = (op) => ({
  sha256: "a".repeat(64),
  storagePath: `_admin-console/${videoId(op)}/${videoId(op + 1)}/${"a".repeat(64)}.xlsx`,
  fileName: "match.xlsx",
  fileSize: 1234,
  playerId: videoId(4),
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
const submit = (db, kind, op = 100, match = null, fp = null) =>
  data(db, `select admin_submit_match_${kind}($1,$2,$3,$4,$5,$6,$7) data`, [
    videoId(2),
    videoId(op),
    videoId(op + 1),
    videoId(10),
    match,
    fp,
    kind === "video" ? videoRequest : fileRequest(op),
  ]);
const access = (db, job, action) =>
  data(db, "select admin_video_access($1,null,$2,$3) data", [
    videoId(2),
    job,
    action,
  ]);

async function mediaHarness() {
  const p = await postgresHarness();
  try {
    await videoSetup(p.db);
    const a = await p.connect(),
      b = await p.connect();
    await role(a, videoId(2));
    await role(b, videoId(2));
    return { ...p, a, b };
  } catch (error) {
    await p.close();
    throw error;
  }
}

for (const kind of ["file", "video"]) {
  test(`${kind}: simultaneous double submission, lost response and rollback yield one match/link/audit`, async () => {
    const p = await mediaHarness();
    try {
      const { winner, loser } = await overlapping(
        p.a,
        p.b,
        p.db,
        () => submit(p.a, kind),
        () => submit(p.b, kind),
      );
      assert.ifError(loser.error);
      assert.deepEqual(loser.value, winner);
      // Client discarded the first response after commit: same operation recovers.
      assert.deepEqual(await submit(p.b, kind), winner);
      const retried = await overlapping(
        p.a,
        p.b,
        p.db,
        () => submit(p.a, kind, 200),
        () => submit(p.b, kind, 200),
        false,
      );
      assert.ifError(retried.loser.error);
      assert.notEqual(retried.loser.value.match_id, retried.winner.match_id);
      assert.equal(
        (
          await p.db.query(
            "select count(*)::int n from matches where created_by=$1",
            [videoId(2)],
          )
        ).rows[0].n,
        2,
      );
      for (const table of [
        kind === "file" ? "match_files" : "processing_jobs",
        "program_audit_log",
        "admin_upload_submissions",
      ])
        assert.equal(
          (await p.db.query(`select count(*)::int n from ${table}`)).rows[0].n,
          2,
        );
    } finally {
      await p.close();
    }
  });
}

test("file worker simultaneous claims and partial writes cannot be replayed", async () => {
  const p = await mediaHarness();
  try {
    const saved = await submit(p.a, "file");
    const claim = (db) =>
      data(db, "select admin_claim_match_file($1,$2,false) data", [
        saved.match_id,
        videoId(2),
      ]);
    const { winner, loser } = await overlapping(
      p.a,
      p.b,
      p.db,
      () => claim(p.a),
      () => claim(p.b),
    );
    assert.equal(winner.claimed, true);
    assert.ifError(loser.error);
    assert.equal(loser.value.claimed, false);
    await p.db.query("insert into points(match_id) values($1)", [
      saved.match_id,
    ]);
    await p.a.query(
      "select admin_finish_match_file($1,$2,'partial-worker-failure')",
      [saved.match_id, winner.claim_token],
    );
    assert.equal((await claim(p.b)).claimed, false);
    assert.equal((await submit(p.b, "file")).match_id, saved.match_id);
    assert.equal(
      (await p.db.query("select count(*)::int n from points")).rows[0].n,
      1,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from match_files")).rows[0].n,
      1,
    );
  } finally {
    await p.close();
  }
});

test("video simultaneous submit claims and quota reservations charge target program exactly once", async () => {
  const p = await mediaHarness();
  try {
    const saved = await submit(p.a, "video");
    await p.db.query(
      "update processing_jobs set status='uploaded' where id=$1",
      [saved.job_id],
    );
    const claimed = await overlapping(
      p.a,
      p.b,
      p.db,
      () => access(p.a, saved.job_id, "claim"),
      () => access(p.b, saved.job_id, "claim"),
    );
    expectError(claimed.loser, "video-already-claimed");
    const reserve = (db) =>
      db.query(
        "select * from admin_reserve_video_quota($1,$2,600,'2026-09-01',270000,7200)",
        [videoId(2), saved.job_id],
      );
    const charged = await overlapping(
      p.a,
      p.b,
      p.db,
      () => reserve(p.a),
      () => reserve(p.b),
    );
    assert.equal(charged.winner.rows[0].ok, true);
    expectError(charged.loser, "video-quota-already-reserved");
    assert.deepEqual(
      (
        await p.db.query(
          "select account_id,account_type,created_by,reserved_seconds from processing_usage",
        )
      ).rows,
      [
        {
          account_id: videoId(10),
          account_type: "program",
          created_by: videoId(2),
          reserved_seconds: 600,
        },
      ],
    );
    // Unknown vendor acceptance / lost queued write leaves a non-replayable claim.
    assert.equal((await submit(p.b, "video")).job_id, saved.job_id);
    await assert.rejects(
      () => access(p.b, saved.job_id, "claim"),
      /video-already-claimed/,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from processing_jobs")).rows[0]
        .n,
      1,
    );
  } finally {
    await p.close();
  }
});

for (const kind of ["file", "video"]) {
  test(`${kind} attachment preserves full coach record against simultaneous result mutation`, async () => {
    const p = await mediaHarness();
    try {
      if (kind === "file")
        await p.db.query("update matches set score=$1 where id=$2", [
          fileRequest(100).parsed.score,
          videoId(20),
        ]);
      await role(p.a, videoId(2), "authenticated");
      const before = await data(
        p.a,
        "select admin_get_analysis_attachment($1,$2) data",
        [videoId(10), videoId(20)],
      );
      await p.a.query(
        "select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)",
        [
          videoId(100),
          videoId(101),
          videoId(10),
          videoId(20),
          before.fingerprint,
        ],
      );
      await role(p.a, videoId(2));
      await role(p.b, null, "owner");
      const race = await overlapping(
        p.a,
        p.b,
        p.db,
        () => submit(p.a, kind, 100, videoId(20), before.fingerprint),
        () =>
          p.b.query(
            "update matches set score='{}',player1_name='Wrong athlete' where id=$1",
            [videoId(20)],
          ),
      );
      expectError(race.loser, "recorded-result-protected");
      const after = (
        await p.db.query("select to_jsonb(m) data from matches m where id=$1", [
          videoId(20),
        ])
      ).rows[0].data;
      assert.deepEqual(
        {
          ...after,
          source_provider: before.match.source_provider,
          analysis_method: before.match.analysis_method,
        },
        before.match,
      );
      assert.equal(
        (await p.db.query("select count(*)::int n from program_audit_log"))
          .rows[0].n,
        1,
      );
    } finally {
      await p.close();
    }
  });
}

async function resultHarness(kind) {
  const p = await postgresHarness();
  try {
    await scheduleSetup(
      ["20260919045138_save_admin_tournament_results.sql"],
      p.db,
    );
    const a = await p.connect(),
      b = await p.connect();
    await role(a, id(2));
    await role(b, id(2));
    const prepare = (db, body) =>
      data(
        db,
        `select admin_prepare_${kind === "dual" ? "dual_results" : "tournament_result"}($1,$2,$3,$4) data`,
        [id(2), body.operationId, id(10), body],
      );
    const apply = (db, op = 100) =>
      data(db, `select admin_apply_${kind}_result($1,$2,$3) data`, [
        id(2),
        id(op),
        id(op + 1),
      ]);
    return { ...p, a, b, prepare, apply };
  } catch (error) {
    await p.close();
    throw error;
  }
}

for (const kind of ["dual", "tournament"]) {
  test(`${kind} overlapping setup and result retries persist one event, result and audit`, async () => {
    const p = await resultHarness(kind);
    try {
      const req = kind === "dual" ? dualRequest() : tournamentRequest();
      const setupRace = await overlapping(
        p.a,
        p.b,
        p.db,
        () => p.prepare(p.a, req),
        () => p.prepare(p.b, req),
      );
      assert.ifError(setupRace.loser.error);
      assert.deepEqual(setupRace.loser.value, setupRace.winner);
      const applied = await overlapping(
        p.a,
        p.b,
        p.db,
        () => p.apply(p.a),
        () => p.apply(p.b),
      );
      assert.ifError(applied.loser.error);
      assert.deepEqual(applied.loser.value, applied.winner);
      assert.deepEqual(await p.apply(p.b), applied.winner);
      for (const table of ["program_events", "matches", "program_audit_log"])
        assert.equal(
          (await p.db.query(`select count(*)::int n from ${table}`)).rows[0].n,
          1,
        );
    } finally {
      await p.close();
    }
  });
  test(`${kind} competing operations on one result target have one winner`, async () => {
    const p = await resultHarness(kind);
    try {
      const req = kind === "dual" ? dualRequest() : tournamentRequest();
      const first = await p.prepare(p.a, req);
      const ctx = await data(
        p.a,
        `select admin_get_${kind}_result_context($1,$2,$3) data`,
        [id(2), id(10), first.eventId],
      );
      const next = kind === "dual" ? dualRequest(200) : tournamentRequest(200);
      next.event = {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: ctx.fingerprint,
      };
      if (kind === "dual") next.items = next.items.slice(0, 1);
      else
        next.entry = {
          kind: "existing",
          entryId: first.entryId,
          playerId: id(20),
          fingerprint: ctx.entries.find((e) => e.id === first.entryId)
            .fingerprint,
        };
      await p.prepare(p.b, next);
      const raced = await overlapping(
        p.a,
        p.b,
        p.db,
        () => p.apply(p.a),
        () => p.apply(p.b, 200),
      );
      assert.ifError(raced.loser.error);
      const item =
        kind === "dual" ? raced.loser.value.items[0] : raced.loser.value.item;
      assert.equal(item.error, "result-already-recorded");
      assert.equal(
        (await p.db.query("select count(*)::int n from matches")).rows[0].n,
        1,
      );
      assert.equal(
        (await p.db.query("select count(*)::int n from program_audit_log"))
          .rows[0].n,
        1,
      );
    } finally {
      await p.close();
    }
  });
}

test("actual roles enforce admin-only provenance reads, private helper denial and attachment scope", async () => {
  const p = await mediaHarness();
  try {
    const video = await submit(p.a, "video");
    await submit(p.a, "file", 200);
    await role(p.a, videoId(2), "authenticated");
    const attachment = await data(
      p.a,
      "select admin_get_analysis_attachment($1,$2) data",
      [videoId(10), videoId(20)],
    );
    await p.a.query(
      "select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)",
      [
        videoId(300),
        videoId(301),
        videoId(10),
        videoId(20),
        attachment.fingerprint,
      ],
    );
    const tables = [
      "admin_upload_submissions",
      "admin_upload_submission_items",
      "admin_analysis_reservations",
      "admin_file_attempts",
      "admin_video_attempts",
    ];
    for (const actor of [1, 2]) {
      await role(p.a, videoId(actor), "authenticated");
      for (const table of tables) {
        assert.ok((await p.a.query(`select * from ${table}`)).rows.length > 0);
        await assert.rejects(() => p.a.query(`delete from ${table}`), {
          code: "42501",
        });
        await assert.rejects(
          () => p.a.query(`update ${table} set operation_id=operation_id`),
          { code: "42501" },
        );
        await assert.rejects(
          () => p.a.query(`insert into ${table} default values`),
          { code: "42501" },
        );
        await assert.rejects(() => p.a.query(`truncate ${table}`), {
          code: "42501",
        });
      }
      await assert.rejects(() => submit(p.a, "video", 400), { code: "42501" });
      await assert.rejects(
        () =>
          p.a.query("select admin_uploads_private.finish_item($1,$2,'{}')", [
            videoId(300),
            videoId(301),
          ]),
        { code: "42501" },
      );
    }
    await role(p.a, videoId(3), "authenticated");
    for (const table of tables)
      assert.equal((await p.a.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(
      () =>
        p.a.query("select admin_get_analysis_attachment($1,$2)", [
          videoId(10),
          videoId(20),
        ]),
      /admin-required/,
    );
    await role(p.a, null, "anon");
    for (const table of tables)
      await assert.rejects(() => p.a.query(`select * from ${table}`), {
        code: "42501",
      });
    await assert.rejects(
      () =>
        p.a.query("select admin_get_analysis_attachment($1,$2)", [
          videoId(10),
          videoId(20),
        ]),
      { code: "42501" },
    );
    await role(p.a, videoId(2), "authenticated");
    await assert.rejects(
      () =>
        p.a.query("select admin_get_analysis_attachment($1,$2)", [
          videoId(11),
          videoId(20),
        ]),
      /wrong-program/,
    );
    await role(p.a, videoId(1));
    await assert.rejects(
      () =>
        data(p.a, "select admin_video_access($1,null,$2,'read') data", [
          videoId(1),
          video.job_id,
        ]),
      /admin-required/,
    );
    // Revoking is_admin immediately removes session visibility and service admission.
    await p.db.query("update users set is_admin=false where id=$1", [
      videoId(2),
    ]);
    await role(p.a, videoId(2), "authenticated");
    for (const table of tables)
      assert.equal((await p.a.query(`select * from ${table}`)).rows.length, 0);
    await role(p.a, videoId(2));
    await assert.rejects(() => submit(p.a, "video"), /admin-required/);
    await assert.rejects(() => submit(p.a, "file", 200), /admin-required/);
  } finally {
    await p.close();
  }
});

test("attachment reservations reject simultaneous second operations and forged scope", async () => {
  const p = await mediaHarness();
  try {
    await role(p.a, videoId(2), "authenticated");
    await role(p.b, videoId(1), "authenticated");
    const snap = await data(
      p.a,
      "select admin_get_analysis_attachment($1,$2) data",
      [videoId(10), videoId(20)],
    );
    const prepare = (db, op) =>
      db.query("select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)", [
        videoId(op),
        videoId(op + 1),
        videoId(10),
        videoId(20),
        snap.fingerprint,
      ]);
    const race = await overlapping(
      p.a,
      p.b,
      p.db,
      () => prepare(p.a, 100),
      () => prepare(p.b, 200),
    );
    expectError(race.loser, "attachment-reserved");
    assert.equal(
      (
        await p.db.query(
          "select count(*)::int n from admin_analysis_reservations",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from admin_upload_submissions"))
        .rows[0].n,
      1,
    );
    await role(p.b, videoId(2));
    await assert.rejects(
      () => submit(p.b, "video", 200, videoId(20), snap.fingerprint),
      /attachment-not-prepared/,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from processing_jobs")).rows[0]
        .n,
      0,
    );
  } finally {
    await p.close();
  }
});

test("program status rules admit claim-pending file only and recheck video charging under a concurrent status change", async () => {
  const p = await mediaHarness();
  try {
    for (const [status, allowed] of [
      ["claim_pending", true],
      ["suspended", false],
      ["archived", false],
    ]) {
      await p.db.query("update programs set status=$1 where id=$2", [
        status,
        videoId(10),
      ]);
      if (allowed) await submit(p.a, "file", 200);
      else
        await assert.rejects(
          () => submit(p.a, "file", 300),
          /program-inactive/,
        );
      await assert.rejects(() => submit(p.a, "video"), /program-inactive/);
    }
    await p.db.query("update programs set status='active' where id=$1", [
      videoId(10),
    ]);
    const saved = await submit(p.a, "video");
    await p.db.query(
      "update processing_jobs set status='uploaded' where id=$1",
      [saved.job_id],
    );
    await access(p.a, saved.job_id, "claim");
    await role(p.a, null, "owner");
    const race = await overlapping(
      p.a,
      p.b,
      p.db,
      () =>
        p.a.query("update programs set status='claim_pending' where id=$1", [
          videoId(10),
        ]),
      () =>
        p.b.query(
          "select * from admin_reserve_video_quota($1,$2,600,'2026-09-01',270000,7200)",
          [videoId(2), saved.job_id],
        ),
    );
    expectError(race.loser, "program-inactive");
    assert.equal(
      (await p.db.query("select count(*)::int n from processing_usage")).rows[0]
        .n,
      0,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from processing_jobs")).rows[0]
        .n,
      1,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from match_files")).rows[0].n,
      1,
    );
  } finally {
    await p.close();
  }
});

for (const kind of ["dual", "tournament"]) {
  test(`${kind} ordinary coach writer cannot bypass a simultaneous console result`, async () => {
    const p = await resultHarness(kind);
    try {
      const first = await p.prepare(
        p.a,
        kind === "dual" ? dualRequest() : tournamentRequest(),
      );
      const entry =
        kind === "dual"
          ? (
              await p.db.query(
                "select id from program_event_entries where event_id=$1 and slot='S1'",
                [first.eventId],
              )
            ).rows[0].id
          : first.entryId;
      await role(p.b, id(3), "authenticated");
      const race = await overlapping(
        p.a,
        p.b,
        p.db,
        () => p.apply(p.a),
        () =>
          p.b.query(
            "insert into matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,analysis_method) values($1,$2,$3,$4,'Player1 Athlete','Coach opponent',$5,'{}','manual')",
            [id(3), id(10), entry, id(20), kind === "dual" ? "S1" : "R16"],
          ),
      );
      expectError(race.loser, "console-result-reserved");
      assert.equal(
        (await p.db.query("select count(*)::int n from matches")).rows[0].n,
        1,
      );
      assert.equal(
        (await p.db.query("select count(*)::int n from program_audit_log"))
          .rows[0].n,
        1,
      );
    } finally {
      await p.close();
    }
  });
}

test("tournament concurrent athlete registration creates one entry across different operations", async () => {
  const p = await resultHarness("tournament");
  try {
    const first = await p.prepare(p.a, tournamentRequest());
    const ctx = await data(
      p.a,
      "select admin_get_tournament_result_context($1,$2,$3) data",
      [id(2), id(10), first.eventId],
    );
    const req = (op) => ({
      ...tournamentRequest(op),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: ctx.fingerprint,
      },
      entry: {
        ...tournamentRequest().entry,
        playerId: id(21),
        playerLabel: "Player2 Athlete",
      },
    });
    const race = await overlapping(
      p.a,
      p.b,
      p.db,
      () => p.prepare(p.a, req(200)),
      () => p.prepare(p.b, req(300)),
    );
    expectError(race.loser, "entry-already-exists");
    assert.equal(
      (
        await p.db.query(
          "select count(*)::int n from program_event_entries where player_user_ids @> $1::uuid[]",
          [[id(21)]],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await p.db.query("select count(*)::int n from admin_upload_submissions"))
        .rows[0].n,
      2,
    );
  } finally {
    await p.close();
  }
});
