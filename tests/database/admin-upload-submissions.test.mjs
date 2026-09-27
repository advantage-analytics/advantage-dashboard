/** Run: node --test tests/database/admin-upload-submissions.test.mjs
 * Isolated PostgreSQL contract test. Dependency tables are deliberately minimal
 * shapes verified in docs/admin-uploads-contracts.md, not a live schema clone.
 * The real migration, grants, RLS and PL/pgSQL run; deployed match/upload triggers
 * and concurrent multi-connection behavior require separate integration tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const member = uuid(1),
  outsider = uuid(2),
  regular = uuid(3);
const program = uuid(10),
  otherProgram = uuid(11),
  match = uuid(20);
const file = uuid(30),
  job = uuid(31),
  outcome = uuid(40);
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260919044542_persist_admin_upload_submissions.sql",
    import.meta.url,
  ),
  "utf8",
);

test("console provenance SQL authorization, durable outcomes and replay", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon, service_role;
      create table public.users(id uuid primary key, is_admin boolean);
      create table public.programs(id uuid primary key);
      create table public.program_events(id uuid primary key, program_id uuid);
      create table public.program_members(program_id uuid, user_id uuid);
      create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as
        $$ select coalesce((select u.is_admin from public.users u where u.id = (select auth.uid())), false) $$;
      create table public.matches(id uuid primary key, program_id uuid, created_by uuid, score text);
      alter table public.matches enable row level security;
      grant select, insert, update, delete on public.matches to authenticated;
      create policy creator_select on public.matches for select to authenticated using (created_by=auth.uid());
      create policy creator_insert on public.matches for insert to authenticated with check (created_by=auth.uid());
      create policy creator_update on public.matches for update to authenticated using (created_by=auth.uid()) with check (created_by=auth.uid());
      create policy creator_delete on public.matches for delete to authenticated using (created_by=auth.uid());
      create table public.program_event_outcomes(id uuid primary key, program_id uuid);
      create table public.processing_jobs(id uuid primary key, match_id uuid, created_by uuid);
      create table public.match_files(id uuid primary key, match_id uuid, uploaded_by uuid);
      create table public.program_audit_log(id bigint generated always as identity primary key,
        program_id uuid, actor_user_id uuid, action text, subject_id uuid, details jsonb,
        constraint program_audit_log_action_check check (action in ('program.conference_changed')));
      insert into public.users values ('${member}',true), ('${outsider}',true), ('${regular}',false);
      insert into public.programs values ('${program}'), ('${otherProgram}');
      insert into public.program_members values ('${program}','${member}');
      insert into public.matches values ('${match}','${program}','${regular}','6-1');
      insert into public.match_files values ('${file}','${match}','${outsider}');
      insert into public.processing_jobs values ('${job}','${match}','${outsider}');
      insert into public.program_event_outcomes values ('${outcome}','${program}');
    `);
    await db.exec(migration);
    const actor = async (id, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id ?? "",
      ]);
      if (role !== "owner") await db.exec(`set role ${role}`);
    };
    const begin = async (
      op,
      item,
      kind = "match",
      target = program,
      request = {},
    ) =>
      (
        await db.query(
          "select * from public.admin_begin_upload_item($1,$2,$3,$4,$5,$6)",
          [uuid(op), uuid(item), target, "file", kind, request],
        )
      ).rows[0];
    const finish = async (op, item, links = {}, error = null) =>
      (
        await db.query(
          "select * from admin_uploads_private.finish_item($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            uuid(op),
            uuid(item),
            { saved: true },
            links.match ?? null,
            links.outcome ?? null,
            links.job ?? null,
            links.file ?? null,
            error,
          ],
        )
      ).rows[0];
    const denied = async (work, code) =>
      assert.rejects(work, (err) => err.code === code);

    await actor(regular);
    await denied(() => begin(100, 101), "42501");
    await denied(
      () =>
        db.exec(`insert into public.admin_upload_submissions(operation_id,actor_user_id,program_id,kind)
      values ('${uuid(100)}','${member}','${program}','file')`),
      "42501",
    );
    await actor(null, "anon");
    await denied(() => begin(100, 101), "42501");
    await actor(null, "service_role");
    await denied(() => begin(100, 101), "42501");

    for (const [id, op] of [
      [member, 100],
      [outsider, 200],
    ]) {
      await actor(id);
      assert.equal((await begin(op, op + 1)).status, "pending");
      assert.equal((await begin(op, op + 1)).status, "pending");
      await denied(
        () => begin(op, op + 1, "match", program, { changed: true }),
        "22023",
      );
      await denied(() => begin(op, op + 1, "match", otherProgram), "22023");
      await denied(() => finish(op, op + 1, { match }), "42501");
      await denied(
        () =>
          db.exec(
            "update public.admin_upload_submission_items set status='succeeded'",
          ),
        "42501",
      );
      await actor(id, "owner"); // Simulates the owner of a later SECURITY DEFINER mutation RPC.
      assert.equal(
        (await finish(op, op + 1, {}, "upload_failed")).status,
        "failed",
      );
      await actor(id);
      assert.equal((await begin(op, op + 1)).error_code, "upload_failed");
      await actor(id, "owner");
      const saved = await finish(op, op + 1, { match });
      assert.equal(saved.status, "succeeded");
      assert.deepEqual(await finish(op, op + 1, {}, "late_failure"), saved);
      await actor(id);
      assert.deepEqual(await begin(op, op + 1), saved);
    }
    await actor(outsider);
    await denied(() => begin(100, 101), "22023");
    await begin(300, 301, "analysis_attachment");
    await actor(outsider, "owner");
    await denied(() => finish(300, 301, { match }), "22023");
    assert.equal(
      (await finish(300, 301, { match, job, file })).status,
      "succeeded",
    );
    await finish(300, 301, { match, job, file });
    await actor(outsider);
    await begin(400, 401, "outcome");
    await begin(500, 501, "match", otherProgram);
    await actor(outsider, "owner");
    await denied(() => finish(500, 501, { match }), "22023");
    await finish(400, 401, { outcome });
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.program_audit_log",
        )
      ).rows[0].n,
      4,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.program_audit_log where action='console.analysis_attached'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.admin_upload_submissions where origin='admin_console'",
        )
      ).rows[0].n,
      5,
    );
    await actor(regular);
    assert.equal(
      (await db.query("select * from public.admin_upload_submissions")).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.admin_upload_submission_items"))
        .rows.length,
      0,
    );
    await denied(() => finish(500, 501, { match }), "42501");
    await actor(outsider); // Non-owner admin still cannot update or delete coach match.
    assert.equal(
      (
        await db.query(
          `update public.matches set score='0-0' where id='${match}' returning id`,
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `delete from public.matches where id='${match}' returning id`,
        )
      ).rows.length,
      0,
    );
    await db.exec(
      `insert into public.matches values ('${uuid(21)}','${program}','${outsider}','6-0')`,
    );
    await actor(outsider, "owner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.admin_upload_submissions",
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.program_audit_log",
        )
      ).rows[0].n,
      4,
    );
    assert.equal(
      (await db.query(`select score from public.matches where id='${match}'`))
        .rows[0].score,
      "6-1",
    );
    // Durable setup is locked to one program/event and survives item retries.
    await db.exec(
      `insert into public.program_events values ('${uuid(60)}','${program}'), ('${uuid(61)}','${otherProgram}')`,
    );
    await actor(member);
    await db.query(
      "select * from public.admin_begin_upload_item($1,$2,$3,'dual','match','{}')",
      [uuid(600), uuid(601), program],
    );
    const link = async (event, result = { entries: [uuid(70)] }) =>
      (
        await db.query(
          "select * from admin_uploads_private.link_event($1,$2,$3)",
          [uuid(600), event, result],
        )
      ).rows[0];
    await denied(() => link(uuid(60)), "42501");
    await actor(member, "owner");
    await denied(() => link(uuid(61)), "22023");
    const setup = await link(uuid(60));
    assert.equal(setup.event_id, uuid(60));
    assert.deepEqual(await link(uuid(60)), setup);
    await denied(() => link(uuid(60), { entries: [] }), "22023");
    await actor(outsider, "owner");
    await denied(() => link(uuid(60)), "42501");
    await actor(outsider);
    for (const [kind, op] of [
      ["video", 700],
      ["tournament", 800],
      ["analysis_attachment", 900],
    ]) {
      await db.query(
        "select * from public.admin_begin_upload_item($1,$2,$3,$4,'match','{}')",
        [uuid(op), uuid(op + 1), program, kind],
      );
    }
    assert.deepEqual(
      (
        await db.query(
          "select distinct kind from public.admin_upload_submissions order by kind",
        )
      ).rows.map((row) => row.kind),
      ["analysis_attachment", "dual", "file", "tournament", "video"],
    );
    await actor(null, "owner");
    await denied(() => finish(500, 501, { match }), "42501");
    await actor(outsider, "owner");
    const privileges = await db.query(`select
      has_table_privilege('authenticated','public.admin_upload_submissions','TRUNCATE') as truncate,
      has_function_privilege('authenticated','admin_uploads_private.finish_item(uuid,uuid,jsonb,uuid,uuid,uuid,uuid,text)','EXECUTE') as finish`);
    assert.deepEqual(privileges.rows[0], { truncate: false, finish: false });
  } finally {
    await db.close();
  }
});
