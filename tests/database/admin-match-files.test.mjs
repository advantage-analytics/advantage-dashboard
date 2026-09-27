import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("file admission, attachment preservation and durable processing claims execute atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema storage; create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated, anon, service_role;
 create table users(id uuid primary key,is_admin boolean,first_name text,last_name text);
 create function is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.users where id=auth.uid()),false) $$;
 create table programs(id uuid primary key,status text,org_type text);
 create table program_members(program_id uuid,user_id uuid,role text);
 create table program_players(id uuid primary key,program_id uuid,claimed_by_user_id uuid,archived_at timestamptz,merged_into_id uuid,first_name text,last_name text);
 create table program_events(id uuid primary key,program_id uuid);
 create table program_event_entries(id uuid primary key,program_id uuid,discipline text,forfeit text,player_user_ids uuid[],opponent_labels text[]);
 create table program_event_outcomes(id uuid primary key,program_id uuid,entry_id uuid,round text,kind text);
 create table matches(id uuid primary key default gen_random_uuid(),created_by uuid,program_id uuid,event_entry_id uuid,player1_id uuid,player2_id uuid,opponent_player_id uuid,player1_name text,player2_name text,score jsonb,result text,round text,tournament_name text,date timestamptz,match_type text,format jsonb,court_type text,source_provider text,analysis_method text,private boolean);
 create table processing_jobs(id uuid primary key,match_id uuid,created_by uuid,status text,results_object_key text,derivation_version integer);
 create table match_files(id uuid primary key default gen_random_uuid(),match_id uuid,uploaded_by uuid,provider_id text,file_name text,file_size bigint,storage_path text,status text);
 create table match_stats(match_id uuid); create table points(match_id uuid); create table shots(match_id uuid);
 create table program_audit_log(id bigint generated always as identity primary key,program_id uuid,actor_user_id uuid,action text,subject_id uuid,details jsonb,constraint program_audit_log_action_check check(action='program.conference_changed'));
 insert into users(id,is_admin) values ('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);
 insert into programs values ('${id(10)}','active','college'),('${id(11)}','active','club');
 insert into program_members values ('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(3)}','coach');
 insert into program_players values ('${id(4)}','${id(10)}',null,null,null,'Athlete','');
 insert into program_event_entries values ('${id(30)}','${id(10)}','singles',null,ARRAY['${id(4)}'::uuid],ARRAY['Opponent']);
 insert into matches values ('${id(20)}','${id(3)}','${id(10)}','${id(30)}','${id(4)}',null,null,'Athlete','Opponent','{"sets":[[6,4],[7,6]],"winner":1,"tiebreaks":[null,[7,4]]}','Final Score','F','Open','2026-09-15','Singles','{"ad_scoring":true}','Hard',null,'manual',false);
 `);
    for (const name of [
      "20260919044542_persist_admin_upload_submissions.sql",
      "20260919044622_prepare_admin_analysis_attachments.sql",
      "20260919044716_submit_admin_match_files.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    const role = async (who, name = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        who ? id(who) : "",
      ]);
      if (name !== "owner") await db.exec(`set role ${name}`);
    };
    const refuse = (fn, message) =>
      assert.rejects(fn, (e) => e.message.includes(message));
    const score = {
      player1: [6, 7],
      player2: [4, 6],
      player1_tiebreaks: [null, 7],
      player2_tiebreaks: [null, 4],
    };
    const request = (op = 100) => ({
      sha256: "a".repeat(64),
      storagePath: `_admin-console/${id(op)}/${id(op + 1)}/${"a".repeat(64)}.xlsx`,
      fileName: "match.xlsx",
      fileSize: 1234,
      playerId: id(4),
      date: "2026-09-15",
      matchType: "Singles",
      courtType: "Hard",
      parsed: {
        player1_name: "Athlete",
        player2_name: "Opponent",
        score,
        result: "Athlete Wins",
        winner: "player1",
        format: { best_of: 3, ad_scoring: true },
      },
    });
    const submit = async (
      req = request(),
      match = null,
      fingerprint = null,
      op = 100,
      actor = 2,
    ) =>
      (
        await db.query(
          "select admin_submit_match_file($1,$2,$3,$4,$5,$6,$7) as data",
          [id(actor), id(op), id(op + 1), id(10), match, fingerprint, req],
        )
      ).rows[0].data;
    const claim = async (match, actor = 2, service = false) =>
      (
        await db.query("select admin_claim_match_file($1,$2,$3) as data", [
          match,
          id(actor),
          service,
        ])
      ).rows[0].data;
    await role(2);
    await refuse(() => submit(), "permission denied");
    await role(null, "service_role");
    await refuse(() => submit(request(), null, null, 100, 3), "admin-required");
    const first = await submit();
    assert.equal(first.state, "queued");
    assert.deepEqual(await submit(), first); // lost admission response
    await refuse(
      () => submit({ ...request(), sha256: "b".repeat(64) }),
      "Item identity conflict",
    );
    await role(null, "owner");
    assert.equal(
      (await db.query("select count(*)::int as n from matches")).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from program_audit_log"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query("select player1_id from matches where id=$1", [
          first.match_id,
        ])
      ).rows[0].player1_id,
      id(4),
    );
    await role(null, "service_role");
    await refuse(() => claim(first.match_id, 3), "admin-required");
    // No operation identifiers are accepted at all: lookup by match is mandatory.
    const lease = await claim(first.match_id);
    assert.equal(lease.claimed, true);
    const duplicate = await claim(first.match_id);
    assert.equal(duplicate.claimed, false);
    assert.equal(duplicate.state, "processing");
    await db.query("select admin_finish_match_file($1,$2,$3)", [
      first.match_id,
      lease.claim_token,
      "processing-failed-review-required",
    ]);
    assert.equal((await claim(first.match_id)).state, "failed");
    assert.equal((await submit()).state, "failed"); // no rerun after partial inserts
    await refuse(
      () =>
        db.query("select admin_finish_match_file($1,$2,null)", [
          first.match_id,
          lease.claim_token,
        ]),
      "invalid-file-claim",
    );

    await role(2, "owner");
    await db.query(
      "update matches set score=$1,result='Final Score' where id=$2",
      [score, id(20)],
    );
    const before = (
      await db.query("select to_jsonb(m) as data from matches m where id=$1", [
        id(20),
      ])
    ).rows[0].data;
    await role(2);
    const fingerprint = (
      await db.query("select admin_get_analysis_attachment($1,$2) as data", [
        id(10),
        id(20),
      ])
    ).rows[0].data.fingerprint;
    await db.query("select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)", [
      id(200),
      id(201),
      id(10),
      id(20),
      fingerprint,
    ]);
    const attachment = {
      ...request(200),
      playerId: null,
      date: null,
      matchType: null,
      courtType: null,
    };
    await role(null, "service_role");
    await refuse(
      () =>
        submit(
          {
            ...attachment,
            parsed: { ...attachment.parsed, player1_name: "Wrong" },
          },
          id(20),
          fingerprint,
          200,
        ),
      "player-mismatch",
    );
    await refuse(
      () =>
        submit(
          {
            ...attachment,
            parsed: {
              ...attachment.parsed,
              score: { ...score, player1: [0, 0] },
            },
          },
          id(20),
          fingerprint,
          200,
        ),
      "score-mismatch",
    );
    await role(2, "owner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from match_files where match_id=$1",
          [id(20)],
        )
      ).rows[0].n,
      0,
    );
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(m) as data from matches m where id=$1",
          [id(20)],
        )
      ).rows[0].data,
      before,
    );
    await db.exec(
      "update program_event_entries set opponent_labels=ARRAY['Changed']",
    );
    await role(null, "service_role");
    await refuse(
      () => submit(attachment, id(20), fingerprint, 200),
      "stale-target",
    );
    await role(2, "owner");
    await db.exec(
      "update program_event_entries set opponent_labels=ARRAY['Opponent']",
    );
    await role(null, "service_role");
    const attached = await submit(attachment, id(20), fingerprint, 200);
    assert.equal(attached.match_id, id(20));
    assert.deepEqual(
      await submit(attachment, id(20), fingerprint, 200),
      attached,
    );
    await refuse(
      () =>
        submit(
          { ...attachment, fileName: "other.xlsx" },
          id(20),
          fingerprint,
          200,
        ),
      "file-identity-conflict",
    );
    const attachmentLease = await claim(id(20));
    await role(2, "owner");
    for (const [key, value] of Object.entries({
      created_by: id(2),
      player1_id: id(2),
      score: { winner: "player2" },
      result: "Changed",
      date: "2026-09-16",
      format: { best_of: 5 },
      player2_name: "Changed",
      round: "QF",
    })) {
      await refuse(
        () =>
          db.query(
            `update matches set ${key}=($1::jsonb->>'value')${["created_by", "player1_id"].includes(key) ? "::uuid" : key === "date" ? "::timestamptz" : ["score", "format"].includes(key) ? "::jsonb" : ""} where id=$2`,
            [
              {
                value:
                  typeof value === "object" ? JSON.stringify(value) : value,
              },
              id(20),
            ],
          ),
        "recorded-result-protected",
      );
    }
    const current = (
      await db.query("select to_jsonb(m) as data from matches m where id=$1", [
        id(20),
      ])
    ).rows[0].data;
    assert.deepEqual(
      { ...current, source_provider: null, analysis_method: "manual" },
      before,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from program_audit_log"))
        .rows[0].n,
      2,
    );
    await role(null, "service_role");
    await db.query("select admin_finish_match_file($1,$2,null)", [
      id(20),
      attachmentLease.claim_token,
    ]);
    assert.equal((await claim(id(20))).state, "completed");
    await role(2, "owner");
    // Ordinary authorized repair is no longer blocked after the attempt ends.
    await db.exec(`update matches set player1_id=null where id='${id(20)}'`);
    await db.exec(`update users set is_admin=false where id='${id(2)}'`);
    await db.exec(
      "grant usage on schema storage to authenticated; grant all on storage.objects to authenticated; create policy ordinary_storage on storage.objects for all to authenticated using(true) with check(true)",
    );
    await role(1);
    await db.exec(
      "insert into storage.objects values ('match-data','user/match.xlsx')",
    );
    await refuse(
      () =>
        db.exec(
          "insert into storage.objects values ('match-data','_admin-console/op/item/hash.xlsx')",
        ),
      "row-level security",
    );
    await role(1, "owner");
    await refuse(
      () => db.query("insert into match_files(match_id) values ($1)", [id(20)]),
      "analysis-already-submitted",
    );
    await refuse(
      () =>
        db.query(
          "insert into processing_jobs(id,match_id,status) values ($1,$2,'pending')",
          [id(90), id(20)],
        ),
      "analysis-already-submitted",
    );
    await role(null, "service_role");
    await refuse(() => submit(), "admin-required");
  } finally {
    await db.close();
  }
});
