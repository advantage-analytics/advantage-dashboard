/** Run: node --test tests/database/plans-2027-plan-model.test.mjs
 * Isolated PostgreSQL contract test for the 2027 plan model migration
 * (`20261126060000_plans_2027_plan_model.sql`), executed byte-for-byte so its
 * own assertion block runs too.
 *
 * The tables are the minimal shape the migration and its RPCs read, built
 * from the live catalog as it was read on 2026-11-25 — not clones:
 *  - `users` with live's `users_plan_check` (free | pro), live's trigger on
 *    `plan` alone, RLS on your own row, and a column-scoped UPDATE grant that
 *    names no billing column;
 *  - `programs` with the old upload defaults (`everyone` / true), `status`
 *    and the pilot columns, readable signed out as live's is;
 *  - `program_members` and `user_program_ids()`, the membership helper live's
 *    program-scoped policies use;
 *  - `program_audit_log` with live's action check, less the two new verbs;
 *  - default privileges that hand a new table to `authenticated` whole, as
 *    live's do, so the migration's own revoke is what is under test.
 *
 * What this proves: only an admin can set, clear or fully read a team's plan;
 * the RPCs validate, audit and stamp as documented; the table's checks hold;
 * a pilot still running on the plan's first day is pulled back to the day
 * before; a plan is invisible signed out, readable by its own team's members
 * without the note or who set it, and writable by no client; a signed-in
 * client cannot write `plan` or any billing column, by grant and again by
 * trigger; new programs and unclaimed ones are coaches-only while every
 * claimed one keeps its setting; and the migration can be run twice.
 *
 * Not proven: PostgREST, the deployed grants themselves (the fixture models
 * them), or concurrent calls — PGlite serializes one connection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261126060000_plans_2027_plan_model.sql",
    import.meta.url,
  ),
  "utf8",
);

const ADMIN = uuid(1);
const COACH = uuid(2);
const OUTSIDER = uuid(3);
const TEAM = uuid(10);
const PILOT_TEAM = uuid(11);
const ENDED_PILOT_TEAM = uuid(12);
const SHORT_PILOT_TEAM = uuid(13);
const UNCLAIMED_TEAM = uuid(14);
const PENDING_TEAM = uuid(15);

const BILLING_COLUMNS = {
  plan: "'coach'",
  plan_period: "'monthly'",
  plan_status: "'active'",
  plan_period_start: "now()",
  plan_period_end: "now()",
  stripe_customer_id: "'cus_test'",
  stripe_subscription_id: "'sub_test'",
};

async function boot() {
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
    create policy "own row" on public.users for all to authenticated
      using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
    revoke all on public.users from authenticated;
    grant select on public.users to authenticated;
    grant update (first_name) on public.users to authenticated;
    grant all on public.users to service_role;
    alter role service_role bypassrls;

    -- Live's trigger and function, as read 2026-11-25.
    create function public.users_block_plan_self_update()
    returns trigger language plpgsql set search_path = '' as $$
    begin
      if new.plan is distinct from old.plan
         and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
             in ('authenticated', 'anon') then
        raise exception 'plan is managed by billing and cannot be changed by clients'
          using errcode = '42501';
      end if;
      return new;
    end;
    $$;
    create trigger users_block_plan_self_update
      before update of plan on public.users
      for each row execute function public.users_block_plan_self_update();

    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select u.is_admin from public.users u
                        where u.id = (select auth.uid())), false)
    $$;

    create table public.programs (
      id uuid primary key default gen_random_uuid(),
      school_name text not null,
      status text not null default 'active',
      upload_policy text not null default 'everyone'
        constraint programs_upload_policy_check
        check (upload_policy = any (array['owner', 'owner_coaches', 'staff', 'everyone'])),
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
        constraint program_audit_log_action_check check (action = any (array[
          'player.added', 'player.updated', 'player.archived', 'player.claimed',
          'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
          'member.removed', 'member.role_changed', 'seats.changed',
          'member.account_deleted', 'lineup.set', 'ownership.transferred',
          'event.deleted', 'player.restored', 'match.attached', 'member.left',
          'program.conference_changed', 'console.result_added',
          'console.analysis_attached', 'join_request.approved',
          'join_request.declined', 'pilot.end_changed', 'pilot.ended',
          'program.details_changed', 'member.upload_changed',
          'program.crest_changed', 'console.submission_reconciled',
          'match.detached', 'match.round_changed', 'pilot.eligibility_changed',
          'join_link.created', 'join_link.revoked', 'join_link.accepted',
          'join_link.mode_changed', 'program.video_sharing_changed',
          'match.opponent_team_changed'
        ])),
      subject_id uuid,
      details jsonb not null default '{}',
      created_at timestamptz not null default now()
    );
    revoke all on public.program_audit_log from authenticated;
    grant select on public.program_audit_log to authenticated;

    insert into auth.users (id) values ('${ADMIN}'), ('${COACH}'), ('${OUTSIDER}');
    insert into public.users (id, first_name, last_name, is_admin) values
      ('${ADMIN}', 'Ada', 'Admin', true),
      ('${COACH}', 'Coach', null, false),
      ('${OUTSIDER}', 'Other', 'Coach', false);
    -- Existing teams, inserted under the old defaults.
    insert into public.programs (id, school_name, pilot_ends_on, pilot_ended_at) values
      ('${TEAM}', 'No Pilot U', null, null),
      ('${PILOT_TEAM}', 'Pilot U', '2027-05-31', null),
      ('${ENDED_PILOT_TEAM}', 'Ended Pilot U', '2027-05-31', '2026-12-01T00:00:00Z'),
      ('${SHORT_PILOT_TEAM}', 'Short Pilot U', '2026-12-31', null);
    -- Directory rows under the old defaults: one nobody has claimed, one
    -- mid-claim.
    insert into public.programs (id, school_name, status) values
      ('${UNCLAIMED_TEAM}', 'Unclaimed U', 'unclaimed'),
      ('${PENDING_TEAM}', 'Pending U', 'claim_pending');
    insert into public.program_members (program_id, user_id, role) values
      ('${TEAM}', '${COACH}', 'coach'),
      ('${PILOT_TEAM}', '${OUTSIDER}', 'coach');
    insert into public.program_audit_log (program_id, action) values ('${TEAM}', 'pilot.ended');
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

const setPlan = (db, programId, plan, term, startsOn, endsOn, note = null) =>
  db.query(
    "select public.admin_set_program_plan($1, $2, $3, $4::date, $5::date, $6)",
    [programId, plan, term, startsOn, endsOn, note],
  );

const clearPlan = (db, programId) =>
  db.query("select public.admin_clear_program_plan($1)", [programId]);

/** The team's plan row and pilot dates, read as the owner; `plan_id` null = no row. */
const planRow = (db, programId) =>
  db
    .query(
      `select pp.plan_id, pp.plan_term, pp.starts_on::text, pp.ends_on::text,
              pp.rush_included, pp.set_by, pp.set_at is not null as stamped,
              pp.note, p.pilot_ends_on::text, p.pilot_ended_at is not null as pilot_ended
         from public.programs p
         left join public.program_plans pp on pp.program_id = p.id
        where p.id = $1`,
      [programId],
    )
    .then(({ rows }) => rows[0]);

const getPlan = (db, programId) =>
  db
    .query(
      `select program_id, plan_id, plan_term, starts_on::text, ends_on::text,
              rush_included, note, set_by, set_at is not null as stamped, set_by_name
         from public.admin_get_program_plan($1)`,
      [programId],
    )
    .then(({ rows }) => rows);

const planAudit = (db, programId) =>
  db
    .query(
      `select action, actor_user_id, details from public.program_audit_log
        where program_id = $1 and action like 'plan.%' order by id`,
      [programId],
    )
    .then(({ rows }) => rows);

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });

test("the migration runs twice and leaves the same schema", async () => {
  const db = await boot();
  try {
    await as(db, "authenticated", ADMIN, () =>
      setPlan(db, TEAM, "program", "spring", "2027-01-01", "2027-05-31"),
    );
    await db.exec(migration);

    assert.equal((await planRow(db, TEAM)).plan_id, "program");
    // The audit row written before the migration still satisfies the check.
    const { rows } = await db.query(
      "select count(*)::int as n from public.program_audit_log",
    );
    assert.equal(rows[0].n, 2);
  } finally {
    await db.close();
  }
});

test("only an admin can set or clear a team's plan", async () => {
  const db = await boot();
  try {
    // A signed-in non-admin reaches the function and is refused by it.
    await rejectsWith(
      as(db, "authenticated", COACH, () =>
        setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31"),
      ),
      "42501",
    );
    await rejectsWith(
      as(db, "authenticated", COACH, () => clearPlan(db, TEAM)),
      "42501",
    );
    // Signed out never reaches it: no EXECUTE.
    await rejectsWith(
      as(db, "anon", null, () =>
        setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31"),
      ),
      "42501",
    );
    await rejectsWith(
      as(db, "anon", null, () => clearPlan(db, TEAM)),
      "42501",
    );
    // The service role may execute it but is nobody's admin.
    await rejectsWith(
      as(db, "service_role", null, () =>
        setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31"),
      ),
      "42501",
    );

    assert.equal((await planRow(db, TEAM)).plan_id, null);
    assert.deepEqual(await planAudit(db, TEAM), []);

    await as(db, "authenticated", ADMIN, () =>
      setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31"),
    );
    assert.equal((await planRow(db, TEAM)).plan_id, "starter");
    await as(db, "authenticated", ADMIN, () => clearPlan(db, TEAM));
    assert.equal((await planRow(db, TEAM)).plan_id, null);
  } finally {
    await db.close();
  }
});

test("setting a plan validates its inputs before writing anything", async () => {
  const db = await boot();
  try {
    const attempt = (...args) =>
      as(db, "authenticated", ADMIN, () => setPlan(db, ...args));

    await rejectsWith(
      attempt(TEAM, "gold", "spring", "2027-01-01", "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(TEAM, null, "spring", "2027-01-01", "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(TEAM, "elite", "full-year", "2027-01-01", "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(TEAM, "elite", "spring", null, "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(TEAM, "elite", "spring", "2027-06-01", "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(
        TEAM,
        "elite",
        "spring",
        "2027-01-01",
        "2027-05-31",
        "x".repeat(501),
      ),
      "22023",
    );
    await rejectsWith(
      attempt(null, "elite", "spring", "2027-01-01", "2027-05-31"),
      "22023",
    );
    await rejectsWith(
      attempt(uuid(999), "elite", "spring", "2027-01-01", "2027-05-31"),
      "P0002",
    );
    await rejectsWith(
      as(db, "authenticated", ADMIN, () => clearPlan(db, uuid(999))),
      "P0002",
    );

    assert.equal((await planRow(db, TEAM)).plan_id, null);
    assert.deepEqual(await planAudit(db, TEAM), []);
  } finally {
    await db.close();
  }
});

test("set, replace and clear each write the row and one audit entry", async () => {
  const db = await boot();
  try {
    const admin = (work) => as(db, "authenticated", ADMIN, work);

    await admin(() =>
      setPlan(
        db,
        TEAM,
        "program",
        "spring",
        "2027-01-01",
        "2027-05-31",
        "  INV-1042  ",
      ),
    );
    assert.deepEqual(await planRow(db, TEAM), {
      plan_id: "program",
      plan_term: "spring",
      starts_on: "2027-01-01",
      ends_on: "2027-05-31",
      rush_included: 3,
      set_by: ADMIN,
      stamped: true,
      note: "INV-1042",
      pilot_ends_on: null,
      pilot_ended: false,
    });
    // The admin page's read: the whole row, with the note and who set it.
    assert.deepEqual(await admin(() => getPlan(db, TEAM)), [
      {
        program_id: TEAM,
        plan_id: "program",
        plan_term: "spring",
        starts_on: "2027-01-01",
        ends_on: "2027-05-31",
        rush_included: 3,
        note: "INV-1042",
        set_by: ADMIN,
        stamped: true,
        set_by_name: "Ada Admin",
      },
    ]);

    // The same plan again: nothing to change, nothing to log.
    await admin(() =>
      setPlan(
        db,
        TEAM,
        "program",
        "spring",
        "2027-01-01",
        "2027-05-31",
        "INV-1042",
      ),
    );
    assert.equal((await planAudit(db, TEAM)).length, 1);

    await admin(() =>
      setPlan(db, TEAM, "elite", "full_year", "2026-08-01", "2027-07-31"),
    );
    const replaced = await planRow(db, TEAM);
    assert.equal(replaced.plan_id, "elite");
    assert.equal(replaced.rush_included, 6);
    assert.equal(replaced.note, null);

    await admin(() => clearPlan(db, TEAM));
    assert.deepEqual(await planRow(db, TEAM), {
      plan_id: null,
      plan_term: null,
      starts_on: null,
      ends_on: null,
      rush_included: null,
      set_by: null,
      stamped: false,
      note: null,
      pilot_ends_on: null,
      pilot_ended: false,
    });
    // Clearing deletes the row; it does not leave an empty one behind.
    const { rows: left } = await db.query(
      "select count(*)::int as n from public.program_plans",
    );
    assert.equal(left[0].n, 0);
    assert.deepEqual(await admin(() => getPlan(db, TEAM)), []);
    // A team with no plan: nothing to clear, nothing to log.
    await admin(() => clearPlan(db, TEAM));

    const audit = await planAudit(db, TEAM);
    assert.deepEqual(
      audit.map((row) => [row.action, row.actor_user_id]),
      [
        ["plan.set", ADMIN],
        ["plan.set", ADMIN],
        ["plan.cleared", ADMIN],
      ],
    );
    assert.deepEqual(audit[0].details, {
      from: null,
      to: {
        plan_id: "program",
        term: "spring",
        starts_on: "2027-01-01",
        ends_on: "2027-05-31",
        note: "INV-1042",
      },
      rush_included: 3,
      by_admin: true,
    });
    assert.equal(audit[1].details.from.plan_id, "program");
    assert.equal(audit[1].details.to.plan_id, "elite");
    assert.equal(audit[1].details.rush_included, 6);
    assert.deepEqual(audit[2].details, {
      from: {
        plan_id: "elite",
        term: "full_year",
        starts_on: "2026-08-01",
        ends_on: "2027-07-31",
        rush_included: 6,
        note: null,
      },
      to: null,
      by_admin: true,
    });

    // Starter includes no rush jobs.
    await admin(() =>
      setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-06-30"),
    );
    assert.equal((await planRow(db, TEAM)).rush_included, 0);
  } finally {
    await db.close();
  }
});

test("the table's own checks refuse a bad plan, past every grant", async () => {
  const db = await boot();
  try {
    // As the table owner: the constraints themselves refuse.
    const insert = (values) =>
      db.exec(
        `insert into public.program_plans
           (program_id, plan_id, plan_term, starts_on, ends_on, rush_included, note)
         values ('${TEAM}', ${values})`,
      );

    await rejectsWith(
      insert("'gold', 'spring', '2027-01-01', '2027-05-31', 0, null"),
      "23514",
    );
    await rejectsWith(
      insert("'starter', 'full-year', '2027-01-01', '2027-05-31', 0, null"),
      "23514",
    );
    await rejectsWith(
      insert("'starter', 'spring', '2027-05-31', '2027-01-01', 0, null"),
      "23514",
    );
    await rejectsWith(
      insert("'starter', 'spring', '2027-01-01', '2027-05-31', -1, null"),
      "23514",
    );
    await rejectsWith(
      insert(
        "'starter', 'spring', '2027-01-01', '2027-05-31', 0, repeat('x', 501)",
      ),
      "23514",
    );
    // Half a plan is not a plan: every field is required.
    await rejectsWith(
      insert("'starter', 'spring', '2027-01-01', null, 0, null"),
      "23502",
    );
    await rejectsWith(
      insert("null, 'spring', '2027-01-01', '2027-05-31', 0, null"),
      "23502",
    );

    // A one-day season is allowed, and a team holds one plan.
    await insert("'starter', 'spring', '2027-01-01', '2027-01-01', 0, null");
    await rejectsWith(
      insert("'elite', 'spring', '2027-01-01', '2027-05-31', 6, null"),
      "23505",
    );

    // The plan goes with its program.
    await db.exec(`delete from public.program_audit_log`);
    await db.exec(`delete from public.program_members`);
    await db.exec(`delete from public.programs where id = '${TEAM}'`);
    const { rows } = await db.query(
      "select count(*)::int as n from public.program_plans",
    );
    assert.equal(rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("a plan is hidden signed out, readable by its own team, and never its note", async () => {
  const db = await boot();
  try {
    const admin = (work) => as(db, "authenticated", ADMIN, work);
    await admin(() =>
      setPlan(
        db,
        TEAM,
        "program",
        "spring",
        "2027-01-01",
        "2027-05-31",
        "PO 7",
      ),
    );
    await admin(() =>
      setPlan(db, PILOT_TEAM, "elite", "full_year", "2026-08-01", "2027-07-31"),
    );

    const readable =
      "program_id, plan_id, plan_term, starts_on::text, ends_on::text, rush_included";
    const read = (role, userId, columns = readable) =>
      as(db, role, userId, () =>
        db
          .query(`select ${columns} from public.program_plans order by plan_id`)
          .then(({ rows }) => rows),
      );

    // Signed out: not the table, not one column of it — while `programs`
    // itself stays readable, which is why the plan is not kept there.
    await rejectsWith(read("anon", null), "42501");
    await rejectsWith(read("anon", null, "plan_id"), "42501");
    const { rows: publicPrograms } = await as(db, "anon", null, () =>
      db.query("select count(*)::int as n from public.programs"),
    );
    assert.equal(publicPrograms[0].n, 6);

    // A member reads their own team's plan and nobody else's.
    assert.deepEqual(await read("authenticated", COACH), [
      {
        program_id: TEAM,
        plan_id: "program",
        plan_term: "spring",
        starts_on: "2027-01-01",
        ends_on: "2027-05-31",
        rush_included: 3,
      },
    ]);
    assert.deepEqual(
      (await read("authenticated", OUTSIDER)).map((row) => row.program_id),
      [PILOT_TEAM],
    );
    // An admin, a member of neither, reads both.
    assert.deepEqual(
      (await read("authenticated", ADMIN)).map((row) => row.program_id),
      [PILOT_TEAM, TEAM],
    );

    // Nobody signed in reads the note or who set it — member or admin — and
    // `select *` fails rather than quietly leaving them out.
    for (const user of [COACH, ADMIN]) {
      await rejectsWith(read("authenticated", user, "note"), "42501");
      await rejectsWith(read("authenticated", user, "set_by"), "42501");
      await rejectsWith(read("authenticated", user, "*"), "42501");
    }
    assert.equal(
      (await read("authenticated", COACH, "set_at is not null as stamped"))[0]
        .stamped,
      true,
    );

    // The full row is the admin RPC's alone.
    await rejectsWith(
      as(db, "authenticated", COACH, () => getPlan(db, TEAM)),
      "42501",
    );
    await rejectsWith(
      as(db, "anon", null, () => getPlan(db, TEAM)),
      "42501",
    );
    assert.equal((await admin(() => getPlan(db, TEAM)))[0].note, "PO 7");
  } finally {
    await db.close();
  }
});

test("no client can write a plan row, member, owner-of-nothing or admin", async () => {
  const db = await boot();
  try {
    await as(db, "authenticated", ADMIN, () =>
      setPlan(db, TEAM, "starter", "spring", "2027-01-01", "2027-05-31"),
    );

    const writes = [
      `insert into public.program_plans (program_id, plan_id, plan_term, starts_on, ends_on, rush_included)
         values ('${PILOT_TEAM}', 'elite', 'spring', '2027-01-01', '2027-05-31', 6)`,
      `update public.program_plans set plan_id = 'elite' where program_id = '${TEAM}'`,
      `update public.program_plans set ends_on = '2099-01-01' where program_id = '${TEAM}'`,
      `delete from public.program_plans where program_id = '${TEAM}'`,
    ];
    for (const [role, user] of [
      ["authenticated", COACH],
      ["authenticated", ADMIN],
      ["anon", null],
    ]) {
      for (const sql of writes) {
        await rejectsWith(
          as(db, role, user, () => db.exec(sql)),
          "42501",
        );
      }
    }

    assert.deepEqual(
      await as(db, "authenticated", ADMIN, () => getPlan(db, TEAM)).then(
        (rows) => rows.map((row) => [row.plan_id, row.ends_on]),
      ),
      [["starter", "2027-05-31"]],
    );
  } finally {
    await db.close();
  }
});

test("a pilot still running on the plan's first day ends the day before", async () => {
  const db = await boot();
  try {
    const admin = (work) => as(db, "authenticated", ADMIN, work);
    const spring = ["program", "spring", "2027-01-01", "2027-05-31"];

    await admin(() => setPlan(db, PILOT_TEAM, ...spring));
    assert.equal((await planRow(db, PILOT_TEAM)).pilot_ends_on, "2026-12-31");
    assert.equal((await planRow(db, PILOT_TEAM)).pilot_ended, false);
    assert.deepEqual(
      (await planAudit(db, PILOT_TEAM))[0].details.pilot_ends_on,
      {
        from: "2027-05-31",
        to: "2026-12-31",
      },
    );

    // A pilot an admin already ended by hand is not re-dated.
    await admin(() => setPlan(db, ENDED_PILOT_TEAM, ...spring));
    assert.equal(
      (await planRow(db, ENDED_PILOT_TEAM)).pilot_ends_on,
      "2027-05-31",
    );
    assert.equal(
      "pilot_ends_on" in (await planAudit(db, ENDED_PILOT_TEAM))[0].details,
      false,
    );

    // Nor is one that is over before the plan starts.
    await admin(() => setPlan(db, SHORT_PILOT_TEAM, ...spring));
    assert.equal(
      (await planRow(db, SHORT_PILOT_TEAM)).pilot_ends_on,
      "2026-12-31",
    );
    assert.equal(
      "pilot_ends_on" in (await planAudit(db, SHORT_PILOT_TEAM))[0].details,
      false,
    );

    // A pilot ending ON the first day overlaps it by that day.
    await db.exec(
      `update public.programs set pilot_ends_on = '2027-01-01' where id = '${TEAM}'`,
    );
    await admin(() => setPlan(db, TEAM, ...spring));
    assert.equal((await planRow(db, TEAM)).pilot_ends_on, "2026-12-31");
  } finally {
    await db.close();
  }
});

test("a signed-in user cannot write plan or any billing column", async () => {
  const db = await boot();
  try {
    const own = (assignment) =>
      as(db, "authenticated", COACH, () =>
        db.exec(`update public.users set ${assignment} where id = '${COACH}'`),
      );

    // The profile form's own columns still save.
    await own("first_name = 'Renamed'");

    // First lock: no UPDATE grant on any of the seven.
    for (const [column, value] of Object.entries(BILLING_COLUMNS)) {
      await rejectsWith(own(`${column} = ${value}`), "42501");
    }

    // Second lock: were a grant ever widened, the trigger still refuses.
    await db.exec("grant update on public.users to authenticated");
    for (const [column, value] of Object.entries(BILLING_COLUMNS)) {
      await assert.rejects(own(`${column} = ${value}`), (error) => {
        assert.equal(error.code, "42501", column);
        assert.match(error.message, /managed by billing/, column);
        return true;
      });
    }
    await own("first_name = 'Renamed again'");

    const { rows } = await db.query(
      `select first_name, plan, plan_period, plan_status, plan_period_start,
              plan_period_end, stripe_customer_id, stripe_subscription_id
         from public.users where id = $1`,
      [COACH],
    );
    assert.deepEqual(rows[0], {
      first_name: "Renamed again",
      plan: "free",
      plan_period: null,
      plan_status: null,
      plan_period_start: null,
      plan_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
  } finally {
    await db.close();
  }
});

test("the service role writes billing, inside the widened checks", async () => {
  const db = await boot();
  try {
    const service = (sql) => as(db, "service_role", null, () => db.exec(sql));

    await service(
      `update public.users set plan = 'coach-pro', plan_period = 'yearly',
         plan_status = 'active', plan_period_start = '2027-01-01T00:00:00Z',
         plan_period_end = '2028-01-01T00:00:00Z',
         stripe_customer_id = 'cus_1', stripe_subscription_id = 'sub_1'
       where id = '${COACH}'`,
    );
    await service(
      `update public.users set plan = 'coach' where id = '${COACH}'`,
    );
    // The legacy Lifetime value stays valid until stage C drops it.
    await service(`update public.users set plan = 'pro' where id = '${ADMIN}'`);

    await rejectsWith(
      service(`update public.users set plan = 'gold' where id = '${COACH}'`),
      "23514",
    );
    await rejectsWith(
      service(
        `update public.users set plan_period = 'weekly' where id = '${COACH}'`,
      ),
      "23514",
    );
    await rejectsWith(
      service(
        `update public.users set plan_status = 'trialing' where id = '${COACH}'`,
      ),
      "23514",
    );
    // One Stripe customer, one account.
    await rejectsWith(
      service(
        `update public.users set stripe_customer_id = 'cus_1' where id = '${ADMIN}'`,
      ),
      "23505",
    );
    await rejectsWith(
      service(
        `update public.users set stripe_subscription_id = 'sub_1' where id = '${ADMIN}'`,
      ),
      "23505",
    );
  } finally {
    await db.close();
  }
});

test("new and unclaimed programs are coaches-only; every claimed one keeps its setting", async () => {
  const db = await boot();
  try {
    const { rows } = await db.query(
      `select id, upload_policy, players_can_upload from public.programs order by id`,
    );
    const policy = Object.fromEntries(
      rows.map((row) => [row.id, [row.upload_policy, row.players_can_upload]]),
    );
    // Nobody has chosen a policy on an unclaimed row, so it moves.
    assert.deepEqual(policy[UNCLAIMED_TEAM], ["owner_coaches", false]);
    // Everything someone already holds — active or mid-claim — is untouched.
    for (const id of [
      TEAM,
      PILOT_TEAM,
      ENDED_PILOT_TEAM,
      SHORT_PILOT_TEAM,
      PENDING_TEAM,
    ]) {
      assert.deepEqual(policy[id], ["everyone", true], id);
    }

    const { rows: created } = await db.query(
      `insert into public.programs (school_name) values ('New Team')
       returning upload_policy, players_can_upload`,
    );
    assert.deepEqual(created, [
      { upload_policy: "owner_coaches", players_can_upload: false },
    ]);

    // Once a row is claimed its policy is its owner's: a second run of the
    // migration leaves it alone.
    await db.exec(
      `update public.programs set status = 'active', upload_policy = 'everyone',
         players_can_upload = true where id = '${UNCLAIMED_TEAM}'`,
    );
    await db.exec(migration);
    const { rows: after } = await db.query(
      `select upload_policy, players_can_upload from public.programs where id = $1`,
      [UNCLAIMED_TEAM],
    );
    assert.deepEqual(after, [
      { upload_policy: "everyone", players_can_upload: true },
    ]);
  } finally {
    await db.close();
  }
});
