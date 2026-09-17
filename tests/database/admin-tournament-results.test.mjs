import { tournamentRequest as request } from "./fixtures/admin-result-requests.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { id, setup } from "./fixtures/admin-schedule-harness.mjs";
const migration = "20260917032144_save_admin_tournament_results.sql";
const reject = (fn, message) =>
  assert.rejects(fn, (e) => e.message.includes(message));
async function harness() {
  const h = await setup([migration]);
  return {
    ...h,
    prepare: async (body, actor = 2, program = 10) =>
      (
        await h.db.query(
          "select admin_prepare_tournament_result($1,$2,$3,$4) data",
          [id(actor), body.operationId, id(program), body],
        )
      ).rows[0].data,
    apply: async (op = 100, item = op + 1, actor = 2) =>
      (
        await h.db.query(
          "select admin_apply_tournament_result($1,$2,$3) data",
          [id(actor), id(op), id(item)],
        )
      ).rows[0].data,
    context: async (event, program = 10) =>
      (
        await h.db.query(
          "select admin_get_tournament_result_context($1,$2,$3) data",
          [id(2), id(program), event],
        )
      ).rows[0].data,
  };
}
async function existing(h, first, op = 200, round = "QF") {
  const c = await h.context(first.eventId);
  const l = c.entries.find((e) => e.id === first.entryId);
  return {
    ...request(op),
    event: {
      kind: "existing",
      eventId: first.eventId,
      fingerprint: c.fingerprint,
    },
    entry: {
      kind: "existing",
      entryId: first.entryId,
      playerId: id(20),
      fingerprint: l.fingerprint,
    },
    round,
  };
}
test("tournament validation precedes setup and service grants protect explicit actor", async () => {
  const h = await harness();
  try {
    await h.role(3);
    await reject(() => h.prepare(request(), 3), "admin-required");
    await h.role(2, "authenticated");
    await reject(() => h.prepare(request()), "permission denied");
    await h.role();
    for (const mutate of [
      (b) => (b.round = "BAD"),
      (b) => (b.event.tournament.startsOn = "2026-02-30"),
      (b) => (b.event.tournament.bestOf = 4),
      (b) => (b.entry.playerId = id(99)),
      (b) => (b.entry.playerLabel = "Forged"),
      (b) => (b.result.ourGames = []),
    ]) {
      const b = request();
      mutate(b);
      await assert.rejects(() => h.prepare(b));
    }
    assert.equal(
      (await h.owner("select count(*)::int n from program_events")).rows[0].n,
      0,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from admin_upload_submissions"))
        .rows[0].n,
      0,
    );
  } finally {
    await h.db.close();
  }
});
test("new tournament and entry replay once; saved rounds and audit retain score semantics", async () => {
  const h = await harness();
  try {
    await h.role();
    const first = await h.prepare(request());
    assert.deepEqual(await h.prepare(request()), first);
    const saved = await h.apply();
    assert.equal(saved.item.status, "succeeded");
    assert.deepEqual(await h.apply(), saved);
    assert.deepEqual(await h.prepare(request()), saved);
    await reject(
      () => h.prepare({ ...request(), round: "QF" }),
      "setup-identity-conflict",
    );
    await reject(() => h.prepare(request(), 1), "operation-identity-conflict");
    const next = await existing(h, first);
    next.result = { kind: "outcome", outcome: "default", side: "theirs" };
    await h.prepare(next);
    assert.equal((await h.apply(200)).item.status, "succeeded");
    const m = (await h.owner("select * from matches")).rows[0];
    assert.equal(m.round, "R16");
    assert.equal(m.player1_id, id(20));
    assert.equal(m.source_provider, null);
    assert.equal(m.analysis_method, "manual");
    assert.deepEqual(m.score, {
      player1: [6, 7],
      player2: [4, 6],
      player1_tiebreaks: [null, 7],
      player2_tiebreaks: [null, 5],
    });
    assert.deepEqual(m.format, {
      best_of: 3,
      ad_scoring: false,
      play_on_lets: false,
    });
    assert.equal(
      (await h.owner("select count(*)::int n from program_events")).rows[0].n,
      1,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_event_entries"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      2,
    );
    assert.equal(
      (await h.owner("select round,actor_user_id from program_event_outcomes"))
        .rows[0].round,
      "QF",
    );
  } finally {
    await h.db.close();
  }
});
test("existing tournament supports new entry, cross-program refusal and duplicate registration rejection", async () => {
  const h = await harness();
  try {
    await h.role();
    const first = await h.prepare(request());
    const c = await h.context(first.eventId);
    const b = {
      ...request(200),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: c.fingerprint,
      },
      entry: {
        ...request().entry,
        playerId: id(21),
        playerLabel: "Player2 Athlete",
      },
    };
    const added = await h.prepare(b);
    assert.notEqual(added.entryId, first.entryId);
    assert.deepEqual(await h.prepare(b), added);
    assert.equal((await h.apply(200)).item.status, "succeeded");
    await reject(
      () => h.prepare({ ...b, operationId: id(300), itemId: id(301) }),
      "entry-already-exists",
    );
    await reject(() => h.context(first.eventId, 11), "tournament-not-found");
    await reject(
      () =>
        h.prepare(
          { ...b, operationId: id(400), itemId: id(401), programId: id(11) },
          2,
          11,
        ),
      "athlete-ineligible",
    );
    await h.role(3, "authenticated");
    await reject(
      () =>
        h.db.query(
          "insert into program_event_entries(event_id,program_id,discipline,player_user_ids,player_labels) values($1,$2,'singles',$3,$4)",
          [first.eventId, id(10), [id(21)], ["Player2 Athlete"]],
        ),
      "console-entry-already-exists",
    );
    // Ordinary entries unrelated to console identities retain the live behavior.
    for (let n = 0; n < 2; n++)
      await h.db.query(
        "insert into program_event_entries(event_id,program_id,discipline,player_user_ids,player_labels) values($1,$2,'singles',$3,$4)",
        [first.eventId, id(10), [id(22)], ["Player3 Athlete"]],
      );
  } finally {
    await h.db.close();
  }
});
test("same entry different rounds coexist while same-round console and ordinary writers lose safely", async () => {
  const h = await harness();
  try {
    await h.role();
    const first = await h.prepare(request());
    const same = await existing(h, first, 200, "R16");
    const next = await existing(h, first, 300, "QF");
    await h.prepare(same);
    await h.prepare(next);
    await h.apply(200);
    assert.equal((await h.apply()).item.error, "result-already-recorded");
    assert.equal((await h.apply(300)).item.status, "succeeded");
    await h.role(3, "authenticated");
    const insert = (round) =>
      h.db.query(
        "insert into matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,analysis_method) values($1,$2,$3,$4,'Player1 Athlete','Coach opponent',$5,'{}','manual')",
        [id(3), id(10), first.entryId, id(20), round],
      );
    await reject(() => insert("R16"), "console-result-reserved");
    await insert("SF");
    await h.role();
    const coach = await existing(h, first, 400, "SF");
    await h.prepare(coach);
    assert.equal((await h.apply(400)).item.error, "result-already-recorded");
    assert.equal(
      (
        await h.owner(
          "select count(*)::int n from matches where round='SF' and created_by=$1",
          [id(3)],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await h.db.close();
  }
});

test("failed reservation allows coach takeover and pending outcomes reject forged tokens", async () => {
  const h = await harness();
  try {
    await h.role();
    const first = await h.prepare(request());
    await h.owner("update program_players set archived_at=now() where id=$1", [
      id(20),
    ]);
    await h.role();
    assert.equal((await h.apply()).item.error, "athlete-ineligible");
    await h.owner("update program_players set archived_at=null where id=$1", [
      id(20),
    ]);
    await h.role(3, "authenticated");
    await h.db.query(
      "insert into matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,analysis_method) values($1,$2,$3,$4,'Player1 Athlete','Coach opponent','R16','{}','manual')",
      [id(3), id(10), first.entryId, id(20)],
    );
    await h.role();
    assert.equal((await h.apply()).item.error, "result-already-recorded");
    const b = await existing(h, first, 200, "QF");
    b.result = { kind: "outcome", outcome: "default", side: "ours" };
    await h.prepare(b);
    await h.role(3, "authenticated");
    await h.db.query(
      "select set_config('admin_uploads.operation',$1,false),set_config('admin_uploads.item',$2,false)",
      [id(200), id(201)],
    );
    await reject(
      () =>
        h.db.query(
          "insert into program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side) values($1,$2,$3,'tournament','QF','default','ours')",
          [first.entryId, first.eventId, id(10)],
        ),
      "console-result-reserved",
    );
    await h.role(null, "owner");
    await h.db.exec(
      "create function fail_tournament_outcome() returns trigger language plpgsql as $$begin raise exception 'test-failure';end;$$;create trigger fail_tournament_outcome before insert on program_event_outcomes for each row execute function fail_tournament_outcome();",
    );
    await h.role(3);
    assert.equal((await h.apply(200)).item.error, "test-failure");
    assert.equal(
      (await h.db.query("select auth.uid() actor")).rows[0].actor,
      id(3),
    );
    assert.equal(
      JSON.parse(
        (
          await h.db.query(
            "select current_setting('request.jwt.claims') claims",
          )
        ).rows[0].claims,
      ).sub,
      id(3),
    );
    await h.owner(
      "drop trigger fail_tournament_outcome on program_event_outcomes",
    );
    await h.role();
    const saved = await h.apply(200);
    assert.equal(saved.item.status, "succeeded");
    assert.equal(
      (
        await h.owner(
          "select actor_user_id from program_event_outcomes where id=$1",
          [saved.item.outcomeId],
        )
      ).rows[0].actor_user_id,
      id(2),
    );
  } finally {
    await h.db.close();
  }
});
test("changed entry, event, legacy forfeit and existing outcome are protected", async () => {
  const h = await harness();
  try {
    await h.role();
    const first = await h.prepare(request());
    await h.owner(
      "update program_event_entries set forfeit='ours' where id=$1",
      [first.entryId],
    );
    await h.role();
    assert.equal((await h.apply()).item.error, "stale-entry");
    const legacy = await existing(h, first, 200);
    await h.prepare(legacy);
    assert.equal((await h.apply(200)).item.error, "result-already-recorded");
    await h.owner("update program_event_entries set forfeit=null where id=$1", [
      first.entryId,
    ]);
    await h.role();
    const changed = await existing(h, first, 300);
    await h.prepare(changed);
    await h.owner("update program_events set name='Coach update' where id=$1", [
      first.eventId,
    ]);
    await h.role();
    assert.equal((await h.apply(300)).item.error, "stale-event");
    const pending = await existing(h, first, 400, "SF");
    await h.prepare(pending);
    await h.owner(
      "update program_event_entries set player_user_ids=$1,player_labels=$2 where id=$3",
      [[id(21)], ["Player2 Athlete"], first.entryId],
    );
    await h.role();
    assert.equal((await h.apply(400)).item.error, "stale-entry");
    // Separate member-admin operation exercises outcome attribution and a later conflict.
    const member = request(500);
    member.result = { kind: "outcome", outcome: "withdrawal", side: "ours" };
    await h.role(1);
    const setup = await h.prepare(member, 1);
    assert.equal((await h.apply(500, 501, 1)).item.status, "succeeded");
    await h.role();
    const conflict = await existing(h, setup, 600, "R16");
    await h.prepare(conflict);
    assert.equal((await h.apply(600)).item.error, "result-already-recorded");
    assert.equal(
      (await h.owner("select count(*)::int n from matches")).rows[0].n,
      0,
    );
  } finally {
    await h.db.close();
  }
});
test("claimed-user aliases cannot register a duplicate console-backed athlete", async () => {
  const h = await harness();
  try {
    await h.owner(
      "update program_players set claimed_by_user_id=$1 where id=$2",
      [id(40), id(20)],
    );
    await h.role();
    const first = await h.prepare(request());
    const c = await h.context(first.eventId);
    const alias = {
      ...request(200),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: c.fingerprint,
      },
      entry: { ...request().entry, playerId: id(40) },
    };
    await reject(() => h.prepare(alias), "entry-already-exists");
    await h.role(3, "authenticated");
    await reject(
      () =>
        h.db.query(
          "insert into program_event_entries(event_id,program_id,discipline,player_user_ids,player_labels) values($1,$2,'singles',$3,$4)",
          [first.eventId, id(10), [id(40)], ["Player1 Athlete"]],
        ),
      "console-entry-already-exists",
    );
  } finally {
    await h.db.close();
  }
});
