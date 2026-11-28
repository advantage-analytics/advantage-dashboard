/** Run: node --test tests/database/plans-2027-final-pricing.test.mjs
 * Isolated PostgreSQL contract test for the final-pricing migration
 * (`20261127060000_plans_2027_final_pricing.sql`), executed byte-for-byte,
 * TWICE, on top of the allowances and gating migrations whose functions it
 * replaces, so its assertion block and its re-runnability are both under
 * test.
 *
 * What it stands on is `fixtures/plans-2027-allowances-live.sql` (the live
 * ledger tables and functions; see `plans-2027-allowances.test.mjs`), plus
 * three things the fixture leaves out and the migration reads, modelled here
 * from the live catalog as read on 2026-11-27:
 *  - `users_plan_check` in the state live holds (free | coach | coach-pro |
 *    pro), or the state the billing migration leaves (no `pro`);
 *  - `processing_jobs.created_at`;
 *  - `program_plans`' plan-model and follow-ups columns (`rush_included`,
 *    `set_by`, `set_at`, `note`, `hours_from`). `admin_set_program_plan`'s
 *    own contract is proven in `plans-2027-plan-model.test.mjs` and
 *    `plans-2027-followups.test.mjs`; here only what this migration changes
 *    is: every plan stamps no Rush jobs.
 *
 * What this proves: `coach` / `coach-pro` rows become `player` /
 * `player-pro` and the old ids can no longer be written; `pro` stays allowed
 * only where it was; a Player's reservation is marked `plan`; and human
 * review is for a paid PLAN only: a Free player's purchased extra hours are
 * still marked `extra_hours` and are not eligible, while a subscriber
 * spending extra hours, a season and a pilot are.
 *
 * Not proven: PostgREST, the deployed grants themselves, concurrent calls.
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
const billing = await read(
  "../../supabase/migrations/20261126080000_plans_2027_billing.sql",
);
const finalPricing = await read(
  "../../supabase/migrations/20261127060000_plans_2027_final_pricing.sql",
);

const H = 3600;
const PLANS_BEGIN = "2027-01-01T00:00:00Z";
const AFTER = "2027-02-10T12:00:00Z";
const BEFORE = "2026-12-31T23:59:59Z";
/** A window wide enough to hold `now()` whenever this runs. */
const WINDOW = ["2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"];

const ADMIN = uuid(1);
const FREE = uuid(2);
const SUBSCRIBER = uuid(3);
const SUBSCRIBER_PRO = uuid(4);
const LIFETIME = uuid(5);
const STAFF = uuid(6);
const SEASON_TEAM = uuid(10);
const PILOT_TEAM = uuid(11);
const OLD_PLAN_TEAM = uuid(12);

const LIVE_CHECK = "'free', 'coach', 'coach-pro', 'pro'";

/** Everything the migration stands on, with the old ids in place. */
async function bootBefore({ check = LIVE_CHECK, lifetime = true } = {}) {
  const db = new PGlite();
  await db.exec(live);
  await db.exec(`
    alter table public.processing_jobs
      add column created_at timestamptz not null default now();
    alter table public.users
      add constraint users_plan_check check (plan = any (array[${check}]));
    alter table public.program_plans
      add column rush_included integer not null default 0,
      add column set_by uuid,
      add column set_at timestamptz not null default now(),
      add column note text;
    -- The fixture's video_credits has no pack; the billing migration comments on it.
    alter table public.video_credits add column pack text;

    insert into auth.users (id) values
      ('${ADMIN}'), ('${FREE}'), ('${SUBSCRIBER}'), ('${SUBSCRIBER_PRO}'),
      ('${LIFETIME}'), ('${STAFF}');
    insert into public.users (id, first_name, is_admin, plan) values
      ('${ADMIN}', 'Ada', true, 'free'),
      ('${FREE}', 'Fay', false, 'free'),
      ('${SUBSCRIBER}', 'Cory', false, 'coach'),
      ('${SUBSCRIBER_PRO}', 'Pia', false, 'coach-pro'),
      ('${LIFETIME}', 'Lee', false, '${lifetime ? "pro" : "free"}'),
      ('${STAFF}', 'Sam', false, 'free');
    insert into public.programs (id, school_name, pilot_eligible, pilot_ends_on) values
      ('${SEASON_TEAM}', 'Season U', false, null),
      ('${PILOT_TEAM}', 'Pilot U', true, date '2027-05-31'),
      ('${OLD_PLAN_TEAM}', 'Old Plan U', false, null);
    insert into public.program_plans
      (program_id, plan_id, plan_term, starts_on, ends_on, rush_included) values
      ('${SEASON_TEAM}', 'starter', 'spring', current_date - 1, current_date + 30, 0),
      ('${OLD_PLAN_TEAM}', 'elite', 'spring', current_date - 1, current_date + 30, 6);
  `);
  await db.exec(allowances);
  await db.exec(gating);
  return db;
}

const addHoursFrom = (db) =>
  db.exec(
    "alter table public.program_plans add column hours_from timestamptz not null default now();",
  );

async function boot(options) {
  const db = await bootBefore(options);
  await addHoursFrom(db);
  await db.exec(finalPricing);
  // Re-runnable: a second pass must change nothing and raise nothing.
  await db.exec(finalPricing);
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
async function newJob(db, { match = uuid(nextId++), createdAt = AFTER } = {}) {
  const id = uuid(nextId++);
  await db.query(
    `insert into public.processing_jobs (id, match_id, status, end_time_seconds, created_at)
     values ($1, $2, 'completed', 3600, $3)`,
    [id, match, createdAt],
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

const planOf = async (db, user) =>
  (await db.query("select plan from public.users where id = $1", [user]))
    .rows[0].plan;

const setPlan = (db, user, plan) =>
  db.query("update public.users set plan = $2 where id = $1", [user, plan]);

const checkDef = async (db) =>
  (
    await db.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conname = 'users_plan_check' and conrelid = 'public.users'::regclass`,
    )
  ).rows[0].def;

// ── the plan ids ────────────────────────────────────────────────────────────

test("coach and coach-pro rows become player and player-pro; nobody else moves", async () => {
  const db = await boot();
  assert.equal(await planOf(db, SUBSCRIBER), "player");
  assert.equal(await planOf(db, SUBSCRIBER_PRO), "player-pro");
  assert.equal(await planOf(db, FREE), "free");
  assert.equal(await planOf(db, LIFETIME), "pro");
});

test("the check takes free | player | player-pro | pro, and no old id", async () => {
  const db = await boot();
  for (const plan of ["player", "player-pro", "pro", "free"]) {
    await setPlan(db, FREE, plan);
  }
  for (const plan of ["coach", "coach-pro", "enterprise"]) {
    await assert.rejects(setPlan(db, FREE, plan), /users_plan_check/);
  }
  const def = await checkDef(db);
  assert.match(def, /'player'/);
  assert.match(def, /'player-pro'/);
  assert.doesNotMatch(def, /coach/);
});

test("after the billing migration: pro is not brought back", async () => {
  // The state `plans_2027_billing` used to leave: no `pro`, the old ids.
  const db = await boot({
    check: "'free', 'coach', 'coach-pro'",
    lifetime: false,
  });
  assert.doesNotMatch(await checkDef(db), /'pro'/);
  await assert.rejects(setPlan(db, FREE, "pro"), /users_plan_check/);
  await setPlan(db, FREE, "player-pro");
  assert.equal(await planOf(db, SUBSCRIBER), "player");
});

test("the two migrations agree in either order", async () => {
  // Billing first, on live's check with a coach row in it.
  const first = await bootBefore();
  await addHoursFrom(first);
  await first.exec(billing);
  assert.equal(await planOf(first, SUBSCRIBER), "player");
  assert.equal(await planOf(first, LIFETIME), "free");
  await first.exec(finalPricing);
  await first.exec(finalPricing);

  // Final pricing first, then billing retires `pro`.
  const second = await boot();
  await second.exec(billing);
  await second.exec(billing);

  for (const db of [first, second]) {
    assert.equal(await planOf(db, SUBSCRIBER), "player");
    assert.equal(await planOf(db, SUBSCRIBER_PRO), "player-pro");
    assert.equal(await planOf(db, LIFETIME), "free");
    const def = await checkDef(db);
    assert.match(def, /'free'.*'player'.*'player-pro'/);
    assert.doesNotMatch(def, /'pro'|coach/);
  }
});

test("it refuses to run before the follow-ups migration", async () => {
  const db = await bootBefore();
  await assert.rejects(db.exec(finalPricing), /plans_2027_followups first/);
  // Nothing moved.
  assert.equal(await planOf(db, SUBSCRIBER), "coach");
});

// ── what paid, and who is reviewed ──────────────────────────────────────────

test("a Player's and a Player Pro's match is marked plan and is eligible", async () => {
  const db = await boot();
  for (const user of [SUBSCRIBER, SUBSCRIBER_PRO]) {
    const job = await newJob(db);
    assert.equal((await reservePersonal(db, job.id, user, H, 5 * H)).ok, true);
    assert.equal(await basisOf(db, job.id), "plan");
    assert.deepEqual(await eligibility(db, job.id), {
      eligible: true,
      basis: "plan",
    });
  }
});

test("a Free player's extra hours: still marked, NOT offered for review", async () => {
  const db = await boot();
  await credit(db, FREE, 2 * H, "purchase");
  const job = await newJob(db);
  const row = await reservePersonal(db, job.id, FREE, H, 0);
  assert.equal(row.ok, true);
  assert.equal(row.credit_spent_seconds, H);
  // The marker records how the match was paid for…
  assert.equal(await basisOf(db, job.id), "extra_hours");
  // …and it does not earn review, nor is it the reason given.
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: false,
    basis: null,
  });
});

test("a subscriber spending extra hours is on a plan and keeps review", async () => {
  const db = await boot();
  await credit(db, SUBSCRIBER, 2 * H, "purchase");
  const job = await newJob(db);
  // No plan hours left this month: the whole match comes from the credit.
  const row = await reservePersonal(db, job.id, SUBSCRIBER, H, 0);
  assert.equal(row.ok, true);
  assert.equal(row.credit_spent_seconds, H);
  assert.equal(await basisOf(db, job.id), "plan");
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: "plan",
  });
});

test("a team's season and a team's pilot are still eligible", async () => {
  const db = await boot();
  const season = await newJob(db);
  await reserveTeam(db, season.id, SEASON_TEAM, STAFF, H, 80 * H);
  assert.deepEqual(await eligibility(db, season.id), {
    eligible: true,
    basis: "season",
  });
  const pilot = await newJob(db);
  await reserveTeam(db, pilot.id, PILOT_TEAM, STAFF, H, 75 * H);
  assert.deepEqual(await eligibility(db, pilot.id), {
    eligible: true,
    basis: "pilot",
  });
});

test("a match sent before plans begin stays eligible, extra hours or not", async () => {
  const db = await boot();
  await credit(db, FREE, 2 * H, "purchase");
  const job = await newJob(db, { createdAt: BEFORE });
  await reservePersonal(db, job.id, FREE, H, 0);
  assert.deepEqual(await eligibility(db, job.id), {
    eligible: true,
    basis: null,
  });
});

test("a match is judged by any of its jobs: a plan re-run earns review, an extra-hours one does not take it away", async () => {
  const db = await boot();
  await credit(db, FREE, 4 * H, "purchase");

  // Extra hours first, then the player subscribes and re-runs it.
  const first = await newJob(db);
  await reservePersonal(db, first.id, FREE, H, 0);
  assert.equal((await eligibility(db, first.id)).eligible, false);
  await setPlan(db, FREE, "player");
  const rerun = await newJob(db, { match: first.match });
  await reservePersonal(db, rerun.id, FREE, H, 5 * H);
  for (const job of [first, rerun]) {
    assert.deepEqual(await eligibility(db, job.id), {
      eligible: true,
      basis: "plan",
    });
  }

  // On a plan first, then cancelled and re-run on extra hours.
  const paid = await newJob(db);
  await reservePersonal(db, paid.id, SUBSCRIBER_PRO, H, 10 * H);
  await setPlan(db, SUBSCRIBER_PRO, "free");
  await credit(db, SUBSCRIBER_PRO, 2 * H, "purchase");
  const later = await newJob(db, { match: paid.match });
  await reservePersonal(db, later.id, SUBSCRIBER_PRO, H, 0);
  assert.equal(await basisOf(db, later.id), "extra_hours");
  assert.deepEqual(await eligibility(db, later.id), {
    eligible: true,
    basis: "plan",
  });
});

test("only the service role can ask", async () => {
  const db = await boot();
  const job = await newJob(db);
  for (const [role, user] of [
    ["anon", null],
    ["authenticated", FREE],
  ]) {
    await assert.rejects(
      as(db, role, user, () =>
        db.query(
          "select * from public.label_review_eligibility($1::uuid[], $2::timestamptz)",
          [[job.id], PLANS_BEGIN],
        ),
      ),
      (error) => error.code === "42501",
    );
  }
});

// ── Rush is in no plan ──────────────────────────────────────────────────────

test("no plan includes Rush: saved rows take 0 and every plan stamps 0", async () => {
  const db = await boot();
  const rush = async (team) =>
    (
      await db.query(
        "select rush_included from public.program_plans where program_id = $1",
        [team],
      )
    ).rows[0].rush_included;
  // The Elite row saved with 6 before the migration.
  assert.equal(await rush(OLD_PLAN_TEAM), 0);

  for (const plan of ["starter", "program", "elite"]) {
    await as(db, "authenticated", ADMIN, () =>
      db.query(
        "select public.admin_set_program_plan($1, $2, 'spring', date '2027-01-01', date '2027-05-31', null)",
        [PILOT_TEAM, plan],
      ),
    );
    assert.equal(await rush(PILOT_TEAM), 0, plan);
  }
  const { rows } = await db.query(
    `select details ->> 'rush_included' as rush from public.program_audit_log
      where program_id = $1 and action = 'plan.set'`,
    [PILOT_TEAM],
  );
  assert.deepEqual(
    rows.map((row) => row.rush),
    ["0", "0", "0"],
  );

  await assert.rejects(
    as(db, "authenticated", FREE, () =>
      db.query(
        "select public.admin_set_program_plan($1, 'starter', 'spring', date '2027-01-01', date '2027-05-31', null)",
        [PILOT_TEAM],
      ),
    ),
    /not authorized/,
  );
});
