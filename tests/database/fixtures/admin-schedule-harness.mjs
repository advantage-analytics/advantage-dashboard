import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const id = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = "20260919045015_save_admin_dual_results.sql";
export async function setup(extraMigrations = [], db = new PGlite()) {
  await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema schedule_private;
 create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth to authenticated,anon,service_role;
 create table users(id uuid primary key,is_admin boolean,first_name text,last_name text);
 create function is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.users where id=auth.uid()),false) $$;
 create table programs(id uuid primary key,status text,program_key text);
 create table program_members(program_id uuid,user_id uuid,role text);
 create table program_players(id uuid primary key,program_id uuid,claimed_by_user_id uuid,archived_at timestamptz,merged_into_id uuid,first_name text,last_name text);
 create table program_events(id uuid primary key default gen_random_uuid(),program_id uuid,kind text,name text,starts_on date,ends_on date,starts_at_time time,site text,surface text,host text,format jsonb,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),unique(id,program_id,kind),check(kind in ('dual','tournament')),check(ends_on>=starts_on),check(site in ('home','away','neutral')));
 create table program_event_entries(id uuid primary key default gen_random_uuid(),event_id uuid references program_events(id),program_id uuid,discipline text,slot text,position integer,draw text,seed integer check(seed>0),player_user_ids uuid[],player_labels text[],opponent_labels text[],opponent_school text,opponent_program_id uuid,forfeit text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(id,event_id,program_id),unique(event_id,slot));
 create table program_event_outcomes(id uuid primary key default gen_random_uuid(),entry_id uuid,event_id uuid,program_id uuid,event_kind text,round text,kind text,side text,actor_user_id uuid not null default auth.uid(),recorded_at timestamptz default now(),foreign key(entry_id,event_id,program_id) references program_event_entries(id,event_id,program_id),foreign key(event_id,program_id,event_kind) references program_events(id,program_id,kind));
 alter table program_event_outcomes add constraint outcome_round_check check ((event_kind='dual' and round is null) or (event_kind='tournament' and round in ('Q1','Q2','Q3','R128','R64','R32','R16','QF','SF','F','C1','C2','C3') and round is not null));
 create unique index outcomes_tournament_unique on program_event_outcomes(entry_id,round) where round is not null;
 create unique index outcomes_dual_unique on program_event_outcomes(entry_id) where round is null;
 create table matches(id uuid primary key default gen_random_uuid(),created_by uuid,program_id uuid,event_entry_id uuid references program_event_entries(id),player1_id uuid,player1_name text,player2_name text,tournament_name text,round text,date timestamptz,match_type text,court_type text,format jsonb,score jsonb,result text,source_provider text,analysis_method text,private boolean);
 create table processing_jobs(id uuid primary key,match_id uuid,created_by uuid);
 create table match_files(id uuid primary key,match_id uuid,uploaded_by uuid);
 -- Never written here: 20260927084958 (T21) declares row variables of these two
 -- types, and PL/pgSQL resolves them when the function is created.
 create table admin_video_attempts(operation_id uuid,item_id uuid,match_id uuid,job_id uuid,request jsonb,primary key(operation_id,item_id));
 create table admin_file_attempts(operation_id uuid,item_id uuid,match_id uuid,file_id uuid,request jsonb,state text,claim_token uuid,error_code text,started_at timestamptz,completed_at timestamptz,primary key(operation_id,item_id));
 create table program_audit_log(id bigint generated always as identity primary key,program_id uuid,actor_user_id uuid,action text,subject_id uuid,details jsonb,constraint program_audit_log_action_check check(action='program.conference_changed'));
 create function user_program_ids() returns setof uuid language sql stable security definer set search_path='' as $$ select program_id from public.program_members where user_id=auth.uid() $$;
 create function can_manage_program_schedule(p uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.program_members where program_id=p and user_id=auth.uid() and role in ('owner','coach','staff')) $$;
 create function match_is_upload_shaped(p text,m text) returns boolean language sql immutable as $$ select p is not null or m is distinct from 'manual' $$;
 create function upload_eligibility_refusal(uuid,uuid,uuid,uuid) returns text language sql as $$ select 'upload-not-supported-in-fixture'::text $$;
 insert into users values('${id(1)}',true,'Member','Admin'),('${id(2)}',true,'Nonmember','Admin'),('${id(3)}',false,'Coach','');
 insert into programs values('${id(10)}','active','target'),('${id(11)}','active','other');
 insert into program_members values('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(3)}','coach');
 grant select,insert,update,delete on program_events,program_event_entries,program_event_outcomes,matches to authenticated;
 `);
  for (let n = 0; n < 6; n++)
    await db.query(
      "insert into program_players values($1,$2,null,null,null,$3,'Athlete')",
      [id(20 + n), id(10), `Player${n + 1}`],
    );
  await db.exec(
    await readFile(
      new URL("./admin-dual-live-guards.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const name of [
    "20260919044542_persist_admin_upload_submissions.sql",
    migration,
    ...extraMigrations,
  ])
    await db.exec(
      await readFile(
        new URL("../../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const role = async (actor = 2, name = "service_role") => {
    await db.exec("reset role");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [
        actor ? id(actor) : "",
        JSON.stringify({ role: name, ...(actor ? { sub: id(actor) } : {}) }),
      ],
    );
    if (name !== "owner") await db.exec("set role " + name);
  };
  const prepare = async (request, actor = 2, program = 10) =>
    (
      await db.query("select admin_prepare_dual_results($1,$2,$3,$4) as data", [
        id(actor),
        request.operationId,
        id(program),
        request,
      ])
    ).rows[0].data;
  const apply = async (op, item, actor = 2) =>
    (
      await db.query("select admin_apply_dual_result($1,$2,$3) as data", [
        id(actor),
        id(op),
        id(item),
      ])
    ).rows[0].data;
  const status = async (op, actor = 2) =>
    (
      await db.query("select admin_dual_result_status($1,$2) as data", [
        id(actor),
        id(op),
      ])
    ).rows[0].data;
  const context = async (event, program = 10, actor = 2) =>
    (
      await db.query("select admin_get_dual_result_context($1,$2,$3) as data", [
        id(actor),
        id(program),
        event,
      ])
    ).rows[0].data;
  const owner = async (sql, args = []) => {
    await role(null, "owner");
    return db.query(sql, args);
  };
  return { db, role, prepare, apply, status, context, owner };
}
