import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  MATCH_FILTER_KEYS,
  activeFilterCount,
  applyMatchFilters,
  buildFilterContext,
  filtersEqual,
  optionAvailability,
  parseMatchFilters,
  returnContactOf,
  serializeMatchFilters,
  toggleMatchFilter,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { Match } from "@/lib/data/types";
import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import { pt } from "./fixtures/film-point";

/*
 * The seats in every case: player1 = "you" (Alex), player2 = the opponent
 * (Rudy), unless a case flips `youIsPlayer1` on purpose.
 */
const CTX: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: "right", player2: "right" },
};
const FLIPPED: MatchFilterContext = { ...CTX, youIsPlayer1: false };

/** Where a player stands behind each baseline, in the stored frame. */
const LOW_END_Y = -0.5;
const HIGH_END_Y = 24.3;

let seq = 0;
function shot(overrides: Partial<MatchShot>): MatchShot {
  seq += 1;
  return {
    id: `s${seq}`,
    shotNumber: 3,
    isPlayer1: true,
    shotType: "Forehand",
    spinType: null,
    speedMph: null,
    zone: null,
    result: "In",
    videoTime: null,
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    ...overrides,
  };
}

/** A shot struck from `half` as the hitter at `end` faces the net. */
function from(
  end: "low" | "high",
  half: "deuce" | "ad",
  overrides: Partial<MatchShot> = {},
): MatchShot {
  const facing = end === "low" ? 1 : -1;
  return shot({
    contactX: (half === "deuce" ? 2 : -2) * facing,
    contactY: end === "low" ? LOW_END_Y : HIGH_END_Y,
    ...overrides,
  });
}

function ids(points: MatchPoint[]): string[] {
  return points.map((p) => p.id);
}

function f(patch: Partial<MatchFilters>): MatchFilters {
  return { ...EMPTY_MATCH_FILTERS, ...patch };
}

function run(
  points: MatchPoint[],
  patch: Partial<MatchFilters>,
  ctx: MatchFilterContext = CTX,
): string[] {
  return ids(applyMatchFilters(points, f(patch), ctx));
}

/* ── Combination rule ───────────────────────────────────────────────────── */

test("no active filter returns the same array", () => {
  const points = [pt({ id: "a" })];
  expect(applyMatchFilters(points, EMPTY_MATCH_FILTERS, CTX)).toBe(points);
});

test("OR within a group, AND across groups and sections", () => {
  const points = [
    pt({ id: "wide-1st", firstShotZone: "Wide", firstShotType: "First Serve" }),
    pt({ id: "t-2nd", firstShotZone: "T", firstShotType: "Second Serve" }),
    pt({
      id: "body-2nd",
      firstShotZone: "Body",
      firstShotType: "Second Serve",
    }),
    pt({
      id: "wide-2nd-set2",
      setNumber: 2,
      firstShotZone: "Wide",
      firstShotType: "Second Serve",
    }),
  ];
  // OR within Serve › Zone.
  expect(run(points, { serveZone: ["Wide", "T"] })).toEqual([
    "wide-1st",
    "t-2nd",
    "wide-2nd-set2",
  ]);
  // AND with Serve › Type.
  expect(
    run(points, { serveZone: ["Wide", "T"], serveType: ["second"] }),
  ).toEqual(["t-2nd", "wide-2nd-set2"]);
  // AND across sections (Score › Sets).
  expect(
    run(points, { serveZone: ["Wide", "T"], serveType: ["second"], sets: [2] }),
  ).toEqual(["wide-2nd-set2"]);
});

/* ── Serve / Return shared fields ───────────────────────────────────────── */

test("Serve.Player and Return.Player are ONE field: returner = you ⇔ server = opponent", () => {
  const points = [
    pt({ id: "p1-serves", serverIsPlayer1: true }),
    pt({ id: "p2-serves", serverIsPlayer1: false }),
  ];
  // You are player1: "you returning" is the opponent serving — player2's serve.
  expect(run(points, { server: "opponent" })).toEqual(["p2-serves"]);
  expect(run(points, { server: "you" })).toEqual(["p1-serves"]);
  // Same filter, other seat: you are player2, so you return player1's serve.
  expect(run(points, { server: "opponent" }, FLIPPED)).toEqual(["p1-serves"]);
  expect(run(points, { server: "you" }, FLIPPED)).toEqual(["p2-serves"]);
});

test("Serve.Side and Return.Side are ONE field: the point's service court", () => {
  const points = [
    pt({ id: "0-0", pointScore: "0-0", gameNumber: 1 }),
    pt({ id: "15-0", pointScore: "15-0", gameNumber: 1 }),
    pt({ id: "AD-40", pointScore: "AD-40", gameNumber: 1 }),
    pt({ id: "40-40", pointScore: "40-40", gameNumber: 1 }),
  ];
  expect(run(points, { court: "deuce" })).toEqual(["0-0", "40-40"]);
  expect(run(points, { court: "ad" })).toEqual(["15-0", "AD-40"]);
});

test("serve spin, zone and return type/spin/zone read the role-picked shots", () => {
  const points = [
    pt({
      id: "kick",
      firstShotSpin: "topspin",
      secondShotType: "Backhand",
      secondShotSpin: "backspin",
      secondShotZone: "Crosscourt",
    }),
    pt({
      id: "slice",
      firstShotSpin: "Sidespin",
      secondShotType: "Forehand",
      secondShotSpin: "Topspin",
      secondShotZone: "Down the Line",
    }),
    pt({ id: "flat", firstShotSpin: "Flat", secondShotZone: "Middle" }),
  ];
  expect(run(points, { serveSpin: ["Kick"] })).toEqual(["kick"]);
  expect(run(points, { serveSpin: ["Slice"] })).toEqual(["slice"]);
  expect(run(points, { returnSpin: ["Slice"] })).toEqual(["kick"]);
  expect(run(points, { returnType: ["Forehand"] })).toEqual(["slice"]);
  expect(run(points, { returnZone: ["Middle", "Crosscourt"] })).toEqual([
    "kick",
    "flat",
  ]);
});

test("return contact: inside / 0–1.0 m behind / more than 1.0 m behind, either end", () => {
  // Low end: baseline at y = 0, behind = −y.
  expect(returnContactOf(1)).toBe("inside");
  expect(returnContactOf(-0.5)).toBe("middle");
  expect(returnContactOf(-1.0)).toBe("middle");
  expect(returnContactOf(-1.5)).toBe("neutral");
  // High end: baseline at y = 23.77, behind = y − 23.77.
  expect(returnContactOf(22)).toBe("inside");
  expect(returnContactOf(24.3)).toBe("middle");
  expect(returnContactOf(25.5)).toBe("neutral");
  expect(returnContactOf(null)).toBeNull();

  const points = [
    pt({ id: "deep", secondShotContactY: 25.5 }),
    pt({ id: "inside", secondShotContactY: 2 }),
    pt({ id: "unmeasured", secondShotContactY: null }),
  ];
  expect(run(points, { returnContact: ["neutral"] })).toEqual(["deep"]);
  expect(
    run(points, { returnContact: ["inside", "middle", "neutral"] }),
  ).toEqual(["deep", "inside"]);
});

/* ── Score ──────────────────────────────────────────────────────────────── */

test("Pressure = raw 30-30 or 40-40, or a break/set/match point", () => {
  const points = [
    pt({ id: "30-30", pointScoreRaw: "30-30" }),
    pt({ id: "40-40", pointScoreRaw: "40 - 40" }),
    pt({ id: "bp", pointScoreRaw: "15-40", isBreakPoint: true }),
    pt({ id: "sp", pointScoreRaw: "40-15", isSetPoint: true }),
    pt({ id: "mp", pointScoreRaw: "40-0", isMatchPoint: true }),
    pt({ id: "calm", pointScoreRaw: "15-30" }),
    // A null raw score is unknown — the defaulted `pointScore` must not help.
    pt({ id: "unknown", pointScoreRaw: null, pointScore: "0-0" }),
    // A tiebreak 3-3 is not 30-30.
    pt({ id: "tb", pointScoreRaw: "3-3", gameScore: "6-6" }),
  ];
  expect(run(points, { scoreType: ["pressure"] })).toEqual([
    "30-30",
    "40-40",
    "bp",
    "sp",
    "mp",
  ]);
  expect(run(points, { scoreType: ["breakpoint"] })).toEqual(["bp"]);
  expect(run(points, { scoreType: ["setPoint", "matchPoint"] })).toEqual([
    "sp",
    "mp",
  ]);
});

test("Points grid matches the raw score server-first, with AD normalised to Ad", () => {
  const points = [
    pt({ id: "AD-40", pointScoreRaw: "AD-40" }),
    pt({ id: "40-ad", pointScoreRaw: " 40 - ad " }),
    pt({ id: "30-15", pointScoreRaw: "30-15" }),
    pt({ id: "15-30", pointScoreRaw: "15-30" }),
  ];
  expect(run(points, { scorePoints: ["Ad-40"] })).toEqual(["AD-40"]);
  expect(run(points, { scorePoints: ["40-Ad"] })).toEqual(["40-ad"]);
  // Server-first: 30-15 is not 15-30.
  expect(run(points, { scorePoints: ["30-15"] })).toEqual(["30-15"]);
  expect(run(points, { scorePoints: ["Ad-40", "15-30"] })).toEqual([
    "AD-40",
    "15-30",
  ]);
});

test("null and tiebreak scores never match the Points grid", () => {
  const points = [
    pt({ id: "real-0-0", pointScoreRaw: "0-0" }),
    pt({ id: "null", pointScoreRaw: null, pointScore: "0-0" }),
    pt({ id: "legacy-undefined", pointScore: "0-0" }),
    pt({ id: "tb-5-1", pointScoreRaw: "5-1", gameScore: "6-6" }),
    pt({ id: "tb-0-0", pointScoreRaw: "0-0", gameScore: "6-6" }),
    pt({ id: "0-AD", pointScoreRaw: "0-AD" }),
  ];
  expect(run(points, { scorePoints: ["0-0"] })).toEqual(["real-0-0"]);
  expect(
    run(points, {
      scorePoints: ["0-0", "15-0", "0-15", "40-0", "0-40", "Ad-40", "40-Ad"],
    }),
  ).toEqual(["real-0-0"]);
});

test("Sets filter by set number", () => {
  const points = [
    pt({ id: "s1", setNumber: 1 }),
    pt({ id: "s2", setNumber: 2 }),
    pt({ id: "s3", setNumber: 3 }),
  ];
  expect(run(points, { sets: [1, 3] })).toEqual(["s1", "s3"]);
});

/* ── Result ─────────────────────────────────────────────────────────────── */

/** Serve by player1 (you), return by player2, then alternating. */
function rally(
  lastType: string,
  count: number,
  lastResult: string,
): MatchShot[] {
  const shots: MatchShot[] = [];
  for (let n = 1; n <= count; n += 1) {
    const isLast = n === count;
    shots.push(
      shot({
        shotNumber: n,
        isPlayer1: n % 2 === 1,
        shotType:
          n === 1
            ? "First Serve"
            : isLast
              ? lastType
              : n % 2
                ? "Forehand"
                : "Backhand",
        result: isLast ? lastResult : "In",
      }),
    );
  }
  return shots;
}

test("Won/Lost are from the Result player's point of view, you when none is set", () => {
  const points = [
    pt({ id: "p1-won", wonByPlayer1: true }),
    pt({ id: "p2-won", wonByPlayer1: false }),
  ];
  expect(run(points, { resultOutcome: ["won"] })).toEqual(["p1-won"]);
  expect(run(points, { resultOutcome: ["lost"] })).toEqual(["p2-won"]);
  expect(run(points, { resultOutcome: ["won"] }, FLIPPED)).toEqual(["p2-won"]);
  expect(
    run(points, { resultPlayer: "opponent", resultOutcome: ["won"] }),
  ).toEqual(["p2-won"]);
  expect(
    run(points, { resultPlayer: "opponent", resultOutcome: ["lost"] }),
  ).toEqual(["p1-won"]);
});

test("Winner = the POV player hit a winner, ace or service winner", () => {
  const points = [
    // Your forehand winner on shot 5.
    pt({
      id: "you-fh-winner",
      resultType: "Forehand Winner",
      wonByPlayer1: true,
      shots: rally("Forehand", 5, "In"),
    }),
    // Rudy's backhand winner on shot 4.
    pt({
      id: "rudy-bh-winner",
      resultType: "Backhand Winner",
      wonByPlayer1: false,
      shots: rally("Backhand", 4, "In"),
    }),
    // Rudy serving an ace.
    pt({
      id: "rudy-ace",
      resultType: "Ace",
      serverIsPlayer1: false,
      wonByPlayer1: false,
      shots: [
        shot({ shotNumber: 1, isPlayer1: false, shotType: "First Serve" }),
      ],
    }),
    // Your service winner: the last row is Rudy's return into the net, but
    // the winner is the server's.
    pt({
      id: "you-service-winner",
      resultType: "Service Winner",
      serverIsPlayer1: true,
      wonByPlayer1: true,
      shots: rally("Forehand", 2, "Net"),
    }),
    pt({ id: "error", resultType: "Forehand Unforced Error" }),
  ];
  expect(run(points, { resultOutcome: ["winner"] })).toEqual([
    "you-fh-winner",
    "rudy-bh-winner",
    "rudy-ace",
    "you-service-winner",
  ]);
  expect(
    run(points, { resultPlayer: "you", resultOutcome: ["winner"] }),
  ).toEqual(["you-fh-winner", "you-service-winner"]);
  expect(
    run(points, { resultPlayer: "opponent", resultOutcome: ["winner"] }),
  ).toEqual(["rudy-bh-winner", "rudy-ace"]);
});

test("Error = the POV player made the error, incl. double faults and a null result type ending Out/Net", () => {
  const points = [
    // Rudy's forehand into the net on shot 4.
    pt({
      id: "rudy-ue",
      resultType: "Forehand Unforced Error",
      wonByPlayer1: true,
      shots: rally("Forehand", 4, "Net"),
    }),
    // Your forced error on shot 3.
    pt({
      id: "you-fe",
      resultType: "Backhand Forced Error",
      wonByPlayer1: false,
      shots: rally("Backhand", 3, "Out"),
    }),
    // Your double fault — the server's even when the last stored row is the
    // returner's (as ~80 live rows are).
    pt({
      id: "you-df",
      resultType: "Double Fault",
      serverIsPlayer1: true,
      wonByPlayer1: false,
      shots: [
        shot({
          shotNumber: 1,
          isPlayer1: true,
          shotType: "Second Serve",
          result: "Out",
        }),
        shot({
          shotNumber: 2,
          isPlayer1: false,
          shotType: "Forehand",
          result: "In",
        }),
      ],
    }),
    // No result type: Rudy's last shot went out — his error.
    pt({
      id: "null-rudy-out",
      resultType: "",
      wonByPlayer1: true,
      shots: rally("Backhand", 6, "Out"),
    }),
    // No result type and the last shot was In: no error to attribute.
    pt({
      id: "null-in",
      resultType: "",
      shots: rally("Forehand", 5, "In"),
    }),
    pt({
      id: "winner",
      resultType: "Forehand Winner",
      shots: rally("Forehand", 3, "In"),
    }),
  ];
  expect(run(points, { resultOutcome: ["error"] })).toEqual([
    "rudy-ue",
    "you-fe",
    "you-df",
    "null-rudy-out",
  ]);
  expect(
    run(points, { resultPlayer: "you", resultOutcome: ["error"] }),
  ).toEqual(["you-fe", "you-df"]);
  expect(
    run(points, { resultPlayer: "opponent", resultOutcome: ["error"] }),
  ).toEqual(["rudy-ue", "null-rudy-out"]);
});

test("Result › Shot: Serve = shot 1, Return = shot 2, else the stroke — by the POV player", () => {
  const points = [
    pt({
      id: "ace",
      resultType: "Ace",
      shots: [
        shot({ shotNumber: 0, isPlayer1: true, shotType: "Feed" }),
        shot({ shotNumber: 1, isPlayer1: true, shotType: "First Serve" }),
      ],
    }),
    pt({ id: "rudy-return", shots: rally("Backhand", 2, "Out") }),
    pt({ id: "you-volley", shots: rally("Forehand Volley", 5, "In") }),
    pt({ id: "rudy-overhead", shots: rally("Overhead", 4, "In") }),
    pt({ id: "you-fh", shots: rally("Forehand", 3, "In") }),
    pt({ id: "rudy-bh", shots: rally("Backhand", 6, "Net") }),
  ];
  expect(run(points, { resultShot: ["Serve"] })).toEqual(["ace"]);
  expect(run(points, { resultShot: ["Return"] })).toEqual(["rudy-return"]);
  expect(run(points, { resultShot: ["Volley"] })).toEqual(["you-volley"]);
  expect(run(points, { resultShot: ["Overhead"] })).toEqual(["rudy-overhead"]);
  // "Forehand Volley" is a volley, not a forehand.
  expect(run(points, { resultShot: ["Forehand"] })).toEqual(["you-fh"]);
  expect(
    run(points, {
      resultShot: ["Backhand", "Return"],
      resultPlayer: "opponent",
    }),
  ).toEqual(["rudy-return", "rudy-bh"]);
  expect(
    run(points, { resultShot: ["Backhand", "Return"], resultPlayer: "you" }),
  ).toEqual([]);
});

/* ── Custom: the same-shot rule ─────────────────────────────────────────── */

/**
 * Rudy (player2) at the high end hits shot 4 down the line and shot 6
 * crosscourt; you (player1) hit shot 5 crosscourt.
 */
function rudyPoint(): MatchPoint {
  return pt({
    id: "rudy",
    shots: [
      from("low", "deuce", {
        shotNumber: 1,
        isPlayer1: true,
        shotType: "First Serve",
      }),
      from("high", "deuce", {
        shotNumber: 2,
        isPlayer1: false,
        shotType: "Forehand",
        zone: "Middle",
      }),
      from("low", "deuce", {
        shotNumber: 3,
        isPlayer1: true,
        shotType: "Forehand",
        zone: "Middle",
      }),
      from("high", "deuce", {
        shotNumber: 4,
        isPlayer1: false,
        shotType: "Forehand",
        zone: "Down the Line",
      }),
      from("low", "deuce", {
        shotNumber: 5,
        isPlayer1: true,
        shotType: "Forehand",
        zone: "Crosscourt",
      }),
      from("high", "deuce", {
        shotNumber: 6,
        isPlayer1: false,
        shotType: "Forehand",
        zone: "Crosscourt",
      }),
    ],
  });
}

test("Custom: Rudy + Crosscourt + shot 4 does NOT match when shot 4 is his DTL and shot 6 his crosscourt", () => {
  const points = [rudyPoint()];
  expect(
    run(points, {
      customPlayer: "opponent",
      customDirection: ["Crosscourt"],
      customRallyShot: [4],
    }),
  ).toEqual([]);
});

test("Custom: one shot satisfying every chosen group matches", () => {
  const points = [rudyPoint()];
  expect(
    run(points, {
      customPlayer: "opponent",
      customDirection: ["Crosscourt"],
      customRallyShot: [6],
    }),
  ).toEqual(["rudy"]);
  // OR within Rally Shot: 4 or 6 — shot 6 carries it.
  expect(
    run(points, {
      customPlayer: "opponent",
      customDirection: ["Crosscourt"],
      customRallyShot: [4, 6],
    }),
  ).toEqual(["rudy"]);
  expect(
    run(points, {
      customPlayer: "opponent",
      customDirection: ["Down the Line"],
    }),
  ).toEqual(["rudy"]);
  // Shot 5 is crosscourt, but it is yours, not Rudy's.
  expect(
    run(points, {
      customPlayer: "opponent",
      customDirection: ["Crosscourt"],
      customRallyShot: [5],
    }),
  ).toEqual([]);
  // Side: every shot here is from the hitter's deuce half.
  expect(run(points, { customPlayer: "you", customSide: ["ad"] })).toEqual([]);
  expect(run(points, { customPlayer: "you", customSide: ["deuce"] })).toEqual([
    "rudy",
  ]);
});

test("Custom: shot numbers of 0 never match", () => {
  const points = [
    pt({
      id: "feed-only",
      shots: [
        from("low", "deuce", {
          shotNumber: 0,
          isPlayer1: true,
          shotType: "Feed",
        }),
      ],
    }),
  ];
  expect(run(points, { customPlayer: "you" })).toEqual([]);
  expect(run(points, { customSide: ["deuce"] })).toEqual([]);
});

test("Custom Direction: a right-hander's forehand crosscourt from the ad half is Inside Out", () => {
  const points = [
    pt({
      id: "inside-out",
      shots: [
        from("low", "ad", {
          shotNumber: 3,
          isPlayer1: true,
          shotType: "Forehand",
          zone: "Crosscourt",
        }),
      ],
    }),
    pt({
      id: "plain-cc",
      shots: [
        from("low", "deuce", {
          shotNumber: 3,
          isPlayer1: true,
          shotType: "Forehand",
          zone: "Crosscourt",
        }),
      ],
    }),
    pt({
      id: "inside-in",
      shots: [
        from("high", "ad", {
          shotNumber: 3,
          isPlayer1: true,
          shotType: "Forehand",
          zone: "Down the Line",
        }),
      ],
    }),
  ];
  expect(run(points, { customDirection: ["Inside Out"] })).toEqual([
    "inside-out",
  ]);
  expect(run(points, { customDirection: ["Crosscourt"] })).toEqual([
    "plain-cc",
  ]);
  expect(run(points, { customDirection: ["Inside In"] })).toEqual([
    "inside-in",
  ]);
  // With no known hand there is no Inside-*: the ad-half forehand stays plain.
  const noHands: MatchFilterContext = {
    ...CTX,
    hands: { player1: null, player2: null },
  };
  expect(run(points, { customDirection: ["Crosscourt"] }, noHands)).toEqual([
    "inside-out",
    "plain-cc",
  ]);
});

test("buildFilterContext: the match row's hand first, else inferred from forehands", () => {
  // Player2's forehands all from the ad half at the high end → a left-hander.
  const lefty = Array.from({ length: 12 }, (_, i) =>
    pt({
      id: `l${i}`,
      shots: [
        from("high", "ad", {
          shotNumber: 3,
          isPlayer1: false,
          shotType: "Forehand",
        }),
      ],
    }),
  );
  const match = {
    player1: { hand: "Right" },
    player2: { hand: null },
  } as unknown as Pick<Match, "player1" | "player2">;
  expect(buildFilterContext(match, lefty, true)).toEqual({
    youIsPlayer1: true,
    hands: { player1: "right", player2: "left" },
  });
});

/* ── Serve › Result, Return › Result, Result › Missed / Rally length ────── */

test("Serve › Result is ONE option per point: result type first, then the return's result", () => {
  const points = [
    pt({ id: "ace", resultType: "Ace", rallyLength: 1 }),
    pt({ id: "sw", resultType: "Service Winner", rallyLength: 1 }),
    pt({ id: "re", resultType: "Forehand Error", secondShotResult: "Net" }),
    pt({ id: "ip", resultType: "Forehand Winner", secondShotResult: "In" }),
    pt({ id: "df", resultType: "Double Fault", rallyLength: 0 }),
    // Neither a serve result type nor a recorded return.
    pt({ id: "none", resultType: "Forehand Winner" }),
  ];
  expect(run(points, { serveResult: ["ace"] })).toEqual(["ace"]);
  expect(run(points, { serveResult: ["service-winner"] })).toEqual(["sw"]);
  expect(run(points, { serveResult: ["return-error"] })).toEqual(["re"]);
  expect(run(points, { serveResult: ["in-play"] })).toEqual(["ip"]);
  expect(run(points, { serveResult: ["double-fault"] })).toEqual(["df"]);
  // "none" matches no option, so every option together leaves it out.
  expect(
    run(points, {
      serveResult: [
        "ace",
        "service-winner",
        "return-error",
        "in-play",
        "double-fault",
      ],
    }),
  ).toEqual(["ace", "sw", "re", "ip", "df"]);

  // The chain: a service winner whose return row reads Out is a service
  // winner only, never a return error as well.
  const swOut = [
    pt({
      id: "sw-out",
      resultType: "Service Winner",
      secondShotResult: "Out",
    }),
  ];
  expect(run(swOut, { serveResult: ["service-winner"] })).toEqual(["sw-out"]);
  for (const other of [
    "ace",
    "return-error",
    "in-play",
    "double-fault",
  ] as const) {
    expect(run(swOut, { serveResult: [other] })).toEqual([]);
  }
});

test("Return › Result: winner = isReturnWinner, error = return Out/Net, in play = landed otherwise", () => {
  const points = [
    // A two-shot rally ended by the returner's backhand winner.
    pt({
      id: "ret-winner",
      resultType: "Backhand Winner",
      secondShotResult: "In",
      rallyLength: 2,
    }),
    // The return landed and the rally went on to six shots.
    pt({
      id: "ret-in",
      resultType: "Forehand Winner",
      secondShotResult: "In",
      rallyLength: 6,
    }),
    pt({
      id: "ret-out",
      resultType: "Backhand Error",
      secondShotResult: "Out",
      rallyLength: 2,
    }),
    pt({ id: "ret-none", resultType: "Forehand Winner", rallyLength: 4 }),
  ];
  expect(run(points, { returnResult: ["winner"] })).toEqual(["ret-winner"]);
  expect(run(points, { returnResult: ["in-play"] })).toEqual(["ret-in"]);
  expect(run(points, { returnResult: ["error"] })).toEqual(["ret-out"]);
  expect(
    run(points, { returnResult: ["winner", "error", "in-play"] }),
  ).not.toContain("ret-none");
});

test("Result › Missed reads the LAST shot row, by the Result player when one is set", () => {
  const points = [
    // Your forehand, the last row, went out (lower-case on purpose).
    pt({ id: "you-out", shots: rally("Forehand", 5, "out") }),
    // The opponent's backhand, the last row, found the net.
    pt({ id: "opp-net", shots: rally("Backhand", 4, "Net") }),
    // An earlier row was Out, but the last row landed.
    pt({
      id: "last-in",
      shots: [
        shot({ shotNumber: 1, shotType: "First Serve", result: "Out" }),
        shot({ shotNumber: 2, isPlayer1: false, result: "In" }),
      ],
    }),
    // No shot rows at all — no last shot to read.
    pt({ id: "no-rows", lastShotType: "Forehand" }),
  ];
  expect(run(points, { resultMissed: ["Out"] })).toEqual(["you-out"]);
  expect(run(points, { resultMissed: ["Net"] })).toEqual(["opp-net"]);
  expect(run(points, { resultMissed: ["Out", "Net"] })).toEqual([
    "you-out",
    "opp-net",
  ]);
  expect(
    run(points, { resultPlayer: "you", resultMissed: ["Out", "Net"] }),
  ).toEqual(["you-out"]);
  expect(
    run(points, { resultPlayer: "opponent", resultMissed: ["Out", "Net"] }),
  ).toEqual(["opp-net"]);
  // Seats follow youIsPlayer1.
  expect(
    run(points, { resultPlayer: "you", resultMissed: ["Out", "Net"] }, FLIPPED),
  ).toEqual(["opp-net"]);
});

test("Result › Rally length uses the rally-length card's bands: 1–4, 5–8, 9+", () => {
  const lengths = [0, 1, 4, 5, 8, 9, 11];
  const points = lengths.map((n) => pt({ id: `r${n}`, rallyLength: n }));
  expect(run(points, { resultRallyLength: ["short"] })).toEqual(["r1", "r4"]);
  expect(run(points, { resultRallyLength: ["medium"] })).toEqual(["r5", "r8"]);
  expect(run(points, { resultRallyLength: ["long"] })).toEqual(["r9", "r11"]);
  // 0 = no shot count recorded: in no band.
  expect(
    run(points, { resultRallyLength: ["short", "medium", "long"] }),
  ).not.toContain("r0");
});

/* ── Option availability ────────────────────────────────────────────────── */

test("optionAvailability reports options with zero points across the WHOLE match", () => {
  const points = [
    pt({
      id: "a",
      setNumber: 1,
      pointScoreRaw: "30-30",
      firstShotZone: "Wide",
    }),
    pt({ id: "b", setNumber: 1, pointScoreRaw: "40-15", firstShotZone: "T" }),
  ];
  const av = optionAvailability(points, CTX);
  // No Ad scores anywhere in the match → hidden.
  expect(av.scorePoints.has("Ad-40")).toBe(false);
  expect(av.scorePoints.has("40-Ad")).toBe(false);
  expect(av.scorePoints.has("30-30")).toBe(true);
  expect(av.scorePoints.has("40-15")).toBe(true);
  expect([...av.sets]).toEqual([1]);
  expect(av.serveZone.has("Body")).toBe(false);
  expect(av.serveZone.has("Wide")).toBe(true);
  expect(av.scoreType.has("pressure")).toBe(true);
  expect(av.scoreType.has("breakpoint")).toBe(false);
  expect(av.customRallyShot.size).toBe(0);

  // Whole match, not the selection: nothing in the result depends on filters.
  const again = optionAvailability(points, CTX);
  expect([...again.serveZone]).toEqual([...av.serveZone]);
});

test("optionAvailability hides Serve › Result's Ace when the match has none", () => {
  const points = [
    pt({ id: "sw", resultType: "Service Winner", rallyLength: 1 }),
    pt({ id: "df", resultType: "Double Fault", rallyLength: 0 }),
  ];
  const av = optionAvailability(points, CTX);
  expect(av.serveResult.has("ace")).toBe(false);
  expect(av.serveResult.has("service-winner")).toBe(true);
  expect(av.serveResult.has("double-fault")).toBe(true);
});

/* ── Counting, equality, URL ────────────────────────────────────────────── */

const EVERYTHING: MatchFilters = {
  sets: [1, 3],
  scoreType: ["pressure", "breakpoint", "setPoint", "matchPoint"],
  scorePoints: ["30-30", "Ad-40", "40-Ad", "0-0"],
  server: "opponent",
  court: "ad",
  serveType: ["first", "second"],
  serveSpin: ["Flat", "Slice", "Kick"],
  serveZone: ["Wide", "Body", "T"],
  serveResult: [
    "ace",
    "service-winner",
    "return-error",
    "in-play",
    "double-fault",
  ],
  returnType: ["Forehand", "Backhand"],
  returnSpin: ["Topspin", "Slice"],
  returnZone: ["Down the Line", "Middle", "Crosscourt"],
  returnContact: ["inside", "middle", "neutral"],
  returnResult: ["winner", "error", "in-play"],
  resultPlayer: "you",
  resultShot: ["Serve", "Return", "Forehand", "Backhand", "Volley", "Overhead"],
  resultOutcome: ["won", "lost", "winner", "error"],
  resultMissed: ["Out", "Net"],
  resultRallyLength: ["short", "medium", "long"],
  customPlayer: "opponent",
  customSide: ["deuce", "ad"],
  customDirection: ["Crosscourt", "Down the Line", "Inside Out", "Inside In"],
  customRallyShot: [1, 4, 12],
};

test("serialize/parse round-trips a filter with every field set", () => {
  // Every group is set, so every field is exercised.
  for (const key of MATCH_FILTER_KEYS) {
    const v = EVERYTHING[key];
    expect(Array.isArray(v) ? v.length > 0 : v !== null).toBe(true);
  }
  const text = serializeMatchFilters(EVERYTHING);
  // URL-safe through URLSearchParams unchanged.
  expect(new URLSearchParams({ f: text }).toString()).toBe(`f=${text}`);
  const back = parseMatchFilters(text);
  expect(filtersEqual(back, EVERYTHING)).toBe(true);
  expect(serializeMatchFilters(back)).toBe(text);
});

test("serialization is deterministic and empty filters serialize to ''", () => {
  expect(serializeMatchFilters(EMPTY_MATCH_FILTERS)).toBe("");
  const a = f({ serveZone: ["T", "Wide"], sets: [3, 1], server: "you" });
  const b = f({ server: "you", sets: [1, 3], serveZone: ["Wide", "T"] });
  expect(serializeMatchFilters(a)).toBe(serializeMatchFilters(b));
  expect(serializeMatchFilters(a)).toBe("s.1.3_sv.y_vz.w.t");
});

test("parse of garbage is EMPTY and never throws", () => {
  for (const junk of [
    "",
    "garbage",
    "%%%;;==",
    "zz.1.2_qq",
    "s.0.abc.-1",
    "sv.maybe",
    "____....",
    "st",
    null,
    undefined,
    42,
    {},
  ]) {
    expect(filtersEqual(parseMatchFilters(junk), EMPTY_MATCH_FILTERS)).toBe(
      true,
    );
  }
  // Valid parts of a partly bad string survive.
  expect(
    filtersEqual(
      parseMatchFilters("zz.9_sv.o.y_vz.w.nope_s.2.2"),
      f({ server: "opponent", serveZone: ["Wide"], sets: [2] }),
    ),
  ).toBe(true);
});

test("activeFilterCount counts chosen options; filtersEqual ignores order", () => {
  expect(activeFilterCount(EMPTY_MATCH_FILTERS)).toBe(0);
  expect(
    activeFilterCount(
      f({ serveZone: ["Wide", "T"], server: "you", sets: [1] }),
    ),
  ).toBe(4);
  expect(
    filtersEqual(
      f({ serveZone: ["Wide", "T"] }),
      f({ serveZone: ["T", "Wide"] }),
    ),
  ).toBe(true);
  expect(
    filtersEqual(f({ serveZone: ["Wide"] }), f({ serveZone: ["Wide", "T"] })),
  ).toBe(false);
  expect(filtersEqual(f({ server: "you" }), f({ server: "opponent" }))).toBe(
    false,
  );
});

test("toggleMatchFilter adds/removes list options and sets/clears single choices", () => {
  const one = toggleMatchFilter(EMPTY_MATCH_FILTERS, "serveZone", "T");
  expect(one.serveZone).toEqual(["T"]);
  expect(toggleMatchFilter(one, "serveZone", "T").serveZone).toEqual([]);
  const you = toggleMatchFilter(EMPTY_MATCH_FILTERS, "server", "you");
  expect(you.server).toBe("you");
  expect(toggleMatchFilter(you, "server", "opponent").server).toBe("opponent");
  expect(toggleMatchFilter(you, "server", "you").server).toBeNull();
  // EMPTY is never mutated.
  expect(activeFilterCount(EMPTY_MATCH_FILTERS)).toBe(0);
});
