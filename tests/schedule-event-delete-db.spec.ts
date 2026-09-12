import { expect, test } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Explicit operator opt-in; never accept a host/connection string or touch a
// remote database. Bootstrap the documented T1/T5/T6 local fixtures first.
const container = process.env.SCHEDULE_DELETE_LOCAL_CONTAINER;
if (container && container !== "supabase_db_advantage-t1-supabase.nVvVfW") {
  throw new Error(
    "Only the verified disposable schedule test container is allowed",
  );
}
const args = [
  "exec",
  "-i",
  container ?? "",
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
function sql(input: string): string {
  return execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function asyncSql(input: string) {
  const child = spawn("docker", args);
  let output = "";
  child.stdout.on("data", (value) => {
    output += value;
  });
  child.stderr.on("data", (value) => {
    output += value;
  });
  child.stdin.end(input);
  return new Promise<{ code: number | null; output: string }>((resolve) =>
    child.on("close", (code) => resolve({ code, output })),
  );
}
const user = randomUUID(),
  program = randomUUID(),
  event = randomUUID(),
  entry = randomUUID();
const actor = `set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`;
const setup = `insert into auth.users(id,email) values('${user}','${user}@test.invalid');
insert into public.programs(id,school_name) values('${program}','Delete fixture');
insert into public.program_members(program_id,user_id,role) values('${program}','${user}','owner');
insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site)
values('${event}','${program}','dual','Delete fixture','2026-09-10','2026-09-10','home');
insert into public.program_event_entries(id,event_id,program_id,discipline) values('${entry}','${event}','${program}','singles');`;
const remove = `select public.delete_schedule_event('${program}','${event}');`;
function denied(statement: string, code: string) {
  return `do $$ begin begin ${statement} raise exception 'Expected refusal'; exception when sqlstate '${code}' then null; end; end $$;`;
}

test.describe("event deletion database boundary (local opt-in only)", () => {
  test.skip(!container, "No verified local container opted in; no writes");
  test.describe.configure({ mode: "serial" });

  test("roles, foreign scope, dependencies, direct deletion and audit", () => {
    for (const role of ["owner", "coach", "staff", "player"]) {
      sql(`begin; ${setup} update public.program_members set role='${role}' where program_id='${program}'; ${actor}
        ${["owner", "coach"].includes(role) ? remove : denied(remove, "42501")}
        reset role;
        do $$ begin
          if (select count(*) from public.program_events where id='${event}') <> ${["owner", "coach"].includes(role) ? 0 : 1} then raise exception 'Wrong deletion state'; end if;
          if (select count(*) from public.program_audit_log where subject_id='${event}' and actor_user_id='${user}' and action='event.deleted') <> ${["owner", "coach"].includes(role) ? 1 : 0} then raise exception 'Wrong audit state'; end if;
        end $$; rollback;`);
    }
    sql(
      `begin; ${setup} ${actor} ${denied(`select public.delete_schedule_event('${randomUUID()}','${event}');`, "42501")} ${denied(`select public.delete_schedule_event('${program}','${randomUUID()}');`, "42501")} rollback;`,
    );
    sql(
      `begin; ${setup} update public.program_members set role='staff' where program_id='${program}'; ${actor} ${denied(`delete from public.program_events where id='${event}';`, "42501")} rollback;`,
    );
    for (const dependency of [
      `insert into public.matches(event_entry_id,score) values('${entry}','{"sets":[[6,0],[6,0]]}');`,
      `update public.program_event_entries set forfeit='ours' where id='${entry}';`,
      `${actor} select public.set_schedule_outcome('${program}','${entry}',null,'default','theirs'); reset role;`,
    ]) {
      sql(`begin; ${setup} ${dependency} ${actor} ${denied(remove, "23514")} ${denied(`delete from public.program_events where id='${event}';`, "23514")} reset role;
        do $$ begin if not exists(select 1 from public.program_event_entries where id='${entry}') then raise exception 'Entry lost'; end if;
        if exists(select 1 from public.program_audit_log where subject_id='${event}') then raise exception 'Refusal audited as deletion'; end if; end $$; rollback;`);
    }
    // The actual CHECK is deliberately made to reject our action within this
    // rolled-back transaction: audit failure must restore event and entry.
    sql(`begin; ${setup} alter table public.program_audit_log add constraint local_audit_failure check(action <> 'event.deleted'); ${actor} ${denied(remove, "23514")} reset role;
      do $$ begin if not exists(select 1 from public.program_event_entries where id='${entry}') then raise exception 'Audit failure lost entry'; end if; end $$; rollback;`);
  });

  test("both race orders preserve dependencies and historical data", async () => {
    test.setTimeout(60_000);
    const history = () =>
      sql(
        `select jsonb_build_object('matches',(select jsonb_agg(m order by id) from public.matches m where id='00000000-0000-4000-8000-000000000004'),'stats',(select jsonb_agg(s order by id) from public.match_stats s),'points',(select jsonb_agg(p order by id) from public.points p),'shots',(select jsonb_agg(s order by id) from public.shots s));`,
      );
    const before = history();
    const waitForSleep = async (tag: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          sql(
            `select count(*) from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep';`,
          ).trim() === "1"
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error(
        "Concurrent transaction did not reach its synchronization point",
      );
    };
    for (const kind of ["match", "outcome", "legacy"]) {
      const dependency =
        kind === "match"
          ? `insert into public.matches(event_entry_id,score) values('${entry}','{}');`
          : kind === "legacy"
            ? `update public.program_event_entries set forfeit='ours' where id='${entry}';`
            : `${actor} select public.set_schedule_outcome('${program}','${entry}',null,'forfeit','ours');`;
      for (const dependencyFirst of [true, false]) {
        sql(setup);
        try {
          const tag = `t6-${randomUUID()}`;
          const first = asyncSql(
            `set application_name='${tag}'; begin; ${dependencyFirst ? dependency : `${actor} ${remove}`} select pg_sleep(2); commit;`,
          );
          await waitForSleep(tag);
          const second = asyncSql(
            `begin; ${dependencyFirst ? `${actor} ${remove}` : dependency} commit;`,
          );
          const [a, b] = await Promise.all([first, second]);
          expect(a.code, a.output).toBe(0);
          // Legacy UPDATE after entry deletion simply affects zero rows.
          if (dependencyFirst || kind !== "legacy")
            expect(b.code, b.output).not.toBe(0);
          expect(
            sql(
              `select count(*) from public.program_events where id='${event}';`,
            ).trim(),
          ).toBe(dependencyFirst ? "1" : "0");
          expect(
            sql(
              `select count(*) from public.matches where event_entry_id='${entry}';`,
            ).trim(),
          ).toBe(dependencyFirst && kind === "match" ? "1" : "0");
        } finally {
          sql(
            `delete from public.program_event_outcomes where event_id='${event}'; delete from public.matches where event_entry_id='${entry}'; delete from public.program_event_entries where id='${entry}'; delete from public.program_events where id='${event}'; delete from public.program_audit_log where program_id='${program}'; delete from public.program_members where program_id='${program}'; delete from public.programs where id='${program}'; delete from auth.users where id='${user}';`,
          );
        }
      }
    }
    expect(history()).toBe(before);
  });
});
