/** Run: node --test tests/database/plans-2027-allowances.test.mjs
 * Isolated PostgreSQL contract test for the 2027 allowances migration
 * (`20261126070000_plans_2027_allowances.sql`), executed byte-for-byte so its
 * own assertion block runs too.
 *
 * `fixtures/plans-2027-allowances-live.sql` holds what the migration stands
 * on, as read from the live catalog on 2026-11-25: `processing_usage`,
 * `video_credits` and `video_credit_spends` with their checks, the unique
 * job index and RLS; and the live bodies of `reserve_processing_quota`,
 * `reserve_personal_quota`, `release_processing_quota`,
 * `reconcile_processing_quota`, `admin_set_pilot_end`, `is_admin`,
 * `user_program_ids` and `is_program_staff`. Modelled, not copied:
 * `users`, `programs`, `program_members`, `program_plans`,
 * `processing_jobs` and `program_audit_log` carry only the columns read
 * here; `user_program_role` is the plain membership lookup; and
 * `admin_video_access` is a STUB that answers from a table, because the real
 * one is the admin console's whole authorization and is not what is under
 * test. Default privileges hand a new function to `authenticated` and
 * `service_role` and not to PUBLIC, as live's do, so the migration's own
 * revokes are what is under test.
 *
 * TIME. The functions sum the ledger rows CREATED inside the window they are
 * handed, and the window is worked out by the app (`hoursWindow()` in
 * src/lib/services/splitstep/allowance.ts; `tests/video-allowance.spec.ts`
 * pins the same windows written out here). A test cannot move `now()`, so
 * each reservation is made and then its row is re-dated to the moment it
 * stands for (`created_at`, and `billing_month` beside it), which is what
 * the next call's sum reads.
 *
 * Not proven: PostgREST, the deployed grants themselves (the fixture models
 * them), or concurrent calls — PGlite serializes one connection, so the
 * advisory locks are taken but never contended.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const live = await read("./fixtures/plans-2027-allowances-live.sql");
const migration = await read(
  "../../supabase/migrations/20261126070000_plans_2027_allowances.sql",
);

const H = 3600;
const ADMIN = uuid(1);
const PLAYER = uuid(2);
const COACH = uuid(3);
const TEAMMATE = uuid(4);
const OUTSIDER = uuid(5);
const TEAM = uuid(10);
const OTHER_TEAM = uuid(11);

async function boot() {
  const db = new PGlite();
  await db.exec(live);
  await db.exec(`
    insert into auth.users (id) values
      ('${ADMIN}'), ('${PLAYER}'), ('${COACH}'), ('${TEAMMATE}'), ('${OUTSIDER}');
    insert into public.users (id, first_name, last_name, is_admin) values
      ('${ADMIN}', 'Ada', 'Admin', true),
      ('${PLAYER}', 'Pat', 'Player', false),
      ('${COACH}', 'Cory', 'Coach', false),
      ('${TEAMMATE}', 'Tess', 'Teammate', false),
      ('${OUTSIDER}', 'Olly', 'Outsider', false);
    insert into public.programs (id, school_name) values
      ('${TEAM}', 'Season U'), ('${OTHER_TEAM}', 'Other U');
    insert into public.program_members (program_id, user_id, role) values
      ('${TEAM}', '${COACH}', 'coach'),
      ('${TEAM}', '${TEAMMATE}', 'player'),
      ('${OTHER_TEAM}', '${OUTSIDER}', 'coach');
  `);
  await db.exec(migration);
  return db;
}

/** Run `work` as a PostgREST caller: the role, and the JWT claims beside it. */
async function as(db, role, userId, work) {
  const claims = JSON.stringify({ role, ...(userId ? { sub: userId } : {}) });
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    claims,
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await work();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

let nextJob = 1000;
/** A `processing_jobs` row to hang a reservation on; `seconds` is its trim. */
async function newJob(db, seconds = 0) {
  const id = uuid(nextJob++);
  await db.query(
    "insert into public.processing_jobs (id, end_time_seconds) values ($1, $2)",
    [id, seconds],
  );
  return id;
}

/** Re-date a reservation's ledger row to the moment it stands for. */
const dated = (db, job, when) =>
  db.query(
    `update public.processing_usage
        set created_at = $2::timestamptz,
            billing_month = (date_trunc('month', $2::timestamptz at time zone 'utc'))::date
      where job_id = $1`,
    [job, when],
  );

/**
 * Reserve for a personal workspace over `[start, end)`, then date the row:
 * to `when`, or to the window's first instant when the moment does not matter.
 */
async function personal(db, user, [start, end], seconds, cap, when) {
  const job = await newJob(db);
  const { rows } = await db.query(
    "select * from public.reserve_plan_personal_quota($1, $2, $3, $4, $5, $6)",
    [job, user, start, end, seconds, cap],
  );
  if (rows[0].ok) await dated(db, job, when ?? start);
  return { ...rows[0], job };
}

/** Reserve for a team over `[start, end)`, then date the row. */
async function team(db, program, by, [start, end], seconds, cap, when) {
  const job = await newJob(db);
  const { rows } = await db.query(
    "select * from public.reserve_plan_program_quota($1, $2, $3, $4, $5, $6, $7)",
    [job, program, by, start, end, seconds, cap],
  );
  if (rows[0].ok) await dated(db, job, when ?? start);
  return { ...rows[0], job };
}

const credit = async (db, user, seconds, expiresAt, source = "purchase") =>
  (
    await db.query(
      `insert into public.video_credits (user_id, seconds, remaining_seconds, expires_at, source)
       values ($1, $2, $2, $3, $4) returning id`,
      [user, seconds, expiresAt, source],
    )
  ).rows[0].id;

const remaining = async (db, id) =>
  (
    await db.query(
      "select remaining_seconds from public.video_credits where id = $1",
      [id],
    )
  ).rows[0].remaining_seconds;

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

// A Coach subscription anchored on the 31st, 12:00 UTC. The windows are what
// `hoursWindow("2027-01-31T12:00:00Z", …)` answers; the spec pins them.
const JAN31 = ["2027-01-31T12:00:00Z", "2027-02-28T12:00:00Z"];
const FEB28 = ["2027-02-28T12:00:00Z", "2027-03-31T12:00:00Z"];
const COACH_CAP = 5 * H;

test("a monthly window anchored on the 31st counts what was created inside it, across two calendar months", async () => {
  const db = await boot();

  // The hour before the period starts: January's ledger, not this window's.
  const before = await personal(db, PLAYER, JAN31, 2 * H, COACH_CAP);
  await dated(db, before.job, "2027-01-31T11:00:00Z");

  // January 31 and February 10 file under different billing months and are
  // one window.
  const first = await personal(
    db,
    PLAYER,
    JAN31,
    2 * H,
    COACH_CAP,
    "2027-01-31T13:00:00Z",
  );
  assert.deepEqual(
    [first.ok, first.used_seconds, first.cap_seconds],
    [true, 2 * H, COACH_CAP],
    "the row dated before the anchor is not counted",
  );
  const second = await personal(
    db,
    PLAYER,
    JAN31,
    2 * H,
    COACH_CAP,
    "2027-02-10T09:00:00Z",
  );
  assert.equal(second.used_seconds, 4 * H);

  const months = await db.query(
    `select billing_month::text as month from public.processing_usage
      where job_id = any($1) order by 1`,
    [[first.job, second.job]],
  );
  assert.deepEqual(
    months.rows.map((row) => row.month),
    ["2027-01-01", "2027-02-01"],
  );

  const over = await personal(db, PLAYER, JAN31, 2 * H, COACH_CAP);
  assert.deepEqual(
    [over.ok, over.used_seconds, over.cap_seconds, over.credit_seconds],
    [false, 4 * H, COACH_CAP, 0],
    "5 h is the cap: 2 h more than the 1 h left is refused",
  );
  const exact = await personal(db, PLAYER, JAN31, H, COACH_CAP);
  assert.deepEqual([exact.ok, exact.used_seconds], [true, 5 * H]);
});

test("plan hours do not roll over into the next window", async () => {
  const db = await boot();
  await personal(db, PLAYER, JAN31, H, COACH_CAP, "2027-02-01T00:00:00Z");

  // 4 h went unused. The next window holds 5 h, not 9.
  const full = await personal(
    db,
    PLAYER,
    FEB28,
    5 * H,
    COACH_CAP,
    "2027-03-01T00:00:00Z",
  );
  assert.deepEqual([full.ok, full.used_seconds], [true, 5 * H]);
  const more = await personal(db, PLAYER, FEB28, 1, COACH_CAP);
  assert.deepEqual([more.ok, more.used_seconds], [false, 5 * H]);

  // The window's last instant belongs to it; its end belongs to the next.
  const edge = await boot();
  const last = await personal(edge, PLAYER, JAN31, H, COACH_CAP);
  await dated(edge, last.job, "2027-02-28T11:59:59Z");
  const next = await personal(edge, PLAYER, JAN31, H, COACH_CAP);
  await dated(edge, next.job, "2027-02-28T12:00:00Z");
  const inJan = await personal(edge, PLAYER, JAN31, 1, COACH_CAP);
  assert.equal(inJan.used_seconds - 1, H, "only the 11:59:59 row is in it");
  const inFeb = await personal(edge, PLAYER, FEB28, 1, COACH_CAP);
  assert.equal(inFeb.used_seconds - 1, H, "the 12:00:00 row is the next one's");
});

test("a yearly subscriber gets a fresh allowance in every monthly slice", async () => {
  const db = await boot();
  // Anchored 2027-01-15: twelve slices, of which three are walked here.
  const slices = [
    ["2027-01-15T00:00:00Z", "2027-02-15T00:00:00Z", "2027-01-20T00:00:00Z"],
    ["2027-02-15T00:00:00Z", "2027-03-15T00:00:00Z", "2027-02-20T00:00:00Z"],
    ["2027-12-15T00:00:00Z", "2028-01-15T00:00:00Z", "2027-12-31T23:00:00Z"],
  ];
  for (const [start, end, when] of slices) {
    const full = await personal(
      db,
      PLAYER,
      [start, end],
      5 * H,
      COACH_CAP,
      when,
    );
    assert.deepEqual([full.ok, full.used_seconds], [true, 5 * H], start);
    const more = await personal(db, PLAYER, [start, end], 1, COACH_CAP);
    assert.equal(more.ok, false, `${start} is spent`);
  }
  const rows = await db.query(
    "select count(*)::int as n from public.processing_usage where account_id = $1",
    [PLAYER],
  );
  assert.equal(rows.rows[0].n, 3);
});

test("Free has no hours: refused with nothing written, unless purchased hours cover it", async () => {
  const db = await boot();
  const month = ["2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z"];

  const refused = await personal(db, PLAYER, month, 60, 0);
  assert.deepEqual(
    [refused.ok, refused.used_seconds, refused.cap_seconds],
    [false, 0, 0],
  );
  const none = await db.query(
    "select count(*)::int as n from public.processing_usage",
  );
  assert.equal(none.rows[0].n, 0);

  // Purchased hours carry a Free player: the ledger row holds no plan time.
  const lot = await credit(db, PLAYER, 2 * H, inDays(300));
  const bought = await personal(db, PLAYER, month, H, 0);
  assert.deepEqual(
    [
      bought.ok,
      bought.used_seconds,
      bought.credit_spent_seconds,
      bought.credit_seconds,
    ],
    [true, 0, H, H],
  );
  assert.equal(await remaining(db, lot), H);
  const ledger = await db.query(
    "select reserved_seconds, account_type from public.processing_usage where job_id = $1",
    [bought.job],
  );
  assert.deepEqual(ledger.rows[0], {
    reserved_seconds: 0,
    account_type: "individual",
  });
});

test("plan hours are spent first, then purchased hours, soonest-expiring first", async () => {
  const db = await boot();
  await personal(db, PLAYER, JAN31, 4 * H, COACH_CAP, "2027-02-01T00:00:00Z");

  const later = await credit(db, PLAYER, H, inDays(30));
  const sooner = await credit(db, PLAYER, 2 * H, inDays(10), "grant");
  // Unspent but expired: not hours anybody has.
  const expired = await credit(db, PLAYER, 10 * H, inDays(-1));

  // 2.5 h: the plan's last hour, then 1.5 h from the lot that expires first.
  const mixed = await personal(db, PLAYER, JAN31, 2.5 * H, COACH_CAP);
  assert.deepEqual(
    [
      mixed.ok,
      mixed.used_seconds,
      mixed.credit_spent_seconds,
      mixed.credit_seconds,
    ],
    [true, 5 * H, 1.5 * H, 1.5 * H],
  );
  assert.equal(await remaining(db, sooner), 0.5 * H);
  assert.equal(await remaining(db, later), H);
  const ledger = await db.query(
    "select reserved_seconds from public.processing_usage where job_id = $1",
    [mixed.job],
  );
  assert.equal(ledger.rows[0].reserved_seconds, H, "only the plan's share");

  // The plan is spent: the next hour drains the sooner lot, then the later.
  const credits = await personal(db, PLAYER, JAN31, H, COACH_CAP);
  assert.deepEqual(
    [credits.ok, credits.credit_spent_seconds, credits.credit_seconds],
    [true, H, 0.5 * H],
  );
  assert.equal(await remaining(db, sooner), 0);
  assert.equal(await remaining(db, later), 0.5 * H);

  const short = await personal(db, PLAYER, JAN31, H, COACH_CAP);
  assert.deepEqual(
    [short.ok, short.credit_seconds],
    [false, 0.5 * H],
    "the expired lot does not count",
  );
  assert.equal(await remaining(db, expired), 10 * H);
});

test("an upgrade's new period starts with fresh hours and the old usage stays in the ledger", async () => {
  const db = await boot();
  // Coach from January 5, used up by the 10th.
  const old = await personal(
    db,
    PLAYER,
    ["2027-01-05T00:00:00Z", "2027-02-05T00:00:00Z"],
    5 * H,
    COACH_CAP,
    "2027-01-10T00:00:00Z",
  );
  assert.equal(old.ok, true);

  // Coach Pro on January 20: `plan_period_start` moves there.
  const pro = ["2027-01-20T00:00:00Z", "2027-02-20T00:00:00Z"];
  const fresh = await personal(db, PLAYER, pro, 10 * H, 10 * H);
  assert.deepEqual(
    [fresh.ok, fresh.used_seconds, fresh.cap_seconds],
    [true, 10 * H, 10 * H],
  );
  await dated(db, fresh.job, "2027-01-20T00:00:00Z");
  assert.equal((await personal(db, PLAYER, pro, 1, 10 * H)).ok, false);

  const ledger = await db.query(
    `select reserved_seconds from public.processing_usage
      where account_id = $1 and not released order by created_at`,
    [PLAYER],
  );
  assert.deepEqual(
    ledger.rows.map((row) => row.reserved_seconds),
    [5 * H, 10 * H],
  );
});

test("an admin's hours override replaces the cap it was handed", async () => {
  const db = await boot();
  await db.query(
    "update public.users set video_hours_override = 1 where id = $1",
    [PLAYER],
  );
  const month = ["2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z"];
  const within = await personal(db, PLAYER, month, H, COACH_CAP);
  assert.deepEqual([within.ok, within.cap_seconds], [true, H]);
  await dated(db, within.job, "2027-01-02T00:00:00Z");
  const over = await personal(db, PLAYER, month, 1, COACH_CAP);
  assert.deepEqual([over.ok, over.cap_seconds], [false, H]);
});

// Starter, Spring: 80 h from January 1 to May 31, both days inclusive.
const SEASON = ["2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"];
const SEASON_CAP = 80 * H;

test("a season is one pool from its first day to its last", async () => {
  const db = await boot();

  // The day before the season, and the day after it: neither is the pool's.
  for (const when of ["2026-12-31T23:59:59Z", "2027-06-01T00:00:00Z"]) {
    const outside = await team(db, TEAM, COACH, SEASON, 10 * H, SEASON_CAP);
    await dated(db, outside.job, when);
  }

  const first = await team(
    db,
    TEAM,
    COACH,
    SEASON,
    30 * H,
    SEASON_CAP,
    "2027-01-01T00:00:00Z",
  );
  assert.deepEqual(
    [first.ok, first.used_seconds, first.cap_seconds],
    [true, 30 * H, SEASON_CAP],
    "the first day counts; the day before and the day after do not",
  );
  const mid = await team(
    db,
    TEAM,
    TEAMMATE,
    SEASON,
    30 * H,
    SEASON_CAP,
    "2027-03-14T15:00:00Z",
  );
  assert.equal(mid.used_seconds, 60 * H, "not a monthly figure");
  const last = await team(
    db,
    TEAM,
    COACH,
    SEASON,
    20 * H,
    SEASON_CAP,
    "2027-05-31T23:59:59Z",
  );
  assert.deepEqual([last.ok, last.used_seconds], [true, SEASON_CAP]);

  const spent = await team(db, TEAM, COACH, SEASON, 1, SEASON_CAP);
  assert.deepEqual([spent.ok, spent.used_seconds], [false, SEASON_CAP]);

  const row = await db.query(
    "select account_type, created_by from public.processing_usage where job_id = $1",
    [mid.job],
  );
  assert.deepEqual(row.rows[0], {
    account_type: "program",
    created_by: TEAMMATE,
  });

  // The day after the season the app hands in a different window and cap:
  // no plan, no pilot, zero.
  const after = await team(
    db,
    TEAM,
    COACH,
    ["2027-06-01T00:00:00Z", "2027-07-01T00:00:00Z"],
    60,
    0,
  );
  assert.deepEqual(
    [after.ok, after.cap_seconds, after.used_seconds],
    [false, 0, 10 * H],
  );
});

test("a pilot keeps 75 hours a calendar month, and a team with neither has none", async () => {
  const db = await boot();
  const january = ["2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z"];
  const february = ["2027-02-01T00:00:00Z", "2027-03-01T00:00:00Z"];
  const PILOT_CAP = 75 * H;

  await team(
    db,
    TEAM,
    COACH,
    january,
    70 * H,
    PILOT_CAP,
    "2027-01-20T00:00:00Z",
  );
  const fresh = await team(
    db,
    TEAM,
    COACH,
    february,
    75 * H,
    PILOT_CAP,
    "2027-02-03T00:00:00Z",
  );
  assert.deepEqual([fresh.ok, fresh.used_seconds], [true, PILOT_CAP]);
  assert.equal((await team(db, TEAM, COACH, february, 1, PILOT_CAP)).ok, false);

  const none = await team(db, OTHER_TEAM, OUTSIDER, february, 1, 0);
  assert.deepEqual(
    [none.ok, none.used_seconds, none.cap_seconds],
    [false, 0, 0],
  );
  const written = await db.query(
    "select count(*)::int as n from public.processing_usage where account_id = $1",
    [OTHER_TEAM],
  );
  assert.equal(written.rows[0].n, 0);
});

test("release and reconcile still give hours back", async () => {
  const db = await boot();

  // A team: a released reservation frees its hours, a reconciled one counts
  // at what the vendor billed.
  const held = await team(db, TEAM, COACH, SEASON, 79 * H, SEASON_CAP);
  await dated(db, held.job, "2027-02-01T00:00:00Z");
  assert.equal(
    (await team(db, TEAM, COACH, SEASON, 2 * H, SEASON_CAP)).ok,
    false,
  );
  await db.query("select public.reconcile_processing_quota($1, $2)", [
    held.job,
    70 * H,
  ]);
  const afterReconcile = await team(db, TEAM, COACH, SEASON, 2 * H, SEASON_CAP);
  assert.deepEqual(
    [afterReconcile.ok, afterReconcile.used_seconds],
    [true, 72 * H],
  );
  await dated(db, afterReconcile.job, "2027-02-02T00:00:00Z");
  await db.query("select public.release_processing_quota($1)", [held.job]);
  const afterRelease = await team(db, TEAM, COACH, SEASON, H, SEASON_CAP);
  assert.equal(afterRelease.used_seconds, 3 * H);

  // A player: plan hours and purchased hours both come back.
  const lot = await credit(db, PLAYER, 2 * H, inDays(60));
  const spend = await personal(db, PLAYER, JAN31, 6 * H, COACH_CAP);
  assert.deepEqual(
    [spend.ok, spend.used_seconds, spend.credit_spent_seconds],
    [true, 5 * H, H],
  );
  await dated(db, spend.job, "2027-02-05T00:00:00Z");
  assert.equal(await remaining(db, lot), H);

  // Billed 4 h of the 6 reserved: the credit hour is refunded first.
  await db.query("select public.reconcile_processing_quota($1, $2)", [
    spend.job,
    4 * H,
  ]);
  assert.equal(await remaining(db, lot), 2 * H);
  const reconciled = await personal(db, PLAYER, JAN31, H, COACH_CAP);
  assert.deepEqual(
    [reconciled.ok, reconciled.used_seconds, reconciled.credit_spent_seconds],
    [true, 5 * H, 0],
    "4 h actual + this hour, all from the plan",
  );
  await db.query("select public.release_processing_quota($1)", [spend.job]);
  const released = await personal(db, PLAYER, JAN31, 4 * H, COACH_CAP);
  assert.deepEqual([released.ok, released.used_seconds], [true, 5 * H]);

  // Safe to call twice, and on a job that holds nothing.
  await db.query("select public.release_processing_quota($1)", [spend.job]);
  await db.query("select public.release_processing_quota($1)", [uuid(999)]);
});

test("the reserve functions refuse bad arguments and a second reservation for one job", async () => {
  const db = await boot();
  const job = await newJob(db);
  const call = (start, end, seconds, cap) =>
    db.query(
      "select * from public.reserve_plan_personal_quota($1, $2, $3, $4, $5, $6)",
      [job, PLAYER, start, end, seconds, cap],
    );
  await assert.rejects(
    call(JAN31[0], JAN31[1], 0, COACH_CAP),
    /must be positive/,
  );
  await assert.rejects(call(JAN31[1], JAN31[0], 60, COACH_CAP), /bad window/);
  await assert.rejects(call(JAN31[0], JAN31[0], 60, COACH_CAP), /bad window/);
  await assert.rejects(call(null, JAN31[1], 60, COACH_CAP), /bad window/);
  await assert.rejects(call(JAN31[0], JAN31[1], 60, -1), /bad p_cap_seconds/);
  await assert.rejects(call(JAN31[0], JAN31[1], 60, null), /bad p_cap_seconds/);

  const teamCall = (start, end, seconds, cap) =>
    db.query(
      "select * from public.reserve_plan_program_quota($1, $2, $3, $4, $5, $6, $7)",
      [job, TEAM, COACH, start, end, seconds, cap],
    );
  await assert.rejects(
    teamCall(SEASON[0], SEASON[1], -5, 1),
    /must be positive/,
  );
  await assert.rejects(teamCall(SEASON[1], SEASON[0], 60, 1), /bad window/);
  await assert.rejects(
    teamCall(SEASON[0], SEASON[1], 60, null),
    /bad p_cap_seconds/,
  );

  assert.equal(
    (await call(JAN31[0], JAN31[1], 60, COACH_CAP)).rows[0].ok,
    true,
  );
  await assert.rejects(
    call(JAN31[0], JAN31[1], 60, COACH_CAP),
    /processing_usage_job_id_key/,
  );
  await assert.rejects(
    teamCall(SEASON[0], SEASON[1], 60, SEASON_CAP),
    /processing_usage_job_id_key/,
  );
});

test("the window meter reads match the reservation and keep the month reads' membership rules", async () => {
  const db = await boot();
  const done = await team(db, TEAM, COACH, SEASON, 3 * H, SEASON_CAP);
  await dated(db, done.job, "2027-01-15T00:00:00Z");
  await db.query("select public.reconcile_processing_quota($1, $2)", [
    done.job,
    2 * H,
  ]);
  const pending = await team(db, TEAM, TEAMMATE, SEASON, H, SEASON_CAP);
  await dated(db, pending.job, "2027-04-02T00:00:00Z");
  const gone = await team(db, TEAM, COACH, SEASON, 5 * H, SEASON_CAP);
  await dated(db, gone.job, "2027-04-03T00:00:00Z");
  await db.query("select public.release_processing_quota($1)", [gone.job]);
  const outside = await team(db, TEAM, COACH, SEASON, 7 * H, SEASON_CAP);
  await dated(db, outside.job, "2027-06-01T00:00:00Z");

  const total = (userId) =>
    as(db, "authenticated", userId, async () => {
      const args = [TEAM, ...SEASON];
      const [t, p, m] = await Promise.all([
        db.query(
          "select public.program_usage_total_between($1, $2, $3) as v",
          args,
        ),
        db.query(
          "select public.program_usage_pending_between($1, $2, $3) as v",
          args,
        ),
        db.query(
          `select user_id, display_name, used_seconds, match_count
             from public.program_usage_by_member_between($1, $2, $3)`,
          args,
        ),
      ]);
      return {
        total: Number(t.rows[0].v),
        pending: Number(p.rows[0].v),
        lines: m.rows.map((row) => [row.user_id, Number(row.used_seconds)]),
        names: m.rows.map((row) => row.display_name),
      };
    });

  const coach = await total(COACH);
  assert.equal(coach.total, 3 * H, "2 h actual + 1 h reserved");
  assert.equal(coach.pending, H);
  assert.deepEqual(coach.lines, [
    [COACH, 2 * H],
    [TEAMMATE, H],
  ]);
  assert.deepEqual(coach.names, ["Cory Coach", "Tess Teammate"]);

  // A player reads the team's total and only their own line.
  const player = await total(TEAMMATE);
  assert.equal(player.total, 3 * H);
  assert.deepEqual(player.lines, [[TEAMMATE, H]]);

  // Somebody outside the program reads nothing.
  const stranger = await total(OUTSIDER);
  assert.deepEqual(
    [stranger.total, stranger.pending, stranger.lines],
    [0, 0, []],
  );

  // The same sum the reservation makes.
  const check = await team(db, TEAM, COACH, SEASON, 1, SEASON_CAP);
  assert.equal(check.used_seconds - 1, coach.total);
});

test("the admin console's reservation takes the resolved cap, and a team with no season and no pilot draws zero", async () => {
  const db = await boot();
  const window = [inDays(-5), inDays(25)];
  const access = (job, value) =>
    db.query(
      "insert into public.test_video_access (job_id, access) values ($1, $2)",
      [job, JSON.stringify(value)],
    );
  const reserve = (actor, job, seconds, cap) =>
    db.query(
      "select * from public.admin_reserve_plan_video_quota($1, $2, $3, $4, $5, $6)",
      [actor, job, seconds, ...window, cap],
    );

  // A team with neither: the cap it was handed is ignored.
  const none = await newJob(db, 600);
  await access(none, { programId: TEAM });
  assert.deepEqual((await reserve(ADMIN, none, 600, 75 * H)).rows[0], {
    ok: false,
    used_seconds: 0,
    cap_seconds: 0,
  });

  // A season containing today (UTC).
  await db.query(
    `insert into public.program_plans (program_id, plan_id, plan_term, starts_on, ends_on)
     values ($1, 'starter', 'spring',
             (now() at time zone 'utc')::date, (now() at time zone 'utc')::date)`,
    [TEAM],
  );
  assert.deepEqual((await reserve(ADMIN, none, 600, 80 * H)).rows[0], {
    ok: true,
    used_seconds: 600,
    cap_seconds: 80 * H,
  });
  const filed = await db.query(
    "select account_id, account_type, created_by from public.processing_usage where job_id = $1",
    [none],
  );
  assert.deepEqual(filed.rows[0], {
    account_id: TEAM,
    account_type: "program",
    created_by: ADMIN,
  });
  await assert.rejects(reserve(ADMIN, none, 600, 80 * H), /already-reserved/);

  // A season that ended yesterday is no season.
  await db.query(
    `update public.program_plans
        set starts_on = (now() at time zone 'utc')::date - 30,
            ends_on = (now() at time zone 'utc')::date - 1
      where program_id = $1`,
    [TEAM],
  );
  const lapsed = await newJob(db, 600);
  await access(lapsed, { programId: TEAM });
  assert.equal(
    (await reserve(ADMIN, lapsed, 600, 80 * H)).rows[0].cap_seconds,
    0,
  );

  // A pilot: running only while eligible, not ended, and not past its end
  // date or May 31, 2027, whichever is first.
  const pilotRuns = (
    await db.query(
      "select (now() at time zone 'utc')::date <= date '2027-05-31' as v",
    )
  ).rows[0].v;
  const pilot = await newJob(db, 600);
  await access(pilot, { programId: OTHER_TEAM });
  await db.query(
    `update public.programs
        set pilot_eligible = true,
            pilot_ends_on = (now() at time zone 'utc')::date + 3650
      where id = $1`,
    [OTHER_TEAM],
  );
  assert.equal(
    (await reserve(ADMIN, pilot, 600, 75 * H)).rows[0].ok,
    pilotRuns,
    "a far end date still stops at May 31, 2027",
  );
  await db.query("delete from public.processing_usage where job_id = $1", [
    pilot,
  ]);
  for (const stopped of [
    "pilot_ended_at = now()",
    "pilot_ended_at = null, pilot_ends_on = (now() at time zone 'utc')::date - 1",
    "pilot_ends_on = null",
    "pilot_ends_on = (now() at time zone 'utc')::date, pilot_eligible = false",
  ]) {
    await db.exec(
      `update public.programs set ${stopped} where id = '${OTHER_TEAM}'`,
    );
    assert.equal(
      (await reserve(ADMIN, pilot, 600, 75 * H)).rows[0].cap_seconds,
      0,
      stopped,
    );
  }

  // A player's own hours: the personal function, credits included.
  const forPlayer = await newJob(db, 2 * H);
  await access(forPlayer, { personalUserId: PLAYER, billing: "player" });
  const lot = await credit(db, PLAYER, 2 * H, inDays(60));
  assert.deepEqual((await reserve(ADMIN, forPlayer, 2 * H, H)).rows[0], {
    ok: true,
    used_seconds: H,
    cap_seconds: H,
  });
  assert.equal(await remaining(db, lot), H);

  // Free: the administrator's own uncapped row, nothing of the player's.
  const free = await newJob(db, 600);
  await access(free, { personalUserId: PLAYER, billing: "free" });
  assert.equal((await reserve(ADMIN, free, 600, 0)).rows[0].ok, true);
  const freeRow = await db.query(
    "select account_id, account_type from public.processing_usage where job_id = $1",
    [free],
  );
  assert.deepEqual(freeRow.rows[0], {
    account_id: ADMIN,
    account_type: "individual",
  });

  // The live function's refusals, unchanged.
  const other = await newJob(db, 600);
  await access(other, { programId: TEAM });
  await assert.rejects(reserve(COACH, other, 600, H), /admin-required/);
  await assert.rejects(
    reserve(ADMIN, other, 601, H),
    /invalid-video-reservation/,
  );
  await assert.rejects(
    reserve(ADMIN, other, 600, null),
    /invalid-video-reservation/,
  );
  await assert.rejects(
    reserve(ADMIN, await newJob(db, 600), 600, H),
    /video-operation-required/,
  );
});

test("a pilot cannot be set to end after May 31, 2027", async () => {
  const db = await boot();
  const setEnd = (userId, date) =>
    as(db, "authenticated", userId, () =>
      db.query("select public.admin_set_pilot_end($1, $2)", [TEAM, date]),
    );

  await assert.rejects(setEnd(ADMIN, "2027-06-01"), /May 31, 2027/);
  await assert.rejects(setEnd(ADMIN, "2028-01-01"), /May 31, 2027/);
  await assert.rejects(setEnd(ADMIN, null), /end date is required/);
  await assert.rejects(setEnd(COACH, "2027-05-31"), /not authorized/);
  const untouched = await db.query(
    "select pilot_ends_on from public.programs where id = $1",
    [TEAM],
  );
  assert.equal(untouched.rows[0].pilot_ends_on, null);

  await setEnd(ADMIN, "2027-05-31");
  const saved = await db.query(
    "select pilot_ends_on::text as d from public.programs where id = $1",
    [TEAM],
  );
  assert.equal(saved.rows[0].d, "2027-05-31");
  await setEnd(ADMIN, "2027-03-01");
  const audit = await db.query(
    `select action, actor_user_id, details ->> 'to' as "to"
       from public.program_audit_log order by id`,
  );
  assert.deepEqual(audit.rows, [
    { action: "pilot.end_changed", actor_user_id: ADMIN, to: "2027-05-31" },
    { action: "pilot.end_changed", actor_user_id: ADMIN, to: "2027-03-01" },
  ]);
});

test("nothing is executable signed out, and only the service role reserves", async () => {
  const db = await boot();
  const functions = {
    "public.reserve_plan_personal_quota(uuid, uuid, timestamptz, timestamptz, integer, integer)":
      [false, false, true],
    "public.reserve_plan_program_quota(uuid, uuid, uuid, timestamptz, timestamptz, integer, integer)":
      [false, false, true],
    "public.admin_reserve_plan_video_quota(uuid, uuid, integer, timestamptz, timestamptz, integer)":
      [false, false, true],
    "public.program_usage_total_between(uuid, timestamptz, timestamptz)": [
      false,
      true,
      true,
    ],
    "public.program_usage_pending_between(uuid, timestamptz, timestamptz)": [
      false,
      true,
      true,
    ],
    "public.program_usage_by_member_between(uuid, timestamptz, timestamptz)": [
      false,
      true,
      true,
    ],
    "public.admin_set_pilot_end(uuid, date)": [false, true, true],
  };
  for (const [signature, expected] of Object.entries(functions)) {
    const { rows } = await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', $1, 'EXECUTE') as service_role,
              (select prosecdef from pg_proc where oid = $1::regprocedure) as definer,
              (select proconfig from pg_proc where oid = $1::regprocedure) as config`,
      [signature],
    );
    assert.deepEqual(
      [rows[0].anon, rows[0].authenticated, rows[0].service_role],
      expected,
      signature,
    );
    assert.equal(rows[0].definer, true, `${signature} is SECURITY DEFINER`);
    assert.deepEqual(rows[0].config, ['search_path=""'], signature);
  }

  // By the call itself, not only the catalog.
  const job = await newJob(db);
  const reserve = () =>
    db.query(
      "select * from public.reserve_plan_personal_quota($1, $2, $3, $4, $5, $6)",
      [job, PLAYER, ...JAN31, 60, COACH_CAP],
    );
  await assert.rejects(as(db, "anon", null, reserve), /permission denied/);
  await assert.rejects(
    as(db, "authenticated", PLAYER, reserve),
    /permission denied/,
  );
  await assert.rejects(
    as(db, "anon", null, () =>
      db.query("select public.program_usage_total_between($1, $2, $3)", [
        TEAM,
        ...SEASON,
      ]),
    ),
    /permission denied/,
  );
  const served = await as(db, "service_role", null, reserve);
  assert.equal(served.rows[0].ok, true);
});

test("the migration can be run twice and leaves the month-keyed functions alone", async () => {
  const db = await boot();
  const bodies = () =>
    db.query(
      `select proname, md5(prosrc) as body, proacl::text as acl from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('reserve_processing_quota', 'reserve_personal_quota',
                          'release_processing_quota', 'reconcile_processing_quota')
        order by proname`,
    );
  const before = await bodies();
  await db.exec(migration);
  assert.deepEqual((await bodies()).rows, before.rows);

  // The month-keyed path still reserves, on the same ledger.
  const job = await newJob(db);
  const month = await db.query(
    "select * from public.reserve_personal_quota($1, $2, $3, $4, $5)",
    [job, PLAYER, "2026-12-01", 60, 2 * H],
  );
  assert.deepEqual([month.rows[0].ok, month.rows[0].used_seconds], [true, 60]);
});
