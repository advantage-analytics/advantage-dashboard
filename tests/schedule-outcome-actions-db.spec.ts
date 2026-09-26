import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

// No app credentials are loaded. Opt-in only, hardwired to the isolated local
// fixture. A remote URL fails before even constructing a database command.
const optedIn = process.env.SCHEDULE_OUTCOMES_LOCAL_FIXTURE === "1";
const run = promisify(execFile);
const container = "supabase_db_advantage-t1-supabase.nVvVfW";
async function sql(query: string) {
  if (
    !optedIn ||
    process.env.SCHEDULE_OUTCOMES_DEV_URL !== "http://127.0.0.1:55321"
  )
    throw new Error("Only the explicitly approved local fixture is allowed");
  return (
    await run("docker", [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ])
  ).stdout.trim();
}

test.describe("outcome SQL authorization and serialization", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !optedIn,
    "Local fixture not explicitly enabled; no database access",
  );
  const program = randomUUID(),
    other = randomUUID(),
    dual = randomUUID(),
    tournament = randomUUID();
  const entry = randomUUID(),
    tourEntry = randomUUID(),
    otherEntry = randomUUID(),
    otherEvent = randomUUID();
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let history = "";
  const asUser = (user: string, query: string) =>
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true); ${query}; commit;`;
  const rpc = (
    line = entry,
    round = "null",
    kind = "'default'",
    side = "'ours'",
    active = program,
  ) =>
    `select public.set_schedule_outcome('${active}','${line}',${round},${kind},${side})`;
  const outcome = (line = entry, event = dual, kind = "dual", round = "null") =>
    `insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side,actor_user_id) values('${line}','${event}','${program}','${kind}',${round},'default','ours','${users[0]}')`;
  const match = (line = entry, round = "'S1'") =>
    `insert into public.matches(event_entry_id,round) values('${line}',${round})`;
  const snapshot =
    "select jsonb_build_object('entry',(select to_jsonb(e) from public.program_event_entries e where id='00000000-0000-4000-8000-000000000003'),'match',(select to_jsonb(m) from public.matches m where id='00000000-0000-4000-8000-000000000004'))";

  test.beforeAll(async () => {
    history = await sql(snapshot);
    await sql(`begin;
      insert into auth.users(id,email) values ${users.map((id) => `('${id}','${id}@local.test')`).join(",")};
      insert into public.programs(id,school_name) values('${program}','T5'),('${other}','T5 other');
      insert into public.program_members(program_id,user_id,role) values ${users.map((id, i) => `('${program}','${id}','${["owner", "coach", "staff", "player"][i]}')`).join(",")};
      insert into public.program_events(id,program_id,kind,name,starts_on,ends_on,site) values('${dual}','${program}','dual','T5','2026-09-10','2026-09-10','home'),('${tournament}','${program}','tournament','T5 tournament','2026-09-10','2026-09-10','home'),('${otherEvent}','${other}','dual','Other','2026-09-10','2026-09-10','home');
      insert into public.program_event_entries(id,event_id,program_id,discipline,slot) values('${entry}','${dual}','${program}','singles','S1'),('${tourEntry}','${tournament}','${program}','singles',null),('${otherEntry}','${otherEvent}','${other}','singles','S1'); commit;`);
  });
  test.afterEach(async () => {
    await sql(
      `delete from public.program_event_outcomes where program_id='${program}'; delete from public.matches where event_entry_id in ('${entry}','${tourEntry}'); update public.program_event_entries set forfeit=null where program_id='${program}';`,
    );
  });
  test.afterAll(async () => {
    await sql(
      `delete from public.program_event_outcomes where program_id='${program}'; delete from public.matches where event_entry_id in ('${entry}','${tourEntry}'); delete from public.program_event_entries where program_id in ('${program}','${other}'); delete from public.program_events where program_id in ('${program}','${other}'); delete from public.program_members where program_id='${program}'; delete from public.programs where id in ('${program}','${other}'); delete from auth.users where id in (${users.map((id) => `'${id}'`).join(",")});`,
    );
    expect(await sql(snapshot), "Historical sentinel changed").toBe(history);
  });

  test("staff set/clear; players and cross-program callers cannot mutate", async () => {
    for (const user of users.slice(0, 3)) {
      await sql(asUser(user, rpc()));
      await expect(
        sql(asUser(user, rpc(entry, "null", "'withdrawal'", "'theirs'"))),
      ).rejects.toThrow(/Clear the saved/);
      await sql(asUser(user, rpc(entry, "null", "null", "null")));
    }
    await expect(sql(asUser(users[3], rpc()))).rejects.toThrow(
      /Only program staff/,
    );
    await expect(sql(asUser(users[0], rpc(otherEntry)))).rejects.toThrow(
      /unavailable/,
    );
    await expect(
      sql(
        asUser(users[0], rpc(otherEntry, "null", "'default'", "'ours'", other)),
      ),
    ).rejects.toThrow(/Only program staff/);
    expect(
      await sql(
        `select count(*) from public.program_event_outcomes where program_id='${program}'`,
      ),
    ).toBe("0");
  });

  test("played conflict, round isolation, clear then score, and legacy protection", async () => {
    await sql(match());
    await expect(sql(asUser(users[0], rpc()))).rejects.toThrow(
      /already has a match/,
    );
    await sql(
      `delete from public.matches where event_entry_id='${entry}'; update public.program_event_entries set forfeit='ours' where id='${entry}'`,
    );
    await expect(sql(asUser(users[0], rpc()))).rejects.toThrow(
      /Clear the saved/,
    );
    await expect(
      sql(
        `update public.program_event_entries set forfeit='theirs' where id='${entry}'`,
      ),
    ).rejects.toThrow(/Clear the saved/);
    await sql(asUser(users[0], rpc(entry, "null", "null", "null")));
    await sql(asUser(users[0], rpc()));
    await expect(sql(match(entry, "'forged-round'"))).rejects.toThrow(
      /Clear the saved/,
    );
    await sql(asUser(users[0], rpc(entry, "null", "null", "null")));
    await sql(match());
    await sql(asUser(users[0], rpc(tourEntry, "'QF'")));
    await sql(match(tourEntry, "'SF'"));
    await expect(sql(match(tourEntry, "'QF'"))).rejects.toThrow(
      /Clear the saved/,
    );
    await sql(
      `update public.program_event_entries set forfeit='ours' where id='${otherEntry}'`,
    );
  });

  test("historical analysis updates and tournament legacy clearing remain available", async () => {
    await sql(
      "begin; update public.matches set insights=insights where id='00000000-0000-4000-8000-000000000004'; rollback;",
    );
    await sql(
      `update public.program_event_entries set forfeit='ours' where id='${tourEntry}'`,
    );
    await sql(asUser(users[0], rpc(tourEntry, "null", "null", "null")));
    await sql(match(tourEntry, "'QF'"));
  });

  for (const first of ["outcome", "match", "legacy"] as const) {
    for (const isolation of ["read committed", "repeatable read"]) {
      test(`${first} wins a deterministic two-connection ${isolation} race`, async () => {
        const label = `t5-${randomUUID()}`;
        const firstWrite =
          first === "outcome"
            ? outcome()
            : first === "match"
              ? match()
              : `update public.program_event_entries set forfeit='ours' where id='${entry}'`;
        const pending = sql(
          `begin; set local application_name='${label}'; ${firstWrite}; select pg_sleep(3); commit;`,
        );
        // Wait for the first transaction's mutation, not a timing guess.
        await expect
          .poll(async () =>
            sql(
              `select count(*) from pg_stat_activity where application_name='${label}' and wait_event='PgSleep'`,
            ),
          )
          .toBe("1");
        const secondWrite = first === "match" ? outcome() : match();
        await expect(
          sql(`begin isolation level ${isolation}; ${secondWrite}; commit;`),
        ).rejects.toThrow(
          /Clear the saved|already has a match|could not serialize/,
        );
        await pending;
        expect(
          await sql(
            `select (select count(*) from public.matches where event_entry_id='${entry}') + (select count(*) from public.program_event_outcomes where entry_id='${entry}') + (select count(*) from public.program_event_entries where id='${entry}' and forfeit is not null)`,
          ),
        ).toBe("1");
      });
    }
  }
});
