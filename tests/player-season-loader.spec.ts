import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readPlayerMatchSides,
  type DbPlayerMatchRow,
  type PlayerMatchSide,
} from "@/lib/data/player-profile-server";
import {
  loadPlayerSeason,
  loadPlayerSeasonCourts,
  lobKeysFromBallPathsBody,
  mapWithConcurrency,
  SEASON_READ_CONCURRENCY,
  seasonOpponentCount,
  type PlayerSeasonDeps,
} from "@/lib/data/player-season-server";
import { foldSeasonRows, foldSeasonTallies } from "@/lib/data/player-season";
import {
  buildSeasonCards,
  buildSeasonLightbox,
} from "@/lib/data/player-season-viz";
import {
  BoundedLru,
  pointsWeight,
  type SeasonPointsCaching,
} from "@/lib/data/season-points-cache";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { parseVizState } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { transportError } from "@/lib/services/match-video/http";
import { lobKeyOf } from "@/components/dashboard/matches/match-detail/match-filters/net-game";

/**
 * The player profile's season loader (`lib/data/player-season-server.ts`)
 * against a fake Supabase client and a fake ball-paths reader — no database,
 * no storage, no session.
 *
 * What the fold itself computes is `tests/player-season.spec.ts`'s business.
 * This spec pins the READ: which matches are this player's and from which
 * seat, which of them count as analyzed, where each match's `isDerived`,
 * `errorSplitJudged` and lob keys come from, that both seats' stats rows are
 * read, that the per-match reads go out together, and that the only
 * service-role dependency is asked only about derived matches the RLS read
 * returned.
 *
 * The roster: Ada is a CLAIMED player, so her matches carry two ids — her
 * login `u-ada` on the older row, her profile `p-ada` on the rest. Bea is a
 * coach-managed teammate. The matches:
 *
 *   m-a  Ada seat 1 (as `u-ada`), SwingVision, points        → analyzed
 *   m-b  Ada seat 2 (Bea recorded first), video, verified +
 *        judged, points, a ball-paths file with one lob      → analyzed
 *   m-c  Ada seat 1, video, stats rows but NO points         → not analyzed
 *   m-d  Ada seat 1, video, unverified, points, the file
 *        download fails                                      → analyzed
 *   m-e  Bea's own match — not Ada's at all
 *   m-f  Ada's, but in another program
 */

/* ── A fake client that filters like PostgREST ───────────────────────────── */

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { message: string } | null };

class FakeQuery implements PromiseLike<Answer> {
  private readonly filters: ((row: Row) => boolean)[] = [];
  private slice: [number, number] | null = null;
  private one = false;

  constructor(
    private readonly table: string,
    private readonly rows: Row[] | Error,
    private readonly log: string[],
  ) {}

  select(columns: string) {
    this.log.push(`${this.table}.select(${columns.split(",")[0].trim()})`);
    return this;
  }
  eq(column: string, value: unknown) {
    // Which match a points read is for, so a spec can see which were read.
    if (this.table === "points" && column === "match_id") {
      this.log.push(`points.match(${String(value)})`);
    }
    this.filters.push((row) => row[column] === value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  /**
   * The profile's seat filter. Not applied: the fake hands back every match
   * of the program so the spec can see `sideOf` drop the ones that are not
   * this player's. The expression is logged so the spec can check which ids
   * the read asked for.
   */
  or(expression: string) {
    this.log.push(`${this.table}.or(${expression})`);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  range(from: number, to: number) {
    this.slice = [from, to];
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }

  then<R1 = Answer, R2 = never>(
    onfulfilled?: ((value: Answer) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.answer()).then(onfulfilled, onrejected);
  }

  private answer(): Answer {
    if (this.rows instanceof Error) {
      return { data: null, error: { message: this.rows.message } };
    }
    let data = this.rows.filter((row) =>
      this.filters.every((keep) => keep(row)),
    );
    if (this.slice) data = data.slice(this.slice[0], this.slice[1] + 1);
    return { data: this.one ? (data[0] ?? null) : data, error: null };
  }
}

function fakeClient(
  tables: Record<string, Row[] | Error>,
  rpcs: Record<string, unknown> = {},
) {
  const log: string[] = [];
  const client = {
    from(table: string) {
      return new FakeQuery(table, tables[table] ?? [], log);
    },
    rpc(name: string) {
      log.push(`rpc:${name}`);
      const answer = rpcs[name];
      if (answer instanceof Error) {
        return Promise.resolve({
          data: null,
          error: { message: answer.message },
        });
      }
      return Promise.resolve({ data: answer ?? null, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, log };
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const PROGRAM = "prog-1";

const ROSTER = [
  {
    player_id: "p-ada",
    profile_id: "p-ada",
    user_id: "u-ada",
    display_name: "Ada Okafor",
    email: "ada@example.test",
    role: "player",
    class_year: "2027",
    lineup_spot: 1,
    managed_by: "self",
  },
  {
    player_id: "p-bea",
    profile_id: "p-bea",
    user_id: null,
    display_name: "Bea Lindqvist",
    email: null,
    role: "player",
    class_year: null,
    lineup_spot: 2,
    managed_by: "coach",
  },
  {
    player_id: "u-coach",
    profile_id: null,
    user_id: "u-coach",
    display_name: "Coach Kim",
    email: "kim@example.test",
    role: "coach",
    class_year: null,
    lineup_spot: null,
    managed_by: "self",
  },
];

function matchRow(overrides: Partial<DbPlayerMatchRow> & { id: string }) {
  return {
    program_id: PROGRAM,
    player1_id: "p-ada",
    player2_id: null,
    player1_name: "Ada Okafor",
    player2_name: "Ana Castillo",
    score: { player1: [6, 6], player2: [3, 4] },
    date: "2026-09-14T00:00:00+00:00",
    tournament_name: null,
    event_entry_id: null,
    round: null,
    result: null,
    match_type: "singles",
    court_type: "hard",
    verified: null,
    verified_at: null,
    errors_judged_at: null,
    duration: null,
    source_provider: "swing-vision",
    created_by: "u-coach",
    opponent_player_id: null,
    ...overrides,
  };
}

const MATCHES = [
  // Her pre-claim row: the login id, SwingVision.
  matchRow({ id: "m-a", player1_id: "u-ada" }),
  // Recorded by Bea first, so Ada is seat two. Verified and judged.
  matchRow({
    id: "m-b",
    player1_id: "p-bea",
    player2_id: "p-ada",
    player1_name: "Bea Lindqvist",
    player2_name: "Ada Okafor",
    date: "2026-09-21T00:00:00+00:00",
    source_provider: "splitstep",
    verified: true,
    verified_at: "2026-09-22T10:00:00Z",
    errors_judged_at: "2026-09-22T11:00:00Z",
  }),
  // Still analysing: stats rows exist, points do not.
  matchRow({
    id: "m-c",
    player2_name: "Cleo Marsh",
    date: "2026-10-02T00:00:00+00:00",
    source_provider: "splitstep",
  }),
  // The same opponent as m-a, typed differently. Unverified video.
  matchRow({
    id: "m-d",
    player2_name: "ANA  castillo",
    date: "2026-10-09T00:00:00+00:00",
    source_provider: "splitstep",
    verified: false,
  }),
  // Bea's own match.
  matchRow({
    id: "m-e",
    player1_id: "p-bea",
    player1_name: "Bea Lindqvist",
    player2_name: "Zed Quill",
  }),
  // Ada's, in another program.
  { ...matchRow({ id: "m-f" }), program_id: "prog-2" },
];

/** A view row for one seat, with the figures the assertions read. */
function statRow(matchId: string, isPlayer1: boolean, winners: number) {
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    winners,
    unforced_errors: 10,
    forced_errors: isPlayer1 ? 4 : null,
    aces: 3,
    double_faults: 2,
    total_points: 100,
    total_points_won: isPlayer1 ? 55 : 45,
    first_serves: 50,
    first_serves_in: 30,
    first_serve_points_won: 20,
  };
}

const STATS = ["m-a", "m-b", "m-c", "m-d"].flatMap((id, i) => [
  statRow(id, true, 10 + i),
  statRow(id, false, 20 + i),
]);

/** `n` points of a match, every other one won by player one. */
function pointRows(matchId: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${matchId}-p${i + 1}`,
    match_id: matchId,
    point_number: i + 1,
    set_number: 1,
    game_number: 1,
    set_score: "0-0",
    game_score: "0-0",
    point_score: "0-0",
    result_type: i % 2 === 0 ? "Winner" : "Unforced Error",
    flags: null,
    won_by_player1: i % 2 === 0,
    server_is_player1: true,
    is_break_point: false,
    is_set_point: false,
    is_match_point: false,
    rally_length: 3 + i,
    duration: null,
    video_time: 10 * (i + 1),
  }));
}

function shotRows(points: Row[]): Row[] {
  return points.flatMap((point) => [
    {
      id: `${point.id}-s1`,
      point_id: point.id,
      shot_number: 1,
      is_player1: true,
      shot_type: "Serve",
      spin_type: null,
      speed_mph: null,
      video_time: (point.video_time as number) + 0.5,
      bounce_video_time: null,
      zone: null,
      result: "In",
      contact_x: 0,
      contact_y: 0,
      landing_x: 0,
      landing_y: 18,
    },
    {
      id: `${point.id}-s2`,
      point_id: point.id,
      shot_number: 2,
      is_player1: false,
      shot_type: "Forehand",
      spin_type: null,
      speed_mph: null,
      video_time: (point.video_time as number) + 2,
      bounce_video_time: null,
      zone: null,
      result: "In",
      contact_x: 0,
      contact_y: 22,
      landing_x: 0,
      landing_y: 6,
    },
  ]);
}

const POINTS = [
  ...pointRows("m-a", 4),
  ...pointRows("m-b", 6),
  ...pointRows("m-d", 2),
  // m-e has points too; they belong to Bea's match and must never be read.
  ...pointRows("m-e", 3),
];
const SHOTS = shotRows(POINTS);

const LOB_CONTACT = 12.345;
const LOB_FILE = JSON.stringify({
  version: 1,
  strokes: [
    {
      contactTime: LOB_CONTACT,
      bounceTime: null,
      path: [
        [12.3, 0, 5, 1],
        [12.8, 0, 8, 5.5],
      ],
    },
  ],
});

type BodyAnswer = Awaited<ReturnType<PlayerSeasonDeps["loadBallPathsBody"]>>;

function fakeBallPaths(bodies: Record<string, BodyAnswer | Error>) {
  const asked: string[] = [];
  const deps: PlayerSeasonDeps = {
    async loadBallPathsBody(matchId) {
      asked.push(matchId);
      const body = bodies[matchId];
      if (body instanceof Error) throw body;
      return body ?? { ok: true, value: null };
    },
  };
  return { deps, asked };
}

function fullTables(overrides: Record<string, Row[] | Error> = {}) {
  return {
    matches: MATCHES,
    match_stats_with_percentages: STATS,
    points: POINTS,
    shots: SHOTS,
    ...overrides,
  };
}

async function adaSides(tables = fullTables()) {
  const { client, log } = fakeClient(tables, { program_roster_full: ROSTER });
  const sides = await readPlayerMatchSides(client, PROGRAM, "p-ada");
  if (!sides) throw new Error("Ada is on the roster");
  return { client, log, sides };
}

/* ── Which matches, whose seat ───────────────────────────────────────────── */

test("the matches read names both of a claimed player's ids and sides each row", async () => {
  const { log, sides } = await adaSides();

  expect(sides.roster.display_name).toBe("Ada Okafor");
  expect(sides.own.map((s) => [s.match.id, s.isPlayer1])).toEqual([
    ["m-a", true],
    ["m-b", false],
    ["m-c", true],
    ["m-d", true],
  ]);

  const seatFilter = log.find((entry) => entry.startsWith("matches.or("));
  expect(seatFilter).toContain("u-ada");
  expect(seatFilter).toContain("p-ada");
});

test("an id that names nobody on the roster is null, not an empty season", async () => {
  const { client } = fakeClient(fullTables(), { program_roster_full: ROSTER });
  expect(await readPlayerMatchSides(client, PROGRAM, "p-nobody")).toBeNull();
});

/* ── The season read ─────────────────────────────────────────────────────── */

test("a match with stats but no points is not analyzed, and still counts as played", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({ "m-b": { ok: true, value: LOB_FILE } });

  const season = await loadPlayerSeason(client, sides.own, deps);

  expect(season.matchesPlayed).toBe(4);
  expect(season.analyzed).toBe(3);
  expect(season.perMatch.map((m) => m.matchId)).toEqual(["m-a", "m-b", "m-d"]);
  expect(season.tallies.perMatch.map((m) => m.matchId)).not.toContain("m-c");
});

/** A `processing_jobs` row as `loadMatchAnalysis` selects it. */
function jobRow(matchId: string, status: string, createdAt: string): Row {
  return {
    id: `job-${matchId}-${createdAt}`,
    match_id: matchId,
    created_by: "u-coach",
    status,
    upload_progress_percent: null,
    error_message: null,
    error_category: null,
    error_code: null,
    error_step: null,
    video_object_key: "v",
    results_object_key: status === "completed" ? "r" : null,
    resubmitted_from_job_id: null,
    billable_seconds: 3600,
    external_job_id: "ext",
    created_at: createdAt,
    updated_at: createdAt,
    derivation_version: status === "completed" ? "v1" : null,
    submitted_at: null,
    queued_ack_at: null,
    vendor_started_at: null,
  };
}

test("analyzed is the report's own gate: a match still analysing is not folded, but is played", async () => {
  // m-b's job finished; m-d was sent again and its new job is queued, though
  // its points from the earlier attempt are still there.
  const { client, sides } = await adaSides(
    fullTables({
      processing_jobs: [
        jobRow("m-b", "completed", "2026-09-22T09:00:00Z"),
        jobRow("m-d", "queued", "2026-10-10T09:00:00Z"),
      ],
    }),
  );
  const { deps } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, sides.own, deps);

  expect(season.matchesPlayed).toBe(4);
  expect(season.analyzed).toBe(2);
  expect(season.perMatch.map((m) => m.matchId)).toEqual(["m-a", "m-b"]);
  expect(season.tallies.perMatch.map((m) => m.matchId)).not.toContain("m-d");
});

test("a failed job that is not stats_unavailable is not folded either", async () => {
  const failed = {
    ...jobRow("m-d", "failed", "2026-10-10T09:00:00Z"),
    error_step: "vendor",
  };
  const { client, sides } = await adaSides(
    fullTables({ processing_jobs: [failed] }),
  );
  const { deps } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, sides.own, deps);
  expect(season.perMatch.map((m) => m.matchId)).toEqual(["m-a", "m-b"]);
});

test("isDerived and errorSplitJudged come from each match's own row", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({});

  const { perMatch } = await loadPlayerSeason(client, sides.own, deps);
  const byId = new Map(perMatch.map((m) => [m.matchId, m]));

  // SwingVision: not derived, every error judged by the export.
  expect(byId.get("m-a")).toMatchObject({
    isDerived: false,
    errorSplitJudged: true,
    isPlayer1: true,
  });
  // Video, verified and judged.
  expect(byId.get("m-b")).toMatchObject({
    isDerived: true,
    errorSplitJudged: true,
    isPlayer1: false,
  });
  // Video, never verified: judged marker or not, its errors are "Errors".
  expect(byId.get("m-d")).toMatchObject({
    isDerived: true,
    errorSplitJudged: false,
    isPlayer1: true,
  });
});

test("dates leave as calendar days and opponents are named from the other seat", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({});

  const { perMatch } = await loadPlayerSeason(client, sides.own, deps);
  expect(perMatch.map((m) => [m.matchId, m.date, m.opponent])).toEqual([
    ["m-a", "2026-09-14", "Ana Castillo"],
    ["m-b", "2026-09-21", "Bea Lindqvist"],
    ["m-d", "2026-10-09", "ANA  castillo"],
  ]);
});

test("two matches on one day reach the tracker in id order, not read order", async () => {
  // The matches read is newest first; matches stores no recording time, so a
  // day's matches are ordered by id — stable, whatever order they arrive in.
  const day = "2026-10-20T00:00:00+00:00";
  const same = [
    matchRow({ id: "m-x2", date: day }),
    matchRow({ id: "m-x1", date: day }),
  ];
  const tables = fullTables({
    matches: same,
    match_stats_with_percentages: same.flatMap((m) => [
      statRow(m.id, true, 1),
      statRow(m.id, false, 2),
    ]),
    points: same.flatMap((m) => pointRows(m.id, 2)),
    shots: shotRows(same.flatMap((m) => pointRows(m.id, 2))),
  });
  const { client, sides } = await adaSides(tables);
  const { deps } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, sides.own, deps);
  expect(season.tallies.perMatch.map((m) => m.matchId)).toEqual([
    "m-x1",
    "m-x2",
  ]);
});

test("both seats' stats rows are read, and 'you' is this player's seat", async () => {
  const { client, log, sides } = await adaSides();
  const { deps } = fakeBallPaths({});
  log.length = 0;

  const { perMatch } = await loadPlayerSeason(client, sides.own, deps);
  const byId = new Map(perMatch.map((m) => [m.matchId, m]));

  // One read of the view for the whole season, not one per match.
  expect(
    log.filter((e) => e.startsWith("match_stats_with_percentages.select")),
  ).toHaveLength(1);

  // m-a: Ada is seat one → her row is `is_player1 = true` (winners 10).
  expect(byId.get("m-a")?.youStats?.winners).toBe(10);
  expect(byId.get("m-a")?.oppStats?.winners).toBe(20);
  // m-b: Ada is seat two → her row is `is_player1 = false` (winners 21).
  expect(byId.get("m-b")?.youStats?.winners).toBe(21);
  expect(byId.get("m-b")?.oppStats?.winners).toBe(11);
  // The published fractions ride along for the pooled rate rows.
  expect(byId.get("m-b")?.youStats?.fractions.firstServeInPct).toEqual({
    made: 30,
    attempts: 50,
  });
});

test("a seat with points but no stats row is null, not zeroes", async () => {
  // m-d keeps its points but loses Ada's (seat one) stats row.
  const { client, sides } = await adaSides(
    fullTables({
      match_stats_with_percentages: STATS.filter(
        (r) => !(r.match_id === "m-d" && r.is_player1),
      ),
    }),
  );
  const { deps } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, sides.own, deps);
  const mD = season.perMatch.find((m) => m.matchId === "m-d");
  expect(mD?.youStats).toBeNull();
  expect(mD?.oppStats?.winners).toBe(23);
  // Winners: m-a 10 and m-b 21 for Ada — m-d is out, not a 0.
  const winners = season.groups
    .flatMap((g) => g.rows)
    .find((r) => r.label === "Winners");
  expect(winners?.you).toMatchObject({ matches: 2, detail: "31 in 2 matches" });
  expect(winners?.opp.matches).toBe(3);
});

test("a job-less import that published nothing is never read for points", async () => {
  // m-a is a SwingVision import: no job, and here no stats row for either
  // seat. Every import that stores points also publishes the stats row, so it
  // has none to read. (A video match is read regardless — its job may be a
  // teammate's, hidden by RLS — see the timeline-upload test.)
  const { client, log, sides } = await adaSides(
    fullTables({
      match_stats_with_percentages: STATS.filter((r) => r.match_id !== "m-a"),
    }),
  );
  const { deps } = fakeBallPaths({});
  log.length = 0;

  const season = await loadPlayerSeason(client, sides.own, deps);

  expect(log).not.toContain("points.match(m-a)");
  expect(season.matchesPlayed).toBe(4);
  expect(season.perMatch.map((m) => m.matchId)).not.toContain("m-a");
});

test("a match the report would not draw is never read for points or lobs", async () => {
  const { client, log, sides } = await adaSides(
    fullTables({
      processing_jobs: [jobRow("m-d", "processing", "2026-10-10T09:00:00Z")],
    }),
  );
  const { deps, asked } = fakeBallPaths({});
  log.length = 0;

  await loadPlayerSeason(client, sides.own, deps);

  expect(log).not.toContain("points.match(m-d)");
  expect(asked).not.toContain("m-d");
});

test("a job with no stats row is still read: a timeline match keeps its points", async () => {
  const { client, log, sides } = await adaSides(
    fullTables({
      match_stats_with_percentages: STATS.filter((r) => r.match_id !== "m-b"),
      processing_jobs: [jobRow("m-b", "completed", "2026-09-22T09:00:00Z")],
    }),
  );
  const { deps } = fakeBallPaths({});
  log.length = 0;

  const season = await loadPlayerSeason(client, sides.own, deps);
  expect(log).toContain("points.match(m-b)");
  expect(season.perMatch.map((m) => m.matchId)).toContain("m-b");
});

test("a video match is read with no visible job and no stats row: a teammate's timeline upload", async () => {
  // processing_jobs is per-creator under RLS: this viewer sees no job for
  // m-b (a video match), and it published no statistics. The report still
  // draws it, so the season reads and folds it.
  const { client, log, sides } = await adaSides(
    fullTables({
      match_stats_with_percentages: STATS.filter((r) => r.match_id !== "m-b"),
      processing_jobs: [],
    }),
  );
  const { deps } = fakeBallPaths({});
  log.length = 0;

  const season = await loadPlayerSeason(client, sides.own, deps);
  expect(log).toContain("points.match(m-b)");
  expect(season.perMatch.map((m) => m.matchId)).toContain("m-b");
});

test("a jobs read that fails throws rather than reading as no jobs", async () => {
  const { client, sides } = await adaSides(
    fullTables({ processing_jobs: new Error("timeout") }),
  );
  const { deps } = fakeBallPaths({});
  await expect(loadPlayerSeason(client, sides.own, deps)).rejects.toThrow(
    /processing jobs/,
  );
});

test("the points reads run a few matches at a time, not the whole season at once", async () => {
  // Eight more of Ada's matches, each with points and stats.
  const extra = Array.from({ length: 8 }, (_, i) => `m-x${i}`);
  const tables = fullTables({
    matches: [...MATCHES, ...extra.map((id) => matchRow({ id }))],
    match_stats_with_percentages: [
      ...STATS,
      ...extra.flatMap((id) => [statRow(id, true, 1), statRow(id, false, 2)]),
    ],
    points: [...POINTS, ...extra.flatMap((id) => pointRows(id, 2))],
    shots: shotRows([...POINTS, ...extra.flatMap((id) => pointRows(id, 2))]),
  });
  const { client, log, sides } = await adaSides(tables);
  const { deps } = fakeBallPaths({});
  log.length = 0;

  const season = await loadPlayerSeason(client, sides.own, deps);

  expect(season.analyzed).toBe(11);
  // Before the first match's shots are read, only the first few matches'
  // points reads have gone out — the pool, not all twelve.
  const firstShots = log.findIndex((e) => e.startsWith("shots.select"));
  const before = log
    .slice(0, firstShots)
    .filter((e) => e.startsWith("points.match("));
  expect(before).toHaveLength(SEASON_READ_CONCURRENCY);
  // And every candidate is still read, once.
  expect(log.filter((e) => e.startsWith("points.match("))).toHaveLength(12);
});

test("mapWithConcurrency never runs more than its limit, and keeps input order", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (n, i) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n));
    running -= 1;
    return `${i}:${n}`;
  });
  expect(peak).toBe(2);
  expect(out).toEqual(["0:5", "1:1", "2:4", "3:2", "4:3", "5:0"]);
  expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  await expect(
    mapWithConcurrency([1, 2], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
  ).rejects.toThrow("boom");
});

test("mapWithConcurrency takes no new item once one has failed", async () => {
  const started: number[] = [];
  await expect(
    mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, n === 0 ? 1 : 20));
      if (n === 0) throw new Error("boom");
      return n;
    }),
  ).rejects.toThrow("boom");
  // Let any straggler worker run its in-flight item out.
  await new Promise((r) => setTimeout(r, 60));
  // 0 fails while 1 is still running; nothing after 1 is started.
  expect(started).toEqual([0, 1]);
});

test("the points of every match are read together, without bookmarks", async () => {
  const { client, log, sides } = await adaSides();
  const { deps } = fakeBallPaths({});
  log.length = 0;

  await loadPlayerSeason(client, sides.own, deps);

  const pointsReads = log.filter((e) => e.startsWith("points.select"));
  const shotsReads = log.filter((e) => e.startsWith("shots.select"));
  expect(pointsReads).toHaveLength(4);
  // Only the three matches with points go on to read their shots.
  expect(shotsReads).toHaveLength(3);
  // Every points query was issued before any shots query: the matches were
  // read in one wave, not one after another.
  const lastPoints = log.lastIndexOf(pointsReads[pointsReads.length - 1]);
  const firstShots = log.findIndex((e) => e.startsWith("shots.select"));
  expect(lastPoints).toBeLessThan(firstShots);
  // Nothing in the fold reads who saved a point.
  expect(log.some((e) => e.startsWith("point_bookmarks"))).toBe(false);
  // And Bea's match was never asked about.
  expect(log.some((e) => e.includes("m-e"))).toBe(false);
});

test("groups and tallies are the pure fold over exactly the analyzed matches", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({ "m-b": { ok: true, value: LOB_FILE } });

  const season = await loadPlayerSeason(client, sides.own, deps);

  expect(season.groups).toEqual(foldSeasonRows(season.perMatch));
  expect(season.tallies).toEqual(foldSeasonTallies(season.perMatch));
  // The tracker has one sample per analyzed match, oldest first.
  expect(season.tallies.perMatch.map((m) => m.matchId)).toEqual([
    "m-a",
    "m-b",
    "m-d",
  ]);
});

/* ── The ball-paths file ─────────────────────────────────────────────────── */

test("the file reader is asked only about derived matches, with ids the matches read returned", async () => {
  const { client, sides } = await adaSides();
  const { deps, asked } = fakeBallPaths({
    "m-b": { ok: true, value: LOB_FILE },
    "m-d": { ok: false, error: transportError("internal_error", "boom") },
  });

  const { perMatch } = await loadPlayerSeason(client, sides.own, deps);
  const byId = new Map(perMatch.map((m) => [m.matchId, m]));

  // m-a is SwingVision — never asked. m-c is derived but has no points; it is
  // asked in the same wave as the points, before anyone knows that.
  expect([...asked].sort()).toEqual(["m-b", "m-c", "m-d"]);
  for (const id of asked) {
    expect(sides.own.map((s) => s.match.id)).toContain(id);
  }

  // A file with a lob: its key, on the stroke's contact time.
  expect(byId.get("m-b")?.lobKeys?.has(lobKeyOf(LOB_CONTACT))).toBe(true);
  // A failed download is unknown, never "no lobs".
  expect(byId.get("m-d")?.lobKeys).toBeNull();
  // No file at all for a SwingVision import.
  expect(byId.get("m-a")?.lobKeys).toBeNull();
});

test("loadPlayerSeasonCourts reads the season's matches and points with no file and no fold — the Visualizations request's read", async () => {
  const { client, log, sides } = await adaSides();
  const { deps, asked } = fakeBallPaths({
    "m-b": { ok: true, value: LOB_FILE },
  });
  // The roster and matches reads are `adaSides`'s; what follows is each
  // loader's own.
  log.splice(0);

  const season = await loadPlayerSeason(client, sides.own, deps);
  const seasonReads = log.splice(0);
  const courts = await loadPlayerSeasonCourts(client, sides.own);
  const courtsReads = log.splice(0);

  // The same analyzed matches, in the same order, with the same points,
  // seats and flags — what the courts fold (`player-season-viz.ts`) reads.
  expect(courts.analyzed).toBe(season.analyzed);
  expect(courts.matchesPlayed).toBe(season.matchesPlayed);
  expect(courts.perMatch.map((m) => m.matchId)).toEqual(
    season.perMatch.map((m) => m.matchId),
  );
  courts.perMatch.forEach((m, i) => {
    const full = season.perMatch[i];
    expect(m.points).toEqual(full.points);
    expect(m.isPlayer1).toBe(full.isPlayer1);
    expect(m.isDerived).toBe(full.isDerived);
    expect(m.errorSplitJudged).toBe(full.errorSplitJudged);
    // Nothing the Statistics fold needs and the courts do not: no lob keys,
    // no stats rows, no date or opponent.
    expect(Object.keys(m).sort()).toEqual([
      "errorSplitJudged",
      "isDerived",
      "isPlayer1",
      "matchId",
      "points",
    ]);
  });
  expect(courts).not.toHaveProperty("groups");
  expect(courts).not.toHaveProperty("tallies");

  // The same points reads — one per candidate, no more — and the file
  // reader is never part of it: the season loader asked for files, the
  // courts loader takes no reader at all.
  const pointReads = (entries: string[]) =>
    entries.filter((entry) => entry.startsWith("points.match(")).sort();
  expect(pointReads(courtsReads)).toEqual(pointReads(seasonReads));
  expect(pointReads(courtsReads).length).toBeGreaterThan(0);
  expect(asked.length).toBeGreaterThan(0);
  // Neither loader reads the matches again — both are handed `sides` — and
  // the courts loader reads nothing the season loader does not.
  for (const entry of courtsReads) {
    expect(entry).not.toMatch(/^matches\./);
    expect(seasonReads).toContain(entry);
  }
});

test("a reader that throws is logged and read as unknown, not as a failed season", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({ "m-b": new Error("storage down") });
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const { perMatch } = await loadPlayerSeason(client, sides.own, deps);
    expect(perMatch.find((m) => m.matchId === "m-b")?.lobKeys).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  } finally {
    console.error = original;
  }
});

test("lobKeysFromBallPathsBody: unknown for no file, not-the-file or no strokes; a set otherwise", () => {
  expect(lobKeysFromBallPathsBody(null)).toBeNull();
  expect(lobKeysFromBallPathsBody("not json")).toBeNull();
  expect(lobKeysFromBallPathsBody('{"version":2,"strokes":[]}')).toBeNull();
  expect(lobKeysFromBallPathsBody('{"version":1,"strokes":[]}')).toBeNull();

  const lobs = lobKeysFromBallPathsBody(LOB_FILE);
  expect(lobs?.has(lobKeyOf(LOB_CONTACT))).toBe(true);

  // A file whose strokes all stay low is a KNOWN answer — no lobs — distinct
  // from unknown.
  const low = JSON.stringify({
    version: 1,
    strokes: [{ contactTime: 3, bounceTime: 4, path: [[3, 0, 5, 1]] }],
  });
  expect(lobKeysFromBallPathsBody(low)).toEqual(new Set());
});

/* ── Opponents ───────────────────────────────────────────────────────────── */

test("opponentsCount counts the rows the Faced-by page would list for this player", async () => {
  const { client, sides } = await adaSides();
  const { deps } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, sides.own, deps);

  // Ana Castillo (m-a, m-d: two spellings, one person) and Cleo Marsh (m-c,
  // unanalyzed but played). Bea (m-b) is not counted: that match is Bea's row
  // on the Opponents page, where the team is always player one.
  expect(season.opponentsCount).toBe(2);
});

test("seasonOpponentCount keys like the Opponents page: stored id first, else the normalised name", () => {
  const side = (
    overrides: Partial<DbPlayerMatchRow> & { id: string },
    isPlayer1 = true,
  ): PlayerMatchSide => ({ match: matchRow(overrides), isPlayer1 });

  // Two spellings of one name fold; a stored id outranks a name.
  expect(
    seasonOpponentCount([
      side({ id: "1", player2_name: "Ana Castillo" }),
      side({ id: "2", player2_name: " ana   CASTILLO " }),
      side({ id: "3", player2_name: "Somebody", opponent_player_id: "opp-9" }),
      side({ id: "4", player2_name: "Else", opponent_player_id: "opp-9" }),
    ]),
  ).toBe(2);

  // A seat-two match is the teammate's row there, so it is not counted here.
  expect(
    seasonOpponentCount([
      side({ id: "5", player1_name: "Bea", player2_name: "Ada" }, false),
    ]),
  ).toBe(0);

  // A match naming nobody counts nobody.
  expect(seasonOpponentCount([side({ id: "6", player2_name: "  " })])).toBe(0);
  expect(seasonOpponentCount([])).toBe(0);
});

/* ── Failing closed, and the empty season ────────────────────────────────── */

test("a points read that fails throws rather than folding a season short", async () => {
  const { client, sides } = await adaSides(
    fullTables({ shots: new Error("timeout") }),
  );
  const { deps } = fakeBallPaths({});
  const original = console.error;
  console.error = () => {};
  try {
    await expect(loadPlayerSeason(client, sides.own, deps)).rejects.toThrow(
      /points of match/,
    );
  } finally {
    console.error = original;
  }
});

test("a roster read that fails throws, never reads as not on the roster", async () => {
  const { client } = fakeClient(fullTables(), {
    program_roster_full: new Error("rpc down"),
  });
  await expect(readPlayerMatchSides(client, PROGRAM, "p-ada")).rejects.toThrow(
    /the roster/,
  );
});

test("a matches read that fails throws, never reads as no matches", async () => {
  const { client } = fakeClient(
    fullTables({ matches: new Error("bad column") }),
    {
      program_roster_full: ROSTER,
    },
  );
  await expect(readPlayerMatchSides(client, PROGRAM, "p-ada")).rejects.toThrow(
    /this player's matches/,
  );
});

test("a stats read that fails throws", async () => {
  const { client, sides } = await adaSides(
    fullTables({ match_stats_with_percentages: new Error("timeout") }),
  );
  const { deps } = fakeBallPaths({});
  await expect(loadPlayerSeason(client, sides.own, deps)).rejects.toThrow(
    /match statistics/,
  );
});

test("a player with no matches is an empty season, with no reads", async () => {
  const { client, log } = fakeClient(fullTables());
  const { deps, asked } = fakeBallPaths({});

  const season = await loadPlayerSeason(client, [], deps);

  expect(season).toMatchObject({
    analyzed: 0,
    matchesPlayed: 0,
    opponentsCount: 0,
    perMatch: [],
  });
  expect(season.groups.length).toBeGreaterThan(0);
  for (const group of season.groups) {
    for (const row of group.rows) {
      expect(row.you.value).toBeNull();
      expect(row.opp.value).toBeNull();
    }
  }
  expect(season.tallies.perMatch).toEqual([]);
  expect(log).toEqual([]);
  expect(asked).toEqual([]);
});

/* ── Points across requests (`season-points-cache.ts`) ───────────────────── */

const VERSIONS = [
  { match_id: "m-a", version: 1 },
  { match_id: "m-b", version: 4 },
  { match_id: "m-d", version: 2 },
];

function freshCaching(
  scope: Partial<SeasonPointsCaching["scope"]> = {},
  cache = new BoundedLru<MatchPoint[]>({
    maxWeight: 10_000,
    ttlMs: 60_000,
    weigh: pointsWeight,
  }),
): SeasonPointsCaching {
  return {
    cache,
    scope: { viewerId: "u-coach", programId: PROGRAM, ...scope },
  };
}

const pointReadsIn = (log: string[]) =>
  log.filter((e) => e.startsWith("points.match(")).sort();

test("a cached season is identical to an uncached one, figure for figure, and the second request reads no points", async () => {
  const tables = fullTables({ match_points_versions: VERSIONS });
  const { client, log, sides } = await adaSides(tables);
  const caching = freshCaching();
  const files = { "m-b": { ok: true, value: LOB_FILE } } as const;

  log.splice(0);
  const uncached = await loadPlayerSeason(
    client,
    sides.own,
    fakeBallPaths(files).deps,
  );
  const uncachedReads = pointReadsIn(log.splice(0));

  const first = await loadPlayerSeason(
    client,
    sides.own,
    fakeBallPaths(files).deps,
    caching,
  );
  expect(pointReadsIn(log.splice(0))).toEqual(uncachedReads);

  const second = fakeBallPaths(files);
  const again = await loadPlayerSeason(client, sides.own, second.deps, caching);
  const againLog = log.splice(0);

  expect(first).toEqual(uncached);
  expect(again).toEqual(uncached);
  // Only m-c — a candidate with no points, so nothing to cache — is read
  // again; the three analyzed matches come from the cache.
  expect(pointReadsIn(againLog)).toEqual(["points.match(m-c)"]);
  expect(againLog.some((e) => e.startsWith("shots.select"))).toBe(false);
  // The service-role file reads never enter the cache: every request asks.
  expect([...second.asked].sort()).toEqual(["m-b", "m-c", "m-d"]);

  // The Visualizations tab's courts, cards and lightbox over the cached
  // season are the uncached season's, value for value.
  const courtsUncached = await loadPlayerSeasonCourts(client, sides.own);
  const courtsCached = await loadPlayerSeasonCourts(client, sides.own, caching);
  expect(courtsCached).toEqual(courtsUncached);
  const bands = { bands: DEFAULT_BANDS, unit: "ft" as const };
  const names = { you: "Ada Okafor", opponent: "Opponents" };
  for (const side of ["you", "opponent"] as const) {
    expect(buildSeasonCards(courtsCached.perMatch, side, bands)).toEqual(
      buildSeasonCards(courtsUncached.perMatch, side, bands),
    );
  }
  for (const query of [
    "cut=serve&ball=first",
    "cut=rallyPlacement",
    "cut=errors&vp=opponent",
  ]) {
    const state = parseVizState(new URLSearchParams(query), {
      errorSplitJudged: false,
    });
    expect(
      buildSeasonLightbox(courtsCached.perMatch, state, bands, names),
      query,
    ).toEqual(
      buildSeasonLightbox(courtsUncached.perMatch, state, bands, names),
    );
  }
});

test("a bumped version reads that match again and only that match", async () => {
  const caching = freshCaching();
  const before = await adaSides(
    fullTables({ match_points_versions: VERSIONS }),
  );
  await loadPlayerSeasonCourts(before.client, before.sides.own, caching);

  // A label publish rewrote m-b: new points, and the trigger bumped it.
  const relabelled = POINTS.map((p) =>
    p.match_id === "m-b" ? { ...p, result_type: "Ace" } : p,
  );
  const after = await adaSides(
    fullTables({
      points: relabelled,
      match_points_versions: VERSIONS.map((v) =>
        v.match_id === "m-b" ? { ...v, version: 5 } : v,
      ),
    }),
  );
  after.log.splice(0);
  const season = await loadPlayerSeasonCourts(
    after.client,
    after.sides.own,
    caching,
  );

  expect(pointReadsIn(after.log)).toEqual([
    "points.match(m-b)",
    "points.match(m-c)",
  ]);
  const mb = season.perMatch.find((m) => m.matchId === "m-b")!;
  expect(mb.points.every((p) => p.resultType === "Ace")).toBe(true);
  expect(season).toEqual(
    await loadPlayerSeasonCourts(after.client, after.sides.own),
  );
});

test("the cache is per viewer and per program: nobody else is ever served another's read", async () => {
  const cache = new BoundedLru<MatchPoint[]>({
    maxWeight: 10_000,
    ttlMs: 60_000,
    weigh: pointsWeight,
  });
  const { client, log, sides } = await adaSides(
    fullTables({ match_points_versions: VERSIONS }),
  );
  await loadPlayerSeasonCourts(client, sides.own, freshCaching({}, cache));

  for (const scope of [{ viewerId: "u-ada" }, { programId: "prog-2" }]) {
    log.splice(0);
    await loadPlayerSeasonCourts(client, sides.own, freshCaching(scope, cache));
    expect(pointReadsIn(log), JSON.stringify(scope)).toEqual([
      "points.match(m-a)",
      "points.match(m-b)",
      "points.match(m-c)",
      "points.match(m-d)",
    ]);
  }
});

test("a match with no version the viewer can read is read every time, and never cached", async () => {
  const caching = freshCaching();
  const { client, log, sides } = await adaSides(
    fullTables({
      match_points_versions: VERSIONS.filter((v) => v.match_id !== "m-d"),
    }),
  );
  await loadPlayerSeasonCourts(client, sides.own, caching);
  log.splice(0);
  await loadPlayerSeasonCourts(client, sides.own, caching);
  expect(pointReadsIn(log)).toEqual(["points.match(m-c)", "points.match(m-d)"]);
  expect(
    caching.cache
      .keys()
      .map((key) => key.split("|")[2])
      .sort(),
  ).toEqual(["m-a", "m-b"]);
});

test("a versions read that fails reads the whole season uncached and caches nothing", async () => {
  const caching = freshCaching();
  const { client, log, sides } = await adaSides(
    fullTables({
      match_points_versions: new Error(
        'relation "public.match_points_versions" does not exist',
      ),
    }),
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    const season = await loadPlayerSeasonCourts(client, sides.own, caching);
    expect(season).toEqual(await loadPlayerSeasonCourts(client, sides.own));
    log.splice(0);
    await loadPlayerSeasonCourts(client, sides.own, caching);
  } finally {
    console.warn = warn;
  }
  expect(pointReadsIn(log)).toHaveLength(4);
  expect(caching.cache.size).toBe(0);
});

test("a failed points read still throws with caching on, and leaves nothing cached for that match", async () => {
  const caching = freshCaching();
  const { client, sides } = await adaSides(
    fullTables({
      match_points_versions: VERSIONS,
      shots: new Error("shots page failed"),
    }),
  );
  const error = console.error;
  console.error = () => {};
  try {
    await expect(
      loadPlayerSeasonCourts(client, sides.own, caching),
    ).rejects.toThrow(/Could not read the points/);
  } finally {
    console.error = error;
  }
  expect(caching.cache.size).toBe(0);
});
