import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = "20260917025856_save_admin_dual_results.sql";
async function setup() {
  const db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema schedule_private;
 create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth to authenticated,anon,service_role;
 create table users(id uuid primary key,is_admin boolean,first_name text,last_name text);
 create function is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.users where id=auth.uid()),false) $$;
 create table programs(id uuid primary key,status text,program_key text);
 create table program_members(program_id uuid,user_id uuid,role text);
 create table program_players(id uuid primary key,program_id uuid,claimed_by_user_id uuid,archived_at timestamptz,merged_into_id uuid,first_name text,last_name text);
 create table program_events(id uuid primary key default gen_random_uuid(),program_id uuid,kind text,name text,starts_on date,ends_on date,starts_at_time time,site text,surface text,host text,format jsonb,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),unique(id,program_id,kind),check(kind in ('dual','tournament')),check(ends_on>=starts_on),check(site in ('home','away','neutral')));
 create table program_event_entries(id uuid primary key default gen_random_uuid(),event_id uuid references program_events(id),program_id uuid,discipline text,slot text,position integer,player_user_ids uuid[],player_labels text[],opponent_labels text[],opponent_school text,opponent_program_id uuid,forfeit text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(id,event_id,program_id),unique(event_id,slot));
 create table program_event_outcomes(id uuid primary key default gen_random_uuid(),entry_id uuid,event_id uuid,program_id uuid,event_kind text,round text,kind text,side text,actor_user_id uuid not null default auth.uid(),recorded_at timestamptz default now(),foreign key(entry_id,event_id,program_id) references program_event_entries(id,event_id,program_id),foreign key(event_id,program_id,event_kind) references program_events(id,program_id,kind));
 create unique index outcomes_dual_unique on program_event_outcomes(entry_id) where round is null;
 create table matches(id uuid primary key default gen_random_uuid(),created_by uuid,program_id uuid,event_entry_id uuid references program_event_entries(id),player1_id uuid,player1_name text,player2_name text,tournament_name text,round text,date timestamptz,match_type text,court_type text,format jsonb,score jsonb,result text,source_provider text,analysis_method text,private boolean);
 create table processing_jobs(id uuid primary key,match_id uuid,created_by uuid);
 create table match_files(id uuid primary key,match_id uuid,uploaded_by uuid);
 create table program_audit_log(id bigint generated always as identity primary key,program_id uuid,actor_user_id uuid,action text,subject_id uuid,details jsonb,constraint program_audit_log_action_check check(action='program.conference_changed'));
 create function user_program_ids() returns setof uuid language sql stable security definer set search_path='' as $$ select program_id from public.program_members where user_id=auth.uid() $$;
 create function can_manage_program_schedule(p uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.program_members where program_id=p and user_id=auth.uid() and role in ('owner','coach','staff')) $$;
 create function match_is_upload_shaped(p text,m text) returns boolean language sql immutable as $$ select p is not null or m is distinct from 'manual' $$;
 create function upload_eligibility_refusal(uuid,uuid,uuid,uuid) returns text language sql as $$ select 'upload-not-supported-in-fixture'::text $$;
 insert into users values('${id(1)}',true,'Member','Admin'),('${id(2)}',true,'Nonmember','Admin'),('${id(3)}',false,'Coach','');
 insert into programs values('${id(10)}','active','target'),('${id(11)}','active','other');
 insert into program_members values('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(3)}','coach');
 grant select,insert,update,delete on program_events,program_event_entries,program_event_outcomes,matches to authenticated;
 `);
  for (let n = 0; n < 6; n++)
    await db.query(
      "insert into program_players values($1,$2,null,null,null,$3,'Athlete')",
      [id(20 + n), id(10), `Player${n + 1}`],
    );
  await db.exec(
    await readFile(
      new URL("./fixtures/admin-dual-live-guards.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const name of [
    "20260917000513_persist_admin_upload_submissions.sql",
    migration,
  ])
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const role = async (actor = 2, name = "service_role") => {
    await db.exec("reset role");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [
        actor ? id(actor) : "",
        JSON.stringify({ role: name, ...(actor ? { sub: id(actor) } : {}) }),
      ],
    );
    if (name !== "owner") await db.exec("set role " + name);
  };
  const prepare = async (request, actor = 2, program = 10) =>
    (
      await db.query("select admin_prepare_dual_results($1,$2,$3,$4) as data", [
        id(actor),
        request.operationId,
        id(program),
        request,
      ])
    ).rows[0].data;
  const apply = async (op, item, actor = 2) =>
    (
      await db.query("select admin_apply_dual_result($1,$2,$3) as data", [
        id(actor),
        id(op),
        id(item),
      ])
    ).rows[0].data;
  const status = async (op, actor = 2) =>
    (
      await db.query("select admin_dual_result_status($1,$2) as data", [
        id(actor),
        id(op),
      ])
    ).rows[0].data;
  const context = async (event, program = 10, actor = 2) =>
    (
      await db.query("select admin_get_dual_result_context($1,$2,$3) as data", [
        id(actor),
        id(program),
        event,
      ])
    ).rows[0].data;
  const owner = async (sql, args = []) => {
    await role(null, "owner");
    return db.query(sql, args);
  };
  return { db, role, prepare, apply, status, context, owner };
}
function request(op = 100) {
  const lines = Array.from({ length: 9 }, (_, n) => {
    const doubles = n >= 6;
    const indexes = doubles ? [(n - 6) * 2, (n - 6) * 2 + 1] : [n];
    return {
      slot: doubles ? `D${n - 5}` : `S${n + 1}`,
      discipline: doubles ? "doubles" : "singles",
      position: n,
      playerUserIds: indexes.map((i) => id(20 + i)),
      playerLabels: indexes.map((i) => `Player${i + 1} Athlete`),
      opponentLabels: indexes.map((i) => `Opponent${i + 1}`),
    };
  });
  return {
    operationId: id(op),
    programId: id(10),
    event: {
      kind: "new",
      dual: {
        opponent: "Other",
        opponentProgramKey: "other",
        date: "2026-09-15",
        startsAtTime: null,
        site: "home",
        surface: "Hard",
        bestOf: 3,
        adScoring: null,
        doublesGamesTo: 8,
        doublesAdScoring: false,
        lines,
      },
    },
    items: [
      {
        itemId: id(op + 1),
        slot: "S1",
        result: {
          kind: "score",
          ourGames: [6, 7],
          theirGames: [4, 6],
          ourTiebreaks: [null, 7],
          theirTiebreaks: [null, 4],
          opponentLabels: ["Opponent1"],
          ending: null,
        },
      },
      {
        itemId: id(op + 2),
        slot: "S2",
        result: { kind: "outcome", outcome: "default", side: "theirs" },
      },
    ],
  };
}
const rejects = (fn, text) =>
  assert.rejects(fn, (e) => e.message.includes(text));
test("dual setup validates everything before writes and replays exact actor-owned setup", async () => {
  const h = await setup();
  try {
    await h.role(3);
    await rejects(() => h.prepare(request(), 3), "admin-required");
    await h.role(2, "authenticated");
    await rejects(() => h.prepare(request()), "permission denied");
    await h.role();
    const invalid = request();
    invalid.items[1].result = {
      kind: "score",
      ourGames: [],
      theirGames: [],
      ourTiebreaks: [],
      theirTiebreaks: [],
      opponentLabels: ["Opponent2"],
      ending: null,
    };
    await rejects(() => h.prepare(invalid), "invalid-score");
    const badDate = request();
    badDate.event.dual.date = "2026-02-30";
    await rejects(() => h.prepare(badDate), "date/time");
    assert.equal(
      (await h.owner("select count(*)::int n from program_events")).rows[0].n,
      0,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from admin_upload_submissions"))
        .rows[0].n,
      0,
    );
    await h.role();
    const first = await h.prepare(request());
    assert.equal(first.items.length, 2);
    assert.deepEqual(await h.prepare(request()), first);
    await rejects(
      () => h.prepare({ ...request(), items: request().items.slice(0, 1) }),
      "setup-identity-conflict",
    );
    await rejects(() => h.prepare(request(), 1), "operation-identity-conflict");
    assert.equal(
      (await h.owner("select count(*)::int n from program_events")).rows[0].n,
      1,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_event_entries"))
        .rows[0].n,
      9,
    );
  } finally {
    await h.db.close();
  }
});
test("independent result transactions preserve successes, audit once, and restore claims", async () => {
  const h = await setup();
  try {
    await h.role();
    await h.prepare(request());
    const first = await h.apply(100, 101);
    assert.equal(first.items.find((i) => i.slot === "S1").status, "succeeded");
    const stored = first.items.find((i) => i.slot === "S1").matchId;
    const after = await h.apply(100, 102);
    assert.ok(after.items.every((i) => i.status === "succeeded"));
    assert.deepEqual(await h.apply(100, 101), after);
    assert.deepEqual(await h.prepare(request()), after);
    assert.equal(
      (await h.db.query("select auth.uid() as actor")).rows[0].actor,
      id(2),
    );
    const outcome = (
      await h.owner(
        "select actor_user_id,kind,side from program_event_outcomes",
      )
    ).rows[0];
    assert.deepEqual(outcome, {
      actor_user_id: id(2),
      kind: "default",
      side: "theirs",
    });
    const match = (await h.owner("select * from matches where id=$1", [stored]))
      .rows[0];
    assert.equal(match.created_by, id(2));
    assert.equal(match.source_provider, null);
    assert.equal(match.analysis_method, "manual");
    assert.equal(match.format.ad_scoring, null);
    assert.deepEqual(match.score, {
      player1: [6, 7],
      player2: [4, 6],
      player1_tiebreaks: [null, 7],
      player2_tiebreaks: [null, 4],
    });
    assert.equal(
      (await h.owner("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      2,
    );
    await h.role(1);
    await h.prepare(request(200), 1);
    const member = await h.apply(200, 202, 1);
    assert.equal(member.items.find((i) => i.slot === "S2").status, "succeeded");
  } finally {
    await h.db.close();
  }
});

test("existing duals preserve coach results and persist independent conflicts through retries", async () => {
  const h = await setup();
  try {
    await h.role();
    const first = await h.prepare(request());
    const context = await h.context(first.eventId);
    await rejects(() => h.context(first.eventId, 11), "dual-not-found");
    const entry = context.entries.find((e) => e.slot === "S3");
    await h.owner(
      "insert into matches(id,created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,result,source_provider,analysis_method) values($1,$2,$3,$4,$5,'Coach Player','Coach Opponent','S3','{\"player1\":[6,6],\"player2\":[0,0]}','Final Score',null,'manual')",
      [id(900), id(3), id(10), entry.id, id(22)],
    );
    await h.role();
    const existing = {
      ...request(200),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: context.fingerprint,
      },
      items: request(200).items.map((i, n) => ({
        ...i,
        slot: n ? "S4" : "S3",
        result: n ? i.result : { ...i.result, opponentLabels: ["Opponent3"] },
      })),
    };
    await h.prepare(existing);
    const failed = await h.apply(200, 201);
    assert.equal(
      failed.items.find((i) => i.slot === "S3").error,
      "result-already-recorded",
    );
    const partial = await h.apply(200, 202);
    assert.equal(
      partial.items.find((i) => i.slot === "S4").status,
      "succeeded",
    );
    assert.deepEqual(await h.prepare(existing), partial);
    assert.deepEqual(await h.apply(200, 202), partial);
    const before = (
      await h.owner("select to_jsonb(m) data from matches m where id=$1", [
        id(900),
      ])
    ).rows[0].data;
    assert.equal(before.created_by, id(3));
    assert.equal(before.player2_name, "Coach Opponent");
    assert.deepEqual(before.score, { player1: [6, 6], player2: [0, 0] });
    // Ordinary staff correction keeps its original authorization and is not a new result.
    await h.role(3, "authenticated");
    await h.db.query(
      'update matches set score=\'{"player1":[6,7],"player2":[0,5]}\' where id=$1',
      [id(900)],
    );
    await h.role();
    const retry = await h.apply(200, 201);
    assert.equal(
      retry.items.find((i) => i.slot === "S3").error,
      "result-already-recorded",
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      1,
    );
    // Stale setup fingerprint is rejected before registering a second batch.
    await h.owner(
      "update program_events set name='Edited by coach' where id=$1",
      [first.eventId],
    );
    await h.role();
    await rejects(
      () => h.prepare({ ...existing, operationId: id(300) }),
      "stale-dual",
    );
  } finally {
    await h.db.close();
  }
});

test("failed items allow ordinary progress, pending token forgery fails, and retry observes winning writes", async () => {
  const h = await setup();
  try {
    await h.role();
    const first = await h.prepare(request());
    const ctx = await h.context(first.eventId);
    const req = {
      ...request(300),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: ctx.fingerprint,
      },
      items: request(300).items.map((i, n) => ({
        ...i,
        slot: n ? "S6" : "S5",
        result: n ? i.result : { ...i.result, opponentLabels: ["Opponent5"] },
      })),
    };
    await h.prepare(req);
    const e5 = ctx.entries.find((e) => e.slot === "S5"),
      e6 = ctx.entries.find((e) => e.slot === "S6");
    await h.role(3, "authenticated");
    await h.db.query(
      "select set_config('admin_uploads.operation',$1,false),set_config('admin_uploads.item',$2,false)",
      [id(300), id(302)],
    );
    await rejects(
      () =>
        h.db.query(
          "insert into program_event_outcomes(entry_id,event_id,program_id,event_kind,kind,side) values($1,$2,$3,'dual','default','ours')",
          [e6.id, first.eventId, id(10)],
        ),
      "console-result-reserved",
    );
    await rejects(() => h.apply(300, 302, 3), "permission denied");
    await h.owner("update program_players set archived_at=now() where id=$1", [
      id(24),
    ]);
    await h.role();
    const failure = await h.apply(300, 301);
    assert.equal(
      failure.items.find((i) => i.slot === "S5").error,
      "athlete-ineligible",
    );
    await h.owner("update program_players set archived_at=null where id=$1", [
      id(24),
    ]);
    await h.role(3, "authenticated");
    await h.db.query(
      "insert into matches(id,created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,source_provider,analysis_method) values($1,$2,$3,$4,$5,'Player5 Athlete','Opponent5','S5','{}',null,'manual')",
      [id(901), id(3), id(10), e5.id, id(24)],
    );
    await h.role();
    assert.equal(
      (await h.apply(300, 301)).items.find((i) => i.slot === "S5").error,
      "result-already-recorded",
    );
    // Caught INSERT failure must restore claims before auditing a durable failure.
    await h.role(null, "owner");
    await h.db.exec(
      "create function fail_test_outcome() returns trigger language plpgsql as $$begin raise exception 'test-outcome-failure';end;$$; create trigger fail_test_outcome before insert on program_event_outcomes for each row execute function fail_test_outcome();",
    );
    await h.role(3);
    const failedOutcome = await h.apply(300, 302);
    assert.equal(
      failedOutcome.items.find((i) => i.slot === "S6").error,
      "test-outcome-failure",
    );
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
    await h.owner("drop trigger fail_test_outcome on program_event_outcomes");
    await h.role();
    const recovered = await h.apply(300, 302);
    assert.equal(
      recovered.items.find((i) => i.slot === "S6").status,
      "succeeded",
    );
    const outcomeId = recovered.items.find((i) => i.slot === "S6").outcomeId;
    assert.equal(
      (
        await h.owner(
          "select actor_user_id from program_event_outcomes where id=$1",
          [outcomeId],
        )
      ).rows[0].actor_user_id,
      id(2),
    );
  } finally {
    await h.db.close();
  }
});

test("entry identity and legacy forfeit changes become durable stale refusals", async () => {
  const h = await setup();
  try {
    await h.role();
    const first = await h.prepare(request());
    const ctx = await h.context(first.eventId);
    const e1 = ctx.entries.find((e) => e.slot === "S1"),
      e2 = ctx.entries.find((e) => e.slot === "S2");
    await h.owner(
      "update program_event_entries set player_labels=ARRAY['Changed'] where id=$1",
      [e1.id],
    );
    await h.owner(
      "update program_event_entries set forfeit='ours' where id=$1",
      [e2.id],
    );
    await h.role();
    assert.equal(
      (await h.apply(100, 101)).items.find((i) => i.slot === "S1").error,
      "stale-entry",
    );
    assert.equal(
      (await h.apply(100, 102)).items.find((i) => i.slot === "S2").error,
      "stale-entry",
    );
    assert.equal(
      (await h.owner("select count(*)::int n from matches")).rows[0].n,
      0,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_event_outcomes"))
        .rows[0].n,
      0,
    );
  } finally {
    await h.db.close();
  }
});

test("competing operations have one winning result and cross-program context is refused", async () => {
  const h = await setup();
  try {
    await h.role();
    const first = await h.prepare(request());
    const ctx = await h.context(first.eventId);
    await rejects(() => h.context(first.eventId, 11), "dual-not-found");
    const next = {
      ...request(200),
      event: {
        kind: "existing",
        eventId: first.eventId,
        fingerprint: ctx.fingerprint,
      },
      items: [request(200).items[0]],
    };
    await h.prepare(next);
    await rejects(
      () =>
        h.prepare({ ...next, operationId: id(300), programId: id(11) }, 2, 11),
      "dual-not-found",
    );
    // Two prepared operations share an entry. Execute both possible commits in
    // order: PGlite has one connection, so this proves conflict/replay outcomes,
    // not multi-session blocking timing.
    const winner = await h.apply(200, 201);
    assert.equal(winner.items[0].status, "succeeded");
    assert.equal(
      (await h.apply(100, 101)).items.find((i) => i.slot === "S1").error,
      "result-already-recorded",
    );
    assert.deepEqual(await h.apply(200, 201), winner);
    await h.role(3, "authenticated");
    const entry = ctx.entries.find((e) => e.slot === "S1");
    await rejects(
      () =>
        h.db.query(
          "insert into matches(created_by,program_id,event_entry_id,player1_id,player1_name,player2_name,round,score,analysis_method) values($1,$2,$3,$4,'Player1 Athlete','Opponent1','S1','{}','manual')",
          [id(3), id(10), entry.id, id(20)],
        ),
      "console-result-reserved",
    );
    assert.equal(
      (await h.owner("select count(*)::int n from matches")).rows[0].n,
      1,
    );
    assert.equal(
      (await h.owner("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      1,
    );
  } finally {
    await h.db.close();
  }
});

test("doubles stopped scores preserve pair identity and No player produces only an outcome", async () => {
  const h = await setup();
  try {
    const body = request();
    body.event.dual.lines[5].playerUserIds = [];
    body.event.dual.lines[5].playerLabels = [];
    body.event.dual.lines[5].noPlayer = true;
    body.items = [
      {
        ...body.items[0],
        slot: "D1",
        result: {
          ...body.items[0].result,
          opponentLabels: ["Opponent1", "Opponent2"],
          ending: { kind: "retired", side: "ours" },
        },
      },
      {
        ...body.items[1],
        slot: "S6",
        result: { kind: "outcome", outcome: "forfeit", side: "ours" },
      },
    ];
    await h.role();
    await h.prepare(body);
    await h.apply(100, 101);
    await h.apply(100, 102);
    const match = (await h.owner("select * from matches")).rows[0];
    assert.equal(match.player1_id, null);
    assert.equal(match.match_type, "Doubles");
    assert.equal(match.player1_name, "Player1 Athlete / Player2 Athlete");
    assert.equal(match.result, "Retired");
    assert.equal(match.score.winner, "player2");
    assert.deepEqual(match.format, {
      best_of: 1,
      ad_scoring: false,
      games_to: 8,
      play_on_lets: false,
    });
    assert.equal(
      (await h.owner("select count(*)::int n from matches")).rows[0].n,
      1,
    );
    assert.equal(
      (await h.owner("select kind from program_event_outcomes")).rows[0].kind,
      "forfeit",
    );
  } finally {
    await h.db.close();
  }
});
