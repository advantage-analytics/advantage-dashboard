/** Run: node --test tests/database/plans-2027-billing.test.mjs
 * Isolated PostgreSQL contract test for the 2027 billing migration
 * (`20261126080000_plans_2027_billing.sql`), executed byte-for-byte so its
 * own assertion block runs too.
 *
 * The two tables are the minimal shape the migration touches, with the
 * constraints as they were read from the live catalog on 2026-11-25:
 * `users.plan` in both states the migration may meet (live's free | pro, and
 * stage A's free | coach | coach-pro | pro), and `video_credits` with live's
 * `pack`, `source` and purchase-needs-a-session checks and its three unique
 * Stripe columns.
 *
 * What this proves: the Lifetime account moves to Free and nobody else moves;
 * `pro` can no longer be written while the three plans on sale can; the
 * migration runs twice, and from either starting check; and an extra-hours
 * row — a purchase with no pack — is accepted by live's checks as they stand
 * and is recorded once per Checkout Session, payment intent and event.
 *
 * Not proven: PostgREST, grants, or the trigger that blocks client writes
 * (`plans-2027-plan-model.test.mjs` covers that one).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261126080000_plans_2027_billing.sql",
    import.meta.url,
  ),
  "utf8",
);

const LIFETIME = uuid(1);
const FREE = uuid(2);
const COACH = uuid(3);

async function boot(planCheck) {
  const db = new PGlite();
  await db.exec(`
    create table public.users (
      id uuid primary key,
      plan text default 'free'
        constraint users_plan_check check (plan = any (array[${planCheck}]))
    );
    create table public.video_credits (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.users (id) on delete cascade,
      seconds integer not null check (seconds > 0),
      remaining_seconds integer not null,
      expires_at timestamptz not null,
      source text not null
        constraint video_credits_source_check
        check (source = any (array['purchase', 'grant'])),
      pack text
        constraint video_credits_pack_check
        check (pack = any (array['1h', '5h'])),
      stripe_checkout_session text unique,
      stripe_payment_intent text unique,
      stripe_event_id text unique,
      amount_cents integer check (amount_cents >= 0),
      currency text,
      created_at timestamptz not null default now(),
      check (remaining_seconds >= 0 and remaining_seconds <= seconds),
      check (source <> 'purchase' or stripe_checkout_session is not null)
    );
    insert into public.users (id, plan) values
      ('${LIFETIME}', 'pro'), ('${FREE}', 'free');
  `);
  return db;
}

const plans = async (db) =>
  Object.fromEntries(
    (await db.query("select id, plan from public.users")).rows.map((row) => [
      row.id,
      row.plan,
    ]),
  );

for (const [name, check] of [
  ["live's check (free | pro)", "'free', 'pro'"],
  ["stage A's check", "'free', 'coach', 'coach-pro', 'pro'"],
]) {
  test(`from ${name}: Lifetime moves to Free and pro leaves the check`, async () => {
    const db = await boot(check);
    await db.exec(migration);

    assert.deepEqual(await plans(db), { [LIFETIME]: "free", [FREE]: "free" });

    await db.query("insert into public.users (id, plan) values ($1, 'coach')", [
      COACH,
    ]);
    await db.query("update public.users set plan = 'coach-pro' where id = $1", [
      COACH,
    ]);
    await assert.rejects(
      db.query("update public.users set plan = 'pro' where id = $1", [FREE]),
      /users_plan_check/,
    );
    await assert.rejects(
      db.query("update public.users set plan = 'enterprise' where id = $1", [
        FREE,
      ]),
      /users_plan_check/,
    );

    // A second run changes nothing, paid rows included.
    await db.exec(migration);
    assert.deepEqual(await plans(db), {
      [LIFETIME]: "free",
      [FREE]: "free",
      [COACH]: "coach-pro",
    });
  });
}

test("extra hours are a purchase with no pack, recorded once", async () => {
  const db = await boot("'free', 'pro'");
  await db.exec(migration);

  const insert = (session, intent, event) =>
    db.query(
      `insert into public.video_credits
         (user_id, seconds, remaining_seconds, expires_at, source, pack,
          stripe_checkout_session, stripe_payment_intent, stripe_event_id,
          amount_cents, currency)
       values ($1, 10800, 10800, now() + interval '12 months', 'purchase',
               null, $2, $3, $4, 10500, 'usd')`,
      [FREE, session, intent, event],
    );

  await insert("cs_test_hours", "pi_hours", "evt_1");
  // The webhook redelivered, confirm racing it, a second event for the same
  // payment: each trips a different unique column.
  for (const again of [
    ["cs_test_hours", "pi_other", "evt_2"],
    ["cs_test_other", "pi_hours", "evt_3"],
    ["cs_test_third", "pi_third", "evt_1"],
  ]) {
    await assert.rejects(insert(...again), (error) => error.code === "23505");
  }
  // Confirm records with no event id; two of those do not collide on NULL.
  await insert("cs_test_a", "pi_a", null);
  await insert("cs_test_b", "pi_b", null);

  const { rows } = await db.query(
    "select count(*)::int as n from public.video_credits where pack is null and source = 'purchase'",
  );
  assert.equal(rows[0].n, 3);

  // A purchase still needs its session, and the old packs still read.
  await assert.rejects(
    insert(null, "pi_c", null),
    (error) => error.code === "23514",
  );
  await db.query(
    `insert into public.video_credits
       (user_id, seconds, remaining_seconds, expires_at, source, pack, stripe_checkout_session)
     values ($1, 3600, 3600, now(), 'purchase', '1h', 'cs_test_pack')`,
    [FREE],
  );
});
