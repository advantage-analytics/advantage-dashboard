import { expect, test } from "@playwright/test";

import type { MatchPoint } from "@/lib/data/match-points-server";

import {
  DERIVED_H2H_GROUPS,
  H2H_GROUPS,
  buildStatRows,
  fractionWords,
  sideCut,
  tallySide,
  watchLine,
  withPointRows,
  type H2HRowConfig,
} from "@/components/dashboard/matches/match-detail/head-to-head-card";
import {
  applyFilmCut,
  FILM_CUT_EXTRA_KEYS,
  filmCutExtras,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  isUnreturnedServe,
  MATCH_FILTER_KEYS,
  type MatchFilterContext,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * The head-to-head rows that open their points in the Video tab (Advantage
 * Intelligence UI T3; the cuts moved onto the shared match filters in T7).
 *
 * Pure and offline. What goes wrong here never shows on the card: a cut with
 * a misspelt key is silently ignored, so the Video tab opens on every point
 * and looks like it worked. A row that gains or loses a cut changes what a
 * click does with nothing drawn differently. So the table is pinned exactly,
 * every key is checked against the shared filters' own keys (plus the
 * Film-only extras), and each cell's cut is checked to open exactly the
 * points its figure counts.
 */

const ALL_ROWS: H2HRowConfig[] = H2H_GROUPS.flatMap((group) => group.configs);

const EXPECTED_CUTS: Record<string, FilmCut> = {
  Aces: { serveResult: ["ace"] },
  "Double faults": { resultEnding: ["error"], resultShot: ["Serve"] },
  "First serve in": { serveType: ["first"] },
  "First serve points won": { serveType: ["first"] },
  "Second serve points won": { serveType: ["second"] },
  "Break points saved": { scoreType: ["breakpoint"] },
  "First serve returns won": { serveType: ["first"] },
  "Second serve returns won": { serveType: ["second"] },
  "Break points converted": { scoreType: ["breakpoint"] },
  "Return winners": { returnResult: ["winner"] },
  Winners: { resultEnding: ["winner"], ending: "winner" },
  "Unforced errors": { resultEnding: ["error"], ending: "unforced-error" },
  "Total points won": {},
};

/**
 * What one cell of each row sends, for "you" — the opponent's mirrors it.
 * A won row is Result › Outcome from the viewer's side (Won for you, Lost
 * for the opponent) with NO Hit by: the points you won include the ones the
 * opponent's error ended.
 */
const EXPECTED_YOU_CUTS: Record<string, FilmCut> = {
  // An ace is the server's: Serve › Player, never Hit by.
  Aces: { serveResult: ["ace"], server: "you" },
  "Double faults": {
    resultEnding: ["error"],
    resultShot: ["Serve"],
    resultPlayer: "you",
  },
  "First serve in": { serveType: ["first"], server: "you" },
  "First serve points won": {
    serveType: ["first"],
    server: "you",
    resultOutcome: ["won"],
  },
  "Second serve points won": {
    serveType: ["second"],
    server: "you",
    resultOutcome: ["won"],
  },
  "Break points saved": {
    scoreType: ["breakpoint"],
    server: "you",
    resultOutcome: ["won"],
  },
  // Your first-serve returns are the opponent's first serves.
  "First serve returns won": {
    serveType: ["first"],
    server: "opponent",
    resultOutcome: ["won"],
  },
  "Second serve returns won": {
    serveType: ["second"],
    server: "opponent",
    resultOutcome: ["won"],
  },
  "Break points converted": {
    scoreType: ["breakpoint"],
    server: "opponent",
    resultOutcome: ["won"],
  },
  "Return winners": {
    returnResult: ["winner"],
    server: "opponent",
    resultOutcome: ["won"],
  },
  Winners: { resultEnding: ["winner"], ending: "winner", resultPlayer: "you" },
  "Unforced errors": {
    resultEnding: ["error"],
    ending: "unforced-error",
    resultPlayer: "you",
  },
  "Total points won": { resultOutcome: ["won"] },
};

function youCut(row: H2HRowConfig): FilmCut {
  return sideCut(row.cut!, "you", row.sideBy, row.sideWon);
}
function oppCut(row: H2HRowConfig): FilmCut {
  return sideCut(row.cut!, "opp", row.sideBy, row.sideWon);
}

/**
 * A cut with every "you" swapped for "opponent" and back, and — since
 * Outcome is read from the viewer's side — Won swapped for Lost.
 */
function mirrored(cut: FilmCut): FilmCut {
  const flip = (v: unknown) =>
    v === "you" ? "opponent" : v === "opponent" ? "you" : v;
  const flipOutcome = (v: unknown) =>
    v === "won" ? "lost" : v === "lost" ? "won" : v;
  return Object.fromEntries(
    Object.entries(cut).map(([k, v]) => [
      k,
      k === "resultOutcome" && Array.isArray(v) ? v.map(flipOutcome) : flip(v),
    ]),
  ) as FilmCut;
}

test.describe("head-to-head cuts", () => {
  test("the cut table is exactly the configured mapping", () => {
    const actual = Object.fromEntries(
      ALL_ROWS.filter((row) => row.cut).map((row) => [row.label, row.cut]),
    );
    expect(actual).toEqual(EXPECTED_CUTS);
  });

  test("each cell's cut is exactly the configured side mapping", () => {
    for (const row of ALL_ROWS.filter((r) => r.cut)) {
      expect(youCut(row), row.label).toEqual(EXPECTED_YOU_CUTS[row.label]);
      expect(oppCut(row), row.label).toEqual(
        mirrored(EXPECTED_YOU_CUTS[row.label]),
      );
    }
  });

  test("rows without a point-level equivalent carry no cut", () => {
    const uncut = ALL_ROWS.filter((row) => !row.cut).map((row) => row.label);
    expect(uncut).toEqual(["Service games won", "Net points won"]);
  });

  test("every cut row names its points for the screen-reader label", () => {
    for (const row of ALL_ROWS.filter((r) => r.cut)) {
      expect(row.noun, row.label).toBeTruthy();
    }
  });

  test("every cut uses only MatchFilters keys and the Film-only extras", () => {
    const known = new Set<string>([
      ...MATCH_FILTER_KEYS,
      ...FILM_CUT_EXTRA_KEYS,
    ]);
    for (const row of ALL_ROWS) {
      if (!row.cut) continue;
      for (const key of Object.keys(row.cut)) {
        expect(known.has(key), `${row.label} → ${key}`).toBe(true);
      }
      // And for the per-cell cut the card actually sends.
      for (const cut of [youCut(row), oppCut(row)]) {
        for (const key of Object.keys(cut)) {
          expect(known.has(key), `${row.label} → ${key}`).toBe(true);
        }
      }
    }
  });

  test("sideCut never mutates the configured cut", () => {
    const row = ALL_ROWS.find((r) => r.label === "Break points saved")!;
    youCut(row);
    expect(row.cut).toEqual({ scoreType: ["breakpoint"] });
  });

  test("built rows carry their config's cut and side rule", () => {
    const rows = buildStatRows(ALL_ROWS, { fractions: {} }, { fractions: {} });
    rows.forEach((row, i) => {
      expect(row.cut).toEqual(ALL_ROWS[i].cut);
      expect(row.sideBy).toEqual(ALL_ROWS[i].sideBy);
      expect(row.sideWon).toEqual(ALL_ROWS[i].sideWon);
    });
  });
});

function byConfig(label: string): H2HRowConfig {
  const row = ALL_ROWS.find((r) => r.label === label);
  if (!row) throw new Error(`no row labelled "${label}"`);
  return row;
}

/* ── A click opens exactly the points the figure counts ─────────────────── */

const CTX: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: null, player2: null },
};

function p(overrides: Partial<MatchPoint> & { id: string }): MatchPoint {
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
    videoTime: 10,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

// Player 1 is "you". A mix of every bucket, served and returned by both.
const MATCH: MatchPoint[] = [
  p({
    id: "ace-you",
    resultType: "Ace",
    rallyLength: 1,
    lastShotType: "First Serve",
  }),
  p({
    id: "ace-opp",
    resultType: "Ace",
    serverIsPlayer1: false,
    wonByPlayer1: false,
    player: "player2",
    rallyLength: 1,
    lastShotType: "First Serve",
  }),
  // An unreturned serve on a video match: a winner, never an ace.
  p({
    id: "sw-you",
    resultType: "Service Winner",
    rallyLength: 1,
    lastShotType: "First Serve",
  }),
  p({
    id: "df-you",
    resultType: "Double Fault",
    wonByPlayer1: false,
    rallyLength: 0,
    lastShotType: "Second Serve",
  }),
  p({
    id: "df-opp",
    resultType: "Double Fault",
    serverIsPlayer1: false,
    wonByPlayer1: true,
    player: "player2",
    rallyLength: 0,
    lastShotType: "Second Serve",
  }),
  p({ id: "fw-you", resultType: "Forehand Winner", lastShotType: "Forehand" }),
  p({
    id: "bw-opp",
    resultType: "Backhand Winner",
    wonByPlayer1: false,
    player: "player2",
    lastShotType: "Backhand",
  }),
  p({
    id: "ue-you",
    resultType: "Forehand Unforced Error",
    wonByPlayer1: false,
    lastShotType: "Forehand",
  }),
  p({
    id: "fe-you",
    resultType: "Backhand Forced Error",
    wonByPlayer1: false,
    lastShotType: "Backhand",
  }),
  p({
    id: "bp-saved",
    isBreakPoint: true,
    firstShotType: "First Serve",
    resultType: "Forehand Winner",
    lastShotType: "Forehand",
  }),
  p({
    id: "bp-lost",
    isBreakPoint: true,
    firstShotType: "Second Serve",
    wonByPlayer1: false,
    resultType: "Backhand Winner",
    player: "player2",
    lastShotType: "Backhand",
  }),
  // The opponent serves, you return a winner.
  p({
    id: "rw-you",
    serverIsPlayer1: false,
    firstShotType: "Second Serve",
    secondShotResult: "In",
    rallyLength: 2,
    resultType: "Backhand Winner",
    lastShotType: "Backhand",
  }),
  // A mislabelled two-shot "winner" the server won: no one's return winner.
  p({
    id: "rw-mislabel",
    serverIsPlayer1: false,
    wonByPlayer1: false,
    player: "player2",
    secondShotResult: "In",
    rallyLength: 2,
    resultType: "Forehand Winner",
    lastShotType: "Forehand",
  }),
  p({ id: "first-in-won", firstShotType: "First Serve" }),
  p({
    id: "first-in-lost",
    firstShotType: "First Serve",
    wonByPlayer1: false,
  }),
];

const count = (cut: FilmCut) => applyFilmCut(MATCH, MATCH, cut, CTX).length;

test.describe("a cell opens exactly the points its figure counts", () => {
  const you = tallySide(MATCH, true);
  const opp = tallySide(MATCH, false);

  test("aces are the Ace bucket by the server — never a service winner", () => {
    const row = byConfig("Aces");
    expect(count(youCut(row))).toBe(you.aces);
    expect(count(oppCut(row))).toBe(opp.aces);
    // Result › Winner + Serve alone would have taken the service winner too.
    const plain = applyMatchFilters(
      MATCH,
      {
        ...EMPTY_MATCH_FILTERS,
        resultEnding: ["winner"],
        resultShot: ["Serve"],
        resultPlayer: "you",
      },
      CTX,
    ).map((pt) => pt.id);
    expect(plain).toContain("sw-you");
    expect(
      applyFilmCut(MATCH, MATCH, youCut(row), CTX).map((pt) => pt.id),
    ).toEqual(["ace-you"]);
    // A pure cut: every key of the cell's cut is a shared filter, so it
    // lands entirely as pills with no Film-only remainder.
    const shared = new Set<string>(MATCH_FILTER_KEYS);
    for (const cut of [youCut(row), oppCut(row)]) {
      for (const key of Object.keys(cut)) {
        expect(shared.has(key), `Aces → ${key}`).toBe(true);
      }
    }
  });

  test("double faults are the server's error on a serve", () => {
    const row = byConfig("Double faults");
    expect(count(youCut(row))).toBe(you.doubleFaults);
    expect(count(oppCut(row))).toBe(opp.doubleFaults);
  });

  test("winners leave the aces on their own line", () => {
    const row = byConfig("Winners");
    const ids = applyFilmCut(MATCH, MATCH, youCut(row), CTX).map((pt) => pt.id);
    expect(ids).not.toContain("ace-you");
    expect(ids).toEqual(["sw-you", "fw-you", "bp-saved", "rw-you"]);
    // Why the row keeps its Film-only `winner` ending: Result › Ending
    // "winner" by you alone credits your ace to you as a winner.
    const endingAlone = applyMatchFilters(
      MATCH,
      { ...EMPTY_MATCH_FILTERS, resultEnding: ["winner"], resultPlayer: "you" },
      CTX,
    ).map((pt) => pt.id);
    expect(endingAlone).toContain("ace-you");
  });

  test("unforced errors leave the forced ones out", () => {
    const row = byConfig("Unforced errors");
    expect(count(youCut(row))).toBe(you.unforcedErrors);
    expect(count(oppCut(row))).toBe(opp.unforcedErrors);
    const ids = applyFilmCut(MATCH, MATCH, youCut(row), CTX).map((pt) => pt.id);
    expect(ids).toEqual(["ue-you"]);
  });

  test("won rows open the points that side won", () => {
    expect(count(youCut(byConfig("Break points saved")))).toBe(
      you.breakPointsFaced.won,
    );
    expect(count(oppCut(byConfig("Break points converted")))).toBe(
      opp.breakPointsAgainst.won,
    );
    expect(count(youCut(byConfig("Total points won")))).toBe(you.allPoints.won);
    expect(count(oppCut(byConfig("Total points won")))).toBe(opp.allPoints.won);
    // The row itself ("both players") opens every point the row is about.
    expect(count(byConfig("Break points saved").cut!)).toBe(2);
    expect(count(byConfig("Total points won").cut!)).toBe(MATCH.length);
  });

  test("return winners agree with the count through Return › Result", () => {
    const row = byConfig("Return winners");
    expect(count(youCut(row))).toBe(you.returnWinners);
    expect(count(oppCut(row))).toBe(opp.returnWinners);
    expect(you.returnWinners).toBe(1);
    // `both` also admits the mislabelled two-shot winner, as it always has.
    expect(count(row.cut!)).toBe(2);
    // A pure cut: no key outside the shared filters.
    const shared = new Set<string>(MATCH_FILTER_KEYS);
    for (const cut of [row.cut!, youCut(row), oppCut(row)]) {
      for (const key of Object.keys(cut)) {
        expect(shared.has(key), `Return winners → ${key}`).toBe(true);
      }
    }
  });

  test("the count is taken over the shared filters' points", () => {
    // Set 1 only, through the shared filters: the cut is laid over them.
    const all = [
      ...MATCH,
      p({ id: "ace-set2", setNumber: 2, resultType: "Ace", rallyLength: 1 }),
    ];
    const shared = applyMatchFilters(
      all,
      { ...EMPTY_MATCH_FILTERS, sets: [1] },
      CTX,
    );
    const row = byConfig("Aces");
    expect(applyFilmCut(all, all, youCut(row), CTX).map((pt) => pt.id)).toEqual(
      ["ace-you", "ace-set2"],
    );
    expect(
      applyFilmCut(all, shared, youCut(row), CTX).map((pt) => pt.id),
    ).toEqual(["ace-you"]);
  });
});

test.describe("the readout's words", () => {
  test("a fraction reads as made of attempts", () => {
    expect(fractionWords({ value: 75, display: "75%", detail: "9/12" })).toBe(
      "9 of 12",
    );
  });

  test("a count published against a total keeps its figure", () => {
    expect(fractionWords({ value: 68, display: "68", detail: "of 148" })).toBe(
      "68 of 148",
    );
  });

  test("no fraction, or no figure, reads as nothing", () => {
    expect(fractionWords({ value: 6, display: "6" })).toBeNull();
    expect(
      fractionWords({ value: null, display: "", detail: "0/0" }),
    ).toBeNull();
  });

  test("the action line names the count and the tab", () => {
    expect(watchLine(12)).toBe("Watch all 12 in Video");
    // One point is "it", never "all 1".
    expect(watchLine(1)).toBe("Watch it in Video");
  });
});

/* ── Return winners, counted from the points ─────────────────────────────── */

function returnPoint(overrides: Partial<MatchPoint>): MatchPoint {
  return {
    id: "r",
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Backhand Winner",
    eventType: "",
    description: "",
    player: "player1",
    // Player 2 serves, player 1 returns and wins on the return.
    serverIsPlayer1: false,
    wonByPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 2,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    secondShotResult: "In",
    ...overrides,
  };
}

const RETURN_WINNERS = ALL_ROWS.filter((r) => r.fromPoints);

function returnWinnersRow(points: MatchPoint[]) {
  const published = buildStatRows(
    RETURN_WINNERS,
    { fractions: {} },
    { fractions: {} },
  );
  return withPointRows(
    RETURN_WINNERS,
    published,
    tallySide(points, true),
    tallySide(points, false),
  )[0];
}

test.describe("return winners", () => {
  test("counts a winning return for the player who returned it", () => {
    const row = returnWinnersRow([
      returnPoint({ id: "a" }),
      returnPoint({ id: "b", pointNumber: 2 }),
    ]);
    expect(row.you.display).toBe("2");
    // The opponent returned nothing, so there is nothing to measure.
    expect(row.opp.display).toBe("");
    expect(row.leader).toBeNull();
  });

  test("zero is a measurement when returns were recorded", () => {
    // Player 1 returned, the return went in, and the rally went on.
    const row = returnWinnersRow([
      returnPoint({ rallyLength: 6, resultType: "Forehand Winner" }),
    ]);
    expect(row.you.display).toBe("0");
    expect(row.you.value).toBe(0);
  });

  test("no recorded returns is an em dash, never a zero", () => {
    const row = returnWinnersRow([
      returnPoint({ secondShotResult: null, rallyLength: 6 }),
    ]);
    expect(row.you.display).toBe("");
  });

  test("a two-shot winner the server won is not a return winner", () => {
    // The mislabelled shot the video pipeline sometimes emits.
    const row = returnWinnersRow([returnPoint({ wonByPlayer1: false })]);
    expect(row.you.display).toBe("0");
    expect(row.opp.display).toBe("");
  });

  test("a service winner never counts", () => {
    const row = returnWinnersRow([
      returnPoint({ resultType: "Service Winner" }),
    ]);
    expect(row.you.display).toBe("0");
  });
});

/* ── Advantage Intelligence: the derived Aces and Winners cuts ──────────── */

const DERIVED_ROWS: H2HRowConfig[] = DERIVED_H2H_GROUPS.flatMap(
  (group) => group.configs,
);

function derivedConfig(label: string): H2HRowConfig {
  const row = DERIVED_ROWS.find((r) => r.label === label);
  if (!row) throw new Error(`no derived row labelled "${label}"`);
  return row;
}

/**
 * The model on an Advantage Intelligence match, as `useMatchFilters()` builds
 * it there (`match.sourceProvider === "splitstep"`): Serve › Result "Ace" is
 * `isUnreturnedServe`.
 */
const DERIVED_CTX: MatchFilterContext = { ...CTX, isDerived: true };

test.describe("derived (Advantage Intelligence) cuts", () => {
  const derivedAces = derivedConfig("Aces");
  const derivedWinners = derivedConfig("Winners");

  test("the derived Aces row opens Serve › Result Ace by the server", () => {
    expect(derivedAces.cut).toEqual({ serveResult: ["ace"] });
    expect(derivedAces.sideBy).toBe("server");
    expect(derivedWinners.cut).toEqual({
      resultEnding: ["winner"],
      ending: "rally-winner",
    });
    expect(derivedWinners.sideBy).toBe("player");
  });

  test("the derived Aces cut opens exactly the points the tally counts", () => {
    for (const [who, isP1] of [
      ["you", true],
      ["opp", false],
    ] as const) {
      const opened = applyFilmCut(
        MATCH,
        MATCH,
        sideCut(derivedAces.cut!, who, "server"),
        DERIVED_CTX,
      );
      expect(opened.length, who).toBe(tallySide(MATCH, isP1).unreturnedServes);
      expect(opened.every(isUnreturnedServe), who).toBe(true);
    }
    expect(
      applyFilmCut(
        MATCH,
        MATCH,
        sideCut(derivedAces.cut!, "you", "server"),
        DERIVED_CTX,
      ).map((pt) => pt.id),
    ).toEqual(["ace-you", "sw-you"]);
  });

  test("the derived Aces cut is pure: it lands entirely as pills", () => {
    expect(filmCutExtras(derivedAces.cut!)).toBeNull();
    const known = new Set<string>(MATCH_FILTER_KEYS);
    for (const key of Object.keys(sideCut(derivedAces.cut!, "you", "server"))) {
      expect(known.has(key), key).toBe(true);
    }
  });

  test("the derived Winners cut never shares a point with the derived Aces cut", () => {
    const aces = new Set(
      applyFilmCut(MATCH, MATCH, derivedAces.cut!, DERIVED_CTX).map(
        (pt) => pt.id,
      ),
    );
    expect(aces.size).toBeGreaterThan(0);
    const winners = applyFilmCut(
      MATCH,
      MATCH,
      derivedWinners.cut!,
      DERIVED_CTX,
    ).map((pt) => pt.id);
    for (const id of winners) expect(aces.has(id), id).toBe(false);
    // And per side, each by its own row's side rule.
    for (const who of ["you", "opp"] as const) {
      const a = new Set(
        applyFilmCut(
          MATCH,
          MATCH,
          sideCut(derivedAces.cut!, who, derivedAces.sideBy),
          DERIVED_CTX,
        ).map((pt) => pt.id),
      );
      for (const pt of applyFilmCut(
        MATCH,
        MATCH,
        sideCut(derivedWinners.cut!, who, derivedWinners.sideBy),
        DERIVED_CTX,
      )) {
        expect(a.has(pt.id), `${who} ${pt.id}`).toBe(false);
      }
    }
  });

  test("every derived cut uses only MatchFilters keys and the Film-only extras", () => {
    const known = new Set<string>([
      ...MATCH_FILTER_KEYS,
      ...FILM_CUT_EXTRA_KEYS,
    ]);
    expect(FILM_CUT_EXTRA_KEYS).toEqual(["ending"]);
    for (const row of DERIVED_ROWS) {
      if (!row.cut) continue;
      for (const key of Object.keys(row.cut)) {
        expect(known.has(key), `${row.label} → ${key}`).toBe(true);
      }
    }
  });

  test("the SwingVision ace ending still admits only resultType Ace", () => {
    // sw-you is an unreturned serve too, but not an Ace.
    expect(
      applyFilmCut(MATCH, MATCH, byConfig("Aces").cut!, CTX).map((pt) => pt.id),
    ).toEqual(["ace-you", "ace-opp"]);
  });

  test("the SwingVision and derived Aces cuts are one pill, differing only by context", () => {
    expect(byConfig("Aces").cut).toEqual(derivedAces.cut);
    // Under the derived context every unreturned serve is an ace.
    expect(
      applyFilmCut(MATCH, MATCH, byConfig("Aces").cut!, DERIVED_CTX).map(
        (pt) => pt.id,
      ),
    ).toEqual(["ace-you", "ace-opp", "sw-you"]);
  });
});
