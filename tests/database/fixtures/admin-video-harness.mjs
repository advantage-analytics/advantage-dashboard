import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const id = (n) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
export async function setup(db = new PGlite()) {
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
 create table match_stats(match_id uuid); create table points(id uuid primary key default gen_random_uuid(),match_id uuid); create table shots(point_id uuid references points(id));
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
    "20260919044542_persist_admin_upload_submissions.sql",
    "20260919044622_prepare_admin_analysis_attachments.sql",
    "20260919044716_submit_admin_match_files.sql",
    "20260919044829_submit_admin_match_videos.sql",
    "20260919045156_fix_admin_attachment_shot_lookup.sql",
    "20260927084958_reconcile_admin_submission_items.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );

  return db;
}
