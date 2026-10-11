import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { matchOutcome, type MatchScore } from "@/lib/data/match-utils";
import { playerSide } from "@/lib/data/player-identity-server";
import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  PRODUCTION_REF,
  SKIP_REASON,
  type Session,
  createAdminClient,
  isProductionTarget,
  runMarker,
} from "./fixtures/live-db";
import { poolLogin } from "./fixtures/live-db-pool";

/**
 * `20261011134127_ask_schema_matches_view.sql`'s restated rules, held to the
 * TypeScript originals row for row against the live database.
 *
 * `ask.matches` states "which side is me" (`ask.my_side`, restating
 * `playerSide()`) and "who won" (`ask.i_won`, restating `scoreWinner()` /
 * `matchOutcome()`) once, in SQL, so the Ask page's model never has to. A
 * rule restated is a rule that can drift; this spec is what stops it. It
 * seeds one account with a match on each side, a legacy match with both
 * player ids null, and matches whose stored `score.winner` contradicts the
 * set count, then asserts the view's `i_won` and `opponent_name` equal what
 * the imported TypeScript functions say for every row.
 *
 * Schema `ask` is deliberately NOT exposed through PostgREST, so supabase-js
 * cannot read the view. The read goes over a direct Postgres connection
 * (`pg`, already a dev dependency) to the same project, as the connection's
 * own user with the request's JWT claims set — the same probe the migration
 * was verified with — and the spec skips when no connection string is given.
 * The seed still goes through the service-role client, so the usual live-DB
 * skip (`HAVE_ENV`: keys present, and never production without the opt-in)
 * applies first; the connection string must name the same project, and is
 * refused for production under the same opt-in.
 *
 * Run on demand:
 *   LIVE_DB_DATABASE_URL=postgresql://… npx playwright test ask-views-parity
 */

/** Read from the process only, never `.env.local` — a connection string is
 *  a per-run choice, like the production opt-in. */
const DB_URL_VAR = "LIVE_DB_DATABASE_URL";
const DB_URL = process.env[DB_URL_VAR];
const PROD_ALLOWED = process.env.LIVE_DB_ALLOW_PROD === "1";

/** A pooler connection string carries the ref in its user name
 *  (`postgres.<ref>`), a direct one in its host. */
function dbUrlIsProduction(url: string): boolean {
  if (isProductionTarget(url)) return true;
  try {
    return new URL(url).username.includes(PRODUCTION_REF);
  } catch {
    return false;
  }
}

const DB_SKIP_REASON = !DB_URL
  ? `${DB_URL_VAR} not set (ask is not exposed through PostgREST; the view is read over a direct connection)`
  : `${DB_URL_VAR} targets the production project; set LIVE_DB_ALLOW_PROD=1 to run against it`;
const HAVE_DB =
  Boolean(DB_URL) && (!dbUrlIsProduction(DB_URL!) || PROD_ALLOWED);

// `pg` ships no typings; the three calls used here are typed by hand so the
// spec typechecks without adding a dependency for one file.
interface PgClient {
  connect(): Promise<void>;
  query<R>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}
const { Client: PgClientCtor } = createRequire(__filename)("pg") as {
  Client: new (opts: { connectionString: string }) => PgClient;
};

const { mark: MARK } = runMarker("ask-parity");

interface SeedMatch {
  label: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string;
  player2_name: string;
  score: MatchScore | null;
}

/** One row per rule branch, with names the assertion can tell apart. */
function seeds(userId: string): SeedMatch[] {
  return [
    {
      label: "player 1, won on sets",
      player1_id: userId,
      player2_id: null,
      player1_name: "Parity Me",
      player2_name: "Parity Opp One",
      score: { player1: [6, 4, 6], player2: [3, 6, 2] },
    },
    {
      label: "player 2, lost on sets",
      player1_id: null,
      player2_id: userId,
      player1_name: "Parity Opp Two",
      player2_name: "Parity Me",
      score: { player1: [6, 6], player2: [4, 3] },
    },
    {
      label: "legacy, both ids null, level sets",
      player1_id: null,
      player2_id: null,
      player1_name: "Parity Me",
      player2_name: "Parity Opp Three",
      score: { player1: [6, 3], player2: [4, 6] },
    },
    {
      label: "player 1, score.winner against the set count",
      player1_id: userId,
      player2_id: null,
      player1_name: "Parity Me",
      player2_name: "Parity Opp Four",
      score: { player1: [1, 0], player2: [6, 3], winner: "player1" },
    },
    {
      label: "player 2, score.winner against the set count",
      player1_id: null,
      player2_id: userId,
      player1_name: "Parity Opp Five",
      player2_name: "Parity Me",
      score: { player1: [6, 6], player2: [2, 1], winner: "player2" },
    },
  ];
}

interface AskMatchRow {
  match_id: string;
  opponent_name: string | null;
  i_won: boolean | null;
}

test.describe("ask.matches parity with playerSide() / matchOutcome() (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);
  test.skip(!HAVE_DB, DB_SKIP_REASON);

  let admin: SupabaseClient;
  let player: Session;
  let db: PgClient;
  /** Seed row → the id the insert gave it, in `seeds()` order. */
  let seededIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();
    player = await poolLogin(admin, "ask-views-parity-player");

    // A crashed run's rows would be counted below as "mine"; sweep them by
    // marker prefix rather than trusting the previous run's afterAll.
    const swept = await admin
      .from("matches")
      .delete()
      .eq("created_by", player.userId)
      .like("tournament_name", "ask-parity-%");
    if (swept.error) throw new Error(`sweep: ${swept.error.message}`);

    const inserted = await admin
      .from("matches")
      .insert(
        seeds(player.userId).map((seed) => ({
          created_by: player.userId,
          program_id: null,
          player1_id: seed.player1_id,
          player2_id: seed.player2_id,
          player1_name: seed.player1_name,
          player2_name: seed.player2_name,
          date: new Date().toISOString(),
          tournament_name: `${MARK} ${seed.label}`,
          score: seed.score,
          source_provider: "swing-vision",
        })),
      )
      .select("id, tournament_name");
    if (inserted.error) throw new Error(`seed: ${inserted.error.message}`);
    const byName = new Map(
      (inserted.data as { id: string; tournament_name: string }[]).map((r) => [
        r.tournament_name,
        r.id,
      ]),
    );
    seededIds = seeds(player.userId).map((seed) => {
      const id = byName.get(`${MARK} ${seed.label}`);
      if (!id) throw new Error(`seed row missing: ${seed.label}`);
      return id;
    });

    db = new PgClientCtor({ connectionString: DB_URL! });
    await db.connect();
    await db.query("set statement_timeout = '15s'");
  });

  test.afterAll(async () => {
    if (seededIds.length > 0) {
      await admin.from("matches").delete().in("id", seededIds);
    }
    await db?.end();
  });

  /** `ask.matches` as the seeded account sees it: the request's JWT claims
   *  set for the transaction, so `auth.uid()` resolves inside the view. */
  async function readAsPlayer(): Promise<AskMatchRow[]> {
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: player.userId, role: "authenticated" }),
      ]);
      const { rows } = await db.query<AskMatchRow>(
        "select match_id, opponent_name, i_won from ask.matches",
      );
      return rows;
    } finally {
      await db.query("rollback");
    }
  }

  test("i_won and opponent_name equal matchOutcome() and the playerSide()-derived opponent for every row", async () => {
    const rows = await readAsPlayer();
    const byId = new Map(rows.map((row) => [row.match_id, row]));

    // The pool user has no claimed roster profile, so its login id is its
    // whole `my_player_ids()` — the same list `playerSide()` is handed.
    const myPlayerIds = [player.userId];

    seeds(player.userId).forEach((seed, index) => {
      const row = byId.get(seededIds[index]);
      expect(row, seed.label).toBeDefined();
      const side = playerSide(
        {
          player1_id: seed.player1_id,
          player2_id: seed.player2_id,
          created_by: player.userId,
        },
        myPlayerIds,
        player.userId,
      );
      expect(side, `${seed.label}: playerSide() must resolve`).not.toBeNull();
      const expectedOpponent =
        side === "player1" ? seed.player2_name : seed.player1_name;
      expect(row!.opponent_name, seed.label).toBe(expectedOpponent);
      expect(row!.i_won, seed.label).toBe(
        matchOutcome(seed.score, side === "player1"),
      );
    });
  });

  test("the view shows exactly the account's personal matches", async () => {
    const rows = await readAsPlayer();
    expect(rows.map((row) => row.match_id).sort()).toEqual(
      [...seededIds].sort(),
    );
  });

  test("authenticated holds nothing in schema ask", async () => {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: player.userId, role: "authenticated" }),
      ]);
      const refused = await db
        .query("select match_id from ask.matches")
        .then(() => null)
        .catch((error: { code?: string }) => error);
      expect(refused?.code).toBe(INSUFFICIENT_PRIVILEGE);
    } finally {
      await db.query("rollback");
    }
  });
});
