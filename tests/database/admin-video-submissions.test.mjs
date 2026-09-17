import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("video admission preserves coach results, serializes jobs, and guards state", async () => {
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
 create table processing_jobs(id uuid primary key default gen_random_uuid(),match_id uuid,created_by uuid,status text,results_object_key text,derivation_version integer,provider text,start_time_seconds numeric,end_time_seconds numeric,billable_seconds integer,initial_top_player_is_player1 boolean,ad_scoring boolean,fixed_camera boolean,external_job_id text,video_object_key text,error_message text,upload_progress_percent numeric,updated_at timestamptz);
 create table match_files(id uuid primary key default gen_random_uuid(),match_id uuid,uploaded_by uuid,provider_id text,file_name text,file_size bigint,storage_path text,status text);
 create table processing_usage(account_id uuid,account_type text,billing_month date,job_id uuid,created_by uuid,reserved_seconds integer,actual_seconds integer,released boolean default false);
 create table match_stats(match_id uuid); create table points(match_id uuid); create table shots(match_id uuid);
 create table program_audit_log(id bigint generated always as identity primary key,program_id uuid,actor_user_id uuid,action text,subject_id uuid,details jsonb,constraint program_audit_log_action_check check(action='program.conference_changed'));
 insert into users(id,is_admin) values ('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);
 insert into programs values ('${id(10)}','active','college'),('${id(11)}','active','club');
 insert into program_members values ('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(3)}','coach');
 insert into program_players values ('${id(4)}','${id(10)}',null,null,null,'Athlete','');
 insert into program_event_entries values ('${id(30)}','${id(10)}','singles',null,ARRAY['${id(4)}'::uuid],ARRAY['Opponent']);
 insert into matches values ('${id(20)}','${id(3)}','${id(10)}','${id(30)}','${id(4)}',null,null,'Athlete','Opponent','{"sets":[[6,4],[7,6]],"winner":1,"tiebreaks":[null,[7,4]]}','Final Score','F','Open','2026-09-15','Singles','{"ad_scoring":true}','Hard',null,'manual',false);
 `);
    // Exact SELECT-only live function snapshot, 2026-09-17 01:18 UTC.
    await db.exec(
      "CREATE OR REPLACE FUNCTION public.reserve_processing_quota(p_job_id uuid, p_account_id uuid, p_account_type text, p_created_by uuid, p_billing_month date, p_seconds integer, p_cap_seconds integer)\n RETURNS TABLE(ok boolean, used_seconds integer, cap_seconds integer)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\ndeclare\n  v_used integer;\nbegin\n  if p_seconds is null or p_seconds <= 0 then\n    raise exception 'reserve_processing_quota: p_seconds must be positive, got %', p_seconds;\n  end if;\n\n  -- Serialize every reservation for this account+month. Transaction-scoped, so\n  -- it releases on commit or rollback without any cleanup path.\n  perform pg_advisory_xact_lock(\n    hashtext(p_account_id::text || ':' || p_billing_month::text)\n  );\n\n  -- A released row is a refund and must not count. Where a job has finished,\n  -- actual_seconds is the truth; until then the reservation stands in for it.\n  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)\n    into v_used\n    from public.processing_usage u\n   where u.account_id = p_account_id\n     and u.billing_month = p_billing_month\n     and u.released = false;\n\n  if v_used + p_seconds > p_cap_seconds then\n    return query select false, v_used, p_cap_seconds;\n    return;\n  end if;\n\n  insert into public.processing_usage\n    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)\n  values\n    (p_account_id, p_account_type, p_billing_month, p_job_id, p_created_by, p_seconds);\n\n  return query select true, v_used + p_seconds, p_cap_seconds;\nend;\n$function$\n",
    );
    for (const name of [
      "20260917000513_persist_admin_upload_submissions.sql",
      "20260917004400_prepare_admin_analysis_attachments.sql",
      "20260917010000_submit_admin_match_files.sql",
      "20260917011813_submit_admin_match_videos.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );

    const role = async (actor, name = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        actor ? id(actor) : "",
      ]);
      if (name !== "owner") await db.exec("set role " + name);
    };
    const refuse = (fn, message) =>
      assert.rejects(fn, (e) => e.message.includes(message));
    const request = {
      playerId: id(4),
      opponentName: "Opponent",
      score: { player1: [6, 7], player2: [4, 6] },
      date: "2026-09-15",
      courtType: "Hard",
      bestOf: 3,
      startSeconds: 10,
      endSeconds: 610,
      initialTopPlayerIsPlayer1: false,
      adScoring: true,
      fixedCamera: false,
    };
    const submit = async (
      actor = 2,
      op = 100,
      match = null,
      fp = null,
      req = request,
      program = 10,
    ) =>
      (
        await db.query(
          "select admin_submit_match_video($1,$2,$3,$4,$5,$6,$7) as data",
          [id(actor), id(op), id(op + 1), id(program), match, fp, req],
        )
      ).rows[0].data;
    const access = async (
      job,
      action = "read",
      actor = 2,
      match = null,
      blob = null,
    ) =>
      (
        await db.query("select admin_video_access($1,$2,$3,$4,$5) as data", [
          id(actor),
          match,
          job,
          action,
          blob,
        ])
      ).rows[0].data;
    await role(2);
    await refuse(() => submit(), "permission denied");
    await role(null, "service_role");
    await refuse(() => submit(3), "admin-required");
    const created = await submit();
    assert.deepEqual(await submit(), created);
    await refuse(() => submit(1), "Operation identity conflict");
    await refuse(
      () => submit(2, 100, null, null, { ...request, endSeconds: 620 }),
      "Item identity conflict",
    );
    const member = await submit(1, 200);
    assert.equal((await access(member.job_id, "read", 1)).programId, id(10));
    assert.equal((await access(created.job_id)).programId, id(10));
    await refuse(() => access(created.job_id, "read", 3), "admin-required");
    await refuse(() => access(created.job_id, "read", 1), "admin-required");
    await refuse(
      () => access(created.job_id, "read", 2, id(20)),
      "video-linkage-mismatch",
    );
    await role(2);
    const preview = (
      await db.query("select admin_get_analysis_attachment($1,$2) as data", [
        id(10),
        id(20),
      ])
    ).rows[0].data;
    await db.query("select admin_prepare_analysis_attachment($1,$2,$3,$4,$5)", [
      id(300),
      id(301),
      id(10),
      id(20),
      preview.fingerprint,
    ]);
    await role(null, "service_role");
    await refuse(
      () => submit(2, 300, id(20), preview.fingerprint, request, 11),
      "Operation identity conflict",
    );
    await refuse(
      () =>
        submit(2, 300, id(20), preview.fingerprint, {
          ...request,
          adScoring: false,
        }),
      "scoring-mismatch",
    );
    const attached = await submit(2, 300, id(20), preview.fingerprint);
    assert.deepEqual(
      await submit(2, 300, id(20), preview.fingerprint),
      attached,
    );
    await access(attached.job_id, "blob", 2, null, "actor/match/video.mp4");
    await role(null, "owner");
    const match = (
      await db.query("select to_jsonb(m) as data from matches m where id=$1", [
        id(20),
      ])
    ).rows[0].data;
    assert.deepEqual(
      { ...match, source_provider: null, analysis_method: "manual" },
      preview.match,
    );
    await refuse(
      () => db.query("update matches set score='{}' where id=$1", [id(20)]),
      "recorded-result-protected",
    );
    await refuse(
      () =>
        db.query(
          "insert into processing_jobs(match_id,created_by,status) values($1,$2,'uploading')",
          [id(20), id(2)],
        ),
      "analysis-already-submitted",
    );
    await refuse(
      () => db.query("insert into match_files(match_id) values($1)", [id(20)]),
      "analysis-already-submitted",
    );
    await db.query(
      "insert into processing_jobs(id,status) values($1,'failed')",
      [id(999)],
    );
    await db.query("delete from processing_jobs where id=$1", [id(999)]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from processing_jobs where id=$1",
          [id(999)],
        )
      ).rows[0].n,
      0,
    );
    await refuse(
      () =>
        db.query(
          "update program_event_entries set opponent_labels=ARRAY['Changed'] where id=$1",
          [id(30)],
        ),
      "recorded-entry-protected",
    );
    await db.exec(
      "grant select,update,delete on processing_jobs to authenticated",
    );
    await role(2);
    await refuse(
      () =>
        db.query("update processing_jobs set created_by=$1 where id=$2", [
          id(1),
          attached.job_id,
        ]),
      "video-job-protected",
    );
    await refuse(
      () =>
        db.query(
          "update processing_jobs set initial_top_player_is_player1=true where id=$1",
          [attached.job_id],
        ),
      "video-job-protected",
    );
    await refuse(
      () =>
        db.query("update processing_jobs set status='queued' where id=$1", [
          attached.job_id,
        ]),
      "video-state-protected",
    );
    await refuse(
      () =>
        db.query("delete from processing_jobs where id=$1", [attached.job_id]),
      "video-job-protected",
    );
    await db.query(
      "update processing_jobs set start_time_seconds=0,end_time_seconds=600,billable_seconds=600,upload_progress_percent=20 where id=$1",
      [attached.job_id],
    );
    await db.query(
      "update processing_jobs set status='uploaded',video_object_key='actor/match/video.mp4',upload_progress_percent=100 where id=$1",
      [attached.job_id],
    );
    await refuse(
      () =>
        db.query(
          "update processing_jobs set start_time_seconds=1 where id=$1",
          [attached.job_id],
        ),
      "invalid-remux-window",
    );
    await role(null, "service_role");
    await access(attached.job_id, "claim");
    const reserve = async (seconds = 600, job = attached.job_id) =>
      (
        await db.query(
          "select * from admin_reserve_video_quota($1,$2,$3,'2026-09-01',270000,7200)",
          [id(2), job, seconds],
        )
      ).rows[0];
    await role(null, "owner");
    await db.query("update program_players set archived_at=now() where id=$1", [
      id(4),
    ]);
    await role(null, "service_role");
    await refuse(() => reserve(), "athlete-ineligible");
    await role(null, "owner");
    await db.query("update program_players set archived_at=null where id=$1", [
      id(4),
    ]);
    await role(null, "service_role");
    await refuse(() => reserve(601), "invalid-video-reservation");
    assert.deepEqual(await reserve(), {
      ok: true,
      used_seconds: 600,
      cap_seconds: 270000,
    });
    await refuse(() => reserve(), "video-quota-already-reserved");

    await refuse(
      () => access(attached.job_id, "claim"),
      "video-already-claimed",
    );
    await refuse(
      () => access(attached.job_id, "upload"),
      "video-not-uploadable",
    );
    await role(null, "owner");
    const usage = (
      await db.query(
        "select account_id,account_type,created_by,reserved_seconds from processing_usage",
      )
    ).rows;
    assert.deepEqual(usage, [
      {
        account_id: id(10),
        account_type: "program",
        created_by: id(2),
        reserved_seconds: 600,
      },
    ]);
    await db.query(
      "update processing_jobs set status='completed' where id=$1",
      [attached.job_id],
    );
    const state = async () =>
      (
        await db.query(
          "select result->>'state' as state from admin_upload_submission_items where operation_id=$1",
          [id(300)],
        )
      ).rows[0].state;
    assert.equal(await state(), "stats_pending");
    await db.query(
      "update processing_jobs set derivation_version=1 where id=$1",
      [attached.job_id],
    );
    assert.equal(await state(), "completed");
    assert.equal(
      (await db.query("select count(*)::int n from processing_jobs")).rows[0].n,
      3,
    );
    assert.equal(
      (await db.query("select count(*)::int n from program_audit_log")).rows[0]
        .n,
      3,
    );
    await db.query(
      "insert into program_players values($1,$2,null,null,null,'Club','Athlete')",
      [id(5), id(11)],
    );
    await role(null, "service_role");
    const club = await submit(
      2,
      400,
      null,
      null,
      { ...request, playerId: id(5) },
      11,
    );
    await role(null, "owner");
    await db.query("update processing_jobs set status='uploaded' where id=$1", [
      club.job_id,
    ]);
    await role(null, "service_role");
    await access(club.job_id, "claim");
    assert.deepEqual(await reserve(600, club.job_id), {
      ok: true,
      used_seconds: 600,
      cap_seconds: 7200,
    });
    await role(null, "owner");
    assert.deepEqual(
      (
        await db.query(
          "select account_id,account_type from processing_usage where job_id=$1",
          [club.job_id],
        )
      ).rows[0],
      { account_id: id(11), account_type: "program" },
    );
    await db.query("update programs set status='claim_pending' where id=$1", [
      id(10),
    ]);
    await role(null, "service_role");
    await refuse(() => access(created.job_id), "program-inactive");
  } finally {
    await db.close();
  }
});
