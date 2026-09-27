import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import pg from "pg";

// An explicit loopback-only opt-in: never load the application's .env.local.
export async function postgresHarness() {
  const connectionString = process.env.ADMIN_UPLOADS_TEST_DATABASE_URL;
  assert.ok(
    connectionString,
    "Set ADMIN_UPLOADS_TEST_DATABASE_URL to a disposable local PostgreSQL cluster",
  );
  const url = new URL(connectionString);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Only loopback PostgreSQL is allowed",
  );
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const name = `admin_uploads_test_${randomUUID().replaceAll("-", "")}`;
  const clients = [];
  try {
    // Roles are cluster-wide; fixture databases are private and dropped below.
    for (const role of ["anon", "authenticated", "service_role"])
      await admin.query(
        `DO $$ BEGIN CREATE ROLE ${role} ${role === "service_role" ? "BYPASSRLS" : ""}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    await admin.query(`CREATE DATABASE ${name}`);
    url.pathname = `/${name}`;
    const connect = async () => {
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      clients.push(client);
      await client.query("SET statement_timeout='15s'");
      return {
        query: (sql, args) => client.query(sql, args),
        // Shared PGlite fixtures create these same cluster roles; only remove
        // those fixture statements. Migration SQL runs byte-for-byte unchanged.
        exec: (sql) =>
          client.query(
            sql.replace(/create role (anon|authenticated|service_role);/gi, ""),
          ),
        close: () => client.end(),
      };
    };
    return {
      db: await connect(),
      connect,
      async close() {
        await Promise.all(clients.map((client) => client.end()));
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
        await admin.end();
      },
    };
  } catch (error) {
    await Promise.all(clients.map((client) => client.end()));
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
    throw error;
  }
}

export async function role(db, actor, name = "service_role") {
  assert.ok(["service_role", "authenticated", "anon", "owner"].includes(name));
  await db.query("RESET ROLE");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [
      actor ?? "",
      JSON.stringify({ role: name, ...(actor ? { sub: actor } : {}) }),
    ],
  );
  if (name !== "owner") await db.query(`SET ROLE ${name}`);
}

// Prove overlap using the server's wait graph, not elapsed time or Promise.all
// alone. The first write remains uncommitted until the second is waiting on it.
export async function overlapping(
  first,
  second,
  observer,
  writeFirst,
  writeSecond,
  commit = true,
) {
  const a = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
  const b = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
  assert.notEqual(a, b);
  await first.query("BEGIN");
  let pending;
  try {
    const winner = await writeFirst();
    pending = writeSecond().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await observer.query(
        "select $1::int=any(pg_blocking_pids($2)) blocked",
        [a, b],
      );
      if (state.rows[0].blocked) {
        blocked = true;
        break;
      }
      await setTimeout(20);
    }
    assert.ok(
      blocked,
      "Second independent session must block on the first transaction",
    );
    await first.query(commit ? "COMMIT" : "ROLLBACK");
    return { winner, loser: await pending };
  } catch (error) {
    await first.query("ROLLBACK");
    if (pending) await pending;
    throw error;
  }
}
