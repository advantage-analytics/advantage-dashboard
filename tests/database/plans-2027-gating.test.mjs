/** Run: node --test tests/database/plans-2027-gating.test.mjs
 * Isolated PostgreSQL contract test for the 2027 gating migration
 * (`20261126090000_plans_2027_gating.sql`), executed byte-for-byte, TWICE, on
 * top of the allowances migration it replaces two functions of, so its
 * assertion block and its re-runnability are both under test.
 *
 * What it stands on is `fixtures/plans-2027-allowances-live.sql` (the live
 * ledger tables and functions as read on 2026-11-25; see
 * `plans-2027-allowances.test.mjs` for what is copied and what is modelled).
 * One column is added here that the fixture's modelled `processing_jobs`
 * leaves out and live has: `created_at timestamptz not null`, checked against
 * the live catalog on 2026-11-26.
 *
 * TIME. A test cannot move `now()`. The gate's date is a PARAMETER
 * (`p_plans_begin`, handed in from `PLANS_BEGIN` by the app), and what it is
 * compared with is `processing_jobs.created_at`, so each job is simply dated
 * to the moment it stands for. A reservation's marker does not depend on the
 * date at all: it records what paid, whenever that was.
 *
 * Not proven: PostgREST, the deployed grants themselves, concurrent calls,
 * or the real `admin_video_access` (the fixture's is a stub).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const live = await read("./fixtures/plans-2027-allowances-live.sql");
const allowances = await read(
  "../../supabase/migrations/20261126070000_plans_2027_allowances.sql",
);
const gating = await read(
  "../../supabase/migrations/20261126090000_plans_2027_gating.sql",
);

const H = 3600;
const PLANS_BEGIN = "2027-01-01T00:00:00Z";
const AFTER = "2027-02-10T12:00:00Z";
const BEFORE = "2026-12-31T23:59:59Z";
/** A window wide enough to hold `now()` whenever this runs. */
const WINDOW = ["2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"];

const ADMIN = uuid(1);
const FREE = uuid(2);
const COACH = uuid(3);
const COMPED = uuid(4);
const STAFF = uuid(5);
const SEASON_TEAM = uuid(10);
const PILOT_TEAM = uuid(11);
const BARE_TEAM = uuid(12);

async function boot() {
  const db = new PGlite();
  await db.exec(live);
  await db.exec(
    "alter table public.processing_jobs add column created_at timestamptz not null default now();",
  );
  await db.exec(`
    insert into auth.users (id) values
      ('${ADMIN}'), ('${FREE}'), ('${COACH}'), ('${COMPED}'), ('${STAFF}');
    insert into public.users (id, first_name, is_admin, plan, video_hours_override) values
      ('${ADMIN}', 'Ada', true, 'free', null),
      ('${FREE}', 'Fay', false, 'free', null),
      ('${COACH}', 'Cory', false, 'coach', null),
      ('${COMPED}', 'Cam', false, 'free', 4),
      ('${STAFF}', 'Sam', false, 'free', null);
    insert into public.programs (id, school_name, pilot_eligible, pilot_ends_on) values
      ('${SEASON_TEAM}', 'Season U', false, null),
      ('${PILOT_TEAM}', 'Pilot U', true, date '2027-05-31'),
      ('${BARE_TEAM}', 'Bare U', false, null);
    insert into public.program_plans (program_id, plan_id, plan_term, starts_on, ends_on) values
      ('${SEASON_TEAM}', 'starter', 'spring', current_date - 1, current_date + 30);
  `);
  await db.exec(allowances);
  await db.exec(gating);
  // Re-runnable: a second pass must change nothing and raise nothing.
  await db.exec(gating);
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

let nextId = 1000;
/** A completed job of `match`, sent for analysis at `createdAt`. */
async function newJob(
  db,
  { match = uuid(nextId++), createdAt = AFTER, status = "completed" } = {},
) {
  const id = uuid(nextId++);
  await db.query(
    `insert into public.processing_jobs (id, match_id, status, end_time_seconds, created_at)
     values ($1, $2, $3, 3600, $4)`,
    [id, match, status, createdAt],
  );
  return { id, match };
}

async function reservePersonal(db, job, user, seconds, cap) {
  const { rows } = await db.query(
    "select * from public.reserve_plan_personal_quota($1, $2, $3, $4, $5, $6)",
    [job, user, ...WINDOW, seconds, cap],
  );
  return rows[0];
}

async function reserveTeam(db, job, program, by, seconds, cap) {
  const { rows } = await db.query(
    "select * from public.reserve_plan_program_quota($1, $2, $3, $4, $5, $6, $7)",
    [job, program, by, ...WINDOW, seconds, cap],
  );
  return rows[0];
}

const credit = (db, user, seconds, source = "purchase") =>
  db.query(
    `insert into public.video_credits (user_id, seconds, remaining_seconds, expires_at, source)
     values ($1, $2, $2, now() + interval '300 days', $3)`,
    [user, seconds, source],
  );

const basisOf = async (db, job) =>
  (
    await db.query(
      "select paid_basis from public.processing_usage where job_id = $1",
      [job],
    )
  ).rows[0]?.paid_basis ?? null;

/** The gate's answer for one job, asked the way the server asks it. */
async function eligibility(db, job, plansBegin = PLANS_BEGIN) {
  const { rows } = await as(db, "service_role", null, () =>
    db.query(
      "select * from public.label_review_eligibility($1::uuid[], $2::timestamptz)",
      [[job], plansBegin],
    ),
  );
  assert.equal(rows.length, 1);
  return { eligible: rows[0].eligible, basis: rows[0].paid_basis };
}

test("plan hours: a Coach's match is paid for and eligible", async () => {
  const db = await boot();
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, COACH, H, 5 * H);
  assert.equal(row.ok, true);
  assert.equal(row.used_seconds, H);
  assert.equal(row.credit_spent_seconds, 0);
  assert.equal(await basisOf(db, job.id), "plan");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "plan",
  });
});

test("a plan covers every match sent on it, whichever hours it drew", async () => {
  const db = await boot();
  // Out of plan hours (cap 0 left), topped up from a credit Advantage granted.
  await credit(db, COACH, 2 * H, "grant");
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, COACH, H, 0);
  assert.equal(row.ok, true);
  assert.equal(row.credit_spent_seconds, H);
  assert.equal(await basisOf(db, job.id), "plan");
  assert.equal((await eligibility(db, job.id)).eligible, true);
});

test("extra hours on a Free account: paid for and eligible (decision 5)", async () => {
  const db = await boot();
  await credit(db, FREE, 2 * H, "purchase");
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, FREE, H, 0);
  assert.equal(row.ok, true);
  assert.equal(row.credit_spent_seconds, H);
  assert.equal(await basisOf(db, job.id), "extra_hours");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "extra_hours",
  });
});

test("a granted credit is not a payment", async () => {
  const db = await boot();
  await credit(db, FREE, 2 * H, "grant");
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, FREE, H, 0);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), null);
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: false,
    basis: null,
  });
});

test("one purchased second among granted ones is a payment", async () => {
  const db = await boot();
  await db.query(
    `insert into public.video_credits (user_id, seconds, remaining_seconds, expires_at, source) values
       ($1, 1800, 1800, now() + interval '10 days', 'grant'),
       ($1, 3600, 3600, now() + interval '20 days', 'purchase')`,
    [FREE],
  );
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, FREE, H, 0);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), "extra_hours");
});

test("a team season: paid for and eligible", async () => {
  const db = await boot();
  const job = await newJob(db);
  const row = await reserveTeam(db, job.id, SEASON_TEAM, STAFF, H, 80 * H);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), "season");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "season",
  });
});

test("a team pilot: eligible", async () => {
  const db = await boot();
  const job = await newJob(db);
  const row = await reserveTeam(db, job.id, PILOT_TEAM, STAFF, H, 75 * H);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), "pilot");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "pilot",
  });
});

test("a pilot that was ended early marks nothing", async () => {
  const db = await boot();
  await db.query(
    "update public.programs set pilot_ended_at = now() where id = $1",
    [PILOT_TEAM],
  );
  const job = await newJob(db);
  // The app would hand in a cap of 0 and be refused; a cap is handed in here
  // only to show the marker is the database's own reading, not the caller's.
  const row = await reserveTeam(db, job.id, PILOT_TEAM, STAFF, H, 75 * H);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), null);
  assert.equal((await eligibility(db, job.id)).eligible, false);
});

test("a team with neither a season nor a pilot marks nothing", async () => {
  const db = await boot();
  const job = await newJob(db);
  const row = await reserveTeam(db, job.id, BARE_TEAM, STAFF, H, 75 * H);
  assert.equal(row.ok, true);
  assert.equal(await basisOf(db, job.id), null);
  assert.equal((await eligibility(db, job.id)).eligible, false);
});

test("unpaid after PLANS_BEGIN: an admin's hours override on a Free account", async () => {
  const db = await boot();
  const job = await newJob(db);
  // The override (4 h) wins over the cap handed in, as before.
  const row = await reservePersonal(db, job.id, COMPED, H, 0);
  assert.equal(row.ok, true);
  assert.equal(row.cap_seconds, 4 * H);
  assert.equal(await basisOf(db, job.id), null);
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: false,
    basis: null,
  });
});

test("unpaid after PLANS_BEGIN: an admin's own uncapped upload", async () => {
  const db = await boot();
  const viaPlanPath = await newJob(db);
  assert.equal(
    (await reservePersonal(db, viaPlanPath.id, ADMIN, H, 2147483647)).ok,
    true,
  );
  assert.equal(await basisOf(db, viaPlanPath.id), null);
  assert.equal((await eligibility(db, viaPlanPath.id)).eligible, false);

  // The console's "billed to nobody": the month-keyed function, no marker.
  const viaConsole = await newJob(db);
  await db.query(
    `select * from public.reserve_processing_quota($1, $2, 'individual', $2,
       (date_trunc('month', now() at time zone 'utc'))::date, $3, 2147483647)`,
    [viaConsole.id, ADMIN, H],
  );
  assert.equal(await basisOf(db, viaConsole.id), null);
  assert.equal((await eligibility(db, viaConsole.id)).eligible, false);
});

test("unpaid after PLANS_BEGIN: a job with no reservation at all", async () => {
  const db = await boot();
  const job = await newJob(db);
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: false,
    basis: null,
  });
});

test("before PLANS_BEGIN nothing changes: every analysed match stays eligible", async () => {
  const db = await boot();
  // Beta hours, the month-keyed function, no marker — and still eligible.
  const beta = await newJob(db, { createdAt: BEFORE });
  await db.query(
    `select * from public.reserve_personal_quota($1, $2, date '2026-12-01', $3, $4)`,
    [beta.id, FREE, H, 2 * H],
  );
  assert.equal(await basisOf(db, beta.id), null);
  assert.deepEqual(await eligibility(db, beta.id), {
    eligible: true,
    basis: null,
  });

  // No reservation at all (an old job), sent the second before the switch.
  const old = await newJob(db, { createdAt: BEFORE });
  assert.equal((await eligibility(db, old.id)).eligible, true);

  // The first instant of PLANS_BEGIN is on the other side.
  const first = await newJob(db, { createdAt: PLANS_BEGIN });
  assert.equal((await eligibility(db, first.id)).eligible, false);

  // Sent before the switch, finished after it: it drew the beta's hours.
  const straddling = await newJob(db, { createdAt: BEFORE });
  assert.equal((await eligibility(db, straddling.id)).eligible, true);
});

test("a paid plan in December is marked, and eligible on both readings", async () => {
  const db = await boot();
  const job = await newJob(db, { createdAt: "2026-12-10T12:00:00Z" });
  assert.equal((await reservePersonal(db, job.id, COACH, H, 5 * H)).ok, true);
  assert.equal(await basisOf(db, job.id), "plan");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "plan",
  });
  // Were the date not there to carry it, the marker would.
  assert.equal(
    (await eligibility(db, job.id, "2026-12-01T00:00:00Z")).eligible,
    true,
  );
});

test("eligibility is the match's: a free re-run keeps it, a paid one earns it", async () => {
  const db = await boot();

  // Analysed free before the switch, re-run free after it: still eligible.
  const early = await newJob(db, { createdAt: BEFORE });
  const rerun = await newJob(db, { match: early.match, createdAt: AFTER });
  assert.equal((await eligibility(db, rerun.id)).eligible, true);

  // A pre-switch job that never completed is not "analysed before".
  const failed = await newJob(db, { createdAt: BEFORE, status: "failed" });
  const retry = await newJob(db, { match: failed.match, createdAt: AFTER });
  assert.equal((await eligibility(db, retry.id)).eligible, false);

  // Paid for in January, re-run free by an admin in February.
  const paid = await newJob(db);
  assert.equal((await reservePersonal(db, paid.id, COACH, H, 5 * H)).ok, true);
  const free = await newJob(db, { match: paid.match });
  assert.deepEqual(await eligibility(db, free.id), {
    eligible: true,
    basis: "plan",
  });

  // Unpaid first, then sent again on purchased hours.
  const unpaid = await newJob(db);
  assert.equal((await eligibility(db, unpaid.id)).eligible, false);
  await credit(db, FREE, 2 * H, "purchase");
  const bought = await newJob(db, { match: unpaid.match });
  assert.equal((await reservePersonal(db, bought.id, FREE, H, 0)).ok, true);
  assert.equal((await eligibility(db, unpaid.id)).eligible, true);
  assert.equal((await eligibility(db, bought.id)).eligible, true);
});

test("a released reservation leaves no paid marker behind", async () => {
  const db = await boot();
  await credit(db, FREE, 2 * H, "purchase");
  const job = await newJob(db);
  assert.equal((await reservePersonal(db, job.id, FREE, H, 0)).ok, true);
  assert.equal(await basisOf(db, job.id), "extra_hours");

  await db.query("select public.release_processing_quota($1)", [job.id]);
  const { rows } = await db.query(
    "select released, paid_basis from public.processing_usage where job_id = $1",
    [job.id],
  );
  assert.deepEqual(rows, [{ released: true, paid_basis: null }]);
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: false,
    basis: null,
  });
  // The hours went back to the player, as before.
  const credits = await db.query(
    "select remaining_seconds from public.video_credits where user_id = $1",
    [FREE],
  );
  assert.equal(credits.rows[0].remaining_seconds, 2 * H);

  // A team's too.
  const teamJob = await newJob(db);
  await reserveTeam(db, teamJob.id, SEASON_TEAM, STAFF, H, 80 * H);
  await db.query("select public.release_processing_quota($1)", [teamJob.id]);
  assert.equal(await basisOf(db, teamJob.id), null);
  assert.equal((await eligibility(db, teamJob.id)).eligible, false);
});

test("reconciling a reservation keeps its marker", async () => {
  const db = await boot();
  const job = await newJob(db);
  await reservePersonal(db, job.id, COACH, H, 5 * H);
  await db.query("select public.reconcile_processing_quota($1, $2)", [
    job.id,
    1800,
  ]);
  assert.equal(await basisOf(db, job.id), "plan");
});

test("a refused reservation writes nothing", async () => {
  const db = await boot();
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, FREE, H, 0);
  assert.equal(row.ok, false);
  const { rows } = await db.query(
    "select 1 from public.processing_usage where job_id = $1",
    [job.id],
  );
  assert.equal(rows.length, 0);
});

test("the marker takes only the four bases", async () => {
  const db = await boot();
  const job = await newJob(db);
  await assert.rejects(
    db.query(
      `insert into public.processing_usage
         (account_id, account_type, billing_month, job_id, created_by, reserved_seconds, paid_basis)
       values ($1, 'individual', date '2027-02-01', $2, $1, 60, 'gift')`,
      [FREE, job.id],
    ),
    /processing_usage_paid_basis_check/,
  );
});

test("only the server can ask what was paid for", async () => {
  const db = await boot();
  const job = await newJob(db);
  for (const [role, user] of [
    ["anon", null],
    ["authenticated", FREE],
    ["authenticated", ADMIN],
  ]) {
    await assert.rejects(
      as(db, role, user, () =>
        db.query(
          "select * from public.label_review_eligibility($1::uuid[], $2::timestamptz)",
          [[job.id], PLANS_BEGIN],
        ),
      ),
      /permission denied/,
    );
    await assert.rejects(
      as(db, role, user, () =>
        db.query(
          "select * from public.reserve_plan_personal_quota($1, $2, $3, $4, $5, $6)",
          [job.id, FREE, ...WINDOW, H, 0],
        ),
      ),
      /permission denied/,
    );
  }
});

test("a player still reads only their own ledger rows, marker included", async () => {
  const db = await boot();
  const job = await newJob(db);
  await reservePersonal(db, job.id, COACH, H, 5 * H);
  const own = await as(db, "authenticated", COACH, () =>
    db.query("select paid_basis from public.processing_usage"),
  );
  assert.deepEqual(own.rows, [{ paid_basis: "plan" }]);
  const other = await as(db, "authenticated", FREE, () =>
    db.query("select paid_basis from public.processing_usage"),
  );
  assert.equal(other.rows.length, 0);
});

test("several jobs asked about at once answer one row each", async () => {
  const db = await boot();
  const paid = await newJob(db);
  await reservePersonal(db, paid.id, COACH, H, 5 * H);
  const unpaid = await newJob(db);
  const early = await newJob(db, { createdAt: BEFORE });
  const { rows } = await as(db, "service_role", null, () =>
    db.query(
      `select job_id, eligible from public.label_review_eligibility($1::uuid[], $2::timestamptz)`,
      [[paid.id, unpaid.id, early.id, uuid(999999)], PLANS_BEGIN],
    ),
  );
  assert.deepEqual(
    Object.fromEntries(rows.map((row) => [row.job_id, row.eligible])),
    { [paid.id]: true, [unpaid.id]: false, [early.id]: true },
  );
});
