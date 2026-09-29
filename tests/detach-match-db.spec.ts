import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * `20260929210741_detach_match_from_event_line.sql` and the follow-up that
 * clears `round` on both detaches (`20260929213016_detach_clears_round.sql`), proven
 * against a database that has them applied. Same shape as
 * `schedule-event-delete-db.spec.ts`: explicit operator opt-in to the one
 * verified disposable local container, psql over docker, every case inside a
 * transaction that rolls back. Never a host, a connection string or a remote
 * project.
 */
const container = process.env.DETACH_MATCH_LOCAL_CONTAINER;
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

const creator = randomUUID(),
  otherStaff = randomUUID(),
  program = randomUUID(),
  event = randomUUID(),
  entry = randomUUID(),
  match = randomUUID();

// A real client session carries `request.jwt.claims`, which is what
// `matches_block_client_regraft` reads to decide it is a client. Without it
// the trigger treats the session as trusted and every refusal below would
// pass vacuously.
const actorAs = (user: string) =>
  `set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true); select set_config('request.jwt.claims','{"role":"authenticated","sub":"${user}"}',true);`;
const actor = actorAs(creator);

// A tournament line with a saved outcome on one round and the match on
// another: `guard_schedule_result` refuses a match onto a round that already
// has an outcome (and any dual line with one), so this is the only way a
// line can hold both — and the detach must leave the outcome alone.
const setup = `insert into auth.users(id,email) values('${creator}','${creator}@test.invalid'),('${otherStaff}','${otherStaff}@test.invalid');
insert into public.programs(id,school_name) values('${program}','Detach fixture');
insert into public.program_members(program_id,user_id,role) values('${program}','${creator}','owner'),('${program}','${otherStaff}','coach');
insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site)
values('${event}','${program}','tournament','Detach fixture','2026-09-10','2026-09-11','home');
insert into public.program_event_entries(id,event_id,program_id,discipline) values('${entry}','${event}','${program}','singles');
insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side,actor_user_id) values('${entry}','${event}','${program}','tournament','Final','default','ours','${creator}');
insert into public.matches(id,program_id,created_by,event_entry_id,round,score,tournament_name) values('${match}','${program}','${creator}','${entry}','Semifinal','{"sets":[[6,0],[6,0]]}','Detach fixture');`;
const detach = `select public.detach_match_from_event_line('${match}');`;
function denied(statement: string, code: string) {
  return `do $$ begin begin ${statement} raise exception 'Expected refusal'; exception when sqlstate '${code}' then null; end; end $$;`;
}
const stillAttached = `do $$ begin
  if not exists(select 1 from public.matches where id='${match}' and event_entry_id='${entry}' and tournament_name='Detach fixture') then raise exception 'Match was detached'; end if;
  if exists(select 1 from public.program_audit_log where subject_id='${match}' and action='match.detached') then raise exception 'Audit row written on refusal'; end if;
end $$;`;

test.describe("detach a match from its event line (local opt-in only)", () => {
  test.skip(!container, "No verified local container opted in; no writes");
  test.describe.configure({ mode: "serial" });

  test("creator who runs the schedule detaches; audit row and outcome survive", () => {
    sql(`begin; ${setup} ${actor}
      do $$ declare r jsonb; begin
        r := (${detach.replace(/;$/, "")});
        if r->>'match_id' <> '${match}' or r->>'entry_id' <> '${entry}' or r->>'event_id' <> '${event}' or r->>'event_kind' <> 'tournament' or r->>'event_name' <> 'Detach fixture' then raise exception 'Wrong return: %', r; end if;
      end $$; reset role;
      do $$ begin
        if not exists(select 1 from public.matches where id='${match}' and event_entry_id is null and tournament_name is null and round is null and program_id='${program}' and score='{"sets":[[6,0],[6,0]]}'::jsonb) then raise exception 'Match not detached, or more than the line was touched'; end if;
        if (select count(*) from public.program_audit_log where program_id='${program}' and subject_id='${match}' and actor_user_id='${creator}' and action='match.detached'
            and details->>'match_id'='${match}' and details->>'entry_id'='${entry}' and details->>'event_id'='${event}') <> 1 then raise exception 'Wrong audit state'; end if;
        if (select count(*) from public.program_event_outcomes where entry_id='${entry}' and round='Final' and kind='default' and side='ours') <> 1 then raise exception 'Outcome touched'; end if;
        if not exists(select 1 from public.program_event_entries where id='${entry}') then raise exception 'Entry lost'; end if;
      end $$; rollback;`);
  });

  test("a dual line: round is cleared too, the entry's slot is untouched", () => {
    // `round` on a dual is the singles/doubles slot label ("S1"). It only
    // means something on the line, so the detach clears it for duals exactly
    // as for tournaments; the line keeps its own `slot`.
    const dualEvent = randomUUID(),
      dualEntry = randomUUID(),
      dualMatch = randomUUID();
    sql(`begin; ${setup}
      insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site)
      values('${dualEvent}','${program}','dual','Dual fixture','2026-09-12','2026-09-12','away');
      insert into public.program_event_entries(id,event_id,program_id,discipline,slot) values('${dualEntry}','${dualEvent}','${program}','singles','1');
      insert into public.matches(id,program_id,created_by,event_entry_id,round,score,tournament_name) values('${dualMatch}','${program}','${creator}','${dualEntry}','S1','{"sets":[[6,1],[6,1]]}','Dual fixture');
      ${actor}
      do $$ declare r jsonb; begin
        r := public.detach_match_from_event_line('${dualMatch}');
        if r->>'event_kind' <> 'dual' or r->>'entry_id' <> '${dualEntry}' then raise exception 'Wrong return: %', r; end if;
      end $$; reset role;
      do $$ begin
        if not exists(select 1 from public.matches where id='${dualMatch}' and event_entry_id is null and tournament_name is null and round is null and program_id='${program}' and score='{"sets":[[6,1],[6,1]]}'::jsonb) then raise exception 'Dual match not detached, or more than the line was touched'; end if;
        if not exists(select 1 from public.program_event_entries where id='${dualEntry}' and slot='1' and discipline='singles') then raise exception 'Entry slot touched'; end if;
      end $$; rollback;`);
  });

  test("a second call is refused: the match is no longer on an event", () => {
    sql(
      `begin; ${setup} ${actor} ${detach} ${denied(detach, "23514")} rollback;`,
    );
  });

  test("a staff member who did not add the match is refused", () => {
    sql(
      `begin; ${setup} ${actorAs(otherStaff)} ${denied(detach, "42501")} reset role; ${stillAttached} rollback;`,
    );
  });

  test("the creator is refused once they no longer run the schedule", () => {
    sql(
      `begin; ${setup} update public.program_members set role='player' where program_id='${program}' and user_id='${creator}'; ${actor} ${denied(detach, "42501")} reset role; ${stillAttached} rollback;`,
    );
  });

  test("anon cannot execute the function at all", () => {
    sql(
      `begin; ${setup} set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true); ${denied(detach, "42501")} reset role; ${stillAttached} rollback;`,
    );
  });

  test("a bare client UPDATE off the line is still refused", () => {
    sql(
      `begin; ${setup} ${actor} ${denied(`update public.matches set event_entry_id = null where id='${match}';`, "42501")} reset role; ${stillAttached} rollback;`,
    );
    // Naming a different match in the marker buys nothing either.
    sql(
      `begin; ${setup} ${actor} select set_config('advantage.detach_match_id','${randomUUID()}',true); ${denied(`update public.matches set event_entry_id = null where id='${match}';`, "42501")} reset role; ${stillAttached} rollback;`,
    );
  });

  test("the event-delete detach path from T1 still works alongside", () => {
    sql(`begin; ${setup} delete from public.program_event_outcomes where entry_id='${entry}'; ${actor}
      do $$ begin if (select public.delete_schedule_event('${program}','${event}')) <> '${event}' then raise exception 'Wrong deleted id'; end if; end $$; reset role;
      do $$ begin
        if not exists(select 1 from public.matches where id='${match}' and event_entry_id is null and tournament_name is null and round is null) then raise exception 'Match not detached'; end if;
        if (select details->>'detached_matches' from public.program_audit_log where subject_id='${event}' and action='event.deleted') is distinct from '1' then raise exception 'Wrong detached count'; end if;
      end $$; rollback;`);
  });
});
