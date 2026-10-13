import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";
import { ASK_MOCK_PLAN } from "@/lib/services/ask/mock";

/**
 * `public.ask_run_query(scope_sql, sql)` — the one door into schema `ask`,
 * and the one place the app runs SQL a language model wrote — proven against
 * the live database through the same path the route uses: supabase-js
 * `rpc()` as a signed-in user, so PostgREST, the role switch and the role's
 * statement timeout are all in the loop.
 *
 * Two pool users, A and B, share a program. A owns two personal matches, B
 * one, and A also filed a match under the shared program. Each match carries
 * a distinct number of points, so a count that leaks a single match is a
 * different number.
 *
 *  1. A's `ask_run_query('select match_id from ask.matches',
 *     'select count(*) from ask.points join scope using (match_id)')` counts
 *     the points of A's two personal matches only — none of B's, none of the
 *     shared program's — and `matches` names exactly those two. B's call
 *     sees B's one.
 *  2. A write (`insert`, `update`, a data-modifying CTE), a two-statement
 *     string (with and without the wrapper's parentheses balanced),
 *     `select * from public.users`, `select pg_sleep(30)` and the switch back
 *     to read-write each come back as an error, with the SQLSTATE the
 *     migration's header predicts; nothing was written.
 *  3. A null or blank argument is refused before anything runs, and an
 *     anonymous client cannot call the function at all.
 *
 * Every row this spec writes names one of its two pool users or carries the
 * run marker, and `beforeAll` sweeps what an interrupted run left behind.
 *
 * Run on demand:  npx playwright test tests/ask-views-rls.spec.ts
 */

const { mark: MARK } = runMarker("ask-rls");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["ask-views-rls-a", "ask-views-rls-b"];

const SCOPE_ALL = "select match_id from ask.matches";
const COUNT_POINTS =
  "select count(*) from ask.points join scope using (match_id)";

/** Postgres SQLSTATEs the migration's probes predict. */
const SYNTAX_ERROR = "42601";
const FEATURE_NOT_SUPPORTED = "0A000";
const READ_ONLY_TRANSACTION = "25006";
const INVALID_CURSOR_DEFINITION = "42P11";
const QUERY_CANCELED = "57014";
const NULL_VALUE_NOT_ALLOWED = "22004";
/** `transaction read-write mode must be set before any query`. */
const ACTIVE_SQL_TRANSACTION = "25001";

/** Points per seeded match: distinct, so a leaked match changes the sum. */
const POINTS = {
  aPersonalOne: 3,
  aPersonalTwo: 4,
  bPersonal: 5,
  aProgram: 6,
} as const;

type AskResult = {
  matches: { match_id: string; opponent_name: string | null }[];
  rows: Record<string, unknown>[];
};
type RpcError = { code?: string; message: string };

test.describe("ask_run_query: scope and guards (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let a: Session;
  let b: Session;
  let programId: string | undefined;
  const matchIds: Partial<Record<keyof typeof POINTS, string>> = {};

  const anon = () =>
    createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const run = (s: SupabaseClient, scopeSql: unknown, sql: unknown) =>
    s.rpc("ask_run_query", {
      scope_sql: scopeSql,
      sql,
    }) as unknown as Promise<{
      data: AskResult | null;
      error: RpcError | null;
    }>;

  /** Delete the users' matches (points cascade), then the program. */
  const sweep = async (userIds: string[]) => {
    if (userIds.length > 0) {
      const gone = await admin
        .from("matches")
        .delete()
        .in("created_by", userIds);
      if (gone.error) throw new Error(`matches sweep: ${gone.error.message}`);
    }
    const programs = await admin
      .from("programs")
      .select("id")
      .like("program_key", "ask-rls-%");
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    const ids = (programs.data as { id: string }[]).map((p) => p.id);
    if (ids.length > 0) {
      await admin.from("program_members").delete().in("program_id", ids);
      const dropped = await admin.from("programs").delete().in("id", ids);
      if (dropped.error)
        throw new Error(`programs sweep: ${dropped.error.message}`);
    }
  };

  const seedMatch = async (
    key: keyof typeof POINTS,
    owner: Session,
    program: string | null,
  ) => {
    const inserted = await admin
      .from("matches")
      .insert({
        created_by: owner.userId,
        program_id: program,
        player1_id: owner.userId,
        player1_name: "Ask RLS Me",
        player2_name: `Ask RLS Opp ${key}`,
        date: new Date().toISOString(),
        tournament_name: `${MARK} ${key}`,
        score: { player1: [6], player2: [4] },
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (inserted.error)
      throw new Error(`seed ${key}: ${inserted.error.message}`);
    const id = (inserted.data as { id: string }).id;
    matchIds[key] = id;

    const points = await admin.from("points").insert(
      Array.from({ length: POINTS[key] }, (_, i) => ({
        match_id: id,
        point_number: i + 1,
        set_number: 1,
        game_number: 1,
        server_is_player1: i % 2 === 0,
        won_by_player1: i % 3 !== 0,
      })),
    );
    if (points.error)
      throw new Error(`seed ${key} points: ${points.error.message}`);
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    await sweep(leftoverIds);

    [a, b] = await poolLogins(admin, SLOTS);
    await sweep([a.userId, b.userId]);

    const program = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-p`,
        school_group: `${MARK}-p`,
        school_name: `Ask RLS Test School ${MARK}`,
        team: "mens",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = (program.data as { id: string }).id;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: a.userId, role: "player" },
      { program_id: programId, user_id: b.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    await seedMatch("aPersonalOne", a, null);
    await seedMatch("aPersonalTwo", a, null);
    await seedMatch("bPersonal", b, null);
    await seedMatch("aProgram", a, programId);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    await sweep([a?.userId, b?.userId].filter((id): id is string => !!id));
  });

  // ── 1. Scope ──────────────────────────────────────────────────────────────

  test("A counts only A's personal points and sees only A's personal matches", async () => {
    const got = await run(a.client, SCOPE_ALL, COUNT_POINTS);
    expect(got.error).toBeNull();
    expect(got.data?.rows).toEqual([
      { count: POINTS.aPersonalOne + POINTS.aPersonalTwo },
    ]);
    expect(got.data?.matches.map((m) => m.match_id).sort()).toEqual(
      [matchIds.aPersonalOne!, matchIds.aPersonalTwo!].sort(),
    );
    // The view's own orientation survives the round trip.
    expect(got.data?.matches.map((m) => m.opponent_name).sort()).toEqual([
      "Ask RLS Opp aPersonalOne",
      "Ask RLS Opp aPersonalTwo",
    ]);
  });

  test("B counts only B's", async () => {
    const got = await run(b.client, SCOPE_ALL, COUNT_POINTS);
    expect(got.error).toBeNull();
    expect(got.data?.rows).toEqual([{ count: POINTS.bPersonal }]);
    expect(got.data?.matches.map((m) => m.match_id)).toEqual([
      matchIds.bPersonal,
    ]);
  });

  // The views once asked auth.uid(), which re-reads request.jwt.claims on
  // every call — and the SQL run through the function can overwrite that
  // setting. One statement read another user's matches (20261013051323's
  // header has the query). The viewer is now pinned and signed before any
  // caller-supplied SQL runs, and nothing in schema ask reads the claims.
  test("SQL that overwrites the request's JWT claims still reads only the caller's rows", async () => {
    const claims = JSON.stringify({ sub: a.userId, role: "authenticated" });
    for (const forged of [
      `select (select set_config('request.jwt.claims', '${claims}', true) is not null) as forged, (select count(*) from ask.matches) as seen`,
      `with f as materialized (select set_config('request.jwt.claims', '${claims}', true) as s) select m.n as seen from f, lateral (select count(*) n from ask.matches where f.s is not null) m`,
    ]) {
      const got = await run(b.client, SCOPE_ALL, forged);
      expect(got.error).toBeNull();
      // B's own one personal match — never A's two.
      expect(got.data?.rows[0]).toMatchObject({ seen: 1 });
    }
  });

  test("SQL that overwrites the pinned viewer reads nothing", async () => {
    for (const forged of [
      `with f as materialized (select set_config('ask.viewer', '${a.userId}', true) as s) select m.n as seen from f, lateral (select count(*) n from ask.matches where f.s is not null) m`,
      `with f as materialized (select set_config('ask.viewer', '${a.userId}', true) as s, set_config('ask.viewer_sig', repeat('0', 64), true) as t) select m.n as seen from f, lateral (select count(*) n from ask.matches where f.s is not null) m`,
    ]) {
      const got = await run(b.client, SCOPE_ALL, forged);
      expect(got.error).toBeNull();
      expect(got.data?.rows[0]).toMatchObject({ seen: 0 });
    }
  });

  test("the public door cannot be called again from inside a query", async () => {
    const got = await run(
      b.client,
      SCOPE_ALL,
      `select public.ask_run_query('select match_id from ask.matches', 'select 1 as x')::text as inner_result`,
    );
    // 42501 is also the door's own "not signed in": the message says which.
    expect(got.error?.code).toBe("42501");
    expect(got.error?.message).toContain("permission denied for function");
  });

  // The door must open onto all four views. ask.match_stats once did not:
  // it read a security_invoker view, so ask_reader was refused on the base
  // table and every statistics question (and the mock plan) failed with
  // 42501 — unnoticed, because nothing had read it through this function.
  test("every ask view can be read through the function", async () => {
    for (const view of ["matches", "match_stats", "points", "shots"]) {
      const got = await run(
        a.client,
        SCOPE_ALL,
        `select count(*) from ask.${view} t join scope using (match_id)`,
      );
      expect(got.error, `ask.${view}`).toBeNull();
      expect(got.data?.rows, `ask.${view}`).toHaveLength(1);
    }
  });

  test("the mock plan runs", async () => {
    const got = await run(a.client, ASK_MOCK_PLAN.scope_sql, ASK_MOCK_PLAN.sql);
    expect(got.error).toBeNull();
    expect(got.data?.rows).toHaveLength(1);
    expect(got.data?.rows[0]).toMatchObject({ matches: 2 });
  });

  test("a narrower scope narrows both matches and rows", async () => {
    const got = await run(
      a.client,
      `select match_id from ask.matches where opponent_name = 'Ask RLS Opp aPersonalTwo'`,
      COUNT_POINTS,
    );
    expect(got.error).toBeNull();
    expect(got.data?.rows).toEqual([{ count: POINTS.aPersonalTwo }]);
    expect(got.data?.matches.map((m) => m.match_id)).toEqual([
      matchIds.aPersonalTwo,
    ]);
  });

  test("a scope naming another user's match id still returns nothing of theirs", async () => {
    const got = await run(
      a.client,
      `select '${matchIds.bPersonal}'::uuid as match_id`,
      COUNT_POINTS,
    );
    expect(got.error).toBeNull();
    expect(got.data?.matches).toEqual([]);
    expect(got.data?.rows).toEqual([{ count: 0 }]);
  });

  // ── 2. Guards ─────────────────────────────────────────────────────────────

  /** The write guards in the order the header lists them: the wrapper's
   *  syntax error, STABLE's per-statement refusal, the read-only transaction,
   *  the role. Any of the four is a refusal; which one fires is recorded by
   *  the migration's live probes, not asserted here. */
  const WRITE_REFUSALS = [
    SYNTAX_ERROR,
    FEATURE_NOT_SUPPORTED,
    READ_ONLY_TRANSACTION,
    INSUFFICIENT_PRIVILEGE,
  ];

  const expectRefused = async (
    label: string,
    sql: string,
    codes: readonly string[],
  ) => {
    const got = await run(a.client, SCOPE_ALL, sql);
    expect(got.data, label).toBeNull();
    expect(got.error, label).not.toBeNull();
    expect(
      codes,
      `${label}: ${got.error?.code} ${got.error?.message}`,
    ).toContain(got.error?.code);
  };

  test("insert, update and a data-modifying CTE are refused and write nothing", async () => {
    await expectRefused(
      "insert",
      `insert into public.matches (created_by) values ('${a.userId}') returning id`,
      WRITE_REFUSALS,
    );
    await expectRefused(
      "update",
      `update public.matches set tournament_name = 'x' where created_by = '${a.userId}' returning id`,
      WRITE_REFUSALS,
    );
    await expectRefused(
      "modifying cte",
      `with gone as (delete from public.matches where created_by = '${a.userId}' returning id) select count(*) from gone`,
      WRITE_REFUSALS,
    );

    const still = await admin
      .from("matches")
      .select("id, tournament_name")
      .eq("created_by", a.userId);
    expect(still.error).toBeNull();
    expect(still.data).toHaveLength(3);
    expect(
      (still.data as { tournament_name: string }[]).every((m) =>
        m.tournament_name.startsWith(MARK),
      ),
    ).toBe(true);
  });

  test("two statements are refused, with or without the wrapper's parentheses balanced", async () => {
    await expectRefused("two statements", "select 1; select 2", [SYNTAX_ERROR]);
    // Balanced against the wrapper, this is two well-formed statements —
    // the cursor refuses the pair before either runs.
    await expectRefused(
      "balanced two statements",
      "select 1) q; select 2 from (select 1",
      [INVALID_CURSOR_DEFINITION],
    );
  });

  test("public.users is permission denied", async () => {
    await expectRefused("public.users", "select * from public.users", [
      INSUFFICIENT_PRIVILEGE,
    ]);
  });

  test("the transaction cannot be switched back to read-write from inside", async () => {
    await expectRefused(
      "read-write switch",
      "select set_config('transaction_read_only', 'off', true)",
      [ACTIVE_SQL_TRANSACTION, FEATURE_NOT_SUPPORTED],
    );
  });

  test("pg_sleep(30) is cancelled by the role's statement timeout", async () => {
    const started = Date.now();
    await expectRefused("pg_sleep", "select pg_sleep(30)", [QUERY_CANCELED]);
    // The role's 8 s, not the 30 s the query asked for.
    expect(Date.now() - started).toBeLessThan(25_000);
  });

  // ── 3. Arguments and callers ──────────────────────────────────────────────

  test("a null or blank argument is refused before anything runs", async () => {
    for (const [scopeSql, sql] of [
      [null, COUNT_POINTS],
      [SCOPE_ALL, null],
      ["   ", COUNT_POINTS],
      [SCOPE_ALL, ""],
    ] as const) {
      const got = await run(a.client, scopeSql, sql);
      expect(got.data).toBeNull();
      expect(got.error?.code, `${scopeSql} / ${sql}`).toBe(
        NULL_VALUE_NOT_ALLOWED,
      );
      expect(got.error?.message).toMatch(/^ask_run_query: /);
    }
  });

  test("an anonymous client cannot call it", async () => {
    const got = await run(anon(), SCOPE_ALL, COUNT_POINTS);
    expect(got.data).toBeNull();
    expect(got.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
