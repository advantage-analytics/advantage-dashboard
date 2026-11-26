/** Run: node --test tests/database/plans-2027-team-terms.test.mjs
 * Isolated PostgreSQL contract test for the team-terms migration
 * (`20261126100000_plans_2027_team_terms.sql`), executed byte-for-byte.
 *
 * The fixture is the minimal shape the migration's functions read, built from
 * the live catalog as it was read on 2026-11-26 — not a clone:
 *  - `pilot_terms_acceptances` with live's columns and defaults (no CHECK on
 *    `terms_version`: live has none);
 *  - `current_pilot_terms_version()`, `assert_pilot_terms_accepted` and
 *    `stamp_pilot_terms_acceptance` exactly as live defines them BEFORE the
 *    migration, with live's service-role-only grants, so the test first
 *    proves what the window before the migration does.
 *
 * What this proves: before the migration an acceptance of '2027-team-1' is
 * refused with TA001 and `accepted_terms_versions()` does not exist (the
 * probe the app falls back on); after it the gate takes either live version
 * and still refuses a retired one or none; the stamp marks the newest
 * un-stamped acceptance of either version, and when all are stamped copies
 * that acceptance's own moment AND version; the grants are as documented;
 * and the migration can be run twice.
 *
 * Not proven: the three RPCs that call these helpers (untouched by the
 * migration), PostgREST, or concurrent calls — PGlite serializes one
 * connection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261126100000_plans_2027_team_terms.sql",
    import.meta.url,
  ),
  "utf8",
);

const PILOT = "2026-fall-pilot-3";
const TEAM = "2027-team-1";
const RETIRED = "2026-fall-pilot-2";

const PILOT_COACH = uuid(1);
const TEAM_COACH = uuid(2);
const RETIRED_COACH = uuid(3);
const NOBODY = uuid(4);
const BOTH_COACH = uuid(5);
const PROGRAM_A = uuid(10);
const PROGRAM_B = uuid(11);
const PROGRAM_C = uuid(12);

async function boot() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;

    create table public.programs (id uuid primary key);
    create table public.pilot_terms_acceptances (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      program_id uuid references public.programs (id) on delete set null,
      terms_version text not null,
      accepted_at timestamptz not null default now()
    );

    -- Live's three functions, as read 2026-11-26.
    create function public.current_pilot_terms_version()
    returns text language sql immutable parallel safe set search_path = '' as $$
      select '2026-fall-pilot-3'::text;
    $$;

    create function public.assert_pilot_terms_accepted(p_user_id uuid)
    returns void language plpgsql security definer set search_path = '' as $$
    begin
      if not exists (
        select 1
          from public.pilot_terms_acceptances a
         where a.user_id = p_user_id
           and a.terms_version = public.current_pilot_terms_version()
      ) then
        raise exception 'pilot terms not accepted for version %',
          public.current_pilot_terms_version()
          using errcode = 'TA001';
      end if;
    end;
    $$;

    create function public.stamp_pilot_terms_acceptance(p_user_id uuid, p_program_id uuid)
    returns void language plpgsql security definer set search_path = '' as $$
    declare
      v_version text := public.current_pilot_terms_version();
      v_row_id  uuid;
      v_at      timestamptz;
    begin
      select a.id into v_row_id
        from public.pilot_terms_acceptances a
       where a.user_id = p_user_id
         and a.terms_version = v_version
         and a.program_id is null
       order by a.accepted_at desc
       limit 1
       for update;

      if v_row_id is not null then
        update public.pilot_terms_acceptances
           set program_id = p_program_id
         where id = v_row_id;
        return;
      end if;

      select a.accepted_at into v_at
        from public.pilot_terms_acceptances a
       where a.user_id = p_user_id
         and a.terms_version = v_version
       order by a.accepted_at desc
       limit 1;

      if v_at is null then
        raise exception 'pilot terms not accepted for version %', v_version
          using errcode = 'TA001';
      end if;

      insert into public.pilot_terms_acceptances
        (user_id, program_id, terms_version, accepted_at)
      values (p_user_id, p_program_id, v_version, v_at);
    end;
    $$;

    revoke execute on function public.assert_pilot_terms_accepted(uuid)
      from public, anon, authenticated;
    revoke execute on function public.stamp_pilot_terms_acceptance(uuid, uuid)
      from public, anon, authenticated;
    grant execute on function public.assert_pilot_terms_accepted(uuid) to service_role;
    grant execute on function public.stamp_pilot_terms_acceptance(uuid, uuid) to service_role;

    insert into public.programs (id) values
      ('${PROGRAM_A}'), ('${PROGRAM_B}'), ('${PROGRAM_C}');
    insert into public.pilot_terms_acceptances (user_id, terms_version, accepted_at) values
      ('${PILOT_COACH}',   '${PILOT}',   '2026-11-01T10:00:00Z'),
      ('${TEAM_COACH}',    '${TEAM}',    '2027-01-05T10:00:00Z'),
      ('${RETIRED_COACH}', '${RETIRED}', '2026-10-27T10:00:00Z'),
      ('${BOTH_COACH}',    '${PILOT}',   '2026-11-01T10:00:00Z'),
      ('${BOTH_COACH}',    '${TEAM}',    '2027-01-05T10:00:00Z');
  `);
  return db;
}

const assertAccepted = (db, user) =>
  db.query("select public.assert_pilot_terms_accepted($1)", [user]);
const stamp = (db, user, program) =>
  db.query("select public.stamp_pilot_terms_acceptance($1, $2)", [
    user,
    program,
  ]);
const refusedTA001 = (error) => {
  assert.equal(error.code, "TA001");
  return true;
};
const rowsFor = async (db, user) =>
  (
    await db.query(
      `select terms_version, program_id, accepted_at
         from public.pilot_terms_acceptances
        where user_id = $1
        order by terms_version, program_id nulls first`,
      [user],
    )
  ).rows;

test("before the migration the database knows only the pilot version", async () => {
  const db = await boot();
  try {
    await assertAccepted(db, PILOT_COACH);
    // The window: a January acceptance of the team terms is refused, which
    // is why the app keeps serving the pilot terms until the probe answers.
    await assert.rejects(assertAccepted(db, TEAM_COACH), refusedTA001);
    await assert.rejects(stamp(db, TEAM_COACH, PROGRAM_A), refusedTA001);
    // The probe itself: the function is not there to call.
    await assert.rejects(
      db.query("select public.accepted_terms_versions()"),
      (error) => {
        assert.equal(error.code, "42883");
        return true;
      },
    );
  } finally {
    await db.close();
  }
});

test("after it the gate accepts either live version and nothing else", async () => {
  const db = await boot();
  try {
    await db.exec(migration);

    const { rows } = await db.query(
      "select public.accepted_terms_versions() as versions",
    );
    assert.deepEqual(rows[0].versions, [PILOT, TEAM]);

    await assertAccepted(db, PILOT_COACH);
    await assertAccepted(db, TEAM_COACH);
    await assertAccepted(db, BOTH_COACH);
    // A retired pilot version is still no acceptance, and neither is none.
    await assert.rejects(assertAccepted(db, RETIRED_COACH), refusedTA001);
    await assert.rejects(assertAccepted(db, NOBODY), refusedTA001);

    // The pilot's own version function is untouched.
    const current = await db.query(
      "select public.current_pilot_terms_version() as v",
    );
    assert.equal(current.rows[0].v, PILOT);
  } finally {
    await db.close();
  }
});

test("the stamp marks an acceptance of either version, and copies its version when all are stamped", async () => {
  const db = await boot();
  try {
    await db.exec(migration);

    // A team-terms acceptance is stamped where before it raised.
    await stamp(db, TEAM_COACH, PROGRAM_A);
    assert.deepEqual(
      (await rowsFor(db, TEAM_COACH)).map((r) => [
        r.terms_version,
        r.program_id,
      ]),
      [[TEAM, PROGRAM_A]],
    );

    // A second program under the same acceptance: a new row at the SAME
    // version and the SAME moment, not a fresh acceptance and not the
    // pilot's version.
    await stamp(db, TEAM_COACH, PROGRAM_B);
    const team = await rowsFor(db, TEAM_COACH);
    assert.equal(team.length, 2);
    assert.deepEqual(
      team.map((r) => r.terms_version),
      [TEAM, TEAM],
    );
    assert.deepEqual(team.map((r) => r.program_id).sort(), [
      PROGRAM_A,
      PROGRAM_B,
    ]);
    assert.equal(
      new Date(team[0].accepted_at).toISOString(),
      "2027-01-05T10:00:00.000Z",
    );
    assert.equal(
      new Date(team[1].accepted_at).toISOString(),
      "2027-01-05T10:00:00.000Z",
    );

    // The pilot path is as it was.
    await stamp(db, PILOT_COACH, PROGRAM_A);
    assert.deepEqual(
      (await rowsFor(db, PILOT_COACH)).map((r) => [
        r.terms_version,
        r.program_id,
      ]),
      [[PILOT, PROGRAM_A]],
    );

    // Holding both, the newest un-stamped acceptance takes the program: the
    // one the coach just made.
    await stamp(db, BOTH_COACH, PROGRAM_C);
    assert.deepEqual(
      (await rowsFor(db, BOTH_COACH)).map((r) => [
        r.terms_version,
        r.program_id,
      ]),
      [
        [PILOT, null],
        [TEAM, PROGRAM_C],
      ],
    );

    // A retired version alone stamps nothing.
    await assert.rejects(stamp(db, RETIRED_COACH, PROGRAM_A), refusedTA001);
    await assert.rejects(stamp(db, NOBODY, PROGRAM_A), refusedTA001);
    assert.deepEqual(
      (await rowsFor(db, RETIRED_COACH)).map((r) => r.program_id),
      [null],
    );
  } finally {
    await db.close();
  }
});

test("grants: the helpers stay service-role only, the version list is for signed-in callers", async () => {
  const db = await boot();
  try {
    await db.exec(migration);
    const can = async (role, fn) =>
      (
        await db.query(
          "select has_function_privilege($1, $2, 'execute') as ok",
          [role, fn],
        )
      ).rows[0].ok;

    for (const fn of [
      "public.assert_pilot_terms_accepted(uuid)",
      "public.stamp_pilot_terms_acceptance(uuid, uuid)",
    ]) {
      assert.equal(await can("service_role", fn), true, fn);
      assert.equal(await can("authenticated", fn), false, fn);
      assert.equal(await can("anon", fn), false, fn);
    }
    const list = "public.accepted_terms_versions()";
    assert.equal(await can("service_role", list), true);
    assert.equal(await can("authenticated", list), true);
    assert.equal(await can("anon", list), false);
  } finally {
    await db.close();
  }
});

test("the migration can be run twice", async () => {
  const db = await boot();
  try {
    await db.exec(migration);
    await stamp(db, TEAM_COACH, PROGRAM_A);
    await db.exec(migration);
    await assertAccepted(db, TEAM_COACH);
    await assertAccepted(db, PILOT_COACH);
    await assert.rejects(assertAccepted(db, RETIRED_COACH), refusedTA001);
    assert.equal((await rowsFor(db, TEAM_COACH)).length, 1);
  } finally {
    await db.close();
  }
});
