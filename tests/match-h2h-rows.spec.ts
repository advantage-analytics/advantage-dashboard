import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

import {
  DERIVED_H2H_GROUPS,
  DERIVED_SERVE_ROWS,
  H2H_GROUPS,
  POINT_ROWS,
  RETURN_ROWS,
  SERVE_ROWS,
  buildStatRows,
  figureReadout,
  h2hGroups,
  hasReadout,
  rowLeader,
  rowCutLabel,
  rowReadout,
  tallySide,
  withErrorSplit,
  withPointRows,
  type H2HRow,
  type H2HRowConfig,
  type H2HStats,
} from "@/components/dashboard/matches/match-detail/head-to-head-card";
import {
  NET_OVERHEAD_DEPTH_M,
  NET_ZONE_DEPTH_M,
  cameToNet,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { netPointsWonPct } from "@/lib/data/match-stats-server";

/**
 * The head-to-head table's sixteen rows and the rule that emphasises one of
 * them.
 *
 * Pure and offline: the card is a table, and what goes wrong with a table is
 * never visible in it. A leader rule that reads "higher wins" everywhere bolds
 * the player who hit MORE double faults and more unforced errors, and the row
 * looks exactly as correct as the thirteen above it. A break-points-saved row
 * that prints the published count instead of the rate says "9" on a player who
 * faced twelve and "9" on a player who faced nine. And a row silently dropped
 * from the config just isn't there — nothing renders a gap.
 */

/** One side's statistics, with only the fields a test actually needs. */
function side(overrides: Partial<H2HStats> = {}): H2HStats {
  return { fractions: {}, ...overrides };
}

function byLabel(rows: H2HRow[], label: string): H2HRow {
  const row = rows.find((candidate) => candidate.label === label);
  if (!row) throw new Error(`no row labelled "${label}"`);
  return row;
}

const ALL_ROWS: H2HRowConfig[] = H2H_GROUPS.flatMap((group) => group.configs);

test.describe("the row configuration", () => {
  test("is sixteen rows in three groups of seven, four and five", () => {
    expect(H2H_GROUPS.map((group) => group.title)).toEqual([
      "Serve",
      "Return",
      "Points",
    ]);
    expect(H2H_GROUPS.map((group) => group.configs.length)).toEqual([7, 4, 5]);
    expect(ALL_ROWS).toHaveLength(16);
  });

  test("every label is sentence case", () => {
    // The 46a card title-cased them ("Break Points Saved"); 47f does not, and a
    // single stray capital in a column of fifteen is conspicuous.
    for (const config of ALL_ROWS) {
      expect(config.label).toBe(
        config.label.charAt(0) + config.label.slice(1).toLowerCase(),
      );
    }
  });

  test("exactly two rows are lower-is-better", () => {
    // The whole point of the flag. If a third row ever acquires it — or one of
    // these two loses it — the emphasis on that row inverts with nothing on
    // screen to say so.
    expect(
      ALL_ROWS.filter((config) => config.lowerIsBetter).map((c) => c.label),
    ).toEqual(["Double faults", "Unforced errors"]);
  });

  test("break points saved is a rate off the fraction, not the published count", () => {
    const config = byConfig("Break points saved");
    expect(config.fromFraction).toBe(true);
    expect(config.fractionKey).toBe("breakpointsSaved");
    expect(config.isPercentage).toBe(true);
  });

  test("return winners has no published source — it is counted from points", () => {
    const config = byConfig("Return winners");
    expect(config.key).toBeUndefined();
    expect(config.fractionKey).toBeUndefined();
    expect(config.fromPoints).toBe("returnWinners");
  });
});

function byConfig(label: string): H2HRowConfig {
  const config = ALL_ROWS.find((candidate) => candidate.label === label);
  if (!config) throw new Error(`no config labelled "${label}"`);
  return config;
}

test.describe("rowLeader", () => {
  test("the higher number leads", () => {
    expect(rowLeader({}, 12, 4)).toBe("you");
    expect(rowLeader({}, 4, 12)).toBe("opp");
  });

  test("the lower number leads where the row says so", () => {
    expect(rowLeader({ lowerIsBetter: true }, 12, 4)).toBe("opp");
    expect(rowLeader({ lowerIsBetter: true }, 4, 12)).toBe("you");
  });

  test("a tie emphasises neither, on both kinds of row", () => {
    expect(rowLeader({}, 7, 7)).toBeNull();
    expect(rowLeader({ lowerIsBetter: true }, 7, 7)).toBeNull();
    // Including a tie at zero, which is the common one: two players who each
    // hit no aces have not each won the row.
    expect(rowLeader({}, 0, 0)).toBeNull();
  });

  test("a missing figure on either side leaves the row unemphasised", () => {
    // Not "the side with a number wins by default": an em dash is unknown, and
    // a bolded 8 opposite it claims a comparison nobody made.
    expect(rowLeader({}, 8, null)).toBeNull();
    expect(rowLeader({}, null, 8)).toBeNull();
    expect(rowLeader({ lowerIsBetter: true }, null, null)).toBeNull();
  });
});

test.describe("the Serve group", () => {
  test("emphasis inverts on double faults and nowhere else", () => {
    const rows = buildStatRows(
      SERVE_ROWS,
      side({ aces: 9, doubleFaults: 6 }),
      side({ aces: 3, doubleFaults: 1 }),
    );

    // More aces is better, so the bigger number leads.
    expect(byLabel(rows, "Aces").leader).toBe("you");
    expect(byLabel(rows, "Aces").you.display).toBe("9");
    // More double faults is worse, so the SMALLER number leads — this is the
    // row that reads correct while being wrong.
    expect(byLabel(rows, "Double faults").leader).toBe("opp");
    expect(byLabel(rows, "Double faults").you.display).toBe("6");
  });

  test("break points saved reads 9/12 as 75%, with the fraction in the tooltip", () => {
    const rows = buildStatRows(
      SERVE_ROWS,
      side({
        breakpointsSaved: 9,
        fractions: { breakpointsSaved: { made: 9, attempts: 12 } },
      }),
      side({
        breakpointsSaved: 9,
        fractions: { breakpointsSaved: { made: 9, attempts: 9 } },
      }),
    );

    const row = byLabel(rows, "Break points saved");
    expect(row.you.display).toBe("75%");
    expect(row.you.detail).toBe("9/12");
    expect(row.opp.display).toBe("100%");
    expect(row.opp.detail).toBe("9/9");
    // Both published counts are 9. Only the rate separates them, so a row that
    // fell back to the count would tie here and emphasise neither.
    expect(row.leader).toBe("opp");
  });

  test("no break points faced is an em dash, not 0%", () => {
    const rows = buildStatRows(
      SERVE_ROWS,
      side({ breakpointsSaved: 0 }),
      side({
        breakpointsSaved: 0,
        fractions: { breakpointsSaved: { made: 2, attempts: 4 } },
      }),
    );

    const row = byLabel(rows, "Break points saved");
    // A player who was never broken to has saved nothing and failed nothing.
    expect(row.you.display).toBe("");
    expect(row.you.value).toBeNull();
    expect(row.opp.display).toBe("50%");
    expect(row.leader).toBeNull();
  });

  test("a withheld statistic stays an em dash and wins nothing", () => {
    // `aces: null` is a suppressed column, not zero. (A video-derived match
    // no longer reads `aces` at all — its Aces row is counted from the
    // points, see "on an Advantage Intelligence match" below.)
    const rows = buildStatRows(
      SERVE_ROWS,
      side({ aces: null }),
      side({ aces: 5 }),
    );

    expect(byLabel(rows, "Aces").you.display).toBe("");
    expect(byLabel(rows, "Aces").opp.display).toBe("5");
    expect(byLabel(rows, "Aces").leader).toBeNull();
  });

  test("percentages round and carry their fraction", () => {
    const rows = buildStatRows(
      SERVE_ROWS,
      side({
        firstServeInPct: 62,
        fractions: { firstServeInPct: { made: 38, attempts: 61 } },
      }),
      side({ firstServeInPct: 71 }),
    );

    const row = byLabel(rows, "First serve in");
    expect(row.you.display).toBe("62%");
    expect(row.you.detail).toBe("38/61");
    expect(row.opp.display).toBe("71%");
    expect(row.opp.detail).toBeUndefined();
    expect(row.leader).toBe("opp");
  });
});

test.describe("the Return group", () => {
  test("the published figures alone never produce return winners", () => {
    // Deliberately given every figure a wrong implementation might reach for.
    const rich = side({
      winners: 31,
      firstReturnWonPct: 44,
      fractions: {
        firstReturnWonPct: { made: 22, attempts: 50 },
        breakpointsWonPct: { made: 3, attempts: 7 },
      },
    });
    const rows = buildStatRows(RETURN_ROWS, rich, side({ winners: 4 }));

    const row = byLabel(rows, "Return winners");
    expect(row.you.display).toBe("");
    expect(row.opp.display).toBe("");
    expect(row.you.value).toBeNull();
    expect(row.leader).toBeNull();

    // The row still exists — the frame draws four rows here.
    expect(rows).toHaveLength(4);
  });
});

test.describe("the Points group", () => {
  test("emphasis inverts on unforced errors and nowhere else", () => {
    const rows = buildStatRows(
      POINT_ROWS,
      side({
        winners: 24,
        unforcedErrors: 31,
        totalPointsWon: 78,
        totalPoints: 148,
      }),
      side({
        winners: 18,
        unforcedErrors: 12,
        totalPointsWon: 70,
        totalPoints: 148,
      }),
    );

    expect(byLabel(rows, "Winners").leader).toBe("you");
    expect(byLabel(rows, "Unforced errors").leader).toBe("opp");
    expect(byLabel(rows, "Total points won").leader).toBe("you");
  });

  test("total points won names the denominator it is out of", () => {
    const rows = buildStatRows(
      POINT_ROWS,
      side({ totalPointsWon: 78, totalPoints: 148 }),
      side({ totalPointsWon: 70, totalPoints: 148 }),
    );

    const row = byLabel(rows, "Total points won");
    expect(row.you.display).toBe("78");
    expect(row.you.detail).toBe("of 148");
  });
});

test.describe("orientation", () => {
  test("the builder is symmetric — swapping the sides swaps the leader", () => {
    // The builder takes `you` and `opp`, never `player1` and `player2`, so the
    // only thing that can put a number in the wrong column is the caller's
    // `useMatchSides()` read. This pins the half that lives here.
    const strong = side({ aces: 9, doubleFaults: 1, unforcedErrors: 8 });
    const weak = side({ aces: 2, doubleFaults: 7, unforcedErrors: 25 });

    const asYou = buildStatRows([...SERVE_ROWS, ...POINT_ROWS], strong, weak);
    const asOpp = buildStatRows([...SERVE_ROWS, ...POINT_ROWS], weak, strong);

    for (const label of ["Aces", "Double faults", "Unforced errors"]) {
      expect(byLabel(asYou, label).leader).toBe("you");
      expect(byLabel(asOpp, label).leader).toBe("opp");
      expect(byLabel(asYou, label).you.display).toBe(
        byLabel(asOpp, label).opp.display,
      );
    }
  });
});

test.describe("hover readouts, with and without video", () => {
  // Every figure answers a hover the same way whether or not the match has a
  // playable video; only the footer changes. Without video, a figure that
  // would have offered "Watch all N in Video" says "No video attached"
  // instead, and one that never could (a zero, a row with no cut) says
  // nothing extra.
  const rows = buildStatRows(
    [...SERVE_ROWS, ...POINT_ROWS],
    side({
      aces: 3,
      winners: 12,
      serviceGamesWonPct: 60,
      fractions: { serviceGamesWonPct: { made: 6, attempts: 10 } },
    }),
    side({
      aces: 0,
      winners: 0,
      serviceGamesWonPct: 50,
      fractions: { serviceGamesWonPct: { made: 4, attempts: 8 } },
    }),
  );
  const aces = byLabel(rows, "Aces");
  const uncut = byLabel(rows, "Service games won");
  const noVideo = { hasVideo: false, count: 0, noVideoLine: true };
  const shareLink = { hasVideo: false, count: 0, noVideoLine: false };
  const videoNoPoints = { hasVideo: true, count: 0, noVideoLine: false };

  test("without video, a figure on a row with a cut gets the no-video footer", () => {
    const readout = figureReadout(aces, "you", "Ace", noVideo);
    expect(hasReadout(readout)).toBe(true);
    expect(readout?.footer).toEqual({ kind: "no-video" });
  });

  test("a zero keeps its empty state and no footer, with or without video", () => {
    for (const scope of [noVideo, videoNoPoints]) {
      const readout = figureReadout(aces, "opp", "Opp", scope);
      expect(readout?.note).toBe("No aces in this match");
      expect(readout?.footer).toBeUndefined();
    }
  });

  test("with video and points behind it, a figure gets the watch footer", () => {
    const readout = figureReadout(aces, "you", "Ace", {
      ...videoNoPoints,
      count: 3,
    });
    expect(readout?.footer).toEqual({ kind: "watch", count: 3 });
    expect(readout?.note).toBeUndefined();
  });

  test("a row with no cut shows its fraction and no footer either way", () => {
    for (const scope of [noVideo, videoNoPoints]) {
      const readout = figureReadout(uncut, "you", "Ace", scope);
      expect(readout?.lines.map((line) => line.name)).toEqual(["6 of 10 won"]);
      expect(readout?.footer).toBeUndefined();
    }
  });

  test("the label follows the same footer rule", () => {
    expect(rowReadout(aces, "Ace", "Opp", noVideo).footer).toEqual({
      kind: "no-video",
    });
    expect(
      rowReadout(aces, "Ace", "Opp", { ...videoNoPoints, count: 3 }).footer,
    ).toEqual({ kind: "watch", count: 3 });
    expect(rowReadout(uncut, "Ace", "Opp", noVideo).footer).toBeUndefined();
    expect(hasReadout(rowReadout(uncut, "Ace", "Opp", noVideo))).toBe(true);
  });

  test("a read-only share link never says no video — it may have one", () => {
    // /m/[token] never shows video, whatever the match has, so the readout
    // keeps its evidence and drops the footer rather than state something
    // false.
    const figure = figureReadout(aces, "you", "Ace", shareLink);
    expect(figure?.footer).toBeUndefined();
    expect(rowReadout(aces, "Ace", "Opp", shareLink).footer).toBeUndefined();
    const fraction = figureReadout(uncut, "you", "Ace", shareLink);
    expect(hasReadout(fraction)).toBe(true);
    expect(figureReadout(aces, "opp", "Opp", shareLink)?.note).toBe(
      "No aces in this match",
    );
  });

  test("an em dash has no readout — it keeps its own tooltip", () => {
    const [missing] = buildStatRows(SERVE_ROWS, side(), side());
    expect(figureReadout(missing, "you", "Ace", noVideo)).toBeNull();
  });
});

/* ── Advantage Intelligence: unreturned serves are aces ─────────────────── */

function pt(overrides: Partial<MatchPoint> & { id: string }): MatchPoint {
  return {
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "",
    eventType: "",
    description: "",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 5,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

// Player 1 is "you". What the derivation writes: every unreturned serve is a
// "Service Winner", never an "Ace".
const DERIVED_MATCH: MatchPoint[] = [
  pt({ id: "sw-you-1", resultType: "Service Winner", rallyLength: 1 }),
  pt({ id: "sw-you-2", resultType: "Service Winner", rallyLength: 1 }),
  pt({
    id: "sw-opp",
    resultType: "Service Winner",
    rallyLength: 1,
    serverIsPlayer1: false,
    wonByPlayer1: false,
    player: "player2",
  }),
  pt({
    id: "df-you",
    resultType: "Double Fault",
    rallyLength: 0,
    wonByPlayer1: false,
  }),
  pt({ id: "fw-you", resultType: "Forehand Winner", rallyLength: 5 }),
];

function derivedRows(
  configs: H2HRowConfig[],
  you: H2HStats,
  opp: H2HStats,
  points: MatchPoint[] = DERIVED_MATCH,
): H2HRow[] {
  return withPointRows(
    configs,
    buildStatRows(configs, you, opp),
    tallySide(points, true),
    tallySide(points, false),
  );
}

test.describe("on an Advantage Intelligence match", () => {
  test("tallySide counts unreturned serves the server won, for the server", () => {
    expect(tallySide(DERIVED_MATCH, true).unreturnedServes).toBe(2);
    expect(tallySide(DERIVED_MATCH, false).unreturnedServes).toBe(1);
  });

  test("aces are the unreturned serves, not the published column", () => {
    const rows = derivedRows(
      DERIVED_SERVE_ROWS,
      side({ aces: null, doubleFaults: 1 }),
      side({ aces: null, doubleFaults: 0 }),
    );
    const aces = byLabel(rows, "Aces");
    expect(aces.you.display).toBe("2");
    expect(aces.opp.display).toBe("1");
    expect(aces.leader).toBe("you");
    // Double faults stay published.
    expect(byLabel(rows, "Double faults").you.display).toBe("1");
    expect(byLabel(rows, "Double faults").opp.display).toBe("0");
  });

  test("the default configs still read aces from the published column", () => {
    const rows = derivedRows(
      SERVE_ROWS,
      side({ aces: null }),
      side({ aces: null }),
    );
    expect(byLabel(rows, "Aces").you.display).toBe("");
    expect(byLabel(rows, "Aces").opp.display).toBe("");
    expect(byLabel(rows, "Aces").leader).toBeNull();
  });

  test("winners are the published figure, which holds no service winners", () => {
    const rows = derivedRows(
      POINT_ROWS,
      side({ winners: 18 }),
      side({ winners: 0 }),
    );
    expect(byLabel(rows, "Winners").you.display).toBe("18");
    expect(byLabel(rows, "Winners").opp.display).toBe("0");
    const config = POINT_ROWS.find((c) => c.label === "Winners");
    expect(config?.fromPoints).toBeUndefined();
  });

  test("double faults are read as published, not counted", () => {
    const config = DERIVED_SERVE_ROWS.find((c) => c.label === "Double faults");
    expect(config?.key).toBe("doubleFaults");
    expect(config?.fromPoints).toBeUndefined();
  });

  test("a service winner with a stroke in between is neither an ace nor a winner", () => {
    // Structural rule: rally length one, won by the server — not the label.
    const points = [
      pt({ id: "sw-long", resultType: "Service Winner", rallyLength: 3 }),
    ];
    expect(tallySide(points, true).unreturnedServes).toBe(0);
    expect(tallySide(points, true).winners).toBe(0);
  });

  test("the derived groups keep the same sixteen rows in the same order", () => {
    expect(DERIVED_SERVE_ROWS.map((c) => c.label)).toEqual(
      SERVE_ROWS.map((c) => c.label),
    );
    const points = DERIVED_H2H_GROUPS.find((g) => g.title === "Points");
    expect(points?.configs).toEqual(POINT_ROWS);
  });
});

test.describe("net points", () => {
  const shot = (
    shotNumber: number,
    isPlayer1: boolean,
    shotType: string,
    contactY: number | null,
  ) => ({ shotNumber, isPlayer1, shotType, contactY }) as MatchShot;
  const point = (wonByPlayer1: boolean, ...shots: MatchShot[]) =>
    ({ wonByPlayer1, serverIsPlayer1: true, shots }) as MatchPoint;
  const serve = shot(1, true, "First Serve", 0);
  const NET = 11.885;

  test("a volley counts anywhere", () => {
    expect(
      cameToNet(point(true, serve, shot(3, true, "Volley", null)), true),
    ).toBe(true);
    expect(
      cameToNet(point(true, serve, shot(3, true, "Forehand Volley", 1)), true),
    ).toBe(true);
  });

  test("a groundstroke counts from inside the service line, either end", () => {
    const at = (y: number) => point(true, serve, shot(3, true, "Forehand", y));
    expect(cameToNet(at(NET - 5), true)).toBe(true);
    expect(cameToNet(at(NET + 5), true)).toBe(true);
    expect(cameToNet(at(NET - 7), true)).toBe(false);
    expect(cameToNet(at(0.5), true)).toBe(false);
  });

  test("an overhead from the back of the court does not count", () => {
    const at = (y: number | null) =>
      point(true, serve, shot(3, true, "Overhead", y));
    expect(cameToNet(at(NET - 7), true)).toBe(true);
    expect(cameToNet(at(NET - 11), true)).toBe(false);
    expect(cameToNet(at(null), true)).toBe(true);
  });

  test("the serve, a return and the other player's shots do not count", () => {
    const close = NET - 3;
    expect(
      cameToNet(point(true, shot(1, true, "First Serve", close)), true),
    ).toBe(false);
    expect(
      cameToNet(point(true, serve, shot(2, false, "Forehand", close)), false),
    ).toBe(false);
    expect(
      cameToNet(point(true, serve, shot(3, true, "Volley", close)), false),
    ).toBe(false);
  });

  test("attempts and won are counted per side, won as a rate with its fraction", () => {
    const youIn = shot(3, true, "Volley", NET - 3);
    const points = [
      point(true, serve, youIn),
      point(false, serve, youIn),
      point(true, serve, shot(3, true, "Forehand", NET - 5)),
      point(true, serve, shot(3, true, "Forehand", 1)),
    ];
    const you = tallySide(points, true);
    const opp = tallySide(points, false);
    const configs = POINT_ROWS.filter((c) => c.label.startsWith("Net"));
    const rows = withPointRows(configs, [], you, opp);

    const attempts = byLabel(rows, "Net point attempts");
    expect(attempts.you.display).toBe("3");
    // No shots of theirs on record: unmeasured, not a zero.
    expect(attempts.opp.display).toBe("");

    const won = byLabel(rows, "Net points won");
    expect(won.you).toMatchObject({ display: "67%", detail: "2/3" });
    expect(won.opp.display).toBe("");
  });

  test("nobody at the net: zero attempts, and no rate rather than 0%", () => {
    const back = (isPlayer1: boolean) =>
      shot(isPlayer1 ? 3 : 2, isPlayer1, "Forehand", 1);
    const points = [point(true, serve, back(false), back(true))];
    const scope = { hasVideo: true, count: 0, noVideoLine: false };
    const rows = withPointRows(
      POINT_ROWS.filter((c) => c.label.startsWith("Net")),
      [],
      tallySide(points, true),
      tallySide(points, false),
    );
    expect(byLabel(rows, "Net point attempts").you.display).toBe("0");
    const won = byLabel(rows, "Net points won");
    expect(won.you).toMatchObject({ value: null, display: "" });
    expect(figureReadout(won, "you", "You", scope)).toBeNull();
  });

  test("the rule's floor, exclusions and missing positions", () => {
    const at = (type: string, number: number, y: number | null) =>
      cameToNet(point(true, serve, shot(number, true, type, y)), true);
    const close = NET - 3;
    // Shot 3 is the floor for a position alone; a volley or overhead has none.
    expect(at("Forehand", 2, close)).toBe(false);
    expect(at("Forehand", 3, close)).toBe(true);
    expect(at("Volley", 2, close)).toBe(true);
    expect(at("Overhead", 2, close)).toBe(true);
    // A serve or a feed is never coming in, however close or however numbered.
    for (const type of ["First Serve", "Second Serve", "Feed"]) {
      expect(at(type, 3, close)).toBe(false);
      expect(at(type, 3, null)).toBe(false);
    }
    // No position: a volley or overhead still counts, a groundstroke cannot.
    expect(at("Volley", 3, null)).toBe(true);
    expect(at("Overhead", 3, null)).toBe(true);
    expect(at("Forehand", 3, null)).toBe(false);
  });

  test("the published figures' SQL rule is the same rule", () => {
    // `net_attempt_shot` is the twin behind `match_stats.net_points_*`: drift
    // and the card disagrees with Ask and the AI summary with nothing broken.
    // The whole body, so every clause `cameToNet` is held to above is held here.
    const dir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .sort()
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .filter((text) => text.includes("function public.net_attempt_shot"))
      .at(-1)!;
    const body = sql
      .split("function public.net_attempt_shot")[1]
      .split("$function$")[1]
      .replace(/\s+/g, " ")
      .trim();
    expect(body).toBe(
      [
        "select case",
        "when p_shot_type in ('First Serve', 'Second Serve', 'Feed') then false",
        "when lower(btrim(coalesce(p_shot_type, ''))) like '%volley%' then true",
        "when lower(btrim(coalesce(p_shot_type, ''))) = 'overhead' then",
        `p_contact_y is null or abs(p_contact_y - ${NET}) <= ${NET_OVERHEAD_DEPTH_M}`,
        "else",
        "p_shot_number >= 3",
        "and p_contact_y is not null",
        `and abs(p_contact_y - ${NET}) <= ${NET_ZONE_DEPTH_M}`,
        "end",
      ].join(" "),
    );
  });

  test("the loader's published rate is still no rate without appearances", () => {
    expect(netPointsWonPct(0, 0)).toBeNull();
    expect(netPointsWonPct(6, 10)).toBe(60);
    expect(netPointsWonPct(0, 4)).toBe(0);
  });
});

test.describe("the banner a label click lands", () => {
  test("a won row's label does not promise only wins", () => {
    const labels = ALL_ROWS.filter((c) => c.cut && c.sideWon).map((c) =>
      rowCutLabel(c),
    );
    expect(labels).toEqual([
      "First serve points",
      "Second serve points",
      "Break points saved",
      "First serve returns",
      "Second serve returns",
      "Break points converted",
      "Return winners",
      "Net points",
      "Total points",
    ]);
  });

  test("a row that opens what it counts keeps its name", () => {
    expect(rowCutLabel({ label: "Net point attempts" })).toBe(
      "Net point attempts",
    );
    expect(rowCutLabel({ label: "First serve in" })).toBe("First serve in");
  });
});

test.describe("errors until the split is judged", () => {
  // `MatchFilterContext.errorSplitJudged`: until a match's errors are judged
  // forced/unforced its "unforced" figure is every error, so the Points group
  // says "Errors" and opens every error; judged, it is Unforced then Forced.
  const pointsOf = (isDerived: boolean, judged: boolean) =>
    h2hGroups(isDerived, judged).find((g) => g.title === "Points")!.configs;

  for (const isDerived of [false, true]) {
    const kind = isDerived ? "derived" : "SwingVision";

    test(`unjudged (${kind}): one Errors row, every error`, () => {
      const configs = pointsOf(isDerived, false);
      expect(configs.map((c) => c.label)).toEqual([
        "Net point attempts",
        "Net points won",
        "Winners",
        "Errors",
        "Total points won",
      ]);
      const errors = configs.find((c) => c.label === "Errors")!;
      // Narrowed to the Film-only "error" bucket, so it opens what it counts.
      expect(errors.cut).toEqual({ resultEnding: ["error"], ending: "error" });
      expect(errors.sideBy).toBe("player");
      expect(errors.lowerIsBetter).toBe(true);
    });

    test(`judged (${kind}): Unforced errors then Forced errors`, () => {
      const configs = pointsOf(isDerived, true);
      expect(configs.map((c) => c.label)).toEqual([
        "Net point attempts",
        "Net points won",
        "Winners",
        "Unforced errors",
        "Forced errors",
        "Total points won",
      ]);
      // Today's row, unchanged.
      expect(configs.find((c) => c.label === "Unforced errors")).toBe(
        POINT_ROWS.find((c) => c.label === "Unforced errors"),
      );
      const forced = configs.find((c) => c.label === "Forced errors")!;
      expect(forced.key).toBe("forcedErrors");
      expect(forced.lowerIsBetter).toBe(true);
      expect(forced.cut).toEqual({
        resultEnding: ["error"],
        ending: "forced-error",
      });
      expect(forced.sideBy).toBe("player");
    });

    test(`the Serve and Return groups never change (${kind})`, () => {
      for (const judged of [false, true]) {
        const groups = h2hGroups(isDerived, judged);
        expect(groups.map((g) => g.title)).toEqual([
          "Serve",
          "Return",
          "Points",
        ]);
        expect(groups[0].configs).toEqual(
          isDerived ? DERIVED_SERVE_ROWS : SERVE_ROWS,
        );
        expect(groups[1].configs).toEqual(RETURN_ROWS);
      }
    });
  }

  test("the Errors value is unforced plus forced, forced absent read as 0", () => {
    const configs = withErrorSplit(POINT_ROWS, false);
    const rows = buildStatRows(
      configs,
      side({ unforcedErrors: 17, forcedErrors: 7 }),
      side({ unforcedErrors: 20, forcedErrors: null }),
    );
    const errors = byLabel(rows, "Errors");
    expect(errors.you.display).toBe("24");
    expect(errors.opp.display).toBe("20");
    // Fewer errors lead — on the summed figure, 20 against 24.
    expect(errors.leader).toBe("opp");
    // No unforced figure is no value at all — the forced count alone is not
    // the row.
    const none = byLabel(
      buildStatRows(
        configs,
        side({ forcedErrors: 3 }),
        side({ forcedErrors: 3 }),
      ),
      "Errors",
    );
    expect(none.you.display).toBe("");
  });

  test("judged rows read each figure on its own", () => {
    const rows = buildStatRows(
      withErrorSplit(POINT_ROWS, true),
      side({ unforcedErrors: 17, forcedErrors: 7 }),
      side({ unforcedErrors: 12, forcedErrors: 9 }),
    );
    expect(byLabel(rows, "Unforced errors").you.display).toBe("17");
    expect(byLabel(rows, "Unforced errors").leader).toBe("opp");
    expect(byLabel(rows, "Forced errors").you.display).toBe("7");
    expect(byLabel(rows, "Forced errors").opp.display).toBe("9");
    expect(byLabel(rows, "Forced errors").leader).toBe("you");
  });
});
