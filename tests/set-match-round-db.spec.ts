import { test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * `20260929215610_set_match_round_on_line.sql`, proven against a database that
 * has it applied. Same shape as `detach-match-db.spec.ts`: explicit operator
 * opt-in to the one verified disposable local container, psql over docker,
 * every case inside a transaction that rolls back. Never a host, a connection
 * string or a remote project.
 */
const container = process.env.SET_MATCH_ROUND_LOCAL_CONTAINER;
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
  match = randomUUID(),
  unlinked = randomUUID();

// A real client session carries `request.jwt.claims`, which is what
// `matches_block_client_regraft` reads to decide it is a client. Without it
// the trigger treats the session as trusted and every refusal below would
// pass vacuously.
const actorAs = (user: string) =>
  `set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true); select set_config('request.jwt.claims','{"role":"authenticated","sub":"${user}"}',true);`;
const actor = actorAs(creator);

// A tournament line with a saved outcome on the quarterfinal and the match on
// the semifinal, plus one unlinked program match by the same creator. The
// outcome is what `guard_schedule_result` refuses a match onto, so moving the
// match to 'QF' must fail while 'F' is free.
const setup = `insert into auth.users(id,email) values('${creator}','${creator}@test.invalid'),('${otherStaff}','${otherStaff}@test.invalid');
insert into public.programs(id,school_name) values('${program}','Round fixture');
insert into public.program_members(program_id,user_id,role) values('${program}','${creator}','owner'),('${program}','${otherStaff}','coach');
insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site)
values('${event}','${program}','tournament','Round fixture','2026-09-10','2026-09-11','home');
insert into public.program_event_entries(id,event_id,program_id,discipline) values('${entry}','${event}','${program}','singles');
insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side,actor_user_id) values('${entry}','${event}','${program}','tournament','QF','default','ours','${creator}');
insert into public.matches(id,program_id,created_by,event_entry_id,round,score,tournament_name,match_type) values('${match}','${program}','${creator}','${entry}','SF','{"sets":[[6,0],[6,0]]}','Round fixture','Tournament');
insert into public.matches(id,program_id,created_by,round,score,match_type) values('${unlinked}','${program}','${creator}','SF','{"sets":[[6,2],[6,2]]}','Tournament');`;
const setRound = (round: string, id = match) =>
  `select public.set_match_round_on_line('${id}','${round}');`;
function denied(statement: string, code: string) {
  return `do $$ begin begin ${statement} raise exception 'Expected refusal'; exception when sqlstate '${code}' then null; end; end $$;`;
}
const unchanged = `do $$ begin
  if not exists(select 1 from public.matches where id='${match}' and event_entry_id='${entry}' and round='SF' and tournament_name='Round fixture') then raise exception 'Match changed'; end if;
  if exists(select 1 from public.program_audit_log where subject_id='${match}' and action='match.round_changed') then raise exception 'Audit row written on refusal'; end if;
end $$;`;

test.describe("set the round of a match on its event line (local opt-in only)", () => {
  test.skip(!container, "No verified local container opted in; no writes");
  test.describe.configure({ mode: "serial" });

  test("creator who runs the schedule moves SF → F; only round changes, audit row written", () => {
    sql(`begin; ${setup} ${actor}
      do $$ declare r jsonb; begin
        r := public.set_match_round_on_line('${match}',' F ');
        if r->>'match_id' <> '${match}' or r->>'entry_id' <> '${entry}' or r->>'event_id' <> '${event}' or r->>'event_kind' <> 'tournament' or r->>'event_name' <> 'Round fixture' or r->>'from' <> 'SF' or r->>'round' <> 'F' then raise exception 'Wrong return: %', r; end if;
      end $$; reset role;
      do $$ begin
        if not exists(select 1 from public.matches where id='${match}' and event_entry_id='${entry}' and round='F' and tournament_name='Round fixture' and match_type='Tournament' and program_id='${program}' and created_by='${creator}' and score='{"sets":[[6,0],[6,0]]}'::jsonb) then raise exception 'Round not changed, or more than the round was touched'; end if;
        if (select count(*) from public.program_audit_log where program_id='${program}' and subject_id='${match}' and actor_user_id='${creator}' and action='match.round_changed'
            and details->>'match_id'='${match}' and details->>'entry_id'='${entry}' and details->>'event_id'='${event}' and details->>'from'='SF' and details->>'to'='F') <> 1 then raise exception 'Wrong audit state'; end if;
        if (select count(*) from public.program_event_outcomes where entry_id='${entry}' and round='QF' and kind='default' and side='ours') <> 1 then raise exception 'Outcome touched'; end if;
      end $$; rollback;`);
  });

  test("the same round again is a no-op: no audit row", () => {
    sql(
      `begin; ${setup} ${actor} ${setRound("SF")} reset role; ${unchanged} rollback;`,
    );
  });

  test("a round held by another match on the entry is refused", () => {
    const other = randomUUID();
    sql(
      `begin; ${setup} insert into public.matches(id,program_id,created_by,event_entry_id,round,score,tournament_name,match_type) values('${other}','${program}','${creator}','${entry}','F','{"sets":[[6,3],[6,3]]}','Round fixture','Tournament');
      ${actor} ${denied(setRound("F"), "23514")} reset role; ${unchanged} rollback;`,
    );
  });

  test("a round with a saved outcome is refused by guard_schedule_result", () => {
    sql(
      `begin; ${setup} ${actor} ${denied(setRound("QF"), "23514")} reset role; ${unchanged} rollback;`,
    );
  });

  test("a blank round, a dual line and an unlinked match are refused", () => {
    sql(
      `begin; ${setup} ${actor} ${denied(setRound("  "), "23514")} ${denied(setRound("F", unlinked), "23514")} reset role; ${unchanged} rollback;`,
    );
    const dualEvent = randomUUID(),
      dualEntry = randomUUID(),
      dualMatch = randomUUID();
    sql(`begin; ${setup}
      insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site)
      values('${dualEvent}','${program}','dual','Dual fixture','2026-09-12','2026-09-12','away');
      insert into public.program_event_entries(id,event_id,program_id,discipline,slot) values('${dualEntry}','${dualEvent}','${program}','singles','1');
      insert into public.matches(id,program_id,created_by,event_entry_id,round,score,tournament_name,match_type) values('${dualMatch}','${program}','${creator}','${dualEntry}','S1','{"sets":[[6,1],[6,1]]}','Dual fixture','Dual Match');
      ${actor} ${denied(setRound("S2", dualMatch), "23514")} reset role;
      do $$ begin if not exists(select 1 from public.matches where id='${dualMatch}' and round='S1') then raise exception 'Dual round changed'; end if; end $$;
      rollback;`);
  });

  test("a staff member who did not add the match, and a creator off the schedule, are refused", () => {
    sql(
      `begin; ${setup} ${actorAs(otherStaff)} ${denied(setRound("F"), "42501")} reset role; ${unchanged} rollback;`,
    );
    sql(
      `begin; ${setup} update public.program_members set role='player' where program_id='${program}' and user_id='${creator}'; ${actor} ${denied(setRound("F"), "42501")} reset role; ${unchanged} rollback;`,
    );
  });

  test("anon cannot execute the function at all", () => {
    sql(
      `begin; ${setup} set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true); ${denied(setRound("F"), "42501")} reset role; ${unchanged} rollback;`,
    );
  });

  test("a bare client UPDATE of round on a linked match is refused", () => {
    sql(
      `begin; ${setup} ${actor} ${denied(`update public.matches set round = 'F' where id='${match}';`, "42501")} reset role; ${unchanged} rollback;`,
    );
    // Naming a different match in the marker buys nothing either.
    sql(
      `begin; ${setup} ${actor} select set_config('advantage.round_match_id','${randomUUID()}',true); ${denied(`update public.matches set round = 'F' where id='${match}';`, "42501")} reset role; ${unchanged} rollback;`,
    );
  });

  test("a bare client UPDATE of round on an unlinked match still succeeds", () => {
    // The Edit Match dialog's Details form PATCHes `round` on a match with no
    // line through the user's own client; the trigger now fires on `round`
    // but has nothing to say when the match is not on a line.
    sql(`begin; ${setup} ${actor} update public.matches set round = 'F' where id='${unlinked}'; reset role;
      do $$ begin if not exists(select 1 from public.matches where id='${unlinked}' and round='F' and event_entry_id is null) then raise exception 'Unlinked round not changed'; end if; end $$;
      rollback;`);
  });

  test("attach and detach still pass the round column through the trigger", () => {
    // Attach: no line → a line, sets `round` in the same UPDATE. Detach: a
    // line → no line, clears it. Neither is a change "while on a line".
    sql(`begin; ${setup} ${actor}
      do $$ declare r jsonb; begin
        r := public.set_match_round_on_line('${match}','F');
        r := public.detach_match_from_event_line('${match}');
        if r->>'entry_id' <> '${entry}' then raise exception 'Wrong detach return: %', r; end if;
        update public.matches set round = 'R16' where id='${match}';
        r := public.attach_match_to_event_line('${match}','${entry}');
        if r->>'round' <> 'R16' then raise exception 'Wrong attach return: %', r; end if;
      end $$; reset role;
      do $$ begin if not exists(select 1 from public.matches where id='${match}' and event_entry_id='${entry}' and round='R16') then raise exception 'Re-attach lost the round'; end if; end $$;
      rollback;`);
  });
});
