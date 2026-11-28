/** Run: node --test tests/database/plans-2027-followups.test.mjs
 * Isolated PostgreSQL contract test for the billing follow-ups migration
 * (`20261126110000_plans_2027_followups.sql`), executed byte-for-byte after
 * the plan-model migration it alters, so both assertion blocks run too.
 *
 * The fixture is the plan-model test's, cut to what the two migrations and
 * their RPCs read (`users`, `programs`, `program_members`, the audit log
 * with live's action check, `is_admin()`, `user_program_ids()`, and default
 * privileges that hand a new table to `authenticated` whole). Not a clone.
 *
 * What this proves: `program_plans.hours_from` is stamped when a plan is
 * first saved; replacing the plan (tier, dates, note) keeps it; clearing the
 * plan and setting one again starts a new one; a row that existed before the
 * migration takes its `set_at`; the team's members can read it, nobody
 * signed out can, and no client can write it; `admin_get_program_plan`
 * returns it, to admins only; and the migration can be run twice, the second
 * run changing no stamp.
 *
 * Not proven: PostgREST, the deployed grants themselves (the fixture models
 * them), or concurrent calls — PGlite serializes one connection.
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

const ADMIN = uuid(1);
const COACH = uuid(2);
const OUTSIDER = uuid(3);
const TEAM = uuid(10);
const OLD_TEAM = uuid(11);

/** The schema both migrations stand on, with the plan-model one applied. */
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

    insert into auth.users (id) values ('${ADMIN}'), ('${COACH}'), ('${OUTSIDER}');
    insert into public.users (id, first_name, last_name, is_admin) values
      ('${ADMIN}', 'Ada', 'Admin', true),
      ('${COACH}', 'Coach', null, false),
      ('${OUTSIDER}', 'Other', 'Coach', false);
    insert into public.programs (id, school_name) values
      ('${TEAM}', 'New Plan U'), ('${OLD_TEAM}', 'Old Plan U');
    insert into public.program_members (program_id, user_id, role) values
      ('${TEAM}', '${COACH}', 'coach');
  `);
  await db.exec(planModel);
  return db;
}

async function boot() {
  const db = await bootBefore();
  await db.exec(followups);
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

const setPlan = (db, programId, plan, term, startsOn, endsOn, note = null) =>
  admin(db, () =>
    db.query(
      "select public.admin_set_program_plan($1, $2, $3, $4::date, $5::date, $6)",
      [programId, plan, term, startsOn, endsOn, note],
    ),
  );

const clearPlan = (db, programId) =>
  admin(db, () =>
    db.query("select public.admin_clear_program_plan($1)", [programId]),
  );

/** The stamp, as text to the microsecond; null with no plan. */
const hoursFrom = (db, programId) =>
  db
    .query(
      `select to_char(hours_from at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US') as at
         from public.program_plans where program_id = $1`,
      [programId],
    )
    .then(({ rows }) => rows[0]?.at ?? null);

/** Let the clock move, so two stamps taken either side cannot be equal. */
const tick = (db) => db.query("select pg_sleep(0.02)");

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });

test("saving a plan stamps hours_from, at that moment and not at its start date", async () => {
  const db = await boot();
  try {
    const before = await db
      .query("select now() as at")
      .then(({ rows }) => rows[0].at);
    await tick(db);
    // A spring plan saved long after its January 1 start.
    await setPlan(db, TEAM, "program", "spring", "2020-01-01", "2020-05-31");
    await tick(db);
    const { rows } = await db.query(
      `select hours_from > $1::timestamptz as after_before,
              hours_from < now() as before_now,
              hours_from > starts_on::timestamptz as after_start,
              hours_from = set_at as same_as_set_at
         from public.program_plans where program_id = $2`,
      [before, TEAM],
    );
    assert.deepEqual(rows[0], {
      after_before: true,
      before_now: true,
      after_start: true,
      same_as_set_at: true,
    });
  } finally {
    await db.close();
  }
});

test("replacing the plan keeps hours_from, whatever changed", async () => {
  const db = await boot();
  try {
    await setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31");
    const first = await hoursFrom(db, TEAM);
    assert.ok(first);

    await tick(db);
    // A bigger plan, a longer season and a note: every column but the stamp.
    await setPlan(
      db,
      TEAM,
      "elite",
      "full_year",
      "2026-08-01",
      "2027-07-31",
      "INV-9",
    );
    assert.equal(await hoursFrom(db, TEAM), first);
    const { rows } = await db.query(
      `select plan_id, plan_term, starts_on::text, note, set_at > hours_from as restamped
         from public.program_plans where program_id = $1`,
      [TEAM],
    );
    // The update did land: `set_at` moved on, `hours_from` did not.
    assert.deepEqual(rows[0], {
      plan_id: "elite",
      plan_term: "full_year",
      starts_on: "2026-08-01",
      note: "INV-9",
      restamped: true,
    });

    // The same plan again writes nothing, the stamp included.
    await tick(db);
    await setPlan(
      db,
      TEAM,
      "elite",
      "full_year",
      "2026-08-01",
      "2027-07-31",
      "INV-9",
    );
    assert.equal(await hoursFrom(db, TEAM), first);
  } finally {
    await db.close();
  }
});

test("clearing the plan and setting one again starts a new hours_from", async () => {
  const db = await boot();
  try {
    await setPlan(db, TEAM, "program", "spring", "2027-01-01", "2027-05-31");
    const first = await hoursFrom(db, TEAM);

    await clearPlan(db, TEAM);
    assert.equal(await hoursFrom(db, TEAM), null);

    await tick(db);
    // The very same plan, added back.
    await setPlan(db, TEAM, "program", "spring", "2027-01-01", "2027-05-31");
    const second = await hoursFrom(db, TEAM);
    assert.ok(second > first, `${second} should be after ${first}`);

    // Both halves are in the audit log.
    const { rows } = await db.query(
      `select action from public.program_audit_log
        where program_id = $1 and action like 'plan.%' order by id`,
      [TEAM],
    );
    assert.deepEqual(
      rows.map((row) => row.action),
      ["plan.set", "plan.cleared", "plan.set"],
    );
  } finally {
    await db.close();
  }
});

test("a plan saved before the migration counts from when it was last set", async () => {
  const db = await bootBefore();
  try {
    await setPlan(
      db,
      OLD_TEAM,
      "program",
      "spring",
      "2027-01-01",
      "2027-05-31",
    );
    await db.query(
      "update public.program_plans set set_at = '2027-02-10T15:30:00Z' where program_id = $1",
      [OLD_TEAM],
    );
    await db.exec(followups);
    assert.equal(await hoursFrom(db, OLD_TEAM), "2027-02-10T15:30:00.000000");

    // Run again: nothing is restamped, and the column is still required.
    await tick(db);
    await db.exec(followups);
    assert.equal(await hoursFrom(db, OLD_TEAM), "2027-02-10T15:30:00.000000");
    await rejectsWith(
      db.query(
        "update public.program_plans set hours_from = null where program_id = $1",
        [OLD_TEAM],
      ),
      "23502",
    );
  } finally {
    await db.close();
  }
});

test("members read hours_from; signed out reads nothing; no client writes it", async () => {
  const db = await boot();
  try {
    await setPlan(db, TEAM, "program", "spring", "2027-01-01", "2027-05-31");
    const select = (role, userId, columns) =>
      as(db, role, userId, () =>
        db
          .query(`select ${columns} from public.program_plans`)
          .then(({ rows }) => rows),
      );

    // The team's coach sees the stamp beside the plan; a coach elsewhere sees no row.
    const own = await select(
      "authenticated",
      COACH,
      "plan_id, hours_from is not null as stamped",
    );
    assert.deepEqual(own, [{ plan_id: "program", stamped: true }]);
    assert.deepEqual(
      await select("authenticated", OUTSIDER, "plan_id, hours_from"),
      [],
    );

    await rejectsWith(select("anon", null, "hours_from"), "42501");
    // The two private columns stay private.
    await rejectsWith(select("authenticated", COACH, "note"), "42501");

    for (const [role, userId] of [
      ["authenticated", COACH],
      ["authenticated", ADMIN],
      ["anon", null],
    ]) {
      await rejectsWith(
        as(db, role, userId, () =>
          db.query(
            "update public.program_plans set hours_from = now() - interval '1 year'",
          ),
        ),
        "42501",
      );
    }
  } finally {
    await db.close();
  }
});

test("admin_get_program_plan returns hours_from, to admins only", async () => {
  const db = await boot();
  try {
    await setPlan(
      db,
      TEAM,
      "program",
      "spring",
      "2027-01-01",
      "2027-05-31",
      "PO 7",
    );
    const get = (userId) =>
      as(db, "authenticated", userId, () =>
        db
          .query(
            `select plan_id, note, set_by_name,
                    to_char(hours_from at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US') as at
               from public.admin_get_program_plan($1)`,
            [TEAM],
          )
          .then(({ rows }) => rows),
      );
    assert.deepEqual(await get(ADMIN), [
      {
        plan_id: "program",
        note: "PO 7",
        set_by_name: "Ada Admin",
        at: await hoursFrom(db, TEAM),
      },
    ]);
    await rejectsWith(get(COACH), "42501");
    await rejectsWith(
      as(db, "anon", null, () =>
        db.query("select * from public.admin_get_program_plan($1)", [TEAM]),
      ),
      "42501",
    );
  } finally {
    await db.close();
  }
});

test("the migration runs twice and leaves the same functions and grants", async () => {
  const db = await boot();
  try {
    const shape = () =>
      db
        .query(
          `select p.proname, pg_get_function_result(p.oid) as result,
                  coalesce(p.proacl::text, '') as acl
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('admin_set_program_plan', 'admin_get_program_plan')
            order by 1`,
        )
        .then(({ rows }) => rows);
    const once = await shape();
    await db.exec(followups);
    assert.deepEqual(await shape(), once);
    assert.match(once[0].result, /hours_from timestamp with time zone/);
  } finally {
    await db.close();
  }
});
