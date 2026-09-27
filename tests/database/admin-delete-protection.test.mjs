import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const tables = [
  "admin_upload_submission_items",
  "admin_analysis_reservations",
  "admin_file_attempts",
  "admin_video_attempts",
];

// The claims migration and T27's release migration, in order, on the minimal
// parents both need. The release file is named by its placeholder version
// until the live project records the real one.
const migrations = [
  "20260919045221_guard_admin_match_storage_purge.sql",
  "20260927103502_release_deletion_claims.sql",
];

async function fixture() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema admin_uploads_private; create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function release_my_account_from_programs() returns table(program_id uuid,profile_id uuid,retained integer,repointed integer) language plpgsql as $$ begin if current_setting('test.refuse',true)='yes' then raise exception 'owner refusal' using errcode='42501'; end if; return; end; $$; create table users(id uuid primary key); create table matches(id uuid primary key); create table processing_jobs(id uuid, created_by uuid); create table admin_upload_submissions(actor_user_id uuid);",
  );
  for (const table of tables)
    await db.exec(
      `create table ${table}(match_id uuid,job_id uuid); alter table ${table} enable row level security;`,
    );
  for (const file of migrations)
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  return db;
}

const asUser = (db, actor) =>
  db.exec(
    `select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated`,
  );

test("durable cleanup claims serialize admission, protect references, and remain service-only", async () => {
  const db = await fixture();
  try {
    const id = "00000000-0000-4000-8000-000000000001";
    const actor = "00000000-0000-4000-8000-000000000002";
    await db.exec(
      `insert into matches values('${id}'); insert into users values('${actor}')`,
    );
    const matchCall = `select public.admin_claim_match_storage_purge(array['${id}'::uuid]) as allowed`;
    const actorCall = `select public.admin_claim_actor_deletion('${actor}') as allowed`;
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(matchCall), /permission denied/);
      await assert.rejects(db.query(actorCall), /permission denied/);
      await assert.rejects(
        db.exec(
          `insert into match_storage_purge_claims(match_id) values('${id}')`,
        ),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    for (const table of tables) {
      await db.exec(
        `insert into ${table}(match_id) values ('${id}'); set role service_role`,
      );
      assert.equal((await db.query(matchCall)).rows[0].allowed, false);
      await db.exec(`reset role; delete from ${table}`);
    }
    await db.exec("set test.refuse='yes'");
    await asUser(db, actor);
    await assert.rejects(
      db.query("select * from prepare_my_account_deletion()"),
      /owner refusal/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from admin_actor_delete_claims",
        )
      ).rows[0].n,
      0,
      "refused account release rolls claim back",
    );
    await db.exec("set test.refuse='no'");
    await db.exec("set role service_role");
    assert.equal((await db.query(matchCall)).rows[0].allowed, true);
    assert.equal(
      (await db.query(matchCall)).rows[0].allowed,
      true,
      "deletion retries reuse claim",
    );
    await db.exec("reset role");
    for (const table of tables)
      await assert.rejects(
        db.exec(`insert into ${table}(match_id) values('${id}')`),
        /match-deletion-in-progress/,
      );
    await db.exec(
      `insert into admin_upload_submissions values('${actor}'); set role service_role`,
    );
    assert.equal((await db.query(actorCall)).rows[0].allowed, false);
    await db.exec(
      "reset role; delete from admin_upload_submissions; set role service_role",
    );
    assert.equal((await db.query(actorCall)).rows[0].allowed, true);
    assert.equal((await db.query(actorCall)).rows[0].allowed, true);
    await db.exec("reset role");
    await assert.rejects(
      db.exec(`insert into admin_upload_submissions values('${actor}')`),
      /account-deletion-in-progress/,
    );
    await db.exec(
      `delete from matches where id='${id}'; delete from users where id='${actor}'`,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from match_storage_purge_claims",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from admin_actor_delete_claims",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("a failed deletion releases its own claims and the console admits again", async () => {
  const db = await fixture();
  try {
    const match = "00000000-0000-4000-8000-000000000011";
    const actor = "00000000-0000-4000-8000-000000000012";
    const other = "00000000-0000-4000-8000-000000000013";
    await db.exec(
      `insert into matches values('${match}'); insert into users values('${actor}'),('${other}')`,
    );
    const claimMatch = `select public.admin_claim_match_storage_purge(array['${match}'::uuid]) as allowed`;
    const releaseMatch = `select public.admin_release_match_storage_purge(array['${match}'::uuid]) as released`;
    const releaseActor =
      "select public.release_my_account_deletion_claim() as released";
    const actorClaims = async () =>
      (
        await db.query(
          "select actor_user_id from admin_actor_delete_claims order by actor_user_id",
        )
      ).rows.map((row) => row.actor_user_id);

    // anon may call neither release.
    await db.exec("set role anon");
    await assert.rejects(db.query(releaseMatch), /permission denied/);
    await assert.rejects(db.query(releaseActor), /permission denied/);
    await db.exec("reset role");

    // authenticated may call only the account release, and only with a session.
    await asUser(db, actor);
    await assert.rejects(db.query(releaseMatch), /permission denied/);
    assert.equal(
      (await db.query(releaseActor)).rows[0].released,
      false,
      "nothing claimed yet, nothing released",
    );
    await db.exec("reset role");
    await asUser(db, "");
    await assert.rejects(db.query(releaseActor), /not authenticated/);
    await db.exec("reset role");

    // service_role may call only the purge release.
    await db.exec("set role service_role");
    await assert.rejects(db.query(releaseActor), /permission denied/);
    assert.equal(
      (await db.query(releaseMatch)).rows[0].released,
      0,
      "no claim on the match yet",
    );
    assert.equal(
      (
        await db.query(
          "select public.admin_release_match_storage_purge('{}'::uuid[]) as released",
        )
      ).rows[0].released,
      0,
      "an empty array releases nothing",
    );

    // Claim two actors and the match, as the deletion paths do.
    assert.equal(
      (
        await db.query(
          `select public.admin_claim_actor_deletion('${actor}') as allowed`,
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query(
          `select public.admin_claim_actor_deletion('${other}') as allowed`,
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal((await db.query(claimMatch)).rows[0].allowed, true);
    await db.exec("reset role");
    assert.deepEqual(await actorClaims(), [actor, other]);

    // While claimed, every console admission is refused.
    await assert.rejects(
      db.exec(
        `insert into admin_analysis_reservations(match_id) values('${match}')`,
      ),
      /match-deletion-in-progress/,
    );
    await assert.rejects(
      db.exec(`insert into admin_upload_submissions values('${actor}')`),
      /account-deletion-in-progress/,
    );

    // The caller releases their own row and nobody else's.
    await asUser(db, actor);
    assert.equal((await db.query(releaseActor)).rows[0].released, true);
    assert.equal(
      (await db.query(releaseActor)).rows[0].released,
      false,
      "a second release finds nothing",
    );
    await db.exec("reset role");
    assert.deepEqual(
      await actorClaims(),
      [other],
      "only the caller's claim went",
    );
    await db.exec(`insert into admin_upload_submissions values('${actor}')`);
    await assert.rejects(
      db.exec(`insert into admin_upload_submissions values('${other}')`),
      /account-deletion-in-progress/,
    );

    // The released match is admitted again by reject_purging_match, and once
    // admitted the guard refuses a fresh claim as before.
    await db.exec("set role service_role");
    assert.equal((await db.query(releaseMatch)).rows[0].released, 1);
    assert.equal(
      (await db.query(releaseMatch)).rows[0].released,
      0,
      "a second release finds nothing",
    );
    await db.exec("reset role");
    await db.exec(
      `insert into admin_analysis_reservations(match_id) values('${match}')`,
    );
    await db.exec("set role service_role");
    assert.equal((await db.query(claimMatch)).rows[0].allowed, false);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from match_storage_purge_claims",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
