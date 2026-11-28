/** Run: node --test tests/database/plans-2027-pilot-grant.test.mjs
 * Isolated PostgreSQL contract test for the 2027 pilot-grant migration
 * (`20261128070000_plans_2027_pilot_grant.sql`), executed byte-for-byte so its
 * own assertion block runs too.
 *
 * The tables are the minimal shape `admin_set_pilot_eligible` reads and
 * writes, from the live catalog as read on 2026-11-27: `programs` with
 * `org_type` and the four pilot columns plus `pilot_eligible`, `users` with
 * `is_admin`, and `program_audit_log` with live's action check. Functions get
 * Postgres's default PUBLIC execute, so the migration's own revokes are what
 * keeps `anon` out.
 *
 * What this proves: an admin can grant a college; a grant with no end date,
 * or on a pilot that ended or lapsed, stamps 2027-05-31 (clearing
 * `pilot_ended_at`) and records it on the audit row as `ends_on`; a future end
 * date is kept and no `ends_on` is recorded; revoking clears only the flag and
 * a repeat call writes nothing; a non-admin and a signed-out caller are
 * refused; and the migration can be run twice.
 *
 * Not proven: PostgREST, the deployed grants themselves, or concurrent calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261128070000_plans_2027_pilot_grant.sql",
    import.meta.url,
  ),
  "utf8",
);

const ADMIN = uuid(1);
const COACH = uuid(2);
const COLLEGE = uuid(10);
const CLUB = uuid(11);
const ENDED = uuid(12);
const LAPSED = uuid(13);
const FUTURE = uuid(14);
const GRANTED = uuid(15);

const LATEST_END = "2027-05-31";

async function boot() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;

    create table public.users (
      id uuid primary key,
      is_admin boolean not null default false
    );

    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select u.is_admin from public.users u
                        where u.id = (select auth.uid())), false)
    $$;

    create table public.programs (
      id uuid primary key,
      school_name text not null,
      org_type text,
      pilot_eligible boolean not null default false,
      pilot_approved_by uuid,
      pilot_approved_at timestamptz,
      pilot_ends_on date,
      pilot_ended_at timestamptz,
      updated_at timestamptz not null default now()
    );

    create table public.program_audit_log (
      id bigint generated always as identity primary key,
      program_id uuid,
      actor_user_id uuid,
      action text not null
        constraint program_audit_log_action_check check (action = any (array[
          'pilot.end_changed', 'pilot.ended', 'pilot.eligibility_changed'
        ])),
      subject_id uuid,
      details jsonb not null default '{}',
      created_at timestamptz not null default now()
    );

    insert into public.users (id, is_admin) values
      ('${ADMIN}', true), ('${COACH}', false);

    insert into public.programs
      (id, school_name, org_type, pilot_eligible, pilot_approved_by,
       pilot_approved_at, pilot_ends_on, pilot_ended_at) values
      ('${COLLEGE}', 'State U', 'college', false, null, null, null, null),
      ('${CLUB}', 'Club', 'club', false, null, null, null, null),
      ('${ENDED}', 'Ended U', 'college', false, '${COACH}', '2026-09-01T00:00:00Z',
         current_date, '2026-11-01T00:00:00Z'),
      ('${LAPSED}', 'Lapsed HS', 'high_school', false, '${COACH}', '2026-09-01T00:00:00Z',
         current_date - 1, null),
      ('${FUTURE}', 'Future Academy', 'academy', false, '${COACH}', '2026-09-01T00:00:00Z',
         current_date + 30, null),
      ('${GRANTED}', 'Granted U', 'college', true, '${COACH}', '2026-09-01T00:00:00Z',
         current_date + 30, null);
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

const setEligible = (
  db,
  programId,
  eligible,
  role = "authenticated",
  user = ADMIN,
) =>
  as(db, role, user, () =>
    db.query("select public.admin_set_pilot_eligible($1, $2)", [
      programId,
      eligible,
    ]),
  );

const pilotRow = (db, programId) =>
  db
    .query(
      `select pilot_eligible, pilot_approved_by, pilot_approved_at is not null as approved,
              pilot_ends_on::text, pilot_ended_at is not null as ended
         from public.programs where id = $1`,
      [programId],
    )
    .then(({ rows }) => rows[0]);

const auditRows = (db, programId) =>
  db
    .query(
      `select action, actor_user_id, details from public.program_audit_log
        where program_id = $1 order by id`,
      [programId],
    )
    .then(({ rows }) => rows);

const today = (db) =>
  db.query("select current_date::text as d").then(({ rows }) => rows[0].d);

test("an admin can grant a college, and a grant with no end date stamps 2027-05-31", async () => {
  const db = await boot();
  await setEligible(db, COLLEGE, true);

  assert.deepEqual(await pilotRow(db, COLLEGE), {
    pilot_eligible: true,
    pilot_approved_by: ADMIN,
    approved: true,
    pilot_ends_on: LATEST_END,
    ended: false,
  });
  assert.deepEqual(await auditRows(db, COLLEGE), [
    {
      action: "pilot.eligibility_changed",
      actor_user_id: ADMIN,
      details: {
        from: false,
        to: true,
        by_admin: true,
        stamped: true,
        ends_on: LATEST_END,
      },
    },
  ]);
});

test("a non-college grant with no end date stamps 2027-05-31 too", async () => {
  const db = await boot();
  await setEligible(db, CLUB, true);
  assert.equal((await pilotRow(db, CLUB)).pilot_ends_on, LATEST_END);
});

test("a grant on a pilot ended by hand re-stamps 2027-05-31 and clears ended_at", async () => {
  const db = await boot();
  await setEligible(db, ENDED, true);

  const row = await pilotRow(db, ENDED);
  assert.equal(row.pilot_ends_on, LATEST_END);
  assert.equal(row.ended, false);
  // The approver already recorded is kept.
  assert.equal(row.pilot_approved_by, COACH);
  const [audit] = await auditRows(db, ENDED);
  assert.equal(audit.details.ends_on, LATEST_END);
  assert.equal(audit.details.stamped, true);
});

test("a grant on a pilot whose end date passed re-stamps 2027-05-31", async () => {
  const db = await boot();
  await setEligible(db, LAPSED, true);

  const row = await pilotRow(db, LAPSED);
  assert.equal(row.pilot_ends_on, LATEST_END);
  assert.equal(row.ended, false);
  assert.equal((await auditRows(db, LAPSED))[0].details.ends_on, LATEST_END);
});

test("a grant on a pilot with a future end date keeps it and records no ends_on", async () => {
  const db = await boot();
  const before = (await pilotRow(db, FUTURE)).pilot_ends_on;
  assert.ok(before > (await today(db)));

  await setEligible(db, FUTURE, true);

  const row = await pilotRow(db, FUTURE);
  assert.equal(row.pilot_eligible, true);
  assert.equal(row.pilot_ends_on, before);
  assert.equal(row.pilot_approved_by, COACH);
  assert.deepEqual((await auditRows(db, FUTURE))[0].details, {
    from: false,
    to: true,
    by_admin: true,
    stamped: false,
  });
});

test("revoking clears only the flag, and a repeat call writes nothing", async () => {
  const db = await boot();
  const before = await pilotRow(db, GRANTED);

  await setEligible(db, GRANTED, false);
  assert.deepEqual(await pilotRow(db, GRANTED), {
    ...before,
    pilot_eligible: false,
  });
  assert.deepEqual(await auditRows(db, GRANTED), [
    {
      action: "pilot.eligibility_changed",
      actor_user_id: ADMIN,
      details: { from: true, to: false, by_admin: true, stamped: false },
    },
  ]);

  await setEligible(db, GRANTED, false);
  assert.equal((await auditRows(db, GRANTED)).length, 1);
});

test("a non-admin is refused with 42501 and nothing changes", async () => {
  const db = await boot();
  await assert.rejects(setEligible(db, COLLEGE, true, "authenticated", COACH), {
    code: "42501",
  });
  assert.equal((await pilotRow(db, COLLEGE)).pilot_eligible, false);
  assert.equal((await auditRows(db, COLLEGE)).length, 0);
});

test("a signed-out caller cannot execute the function at all", async () => {
  const db = await boot();
  await assert.rejects(
    setEligible(db, COLLEGE, true, "anon", null),
    (error) => {
      assert.equal(error.code, "42501");
      assert.match(error.message, /permission denied for function/);
      return true;
    },
  );
  assert.equal((await pilotRow(db, COLLEGE)).pilot_eligible, false);
});

test("an unknown program and null arguments are refused as live refuses them", async () => {
  const db = await boot();
  await assert.rejects(setEligible(db, uuid(99), true), { code: "P0002" });
  await assert.rejects(setEligible(db, null, true), { code: "22023" });
  await assert.rejects(setEligible(db, COLLEGE, null), { code: "22023" });
});

test("the migration runs twice and keeps its grants", async () => {
  const db = await boot();
  await db.exec(migration);

  const { rows } = await db.query(`
    select has_function_privilege('anon', 'public.admin_set_pilot_eligible(uuid, boolean)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.admin_set_pilot_eligible(uuid, boolean)', 'EXECUTE') as authd,
           has_function_privilege('service_role', 'public.admin_set_pilot_eligible(uuid, boolean)', 'EXECUTE') as svc
  `);
  assert.deepEqual(rows[0], { anon: false, authd: true, svc: true });

  await setEligible(db, COLLEGE, true);
  assert.equal((await pilotRow(db, COLLEGE)).pilot_ends_on, LATEST_END);
});
