import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("attachment SQL preserves results, revalidates and serializes reservation identity", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated, anon, service_role;
 create table users(id uuid primary key,is_admin boolean);
 create function is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.users where id=auth.uid()),false) $$;
 create table programs(id uuid primary key,status text,org_type text);
 create table program_members(program_id uuid,user_id uuid,role text);
 create table program_players(id uuid primary key,program_id uuid,claimed_by_user_id uuid,archived_at timestamptz,merged_into_id uuid);
 create table program_events(id uuid primary key,program_id uuid);
 create table program_event_entries(id uuid primary key,program_id uuid,discipline text,forfeit text,player_user_ids uuid[],opponent_labels text[]);
 create table program_event_outcomes(id uuid primary key,program_id uuid,entry_id uuid,round text,kind text);
 create table matches(id uuid primary key,created_by uuid,program_id uuid,event_entry_id uuid,player1_id uuid,player2_id uuid,opponent_player_id uuid,player1_name text,player2_name text,score jsonb,result text,round text,tournament_name text,date timestamptz,match_type text,format jsonb,court_type text,source_provider text,analysis_method text);
 create table processing_jobs(id uuid primary key,match_id uuid,created_by uuid,status text,results_object_key text,derivation_version integer);
 create table match_files(id uuid primary key,match_id uuid,uploaded_by uuid);
 create table match_stats(match_id uuid); create table points(match_id uuid); create table shots(match_id uuid);
 create table program_audit_log(id bigint generated always as identity primary key,program_id uuid,actor_user_id uuid,action text,subject_id uuid,details jsonb,constraint program_audit_log_action_check check(action='program.conference_changed'));
 insert into users values ('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);
 insert into programs values ('${id(10)}','active','college'),('${id(11)}','active','club');
 insert into program_members values ('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(3)}','coach');
 insert into program_players values ('${id(4)}','${id(10)}',null,null,null);
 insert into program_event_entries values ('${id(30)}','${id(10)}','singles',null,ARRAY['${id(4)}'::uuid],ARRAY['Opponent']);
 insert into matches values ('${id(20)}','${id(3)}','${id(10)}','${id(30)}','${id(4)}',null,null,'Athlete','Opponent','{"sets":[[6,4],[7,6]],"winner":1,"tiebreaks":[null,[7,4]]}','Final Score','F','Open','2026-09-15','Singles','{"ad_scoring":true}','Hard',null,'manual');
 `);
    for (const name of [
      "20260917000513_persist_admin_upload_submissions.sql",
      "20260917004400_prepare_admin_analysis_attachments.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    const actor = async (n, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        n ? id(n) : "",
      ]);
      if (role !== "owner") await db.exec("set role " + role);
    };
    const preview = async (program = 10) =>
      (
        await db.query("select admin_get_analysis_attachment($1,$2) as data", [
          id(program),
          id(20),
        ])
      ).rows[0].data;
    const prepare = async (fingerprint, op = 100, program = 10) =>
      (
        await db.query(
          "select admin_prepare_analysis_attachment($1,$2,$3,$4,$5) as data",
          [id(op), id(op + 1), id(program), id(20), fingerprint],
        )
      ).rows[0].data;
    const refuse = async (work, message) =>
      assert.rejects(work, (e) => e.message.includes(message));
    const mutate = async (sql) => {
      await actor(1, "owner");
      await db.exec(sql);
      await actor(2);
    };
    await actor(3);
    await refuse(preview, "admin-required");
    await actor(null, "anon");
    await refuse(preview, "permission denied");
    await actor(null, "service_role");
    await refuse(preview, "permission denied");
    await actor(1);
    const first = await preview(); // member admin
    await actor(2);
    assert.deepEqual(await preview(), first); // nonmember admin
    await refuse(() => preview(11), "wrong-program");
    await refuse(() => prepare("forged"), "stale-target");
    const before = first.match;
    const saved = await prepare(first.fingerprint);
    assert.deepEqual(await prepare(first.fingerprint), saved);
    await refuse(() => prepare(first.fingerprint, 200), "attachment-reserved");
    await actor(1);
    await refuse(
      () => prepare(first.fingerprint),
      "Operation identity conflict",
    );
    await actor(2);
    await refuse(
      () => db.exec(`update admin_analysis_reservations set snapshot='{}'`),
      "permission denied",
    );
    await refuse(
      () =>
        db.query(
          "select admin_prepare_analysis_attachment($1,$2,$3,$4,$5,$6)",
          [id(200), id(201), id(10), id(20), first.fingerprint, { score: {} }],
        ),
      "does not exist",
    );
    for (const [sql, undo, reason] of [
      [
        `update matches set score='{"winner":2}'`,
        `update matches set score='${JSON.stringify(before.score)}'`,
        "stale-target",
      ],
      [
        `update matches set player1_name='Changed'`,
        `update matches set player1_name='Athlete'`,
        "stale-target",
      ],
      [
        `update program_event_entries set opponent_labels=ARRAY['Changed']`,
        `update program_event_entries set opponent_labels=ARRAY['Opponent']`,
        "stale-target",
      ],
      [
        `update programs set status='suspended'`,
        `update programs set status='active'`,
        "program-inactive",
      ],
      [
        `update program_players set archived_at=now()`,
        `update program_players set archived_at=null`,
        "athlete-ineligible",
      ],
      [
        `update program_event_entries set forfeit='home'`,
        `update program_event_entries set forfeit=null`,
        "entry-ineligible",
      ],
      [
        `insert into processing_jobs values ('${id(50)}','${id(20)}','${id(3)}','pending',null,null)`,
        `delete from processing_jobs`,
        "processing-in-flight",
      ],
      [
        `insert into processing_jobs values ('${id(50)}','${id(20)}','${id(3)}','derivation_failed',null,null)`,
        `delete from processing_jobs`,
        "existing-analysis",
      ],
      [
        `insert into match_files values ('${id(50)}','${id(20)}','${id(3)}')`,
        `delete from match_files`,
        "existing-analysis",
      ],
      ...["match_stats", "points", "shots"].map((t) => [
        `insert into ${t} values ('${id(20)}')`,
        `delete from ${t}`,
        "existing-analysis",
      ]),
    ]) {
      await mutate(sql);
      await refuse(() => prepare(first.fingerprint), reason);
      await mutate(undo);
    }
    assert.deepEqual((await preview()).match, before);
    await actor(2, "owner");
    const counts = (
      await db.query(
        `select (select count(*)::int from matches) as matches,(select count(*)::int from admin_analysis_reservations) as reservations,(select count(*)::int from admin_upload_submission_items) as items,(select count(*)::int from program_audit_log) as audits,(select count(*)::int from processing_jobs) as jobs`,
      )
    ).rows[0];
    assert.deepEqual(counts, {
      matches: 1,
      reservations: 1,
      items: 1,
      audits: 0,
      jobs: 0,
    });
    // Primary-key uniqueness is the last line of defense even if a future caller
    // bypasses the current FOR UPDATE serializer. This is real PostgreSQL 23505.
    await refuse(
      () =>
        db.exec(
          `insert into admin_analysis_reservations select * from admin_analysis_reservations`,
        ),
      "duplicate key",
    );
    // Doubles/manual custom-program targets remain preparable. Preparation
    // spends no quota and cannot silently promote a club to a college tier.
    await db.query(
      "insert into matches select * from jsonb_populate_record(null::matches,$1)",
      [
        {
          ...before,
          id: id(21),
          program_id: id(11),
          event_entry_id: null,
          player1_id: null,
          match_type: "Doubles",
        },
      ],
    );
    await db.exec(
      `insert into processing_jobs values ('${id(51)}','${id(21)}','${id(3)}','failed',null,null)`,
    );
    await actor(2);
    const doubles = (
      await db.query("select admin_get_analysis_attachment($1,$2) as data", [
        id(11),
        id(21),
      ])
    ).rows[0].data;
    await db.query("select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)", [
      id(300),
      id(301),
      id(11),
      id(21),
      doubles.fingerprint,
    ]);
    await actor(2, "owner");
    assert.equal(
      (
        await db.query(
          "select snapshot->'program'->>'org_type' as org from admin_analysis_reservations where match_id=$1",
          [id(21)],
        )
      ).rows[0].org,
      "club",
    );
    // Losing admin privileges revokes replay too.
    await db.exec(`update users set is_admin=false where id='${id(2)}'`);
    await actor(2);
    await refuse(() => prepare(first.fingerprint), "Admin required");
    await actor(3);
    assert.equal(
      (await db.query("select * from admin_analysis_reservations")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
