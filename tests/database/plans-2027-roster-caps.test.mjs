/** Run: node --test tests/database/plans-2027-roster-caps.test.mjs
 * Isolated PostgreSQL contract test for the roster-caps migration
 * (`20261128060000_plans_2027_roster_caps.sql`), executed byte-for-byte,
 * TWICE, after the plan-model and follow-ups migrations, so its guard, its
 * assertion block and its re-runnability are all under test.
 *
 * The fixture is the follow-ups test's, plus what this migration reads:
 * `programs.seats` as live holds it (`integer not null default 25`, checked
 * `>= 1`; read 2026-11-27) and a `program_players` table cut to the columns
 * a seat is counted from. The final-pricing migration is not run here: its
 * other functions need tables this fixture leaves out, and the one thing it
 * changes in `admin_set_program_plan` (no Rush in any plan) is in the body
 * this migration carries, which its own assertion block checks.
 *
 * What this proves, branch by branch of the seats rule:
 *  - no plan before, seats at the default 25: they take the plan's cap;
 *  - no plan before, seats set by hand (above or below): kept;
 *  - on a plan with seats at that plan's cap: the new cap, raising 25 to 35
 *    and lowering 35 to 25;
 *  - on a plan with seats set by hand: kept, through every later save;
 *  - clearing a plan takes back the seats it gave: seats at the cleared
 *    plan's cap go back to the default 25 (so the next save follows its plan
 *    again), seats set by hand are kept, and the move rides on the
 *    `plan.cleared` audit row as `details.seats = {from, to}`, only when
 *    seats moved;
 *  - a team with more players than the cap takes the cap and keeps everyone,
 *    on a save and on a clear;
 *  - the change rides on the save's `plan.set` audit row as
 *    `details.seats = {from, to}`, only when seats moved; no `seats.changed`
 *    row is written; a save that changes nothing logs nothing;
 *  - a team nobody saves a plan for is not touched by the migration;
 *  - only an admin can call either function, and nobody signed out can.
 *
 * Not proven: that a full team's next add is refused (that is
 * `add_program_player` and its siblings on live, which this fixture does not
 * hold), PostgREST, the deployed grants themselves, or concurrent calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const read = (name) =>
  readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const planModel = await read("20261126060000_plans_2027_plan_model.sql");
const followups = await read("20261126110000_plans_2027_followups.sql");
const rosterCaps = await read("20261128060000_plans_2027_roster_caps.sql");

const ADMIN = uuid(1);
const COACH = uuid(2);
/** No plan, seats at the column default. */
const FRESH = uuid(10);
/** No plan, seats set by hand above every cap. */
const HAND_SET = uuid(11);
/** No plan, seats set by hand below every cap. */
const SMALL = uuid(12);
/** No plan, default seats, thirty players on the roster. */
const FULL = uuid(13);
/** On a pilot, default seats. */
const PILOT = uuid(14);
/** Never given a plan in any test. */
const UNTOUCHED = uuid(15);

/** The schema the migrations stand on, with plan-model and follow-ups applied. */
async function bootBefore() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    alter default privileges in schema public
      grant all on tables to authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;

    create table public.users (
      id uuid primary key references auth.users (id),
      first_name text,
      last_name text,
      is_admin boolean not null default false,
      plan text default 'free'
        constraint users_plan_check check (plan = any (array['free', 'pro']))
    );
    alter table public.users enable row level security;
    revoke all on public.users from authenticated;
    grant select on public.users to authenticated;
    grant update (first_name) on public.users to authenticated;
    grant all on public.users to service_role;
    alter role service_role bypassrls;

    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select u.is_admin from public.users u
                        where u.id = (select auth.uid())), false)
    $$;

    create table public.programs (
      id uuid primary key default gen_random_uuid(),
      school_name text not null,
      status text not null default 'active',
      upload_policy text not null default 'everyone',
      players_can_upload boolean not null default true,
      pilot_ends_on date,
      pilot_ended_at timestamptz,
      seats integer not null default 25
        constraint programs_seats_check check (seats >= 1),
      updated_at timestamptz not null default now()
    );
    revoke all on public.programs from authenticated;
    grant select on public.programs to anon, authenticated;

    create table public.program_members (
      program_id uuid not null references public.programs (id),
      user_id uuid not null,
      role text not null,
      primary key (program_id, user_id)
    );
    revoke all on public.program_members from authenticated;
    create function public.user_program_ids() returns setof uuid
    language sql stable security definer set search_path = '' as $$
      select program_id from public.program_members
       where user_id = (select auth.uid())
    $$;

    create table public.program_audit_log (
      id bigint generated always as identity primary key,
      program_id uuid,
      actor_user_id uuid,
      action text not null
        constraint program_audit_log_action_check
        check (action = any (array['pilot.ended'])),
      subject_id uuid,
      details jsonb not null default '{}',
      created_at timestamptz not null default now()
    );
    revoke all on public.program_audit_log from authenticated;

    -- What a seat counts on live (\`program_seat_counts.used\`), cut to the
    -- columns that decide it.
    create table public.program_players (
      id uuid primary key default gen_random_uuid(),
      program_id uuid not null references public.programs (id),
      archived_at timestamptz,
      merged_into_id uuid
    );
    revoke all on public.program_players from authenticated;

    insert into auth.users (id) values ('${ADMIN}'), ('${COACH}');
    insert into public.users (id, first_name, last_name, is_admin) values
      ('${ADMIN}', 'Ada', 'Admin', true),
      ('${COACH}', 'Coach', null, false);
    insert into public.programs (id, school_name, seats, pilot_ends_on) values
      ('${FRESH}', 'Fresh U', 25, null),
      ('${HAND_SET}', 'Hand Set U', 40, null),
      ('${SMALL}', 'Small U', 12, null),
      ('${FULL}', 'Full U', 25, null),
      ('${PILOT}', 'Pilot U', 25, date '2027-05-31'),
      ('${UNTOUCHED}', 'Untouched U', 30, null);
    insert into public.program_members (program_id, user_id, role) values
      ('${FRESH}', '${COACH}', 'coach');
    insert into public.program_players (program_id)
      select '${FULL}' from generate_series(1, 30);
  `);
  await db.exec(planModel);
  await db.exec(followups);
  return db;
}

async function boot() {
  const db = await bootBefore();
  await db.exec(rosterCaps);
  // Re-runnable: a second pass must change nothing and raise nothing.
  await db.exec(rosterCaps);
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

const admin = (db, work) => as(db, "authenticated", ADMIN, work);

const setPlan = (
  db,
  programId,
  plan,
  { term = "spring", endsOn = "2027-05-31", note = null } = {},
) =>
  admin(db, () =>
    db.query(
      "select public.admin_set_program_plan($1, $2, $3, date '2027-01-01', $4::date, $5)",
      [programId, plan, term, endsOn, note],
    ),
  );

const clearPlan = (db, programId) =>
  admin(db, () =>
    db.query("select public.admin_clear_program_plan($1)", [programId]),
  );

const seatsOf = async (db, programId) =>
  (
    await db.query("select seats from public.programs where id = $1", [
      programId,
    ])
  ).rows[0].seats;

/** Hand-set seats: the direct write that is the only way to do it today. */
const handSet = (db, programId, seats) =>
  db.query("update public.programs set seats = $2 where id = $1", [
    programId,
    seats,
  ]);

/** Each `plan.set` row's `details.seats`, oldest first; null where absent. */
const seatTrail = async (db, programId) =>
  (
    await db.query(
      `select details -> 'seats' as seats from public.program_audit_log
        where program_id = $1 and action = 'plan.set' order by id`,
      [programId],
    )
  ).rows.map((row) => row.seats);

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });

// ── no plan before this save ────────────────────────────────────────────────

test("no plan, default seats: the team takes the plan's cap", async () => {
  for (const [plan, cap] of [
    ["starter", 25],
    ["program", 25],
    ["elite", 35],
  ]) {
    const db = await boot();
    await setPlan(db, FRESH, plan);
    assert.equal(await seatsOf(db, FRESH), cap, plan);
    await db.close();
  }
});

test("no plan, seats set by hand: kept, above the cap and below it", async () => {
  const db = await boot();
  await setPlan(db, HAND_SET, "elite");
  assert.equal(await seatsOf(db, HAND_SET), 40);
  await setPlan(db, SMALL, "elite");
  assert.equal(await seatsOf(db, SMALL), 12);
  assert.deepEqual(await seatTrail(db, HAND_SET), [null]);
  assert.deepEqual(await seatTrail(db, SMALL), [null]);
  await db.close();
});

// ── on a plan before this save ──────────────────────────────────────────────

test("seats at the old plan's cap follow the new plan: 25 to 35 and back to 25", async () => {
  const db = await boot();
  await setPlan(db, FRESH, "starter");
  assert.equal(await seatsOf(db, FRESH), 25);
  await setPlan(db, FRESH, "elite");
  assert.equal(await seatsOf(db, FRESH), 35);
  await setPlan(db, FRESH, "program");
  assert.equal(await seatsOf(db, FRESH), 25);
  // Starter and Program share a cap: nothing to move.
  await setPlan(db, FRESH, "starter");
  assert.equal(await seatsOf(db, FRESH), 25);
  assert.deepEqual(await seatTrail(db, FRESH), [
    null,
    { from: 25, to: 35 },
    { from: 35, to: 25 },
    null,
  ]);
  await db.close();
});

test("re-saving the same plan with new dates or a note leaves its seats at the cap", async () => {
  const db = await boot();
  await setPlan(db, FRESH, "elite");
  await setPlan(db, FRESH, "elite", { endsOn: "2027-06-30", note: "PO 7" });
  assert.equal(await seatsOf(db, FRESH), 35);
  assert.deepEqual(await seatTrail(db, FRESH), [{ from: 25, to: 35 }, null]);
  await db.close();
});

test("on a plan, seats set by hand: kept through every later save", async () => {
  const db = await boot();
  await setPlan(db, FRESH, "elite");
  await handSet(db, FRESH, 40);
  // The negotiated exception survives re-saving the plan…
  await setPlan(db, FRESH, "elite", { note: "renewed" });
  assert.equal(await seatsOf(db, FRESH), 40);
  // …a move down…
  await setPlan(db, FRESH, "starter");
  assert.equal(await seatsOf(db, FRESH), 40);
  // …and a move back up.
  await setPlan(db, FRESH, "elite");
  assert.equal(await seatsOf(db, FRESH), 40);

  // Below the cap counts as by hand too.
  await setPlan(db, PILOT, "elite");
  await handSet(db, PILOT, 30);
  await setPlan(db, PILOT, "program");
  assert.equal(await seatsOf(db, PILOT), 30);
  await db.close();
});

// ── clearing ────────────────────────────────────────────────────────────────

/** Each `plan.cleared` row's `details`, oldest first. */
const clearTrail = async (db, programId) =>
  (
    await db.query(
      `select details from public.program_audit_log
        where program_id = $1 and action = 'plan.cleared' order by id`,
      [programId],
    )
  ).rows.map((row) => row.details);

test("clearing Elite takes its 35 seats back to 25, and the next plan is followed again", async () => {
  const db = await boot();
  await setPlan(db, FRESH, "elite");
  assert.equal(await seatsOf(db, FRESH), 35);
  await clearPlan(db, FRESH);
  assert.equal(await seatsOf(db, FRESH), 25);

  // The move is on the clear's own audit row, beside what it already carried.
  const trail = await clearTrail(db, FRESH);
  assert.equal(trail.length, 1);
  assert.deepEqual(trail[0].seats, { from: 35, to: 25 });
  assert.equal(trail[0].from.plan_id, "elite");
  assert.equal(trail[0].from.rush_included, 0);
  assert.equal(trail[0].to, null);
  assert.equal(trail[0].by_admin, true);
  const other = await db.query(
    `select count(*)::int as n from public.program_audit_log
      where program_id = $1 and action not in ('plan.set', 'plan.cleared')`,
    [FRESH],
  );
  assert.equal(other.rows[0].n, 0);

  // Back at the default, the team is not read as hand-set: Starter gives 25
  // (it used to keep 35 for good), and Elite would give 35 again.
  await setPlan(db, FRESH, "starter");
  assert.equal(await seatsOf(db, FRESH), 25);
  await setPlan(db, FRESH, "elite");
  assert.equal(await seatsOf(db, FRESH), 35);

  // Clearing a team with no plan changes nothing and logs nothing.
  await clearPlan(db, FRESH);
  await clearPlan(db, FRESH);
  assert.equal(await seatsOf(db, FRESH), 25);
  assert.equal((await clearTrail(db, FRESH)).length, 2);
  await db.close();
});

test("clearing a plan keeps seats that were set by hand", async () => {
  const db = await boot();
  // Elite, then a negotiated 40.
  await setPlan(db, FRESH, "elite");
  await handSet(db, FRESH, 40);
  await clearPlan(db, FRESH);
  assert.equal(await seatsOf(db, FRESH), 40);

  // Hand-set below the cap, and hand-set before the plan was ever saved.
  await setPlan(db, PILOT, "elite");
  await handSet(db, PILOT, 30);
  await clearPlan(db, PILOT);
  assert.equal(await seatsOf(db, PILOT), 30);
  await setPlan(db, SMALL, "starter");
  await clearPlan(db, SMALL);
  assert.equal(await seatsOf(db, SMALL), 12);

  for (const id of [FRESH, PILOT, SMALL]) {
    const trail = await clearTrail(db, id);
    assert.equal(trail.length, 1);
    assert.equal("seats" in trail[0], false);
  }
  await db.close();
});

test("clearing Starter or Program at 25 leaves 25, with no seats entry on the audit row", async () => {
  for (const plan of ["starter", "program"]) {
    const db = await boot();
    await setPlan(db, FRESH, plan);
    await clearPlan(db, FRESH);
    assert.equal(await seatsOf(db, FRESH), 25, plan);
    const trail = await clearTrail(db, FRESH);
    assert.equal(trail.length, 1);
    assert.equal("seats" in trail[0], false);
    assert.equal(trail[0].from.plan_id, plan);
    await db.close();
  }
});

// ── a team already over the cap ─────────────────────────────────────────────

test("more players than the cap: seats take the cap and nobody is removed", async () => {
  const db = await boot();
  const players = async () =>
    (
      await db.query(
        `select count(*)::int as n from public.program_players
          where program_id = $1 and archived_at is null and merged_into_id is null`,
        [FULL],
      )
    ).rows[0].n;
  assert.equal(await players(), 30);

  await setPlan(db, FULL, "elite");
  await setPlan(db, FULL, "starter");
  // 30 players on 25 seats: the cap is applied as it is for any team, which
  // is what seats below usage already mean (only the next add is refused).
  assert.equal(await seatsOf(db, FULL), 25);
  assert.equal(await players(), 30);

  // The same on a clear: Elite's 35 go back to 25 under thirty players, and
  // every one of them stays.
  await setPlan(db, FULL, "elite");
  assert.equal(await seatsOf(db, FULL), 35);
  await clearPlan(db, FULL);
  assert.equal(await seatsOf(db, FULL), 25);
  assert.equal(await players(), 30);
  assert.deepEqual((await clearTrail(db, FULL))[0].seats, { from: 35, to: 25 });
  await db.close();
});

// ── the audit row ───────────────────────────────────────────────────────────

test("the change rides on the plan.set row; no seats.changed row is written", async () => {
  const db = await boot();
  await setPlan(db, PILOT, "elite", { note: "INV-9" });
  const { rows } = await db.query(
    `select action, actor_user_id, details from public.program_audit_log
      where program_id = $1 order by id`,
    [PILOT],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "plan.set");
  assert.equal(rows[0].actor_user_id, ADMIN);
  assert.deepEqual(rows[0].details.seats, { from: 25, to: 35 });
  // Beside what the row already carried.
  assert.equal(rows[0].details.to.plan_id, "elite");
  assert.equal(rows[0].details.rush_included, 0);
  assert.deepEqual(rows[0].details.pilot_ends_on, {
    from: "2027-05-31",
    to: "2026-12-31",
  });

  // An identical save changes nothing and logs nothing.
  await setPlan(db, PILOT, "elite", { note: "INV-9" });
  const again = await db.query(
    "select count(*)::int as n from public.program_audit_log where program_id = $1",
    [PILOT],
  );
  assert.equal(again.rows[0].n, 1);
  assert.equal(await seatsOf(db, PILOT), 35);
  await db.close();
});

// ── what the migration leaves alone ─────────────────────────────────────────

test("the migration itself moves no seats, and a team with no plan keeps its own", async () => {
  const db = await bootBefore();
  // A team put on Elite before the migration: 25 seats, and it stays so.
  await setPlan(db, FRESH, "elite");
  const before = await db.query(
    "select id, seats from public.programs order by id",
  );
  await db.exec(rosterCaps);
  await db.exec(rosterCaps);
  const after = await db.query(
    "select id, seats from public.programs order by id",
  );
  assert.deepEqual(after.rows, before.rows);
  assert.equal(await seatsOf(db, FRESH), 25);
  assert.equal(await seatsOf(db, UNTOUCHED), 30);
  assert.equal(await seatsOf(db, PILOT), 25);

  // Read as set by hand from here on (the header's "teams already on a plan").
  await setPlan(db, FRESH, "elite", { note: "re-saved" });
  assert.equal(await seatsOf(db, FRESH), 25);
  await db.close();
});

test("it refuses to run where seats have no default of 25", async () => {
  const db = await bootBefore();
  await db.exec(
    "alter table public.programs alter column seats set default 30;",
  );
  await assert.rejects(db.exec(rosterCaps), /default is no longer 25/);
  await db.close();
});

// ── who can call it ─────────────────────────────────────────────────────────

test("grants are unchanged: admins only, and nobody signed out", async () => {
  const db = await boot();
  const fn =
    "public.admin_set_program_plan(uuid, text, text, date, date, text)";
  for (const name of [fn, "public.admin_clear_program_plan(uuid)"]) {
    const { rows } = await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', $1, 'EXECUTE') as service_role,
              p.prosecdef as definer, p.proconfig as config
         from pg_proc p where p.oid = $1::regprocedure`,
      [name],
    );
    assert.deepEqual(
      rows[0],
      {
        anon: false,
        authenticated: true,
        service_role: true,
        definer: true,
        config: ['search_path=""'],
      },
      name,
    );
  }

  // A coach is signed in and still not an admin: refused, seats untouched.
  await rejectsWith(
    as(db, "authenticated", COACH, () =>
      db.query(
        "select public.admin_set_program_plan($1, 'elite', 'spring', date '2027-01-01', date '2027-05-31', null)",
        [FRESH],
      ),
    ),
    "42501",
  );
  await rejectsWith(
    as(db, "anon", null, () =>
      db.query(
        "select public.admin_set_program_plan($1, 'elite', 'spring', date '2027-01-01', date '2027-05-31', null)",
        [FRESH],
      ),
    ),
    "42501",
  );
  assert.equal(await seatsOf(db, FRESH), 25);

  // The same gate on a clear: the plan stays, and so do its seats.
  await setPlan(db, FRESH, "elite");
  for (const [role, userId] of [
    ["authenticated", COACH],
    ["anon", null],
  ]) {
    await rejectsWith(
      as(db, role, userId, () =>
        db.query("select public.admin_clear_program_plan($1)", [FRESH]),
      ),
      "42501",
    );
  }
  assert.equal(await seatsOf(db, FRESH), 35);
  assert.equal((await clearTrail(db, FRESH)).length, 0);

  // No client can write the column itself.
  await rejectsWith(
    as(db, "authenticated", COACH, () =>
      db.query("update public.programs set seats = 99 where id = $1", [FRESH]),
    ),
    "42501",
  );
  await db.close();
});
