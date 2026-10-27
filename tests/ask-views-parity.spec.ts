import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { youAreAtLowEnd } from "@/components/dashboard/matches/match-detail/film/film-court";
import type { MatchShot } from "@/lib/data/match-points-server";
import { matchOutcome, type MatchScore } from "@/lib/data/match-utils";
import { playerSide } from "@/lib/data/player-identity-server";
import { REAL_HALF_SINGLES, REAL_NET_Y } from "@/lib/data/serve-zones";
import { DEFAULT_BANDS, makeDepthBucketer } from "@/lib/data/viz-bands";
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
 * `20261011193659_ask_stats_points_shots_views.sql` applies the same side
 * rule to statistics, points and shots. The player-1 and player-2 seeds also
 * get a `match_stats` row per side and a handful of `points`, and the spec
 * asserts that `ask.match_stats`'s `side = 'me'` row is the `match_stats`
 * row whose `is_player1` matches `playerSide()`, and that `ask.points`'s
 * `i_served` / `i_won` are `server_is_player1` / `won_by_player1` turned by
 * the same side. `ask.shots` has no seed here: its `mine` is the one-line
 * rule the points case already pins, on `shots.is_player1`.
 *
 * `20261015090038_ask_point_facts.sql` precomputes one row per point
 * (`public.ask_point_facts`, written by statement triggers on `points` and
 * `shots`) and turns it to the viewer in `ask.point_plays`. The seeded
 * points reach that table through the trigger alone, so the last case holds
 * `ask.point_plays` to `ask.points` row for row — same `i_served`, `i_won`,
 * `court` and per-set `game_number` — and expects `has_shots` false, since
 * no shot is seeded on those two matches.
 *
 * `20261027032924_ask_shot_positions.sql` turns `ask.shots`' court positions
 * to the player by voting each point's end the way the film court does. The
 * fourth seed gets two points of shots, one from each end, stored in the
 * world frame (`POSITION_POINTS`), and the spec holds the view's positions to
 * `youAreAtLowEnd()` + the 180° turn from `film-court.ts`, and checks the
 * dropped landings, `landing_pinned`, `landing_section` and `has_coords`.
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

/** Seed indices that get statistics and points: the player-1 and player-2
 *  matches, one on each side of `is_player1`. */
const STATS_SEEDS = [0, 1] as const;

/** The counters the stats case compares; chosen so one side's row cannot
 *  be mistaken for the other's (every counter differs between the two). */
const STAT_COLUMNS = [
  "aces",
  "double_faults",
  "winners",
  "unforced_errors",
  "first_serves",
  "first_serves_in",
  "first_serve_points_won",
  "total_points",
  "total_points_won",
] as const;
type StatColumn = (typeof STAT_COLUMNS)[number];
type StatCounters = Record<StatColumn, number>;

/** One `match_stats` row per side, every counter distinct across sides. */
function statsSeed(
  matchId: string,
  isPlayer1: boolean,
): StatCounters & { match_id: string; is_player1: boolean } {
  const base = isPlayer1 ? 10 : 50;
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    aces: base + 1,
    double_faults: base + 2,
    winners: base + 3,
    unforced_errors: base + 4,
    first_serves: base + 20,
    first_serves_in: base + 15,
    first_serve_points_won: base + 9,
    total_points: base + 40,
    total_points_won: base + 25,
  };
}

interface PointSeed {
  match_id: string;
  point_number: number;
  set_number: number;
  game_number: number;
  server_is_player1: boolean;
  won_by_player1: boolean;
}

/** Six points across two sets with `game_number` counted through the match
 *  (set 2 starts at game 3), as the derivation engine stores it; server and
 *  winner alternate on different periods so no single flip passes both. */
function pointsSeed(matchId: string): PointSeed[] {
  return [1, 2, 3, 4, 5, 6].map((n) => ({
    match_id: matchId,
    point_number: n,
    set_number: n <= 4 ? 1 : 2,
    game_number: n <= 2 ? 1 : n <= 4 ? 2 : 3,
    server_is_player1: n % 2 === 1,
    won_by_player1: n % 3 !== 0,
  }));
}

/** The seed that gets shots: player 1 (score.winner against the set count). */
const POSITION_SEED = 3;

interface ShotSeed {
  shot_number: number;
  is_player1: boolean;
  shot_type: string;
  zone: string | null;
  result: "In" | "Out" | "Net";
  contact_x: number;
  contact_y: number;
  landing_x: number;
  landing_y: number;
  /** What the view must answer, beyond the turned positions. */
  expect: {
    landingDropped: boolean;
    pinned: boolean | null;
    section: string | null;
  };
}

/**
 * Two points in the stored world frame, player 1 = the viewer. Point 1 has
 * the viewer at the y = 0 end, point 2 at the other (an end change), so a
 * view that forgot to turn, or turned y alone, fails on point 2.
 */
const POSITION_POINTS: { point_number: number; shots: ShotSeed[] }[] = [
  {
    point_number: 1,
    shots: [
      {
        shot_number: 1,
        is_player1: true,
        shot_type: "First Serve",
        zone: "T",
        result: "In",
        contact_x: 0.5,
        contact_y: -0.5,
        landing_x: -1.5,
        landing_y: 17.5,
        expect: { landingDropped: false, pinned: false, section: "T" },
      },
      {
        shot_number: 2,
        is_player1: false,
        shot_type: "Forehand",
        zone: "Crosscourt",
        result: "In",
        contact_x: 2,
        contact_y: 24,
        landing_x: 3,
        landing_y: 2,
        expect: { landingDropped: false, pinned: false, section: "Deep Right" },
      },
      {
        // Netted: its recorded bounce is no position.
        shot_number: 3,
        is_player1: true,
        shot_type: "Backhand",
        zone: "Down the Line",
        result: "Net",
        contact_x: -1,
        contact_y: 1,
        landing_x: -0.5,
        landing_y: 11,
        expect: { landingDropped: true, pinned: null, section: null },
      },
    ],
  },
  {
    point_number: 2,
    shots: [
      {
        // A SwingVision fault set on the service line.
        shot_number: 1,
        is_player1: true,
        shot_type: "First Serve",
        zone: "Wide",
        result: "Out",
        contact_x: -0.4,
        contact_y: 24.2,
        landing_x: 0.8,
        landing_y: 5.49,
        expect: { landingDropped: false, pinned: true, section: null },
      },
      {
        shot_number: 2,
        is_player1: false,
        shot_type: "Backhand",
        zone: "Middle",
        result: "In",
        contact_x: 1,
        contact_y: -1,
        landing_x: 0.5,
        landing_y: 15,
        expect: {
          landingDropped: false,
          pinned: false,
          section: "Short Middle",
        },
      },
      {
        shot_number: 3,
        is_player1: true,
        shot_type: "Forehand",
        zone: "Crosscourt",
        result: "In",
        contact_x: 0.3,
        contact_y: 23,
        landing_x: 3.5,
        landing_y: 3,
        expect: { landingDropped: false, pinned: false, section: "Deep Left" },
      },
      {
        // In, but bounced on the hitter's own half: the tracker's error.
        shot_number: 4,
        is_player1: false,
        shot_type: "Volley",
        zone: "Middle",
        result: "In",
        contact_x: 0.2,
        contact_y: 9,
        landing_x: 0.4,
        landing_y: 8,
        expect: { landingDropped: true, pinned: null, section: null },
      },
    ],
  },
];

/** The point's end by the film court's rule; true = the viewer at y = 0. */
function pointLowEnd(point: (typeof POSITION_POINTS)[number]): boolean | null {
  return youAreAtLowEnd(
    point.shots.map(
      (shot) =>
        ({
          isPlayer1: shot.is_player1,
          result: shot.result,
          contactY: shot.contact_y,
          landingY: shot.landing_y,
        }) as MatchShot,
    ),
    true,
  );
}

/** A stored position turned to the player, as film-court.ts turns a point. */
function turned(low: boolean, x: number, y: number): { x: number; y: number } {
  return low ? { x, y } : { x: -x, y: 23.77 - y };
}

/** Index 0 is Deep, as `makeDepthBucketer` orders the default thirds. */
const DEPTH_BAND_NAMES = ["Deep", "Mid", "Short"] as const;
const depthBand = makeDepthBucketer(DEFAULT_BANDS);

/**
 * `landing_section` as the TypeScript rules name it: a serve keeps its zone;
 * any other in-play ball gets the Visualizations tab's default depth band
 * (`makeDepthBucketer(DEFAULT_BANDS)`) and a third of the singles width. The
 * view restates both in SQL; this is what holds the restatement to them.
 */
function sectionByTsRules(shot: ShotSeed, low: boolean): string | null {
  if (shot.result !== "In" || shot.expect.landingDropped) return null;
  if (/serve/i.test(shot.shot_type)) return shot.zone;
  const landing = turned(low, shot.landing_x, shot.landing_y);
  const depth = DEPTH_BAND_NAMES[depthBand(Math.abs(landing.y - REAL_NET_Y))];
  const lane =
    Math.abs(landing.x) < REAL_HALF_SINGLES / 3
      ? "Middle"
      : landing.x > 0
        ? "Right"
        : "Left";
  return `${depth} ${lane}`;
}

test("the position seeds' expected sections are what the TypeScript band and lane rules name", () => {
  for (const point of POSITION_POINTS) {
    const low = pointLowEnd(point);
    expect(low, `point ${point.point_number}`).not.toBeNull();
    for (const shot of point.shots) {
      expect(
        shot.expect.section,
        `point ${point.point_number} shot ${shot.shot_number}`,
      ).toBe(sectionByTsRules(shot, low!));
    }
  }
});

interface AskShotPositionRow {
  point_number: number;
  shot_number: number;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  landing_pinned: boolean | null;
  landing_section: string | null;
}

type AskStatsRow = { match_id: string; side: "me" | "opponent" } & Record<
  StatColumn,
  number
> & { first_serve_pct: string | null };

interface AskPointRow {
  match_id: string;
  set_number: number;
  game_number: number;
  point_number: number;
  i_served: boolean;
  i_won: boolean;
}

/** `ask.point_plays` beside the same point's `ask.points` row. */
interface AskPointPlaysRow {
  match_id: string;
  point_number: number;
  i_served: boolean;
  i_won: boolean;
  court: string;
  game_number: number;
  has_shots: boolean;
  points_i_served: boolean;
  points_i_won: boolean;
  points_court: string;
  points_game_number: number;
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

    // Statistics and points for the two sided matches. Both tables cascade
    // from `matches`, so the sweep and afterAll above clean these up too.
    const stats = await admin
      .from("match_stats")
      .insert(
        STATS_SEEDS.flatMap((index) => [
          statsSeed(seededIds[index], true),
          statsSeed(seededIds[index], false),
        ]),
      );
    if (stats.error) throw new Error(`seed stats: ${stats.error.message}`);
    const points = await admin
      .from("points")
      .insert(STATS_SEEDS.flatMap((index) => pointsSeed(seededIds[index])));
    if (points.error) throw new Error(`seed points: ${points.error.message}`);

    // Shots for the positions case, on a match the point_plays case ignores.
    const positionPoints = await admin
      .from("points")
      .insert(
        POSITION_POINTS.map((point) => ({
          match_id: seededIds[POSITION_SEED],
          point_number: point.point_number,
          set_number: 1,
          game_number: point.point_number,
          server_is_player1: true,
          won_by_player1: true,
        })),
      )
      .select("id, point_number");
    if (positionPoints.error) {
      throw new Error(`seed position points: ${positionPoints.error.message}`);
    }
    const pointIds = new Map(
      (positionPoints.data as { id: string; point_number: number }[]).map(
        (row) => [row.point_number, row.id],
      ),
    );
    const shots = await admin.from("shots").insert(
      POSITION_POINTS.flatMap((point) =>
        point.shots.map(({ expect: _expect, ...shot }) => ({
          ...shot,
          point_id: pointIds.get(point.point_number),
        })),
      ),
    );
    if (shots.error) throw new Error(`seed shots: ${shots.error.message}`);

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

  /** A query over schema `ask` as the seeded account sees it: the request's
   *  JWT claims set for the transaction, so `auth.uid()` resolves inside
   *  the views. */
  async function readAsPlayer<R>(
    sql: string,
    values?: unknown[],
  ): Promise<R[]> {
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: player.userId, role: "authenticated" }),
      ]);
      const { rows } = await db.query<R>(sql, values);
      return rows;
    } finally {
      await db.query("rollback");
    }
  }

  function readMatches(): Promise<AskMatchRow[]> {
    return readAsPlayer<AskMatchRow>(
      "select match_id, opponent_name, i_won from ask.matches",
    );
  }

  /** The side `playerSide()` gives a seed, which the sided seeds always have. */
  function seedSide(index: number): "player1" | "player2" {
    const seed = seeds(player.userId)[index];
    const side = playerSide(
      {
        player1_id: seed.player1_id,
        player2_id: seed.player2_id,
        created_by: player.userId,
      },
      [player.userId],
      player.userId,
    );
    if (!side) throw new Error(`${seed.label}: playerSide() must resolve`);
    return side;
  }

  test("i_won and opponent_name equal matchOutcome() and the playerSide()-derived opponent for every row", async () => {
    const rows = await readMatches();
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
    const rows = await readMatches();
    expect(rows.map((row) => row.match_id).sort()).toEqual(
      [...seededIds].sort(),
    );
  });

  test("ask.match_stats side = 'me' is the match_stats row whose is_player1 matches playerSide()", async () => {
    const columns = STAT_COLUMNS.join(", ");
    const rows = await readAsPlayer<AskStatsRow>(
      `select match_id, side, ${columns}, first_serve_pct
         from ask.match_stats where match_id = any($1)`,
      [STATS_SEEDS.map((index) => seededIds[index])],
    );
    expect(rows).toHaveLength(STATS_SEEDS.length * 2);

    for (const index of STATS_SEEDS) {
      const label = seeds(player.userId)[index].label;
      const meIsPlayer1 = seedSide(index) === "player1";
      for (const side of ["me", "opponent"] as const) {
        const isPlayer1 = side === "me" ? meIsPlayer1 : !meIsPlayer1;
        const stored = await admin
          .from("match_stats")
          .select(`${columns}, first_serves, first_serves_in`)
          .eq("match_id", seededIds[index])
          .eq("is_player1", isPlayer1)
          .single();
        if (stored.error) throw new Error(stored.error.message);
        const expected = stored.data as unknown as StatCounters;

        const row = rows.find(
          (r) => r.match_id === seededIds[index] && r.side === side,
        );
        expect(row, `${label}: ${side} row`).toBeDefined();
        for (const column of STAT_COLUMNS) {
          expect(row![column], `${label}: ${side}.${column}`).toBe(
            expected[column],
          );
        }
        // The percentage passes through match_stats_with_percentages
        // unchanged; pg returns numeric as text.
        expect(
          Number(row!.first_serve_pct),
          `${label}: ${side}.first_serve_pct`,
        ).toBeCloseTo(
          (100 * expected.first_serves_in) / expected.first_serves,
          1,
        );
      }
    }
  });

  test("ask.points i_served / i_won are server_is_player1 / won_by_player1 turned by playerSide(), and game_number restarts per set", async () => {
    const rows = await readAsPlayer<AskPointRow>(
      `select match_id, set_number, game_number, point_number, i_served, i_won
         from ask.points where match_id = any($1)`,
      [STATS_SEEDS.map((index) => seededIds[index])],
    );
    const byKey = new Map(
      rows.map((row) => [`${row.match_id}:${row.point_number}`, row]),
    );

    for (const index of STATS_SEEDS) {
      const label = seeds(player.userId)[index].label;
      const meIsPlayer1 = seedSide(index) === "player1";
      const stored = await admin
        .from("points")
        .select(
          "point_number, set_number, game_number, server_is_player1, won_by_player1",
        )
        .eq("match_id", seededIds[index]);
      if (stored.error) throw new Error(stored.error.message);
      const points = stored.data as unknown as PointSeed[];
      expect(points, `${label}: points seeded`).toHaveLength(6);

      for (const point of points) {
        const row = byKey.get(`${seededIds[index]}:${point.point_number}`);
        const at = `${label}: point ${point.point_number}`;
        expect(row, at).toBeDefined();
        expect(row!.i_served, `${at} i_served`).toBe(
          point.server_is_player1 === meIsPlayer1,
        );
        expect(row!.i_won, `${at} i_won`).toBe(
          point.won_by_player1 === meIsPlayer1,
        );
        expect(row!.set_number, `${at} set_number`).toBe(point.set_number);
        // Stored cumulatively (set 2 starts at game 3); shown per set.
        expect(row!.game_number, `${at} game_number`).toBe(
          point.set_number === 1 ? point.game_number : point.game_number - 2,
        );
      }
    }
  });

  test("ask.point_plays is ask.points row for row on the server, the winner, the court and the game, written by the triggers alone", async () => {
    const rows = await readAsPlayer<AskPointPlaysRow>(
      `select p.match_id, p.point_number, p.i_served, p.i_won, p.court, p.game_number, p.has_shots,
              q.i_served as points_i_served, q.i_won as points_i_won,
              q.court as points_court, q.game_number as points_game_number
         from ask.point_plays p
         join ask.points q on q.match_id = p.match_id and q.point_number = p.point_number
        where p.match_id = any($1)`,
      [STATS_SEEDS.map((index) => seededIds[index])],
    );
    // Six points per sided match: every seeded point has its facts row.
    expect(rows).toHaveLength(STATS_SEEDS.length * 6);
    for (const row of rows) {
      const at = `${row.match_id}: point ${row.point_number}`;
      expect(row.i_served, `${at} i_served`).toBe(row.points_i_served);
      expect(row.i_won, `${at} i_won`).toBe(row.points_i_won);
      expect(row.court, `${at} court`).toBe(row.points_court);
      expect(row.game_number, `${at} game_number`).toBe(row.points_game_number);
      expect(row.has_shots, `${at} has_shots`).toBe(false);
    }
  });

  test("ask.shots positions are the stored ones turned by youAreAtLowEnd(), with the untrustworthy landings dropped", async () => {
    const rows = await readAsPlayer<AskShotPositionRow>(
      `select point_number, shot_number, contact_x, contact_y, landing_x, landing_y,
              landing_pinned, landing_section
         from ask.shots where match_id = $1`,
      [seededIds[POSITION_SEED]],
    );
    const byKey = new Map(
      rows.map((row) => [`${row.point_number}:${row.shot_number}`, row]),
    );
    // Player 1 is the viewer on this seed.
    const meIsPlayer1 = seedSide(POSITION_SEED) === "player1";
    expect(meIsPlayer1).toBe(true);

    for (const point of POSITION_POINTS) {
      const low = pointLowEnd(point);
      expect(low, `point ${point.point_number}`).toBe(point.point_number === 1);
      const turn = (x: number, y: number) => turned(low!, x, y);

      for (const shot of point.shots) {
        const at = `point ${point.point_number} shot ${shot.shot_number}`;
        const row = byKey.get(`${point.point_number}:${shot.shot_number}`);
        expect(row, at).toBeDefined();
        const contact = turn(shot.contact_x, shot.contact_y);
        expect(row!.contact_x, `${at} contact_x`).toBeCloseTo(contact.x, 6);
        expect(row!.contact_y, `${at} contact_y`).toBeCloseTo(contact.y, 6);
        if (shot.expect.landingDropped) {
          expect(row!.landing_x, `${at} landing_x`).toBeNull();
          expect(row!.landing_y, `${at} landing_y`).toBeNull();
        } else {
          const landing = turn(shot.landing_x, shot.landing_y);
          expect(row!.landing_x, `${at} landing_x`).toBeCloseTo(landing.x, 6);
          expect(row!.landing_y, `${at} landing_y`).toBeCloseTo(landing.y, 6);
        }
        expect(row!.landing_pinned, `${at} landing_pinned`).toBe(
          shot.expect.pinned,
        );
        // shot.expect.section is held to the TypeScript rules offline (the
        // test above), so the SQL is held to them here.
        expect(row!.landing_section, `${at} landing_section`).toBe(
          shot.expect.section,
        );
      }
    }
  });

  test("ask.matches has_coords is true for the match with positioned shots alone", async () => {
    const rows = await readAsPlayer<{ match_id: string; has_coords: boolean }>(
      "select match_id, has_coords from ask.matches",
    );
    for (const [index, id] of seededIds.entries()) {
      const row = rows.find((r) => r.match_id === id);
      expect(row, `seed ${index}`).toBeDefined();
      expect(row!.has_coords, `seed ${index}`).toBe(index === POSITION_SEED);
    }
  });

  test("the four views expose no coordinate, video, flag or id column but match_id and ask.shots' turned positions", async () => {
    const { rows } = await db.query<{
      table_name: string;
      column_name: string;
    }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'ask'
          and table_name in ('match_stats', 'points', 'shots', 'point_plays')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    // The stored world-frame coordinates never reach a view; these four are
    // the view's own, turned to the player.
    const turned = new Set([
      "shots.contact_x",
      "shots.contact_y",
      "shots.landing_x",
      "shots.landing_y",
    ]);
    const banned = rows.filter(
      ({ table_name, column_name }) =>
        column_name !== "match_id" &&
        !turned.has(`${table_name}.${column_name}`) &&
        /(_x|_y|_id|video_time|flags|derived|^id)$/.test(column_name),
    );
    expect(banned).toEqual([]);
  });

  test("authenticated holds nothing in schema ask", async () => {
    for (const view of [
      "matches",
      "match_stats",
      "points",
      "shots",
      "point_plays",
    ]) {
      await db.query("begin");
      try {
        await db.query("set local role authenticated");
        await db.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: player.userId, role: "authenticated" }),
        ]);
        const refused = await db
          .query(`select match_id from ask.${view}`)
          .then(() => null)
          .catch((error: { code?: string }) => error);
        expect(refused?.code, view).toBe(INSUFFICIENT_PRIVILEGE);
      } finally {
        await db.query("rollback");
      }
    }
  });
});
