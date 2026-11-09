import { expect, test } from "@playwright/test";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  buildPlayerInsightPrompt,
  buildSeasonEvidence,
  seasonInsightSignature,
} from "@/lib/data/player-insight";
import {
  foldSeasonRows,
  foldSeasonTallies,
  type SeasonMatch,
} from "@/lib/data/player-season";
import type { H2HStats } from "@/components/dashboard/matches/match-detail/head-to-head-rows";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The season Advantage Intelligence claim on the team player profile
 * (`lib/data/player-insight.ts` and `/api/player-insight`). Pure and offline:
 * the fold is the real one over a two-match fixture, and the route is loaded
 * through `createLoader()` with the workspace, roster, season loader,
 * Supabase and LLM seams as recording fakes.
 *
 * What is pinned, in order: the evidence line is composed from the season
 * fold's own pooled rates and drops a clause the season has no figure for;
 * the cache signature follows the analyzed matches and their figures; the
 * prompt states every row with a figure under the player's name, leaves out
 * the rows with none, and carries the voice rules — one sentence, eight
 * words, no digits, third person. Then the route: every refusal is JSON
 * through `errorResponse()` and reaches neither the roster nor the model; a
 * body's program id is refused by name, never read; the roster is read for
 * the WORKSPACE's program; nothing analyzed is a 204; the stream is the
 * adapter's chunks with the prompt built from the season, and the season is
 * loaded with no ball-paths file and no service-role client.
 */

/* ── Fixture: two analyzed matches, the player in each seat once ────────── */

function point(id: string, wonByPlayer1: boolean): MatchPoint {
  return {
    id,
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Forehand Winner",
    eventType: "",
    description: "",
    player: wonByPlayer1 ? "player1" : "player2",
    wonByPlayer1,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 0,
    duration: null,
    videoTime: 10,
    saved: false,
    savedBy: [],
    shots: [],
    secondShotResult: null,
  };
}

function match(o: {
  id: string;
  date: string;
  opponent: string;
  isPlayer1: boolean;
  points: MatchPoint[];
  you: Partial<H2HStats>;
  opp: Partial<H2HStats>;
}): SeasonMatch {
  return {
    matchId: o.id,
    date: o.date,
    opponent: o.opponent,
    points: o.points,
    isPlayer1: o.isPlayer1,
    isDerived: false,
    errorSplitJudged: false,
    lobKeys: null,
    youStats: { fractions: {}, ...o.you },
    oppStats: { fractions: {}, ...o.opp },
  };
}

/** Seat 1 v Smith: 2 of 3 points, 40/80 published, first serve 30/50. */
const MATCH_A = match({
  id: "m-a",
  date: "2026-02-01",
  opponent: "Smith",
  isPlayer1: true,
  points: [point("a1", true), point("a2", true), point("a3", false)],
  you: {
    aces: 3,
    totalPointsWon: 40,
    totalPoints: 80,
    fractions: { firstServeInPct: { made: 30, attempts: 50 } },
  },
  opp: {
    aces: 1,
    totalPointsWon: 40,
    totalPoints: 80,
    fractions: { firstServeInPct: { made: 29, attempts: 50 } },
  },
});

/** Seat 2 v Jones: 1 of 4 points, 50/90 published, first serve 35/60. */
const MATCH_B = match({
  id: "m-b",
  date: "2026-03-01",
  opponent: "Jones",
  isPlayer1: false,
  points: [
    point("b1", true),
    point("b2", true),
    point("b3", false),
    point("b4", true),
  ],
  you: {
    aces: 5,
    totalPointsWon: 50,
    totalPoints: 90,
    fractions: { firstServeInPct: { made: 35, attempts: 60 } },
  },
  opp: {
    aces: 2,
    totalPointsWon: 40,
    totalPoints: 90,
    fractions: { firstServeInPct: { made: 36, attempts: 60 } },
  },
});

function season(matches: SeasonMatch[], matchesPlayed = matches.length + 1) {
  return {
    analyzed: matches.length,
    matchesPlayed,
    opponentsCount: matches.length,
    groups: foldSeasonRows(matches),
    tallies: foldSeasonTallies(matches),
    perMatch: matches,
  };
}

const SEASON = season([MATCH_A, MATCH_B]);

/* ── Evidence ───────────────────────────────────────────────────────────── */

test.describe("buildSeasonEvidence", () => {
  test("the analyzed count, then pooled points won and first serve", () => {
    const evidence = buildSeasonEvidence(SEASON);
    expect(evidence).not.toBeNull();
    // 90/170 points and 65/110 first serves — pooled, not a mean of 50%/56%
    // and 60%/58%.
    expect(evidence!.text).toBe(
      "2 analyzed · points won 53% · first serve 59%",
    );
    expect(evidence!.parts.filter((p) => p.tabular).map((p) => p.text)).toEqual(
      ["2", "53%", "59%"],
    );
    expect(evidence!.parts.map((p) => p.text).join("")).toBe(evidence!.text);
  });

  test("null with nothing analyzed", () => {
    expect(buildSeasonEvidence(season([]))).toBeNull();
  });

  test("a row the season has no figure for drops its clause", () => {
    const noFirstServe = season([
      { ...MATCH_A, youStats: { ...MATCH_A.youStats, fractions: {} } },
      { ...MATCH_B, youStats: { ...MATCH_B.youStats, fractions: {} } },
    ]);
    expect(buildSeasonEvidence(noFirstServe)!.text).toBe(
      "2 analyzed · points won 53%",
    );
  });
});

/* ── Signature ──────────────────────────────────────────────────────────── */

test.describe("seasonInsightSignature", () => {
  test("stable for the same season, changed by a match or a figure", () => {
    const base = seasonInsightSignature(SEASON);
    expect(seasonInsightSignature(season([MATCH_A, MATCH_B]))).toBe(base);
    expect(base).toContain("m-a,m-b");
    expect(base).toContain("points won 53%");

    expect(seasonInsightSignature(season([MATCH_A]))).not.toBe(base);
    const rederived = season([
      MATCH_A,
      {
        ...MATCH_B,
        youStats: { ...MATCH_B.youStats!, totalPointsWon: 60 },
      },
    ]);
    expect(seasonInsightSignature(rederived)).not.toBe(base);
    expect(seasonInsightSignature(season([]))).toBe("0::");
  });
});

/* ── Prompt ─────────────────────────────────────────────────────────────── */

test.describe("buildPlayerInsightPrompt", () => {
  const prompt = buildPlayerInsightPrompt({
    name: "Maya Chen",
    firstName: "Maya",
    matchesPlayed: 3,
    analyzed: 2,
    groups: SEASON.groups,
    tallies: SEASON.tallies,
  });

  test("names the player and the sample", () => {
    expect(prompt).toContain("Player: Maya Chen");
    expect(prompt).toContain("Matches recorded: 3");
    expect(prompt).toContain(
      "Matches analyzed (every figure below comes from these): 2",
    );
    // Oldest first, each match's share from its own seat: 2 of 3 as player
    // one, 1 of 4 as player two.
    expect(prompt).toContain(
      "Points won per analyzed match (oldest → newest): 67% v Smith, 25% v Jones",
    );
  });

  test("states the rows with a figure under the player's name, counts per match and rates pooled", () => {
    expect(prompt).toContain("  - Aces: Maya 4.0, opponents 1.5 (per match)");
    expect(prompt).toContain("  - First serve in: Maya 59%, opponents 59%");
    expect(prompt).toContain("  - Total points won: Maya 53%, opponents 47%");
    // The group titles frame the rows.
    expect(prompt).toContain("\nServe\n");
    expect(prompt).toContain("\nPoints\n");
  });

  test("leaves out the rows with no figure on either side", () => {
    // No ball-paths file, so the lob rows are unknown; no published serve
    // fractions beyond first serve in, so those rows are dashes too.
    expect(prompt).not.toContain("Lob points won");
    expect(prompt).not.toContain("Passed the net player");
    expect(prompt).not.toContain("Break points saved");
    expect(prompt).not.toContain("Double faults");
  });

  test("does not call all-time figures a season", () => {
    // The fold covers every recorded match, not one academic season.
    expect(prompt).not.toContain("this season");
    expect(prompt).not.toContain("Maya's season");
    expect(prompt).not.toContain("Season figures");
    expect(prompt).toContain("Figures over every analyzed match on record");
    expect(prompt).toContain("never present them as a single season's");
  });

  test("carries the voice rules: one sentence, eight words, no digits, third person", () => {
    for (const rule of [
      "ONE sentence, at most 8 words",
      "falsifiable CLAIM",
      "NO digits, percentages, counts or ordinals",
      "About Maya, in the third person, present tense",
      "never a gendered pronoun",
      "No greeting, no markdown",
      "NO exclamation marks",
      "If the sample is thin",
      "Return the sentence alone, with no surrounding text.",
    ])
      expect(prompt, rule).toContain(rule);
    expect(prompt).toContain("deciding Maya's losses.");
  });
});

/* ── The route ──────────────────────────────────────────────────────────── */

const PROGRAM = "11111111-1111-4111-8111-111111111111";
const PLAYER = "7c1f2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

const TEAM_WORKSPACE = {
  viewer: { id: "u-coach" },
  active: { kind: "team", id: PROGRAM, name: "Tech" },
  available: [],
};

const SIDES = {
  roster: {
    player_id: PLAYER,
    profile_id: PLAYER,
    user_id: null,
    display_name: "Maya Chen",
    email: null,
    role: "player",
    class_year: null,
    lineup_spot: 1,
    managed_by: "staff",
  },
  own: [{ match: { id: "m-a" }, isPlayer1: true }],
};

interface Calls {
  sides: unknown[][];
  season: {
    sides: unknown;
    deps: { loadBallPathsBody: (matchId: string) => Promise<unknown> };
  }[];
  llm: unknown[][];
  admin: number;
}

function newCalls(): Calls {
  return { sides: [], season: [], llm: [], admin: 0 };
}

function loadRoute(
  scenario: {
    workspace: unknown;
    sides?: unknown;
    season?: unknown;
    llm?: "stream" | "throw";
  },
  calls: Calls,
) {
  const refuseAdmin = () => {
    calls.admin += 1;
    throw new Error("the service-role client must not be built");
  };
  const loader = createLoader({
    stubs: {
      "@/lib/workspace/active-workspace-server": {
        getWorkspaceContext: async () => scenario.workspace,
      },
      "@/lib/data/player-profile-server": {
        getPlayerMatchSides: async (...args: unknown[]) => {
          calls.sides.push(args);
          return scenario.sides ?? null;
        },
      },
      "@/lib/data/player-season-server": {
        loadPlayerSeason: async (
          _client: unknown,
          sides: unknown,
          deps: Calls["season"][number]["deps"],
        ) => {
          calls.season.push({ sides, deps });
          return scenario.season;
        },
      },
      "@/lib/supabase/server": { createClient: async () => ({}) },
      "@/lib/supabase/admin": {
        createAdminClient: refuseAdmin,
        lazyAdminClient: refuseAdmin,
      },
      "@/lib/llm/adapter": {
        createLLMObservabilityContext: (viewerId: string) => ({ viewerId }),
        getLLMStream: async (...args: unknown[]) => {
          calls.llm.push(args);
          if (scenario.llm === "throw") throw new Error("no provider");
          return (async function* () {
            yield "Second serves are ";
            yield "deciding Maya's losses.";
          })();
        },
      },
    },
    globals: {
      Response,
      Request,
      Headers,
      ReadableStream,
      TextEncoder,
      TextDecoder,
      URL,
      AbortController,
    },
  });
  return (
    loader.load("src/app/api/player-insight/route.ts") as {
      POST: (request: Request) => Promise<Response>;
    }
  ).POST;
}

function post(
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return new Request("http://localhost/api/player-insight", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test.describe("/api/player-insight", () => {
  test("no session → 401 unauthenticated, no roster read, no model call", async () => {
    const calls = newCalls();
    const POST = loadRoute({ workspace: null }, calls);
    const res = await POST(post({ playerId: PLAYER }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: "Sign in to continue.",
      code: "unauthenticated",
    });
    expect(calls.sides).toEqual([]);
    expect(calls.llm).toEqual([]);
  });

  test("a personal workspace → 404 not_a_program", async () => {
    const calls = newCalls();
    const POST = loadRoute(
      {
        workspace: {
          viewer: { id: "u-1" },
          active: { kind: "personal", id: "u-1", name: "Me" },
        },
      },
      calls,
    );
    const res = await POST(post({ playerId: PLAYER }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_a_program" });
    expect(calls.sides).toEqual([]);
    expect(calls.llm).toEqual([]);
  });

  test("a bad body → 400 invalid_request before the roster is read", async () => {
    const calls = newCalls();
    const POST = loadRoute({ workspace: TEAM_WORKSPACE }, calls);

    const noId = await POST(post({}));
    expect(noId.status).toBe(400);
    expect(await noId.json()).toMatchObject({
      code: "invalid_request",
      detail: "player_id_type",
    });

    const notUuid = await POST(post({ playerId: "maya" }));
    expect(notUuid.status).toBe(400);
    expect(await notUuid.json()).toMatchObject({
      detail: "player_id_not_uuid",
    });

    // A program id in the body is refused by name, never read.
    const programId = await POST(
      post({
        playerId: PLAYER,
        programId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    expect(programId.status).toBe(400);
    expect(await programId.json()).toMatchObject({
      detail: "unexpected_field:programId",
    });

    const notJson = await POST(
      post("playerId=" + PLAYER, { "content-type": "text/plain" }),
    );
    expect(notJson.status).toBe(400);

    expect(calls.sides).toEqual([]);
    expect(calls.llm).toEqual([]);
  });

  test("not on the active program's roster → 404 player_not_found; the roster is the workspace's", async () => {
    const calls = newCalls();
    const POST = loadRoute({ workspace: TEAM_WORKSPACE, sides: null }, calls);
    const res = await POST(post({ playerId: PLAYER.toUpperCase() }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: "This player is not on the roster.",
      code: "player_not_found",
    });
    // The program from the workspace cookie, the id lower-cased.
    expect(calls.sides).toEqual([[PROGRAM, PLAYER]]);
    expect(calls.season).toEqual([]);
    expect(calls.llm).toEqual([]);
  });

  test("nothing analyzed → 204, no model call", async () => {
    const calls = newCalls();
    const POST = loadRoute(
      { workspace: TEAM_WORKSPACE, sides: SIDES, season: season([], 1) },
      calls,
    );
    const res = await POST(post({ playerId: PLAYER }));
    expect(res.status).toBe(204);
    expect(calls.llm).toEqual([]);
  });

  test("an analyzed season → the claim streams as text, from the prompt over the season, with no file read and no service role", async () => {
    const calls = newCalls();
    const POST = loadRoute(
      { workspace: TEAM_WORKSPACE, sides: SIDES, season: SEASON },
      calls,
    );
    const res = await POST(post({ playerId: PLAYER }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Second serves are deciding Maya's losses.");

    // The season was loaded over the roster's own matches, and its one
    // service-role dependency was answered with "no file" for every match.
    expect(calls.season).toHaveLength(1);
    expect(calls.season[0].sides).toBe(SIDES.own);
    await expect(
      calls.season[0].deps.loadBallPathsBody("m-a"),
    ).resolves.toEqual({ ok: true, value: null });
    expect(calls.admin).toBe(0);

    // One model call: the real prompt over the season, the viewer's trace,
    // the route's span.
    expect(calls.llm).toHaveLength(1);
    const [prompt, messages, context, options] = calls.llm[0] as [
      string,
      { role: string; content: string }[],
      unknown,
      unknown,
    ];
    expect(prompt).toContain("Player: Maya Chen");
    expect(prompt).toContain("  - Total points won: Maya 53%, opponents 47%");
    expect(prompt).toContain("NO digits");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(context).toEqual({ viewerId: "u-coach" });
    expect(options).toEqual({ span: "player.insight" });
  });

  test("the adapter failing to open → 500 internal_error", async () => {
    const calls = newCalls();
    const POST = loadRoute(
      { workspace: TEAM_WORKSPACE, sides: SIDES, season: SEASON, llm: "throw" },
      calls,
    );
    const res = await POST(post({ playerId: PLAYER }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      code: "internal_error",
      detail: "stream_open",
    });
  });
});
