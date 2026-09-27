import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("durable cleanup claims serialize admission, protect references, and remain service-only", async () => {
  const db = new PGlite();
  try {
    const tables = [
      "admin_upload_submission_items",
      "admin_analysis_reservations",
      "admin_file_attempts",
      "admin_video_attempts",
    ];
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema admin_uploads_private; create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function release_my_account_from_programs() returns table(program_id uuid,profile_id uuid,retained integer,repointed integer) language plpgsql as $$ begin if current_setting('test.refuse',true)='yes' then raise exception 'owner refusal' using errcode='42501'; end if; return; end; $$; create table users(id uuid primary key); create table matches(id uuid primary key); create table processing_jobs(id uuid, created_by uuid); create table admin_upload_submissions(actor_user_id uuid);",
    );
    for (const table of tables)
      await db.exec(
        `create table ${table}(match_id uuid,job_id uuid); alter table ${table} enable row level security;`,
      );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260919045221_guard_admin_match_storage_purge.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
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
    await db.exec(
      `select set_config('request.jwt.claim.sub','${actor}',false); set test.refuse='yes'; set role authenticated`,
    );
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
