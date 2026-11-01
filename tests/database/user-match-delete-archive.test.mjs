import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20261101222909_user_match_delete_archives_labels.sql",
  "20261101230941_label_archive_strip_names.sql",
];

const match = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";
const selfSession = "00000000-0000-4000-8000-000000000003";
const point = "00000000-0000-4000-8000-000000000004";
const job = "00000000-0000-4000-8000-000000000005";
const operation = "00000000-0000-4000-8000-000000000006";
const item = "00000000-0000-4000-8000-000000000007";

// The migration on the parents it touches, with the foreign keys that make a
// delete refuse, and the fields a real row carries.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table matches(id uuid primary key, score jsonb, format jsonb, match_type text, court_type text, player1_name text, player2_name text);
    create table match_storage_purge_claims(match_id uuid primary key references matches(id) on delete cascade);
    create table processing_jobs(id uuid primary key, match_id uuid references matches(id) on delete cascade);
    create table match_files(id uuid primary key, match_id uuid references matches(id) on delete cascade);
    create table label_sessions(id uuid primary key, match_id uuid not null references matches(id) on delete restrict, kind text not null, status text);
    create table label_points(id uuid primary key, session_id uuid references label_sessions(id) on delete cascade, point_index int);
    create table label_shots(id uuid primary key, session_id uuid references label_sessions(id) on delete cascade, label_point_id uuid references label_points(id) on delete cascade, vendor jsonb, created_at timestamptz default now());
    create table admin_upload_submission_items(operation_id uuid, item_id uuid, kind text not null, status text not null, match_id uuid references matches(id), outcome_id uuid, processing_job_id uuid references processing_jobs(id), match_file_id uuid references match_files(id), result jsonb not null default '{}', updated_at timestamptz, primary key(operation_id,item_id),
      constraint admin_upload_submission_items_check1 check (status <> 'succeeded' or (kind='outcome' and outcome_id is not null and match_id is null) or (kind<>'outcome' and match_id is not null and outcome_id is null)));
    create table admin_schedule_result_targets(operation_id uuid, item_id uuid, foreign key(operation_id,item_id) references admin_upload_submission_items(operation_id,item_id));
    create table admin_analysis_reservations(operation_id uuid, item_id uuid, match_id uuid not null references matches(id));
    create table admin_file_attempts(operation_id uuid, item_id uuid, match_id uuid not null references matches(id), file_id uuid references match_files(id));
    create table admin_video_attempts(operation_id uuid, item_id uuid, match_id uuid not null references matches(id), job_id uuid not null references processing_jobs(id));
  `);
  for (const file of migrations)
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(`
    insert into matches(id, score, match_type, player1_name, player2_name) values ('${match}', '[[6,4]]', 'Singles', 'A Player', 'B Opponent');
    insert into processing_jobs values ('${job}', '${match}');
    insert into label_sessions values ('${session}', '${match}', 'analyst', 'complete'), ('${selfSession}', '${match}', 'self', 'labelling');
    insert into label_points values ('${point}', '${session}', 1);
    insert into label_shots(id, session_id, label_point_id, vendor, created_at) values
      (gen_random_uuid(), '${session}', '${point}', '{"pred_player_id":"A Player","speed_kmh":120}', '2026-01-01'),
      (gen_random_uuid(), '${session}', '${point}', '{"pred_player_id":"B Opponent"}', '2026-01-02'),
      (gen_random_uuid(), '${session}', '${point}', '{"pred_player_id":"None"}', '2026-01-03'),
      (gen_random_uuid(), '${session}', '${point}', '{"pred_player_id":"Someone Else"}', '2026-01-04'),
      (gen_random_uuid(), '${session}', '${point}', null, '2026-01-05');
    insert into admin_upload_submission_items(operation_id, item_id, kind, status, match_id, processing_job_id) values ('${operation}', '${item}', 'match', 'succeeded', '${match}', '${job}');
    insert into admin_schedule_result_targets values ('${operation}', '${item}');
    insert into admin_analysis_reservations values ('${operation}', '${item}', '${match}');
    insert into admin_video_attempts values ('${operation}', '${item}', '${match}', '${job}');
  `);
  return db;
}

const count = async (db, table) =>
  (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;

const claim = `select public.admin_claim_match_delete(array['${match}'::uuid]) as allowed`;

test("a delete with no claim is still refused while labels and console rows point at the match", async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.exec(`delete from matches where id='${match}'`));
    assert.equal(await count(db, "matches"), 1);
    assert.equal(await count(db, "label_archive"), 0);
    assert.equal(await count(db, "label_points"), 1);
  } finally {
    await db.close();
  }
});

test("a claimed delete archives the labels without names and leaves the console's history", async () => {
  const db = await fixture();
  try {
    await db.exec("set role service_role");
    assert.equal((await db.query(claim)).rows[0].allowed, true);
    await db.exec("reset role");
    // Stands in for matches_drop_self_review: kind = 'self' is not archived.
    await db.exec(`delete from label_sessions where id='${selfSession}'`);
    await db.exec(`delete from matches where id='${match}'`);

    assert.equal(await count(db, "matches"), 0);
    assert.equal(await count(db, "label_sessions"), 0);
    assert.equal(await count(db, "label_points"), 0);
    assert.equal(await count(db, "admin_video_attempts"), 0);
    assert.equal(await count(db, "admin_analysis_reservations"), 0);
    assert.equal(await count(db, "admin_schedule_result_targets"), 0);

    const { rows: archived } = await db.query("select * from label_archive");
    assert.equal(archived.length, 1);
    assert.equal(archived[0].match_id, match);
    assert.equal(archived[0].session_id, session);
    assert.equal(archived[0].points.length, 1);
    assert.deepEqual(
      archived[0].shots.map((shot) => shot.vendor?.pred_player_id ?? null),
      ["p1", "p2", "None", null, null],
    );
    assert.equal(archived[0].shots[0].vendor.speed_kmh, 120);
    assert.equal(archived[0].match_context.match_type, "Singles");
    const stored = JSON.stringify(archived[0]);
    for (const name of ["A Player", "B Opponent", "Someone Else"])
      assert.equal(stored.includes(name), false, name);

    const { rows: items } = await db.query(
      "select status, match_id, processing_job_id, result ? 'match_deleted_at' as stamped from admin_upload_submission_items",
    );
    assert.deepEqual(items, [
      {
        status: "succeeded",
        match_id: null,
        processing_job_id: null,
        stamped: true,
      },
    ]);
  } finally {
    await db.close();
  }
});

test("only a deleted match may leave a succeeded item unlinked", async () => {
  const db = await fixture();
  try {
    await assert.rejects(
      db.exec("update admin_upload_submission_items set match_id = null"),
      /admin_upload_submission_items_check1/,
    );
  } finally {
    await db.close();
  }
});

test("a failed delete keeps the labels where they were", async () => {
  const db = await fixture();
  try {
    await db.exec("set role service_role");
    await db.query(claim);
    await db.exec("reset role");
    await db.exec(`delete from label_sessions where id='${selfSession}'`);
    await db.exec(
      `create function refuse() returns trigger language plpgsql as $$ begin raise exception 'late refusal'; end; $$;
       create trigger zz_refuse before delete on processing_jobs for each row execute function refuse();`,
    );
    await assert.rejects(
      db.exec(`delete from matches where id='${match}'`),
      /late refusal/,
    );
    assert.equal(await count(db, "label_archive"), 0);
    assert.equal(await count(db, "label_points"), 1);
    assert.equal(await count(db, "admin_video_attempts"), 1);
  } finally {
    await db.close();
  }
});

test("only the service role can claim or read the archive", async () => {
  const db = await fixture();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(claim), /permission denied/);
      await assert.rejects(
        db.query("select * from label_archive"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await db.query("select * from label_archive");
    await assert.rejects(
      db.exec(
        `insert into label_archive(match_id, session_id, match_context, session, points, shots) values ('${match}','${match}','{}','{}','[]','[]')`,
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
