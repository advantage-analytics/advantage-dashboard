import {
  dualRequest,
  tournamentRequest,
} from "./fixtures/admin-result-requests.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { id, setup as setupBase } from "./fixtures/admin-schedule-harness.mjs";

// T21 (audit action) and T24 load on top of the dual migration the harness
// installs; the tournament migration must precede T24, which patches its RPC.
const migration = "20260927094436_abandon_admin_result_items.sql";
const setup = () =>
  setupBase([
    "20260919045138_save_admin_tournament_results.sql",
    "20260927084958_reconcile_admin_submission_items.sql",
    migration,
  ]);
const rejects = (fn, text) =>
  assert.rejects(fn, (e) => e.message.includes(text));
// The route supplies the verified session actor. Actor 1 is a member admin
// who never started any of these operations (actor 2 did).
const abandon = async (h, op, actor = 1) =>
  (
    await h.db.query("select admin_abandon_result_items($1,$2) as data", [
      id(actor),
      id(op),
    ])
  ).rows[0].data;
const count = async (h, from, args = []) =>
  (await h.owner(`select count(*)::int n from ${from}`, args)).rows[0].n;
const rowsOf = async (h, table, op, where = "") =>
  (
    await h.owner(
      `select to_jsonb(r) data from ${table} r where operation_id=$1 ${where} order by item_id`,
      [id(op)],
    )
  ).rows.map((r) => r.data);
const lastAudit = async (h) =>
  (
    await h.owner(
      "select program_id,actor_user_id,action,subject_id,details from program_audit_log order by id desc limit 1",
    )
  ).rows[0];
const score = (opponentLabels) => ({
  kind: "score",
  ourGames: [6, 7],
  theirGames: [4, 6],
  ourTiebreaks: [null, 7],
  theirTiebreaks: [null, 4],
  opponentLabels,
  ending: null,
});
// One item per line: S1..S6 -> item ids op+1..op+6, D1..D3 -> op+7..op+9.
function nineLineDual(op = 100) {
  const body = dualRequest(op);
  body.items = body.event.dual.lines.map((line, n) => ({
    itemId: id(op + 1 + n),
    slot: line.slot,
    result:
      line.slot === "S2" || line.slot === "D3"
        ? { kind: "outcome", outcome: "default", side: "theirs" }
        : score(line.opponentLabels),
  }));
  return body;
}

test("abandon flips only the pending dual items, frees their lines and is terminal for apply", async () => {
  const h = await setup();
  try {
    await h.role();
    const first = await h.prepare(nineLineDual());
    assert.equal(first.items.length, 9);
    for (const item of [101, 102, 107]) {
      const applied = await h.apply(100, item);
      assert.equal(
        applied.items.find((i) => i.itemId === id(item)).status,
        "succeeded",
      );
    }
    const ctx = await h.context(first.eventId);
    const entry = (slot) => ctx.entries.find((e) => e.slot === slot);
    const coachOutcome = (slot) =>
      h.db.query(
        "insert into program_event_outcomes(entry_id,event_id,program_id,event_kind,kind,side) values($1,$2,$3,'dual','default','ours')",
        [entry(slot).id, first.eventId, id(10)],
      );
    const coachMatch = (slot, player) =>
      h.db.query(
        "insert into matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,analysis_method) values($1,$2,$3,$4,'Coach Player','Coach Opponent',$5,'{}','manual')",
        [id(3), id(10), entry(slot).id, player, slot],
      );
    // Pending items reserve their lines against the coach.
    await h.role(3, "authenticated");
    await rejects(() => coachOutcome("S3"), "console-result-reserved");
    await rejects(() => coachMatch("S4", id(23)), "console-result-reserved");

    // Service-only, any CURRENT admin, never a non-admin actor id.
    await h.role(null, "anon");
    await rejects(() => abandon(h, 100), "permission denied");
    await h.role(2, "authenticated");
    await rejects(() => abandon(h, 100), "permission denied");
    await h.role();
    await rejects(() => abandon(h, 100, 3), "admin-required");
    await rejects(() => abandon(h, 999), "operation-not-found");

    const succeededBefore = await rowsOf(
      h,
      "admin_upload_submission_items",
      100,
      "and status='succeeded'",
    );
    assert.equal(succeededBefore.length, 3);
    const targetsBefore = await rowsOf(h, "admin_schedule_result_targets", 100);
    assert.equal(targetsBefore.length, 9);
    const auditBefore = await count(h, "program_audit_log");
    const matchesBefore = await count(h, "matches");
    const outcomesBefore = await count(h, "program_event_outcomes");

    await h.role();
    const abandoned = await abandon(h, 100);
    const pendingIds = [103, 104, 105, 106, 108, 109].map(id);
    assert.deepEqual(abandoned.abandonedItemIds, pendingIds);
    assert.equal(abandoned.operationId, id(100));
    assert.equal(abandoned.kind, "dual");
    assert.equal(abandoned.programId, id(10));
    assert.equal(abandoned.eventId, first.eventId);
    assert.equal(abandoned.items.length, 9);
    for (const item of abandoned.items) {
      if (pendingIds.includes(item.itemId))
        assert.deepEqual(item, {
          itemId: item.itemId,
          status: "failed",
          error: "abandoned",
        });
      else
        assert.deepEqual(item, {
          itemId: item.itemId,
          status: "succeeded",
          error: null,
        });
    }

    // Exactly the six pending rows changed; successes and targets are history.
    const failed = await rowsOf(
      h,
      "admin_upload_submission_items",
      100,
      "and status='failed'",
    );
    assert.deepEqual(
      failed.map((r) => r.item_id),
      pendingIds,
    );
    for (const row of failed) {
      assert.equal(row.error_code, "abandoned");
      assert.equal(row.audit_id, null);
      assert.equal(row.match_id, null);
      assert.equal(row.outcome_id, null);
      assert.notEqual(row.updated_at, row.created_at);
    }
    assert.deepEqual(
      await rowsOf(
        h,
        "admin_upload_submission_items",
        100,
        "and status='succeeded'",
      ),
      succeededBefore,
    );
    assert.deepEqual(
      await rowsOf(h, "admin_schedule_result_targets", 100),
      targetsBefore,
    );
    assert.equal(await count(h, "matches"), matchesBefore);
    assert.equal(await count(h, "program_event_outcomes"), outcomesBefore);
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);
    const audit = await lastAudit(h);
    assert.equal(audit.action, "console.submission_reconciled");
    assert.equal(audit.program_id, id(10));
    assert.equal(audit.actor_user_id, id(1));
    assert.equal(audit.subject_id, first.eventId);
    assert.deepEqual(audit.details, {
      origin: "admin_console",
      mode: "abandon",
      kind: "dual",
      operation_id: id(100),
      event_id: first.eventId,
      item_ids: pendingIds,
    });

    // The freed lines take ordinary results again.
    await h.role(3, "authenticated");
    await coachOutcome("S3");
    await coachMatch("S4", id(23));
    assert.equal(await count(h, "matches"), matchesBefore + 1);
    assert.equal(await count(h, "program_event_outcomes"), outcomesBefore + 1);

    // A same-request resume: prepare replays the saved status, and apply
    // returns for an abandoned item without touching anything.
    await h.role();
    const resumed = await h.prepare(nineLineDual());
    assert.equal(resumed.items.find((i) => i.slot === "S5").error, "abandoned");
    const s5Before = await rowsOf(
      h,
      "admin_upload_submission_items",
      100,
      `and item_id='${id(105)}'`,
    );
    const replay = await h.apply(100, 105);
    assert.deepEqual(
      replay.items.find((i) => i.slot === "S5"),
      {
        itemId: id(105),
        slot: "S5",
        status: "failed",
        matchId: null,
        outcomeId: null,
        error: "abandoned",
      },
    );
    assert.deepEqual(
      await rowsOf(
        h,
        "admin_upload_submission_items",
        100,
        `and item_id='${id(105)}'`,
      ),
      s5Before,
    );
    assert.equal(await count(h, "matches"), matchesBefore + 1);
    assert.equal(await count(h, "program_event_outcomes"), outcomesBefore + 1);
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);

    // Abandoning again finds nothing pending: no change, no audit row.
    await h.role();
    const again = await abandon(h, 100);
    assert.deepEqual(again.abandonedItemIds, []);
    assert.deepEqual(again.items, abandoned.items);
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);

    // Video and file submissions have admin_reconcile_submission_item instead.
    await h.owner(
      "insert into admin_upload_submissions(operation_id,actor_user_id,program_id,kind) values($1,$2,$3,'video')",
      [id(800), id(2), id(10)],
    );
    await h.role();
    await rejects(() => abandon(h, 800), "kind-unsupported");
  } finally {
    await h.db.close();
  }
});

test("only abandoned is terminal: an item failed for another reason stays retryable", async () => {
  const h = await setup();
  try {
    await h.role();
    await h.prepare(dualRequest());
    await h.owner("update program_players set archived_at=now() where id=$1", [
      id(20),
    ]);
    await h.role();
    assert.equal(
      (await h.apply(100, 101)).items.find((i) => i.slot === "S1").error,
      "athlete-ineligible",
    );
    const auditBefore = await count(h, "program_audit_log");
    const abandoned = await abandon(h, 100);
    assert.deepEqual(abandoned.abandonedItemIds, [id(102)]);
    assert.deepEqual(
      abandoned.items.map((i) => [i.itemId, i.status, i.error]),
      [
        [id(101), "failed", "athlete-ineligible"],
        [id(102), "failed", "abandoned"],
      ],
    );
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);
    assert.deepEqual((await lastAudit(h)).details.item_ids, [id(102)]);
    // The other failure code is still a retry once its cause is gone.
    await h.owner("update program_players set archived_at=null where id=$1", [
      id(20),
    ]);
    await h.role();
    assert.equal(
      (await h.apply(100, 101)).items.find((i) => i.slot === "S1").status,
      "succeeded",
    );
    assert.equal(
      (await h.apply(100, 102)).items.find((i) => i.slot === "S2").error,
      "abandoned",
    );
    assert.equal(await count(h, "program_event_outcomes"), 0);
  } finally {
    await h.db.close();
  }
});

test("abandon frees a tournament round and its apply returns without writing", async () => {
  const h = await setup();
  try {
    const prepare = async (body, actor = 2) =>
      (
        await h.db.query(
          "select admin_prepare_tournament_result($1,$2,$3,$4) data",
          [id(actor), body.operationId, id(10), body],
        )
      ).rows[0].data;
    const apply = async (op = 100, item = op + 1, actor = 2) =>
      (
        await h.db.query(
          "select admin_apply_tournament_result($1,$2,$3) data",
          [id(actor), id(op), id(item)],
        )
      ).rows[0].data;
    await h.role();
    const first = await prepare(tournamentRequest());
    assert.equal(first.item.status, "pending");
    const coachOutcome = () =>
      h.db.query(
        "insert into program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side) values($1,$2,$3,'tournament','R16','default','ours')",
        [first.entryId, first.eventId, id(10)],
      );
    await h.role(3, "authenticated");
    await rejects(() => coachOutcome(), "console-result-reserved");
    await h.role(null, "anon");
    await rejects(() => abandon(h, 100), "permission denied");
    await h.role(2, "authenticated");
    await rejects(() => abandon(h, 100), "permission denied");

    const targetsBefore = await rowsOf(h, "admin_schedule_result_targets", 100);
    assert.equal(targetsBefore.length, 1);
    const auditBefore = await count(h, "program_audit_log");
    await h.role();
    const abandoned = await abandon(h, 100);
    assert.deepEqual(abandoned, {
      operationId: id(100),
      kind: "tournament",
      programId: id(10),
      eventId: first.eventId,
      abandonedItemIds: [id(101)],
      items: [{ itemId: id(101), status: "failed", error: "abandoned" }],
    });
    assert.deepEqual(
      await rowsOf(h, "admin_schedule_result_targets", 100),
      targetsBefore,
    );
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);
    const audit = await lastAudit(h);
    assert.equal(audit.action, "console.submission_reconciled");
    assert.equal(audit.actor_user_id, id(1));
    assert.equal(audit.subject_id, first.eventId);
    assert.equal(audit.details.kind, "tournament");
    assert.deepEqual(audit.details.item_ids, [id(101)]);

    await h.role(3, "authenticated");
    await coachOutcome();
    assert.equal(await count(h, "program_event_outcomes"), 1);

    await h.role();
    const replay = await apply();
    assert.equal(replay.item.status, "failed");
    assert.equal(replay.item.error, "abandoned");
    assert.equal(replay.item.round, "R16");
    assert.equal(await count(h, "matches"), 0);
    assert.equal(await count(h, "program_event_outcomes"), 1);
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);
    assert.deepEqual((await abandon(h, 100)).abandonedItemIds, []);
    assert.equal(await count(h, "program_audit_log"), auditBefore + 1);
  } finally {
    await h.db.close();
  }
});
