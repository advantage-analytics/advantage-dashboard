import { expect, test } from "@playwright/test";

import {
  chipsFrom,
  clipText,
  dualRecordFrom,
  gamesWonPct,
  kpiSeries,
  lineHistoryFrom,
  seasonKpis,
  SEASON_KPI_DEFAULT_KEYS,
  SEASON_KPI_MAX,
  SEASON_KPI_MIN,
  SEASON_KPI_SPECS,
  resolveLine,
  resolveSchool,
  runningDifferential,
  statRowsByKey,
  type DbStatRow,
  type ProfileEntry,
  type ProfileEvent,
  type ProfileResult,
  type ProfileStatRow,
} from "@/lib/data/player-profile";
import {
  canonicalRosterIds,
  idsResolvingTo,
  sideOf,
} from "@/lib/data/roster-ids";
import { matchOutcome } from "@/lib/data/match-utils";
import {
  fromPlayerSide,
  transformDbMatch,
  type DbMatch,
  type DisplayMatch,
} from "@/lib/data/matches-list-types";
import {
  buildPlayerProfile,
  countedSides,
  profileResultsFrom,
  type DbPlayerMatchRow,
  type DbRosterFullRow,
  type PlayerMatchSide,
} from "@/lib/data/player-profile-server";
import { seasonStrip } from "@/lib/data/player-profile";
import { isPracticeMatch } from "@/lib/matches/match-type";

/**
 * The player profile's arithmetic (Platform Audit `Te` / `Te2`).
 *
 * Everything here reads from one side of a match. The failure these guard
 * against is silent: a line grouped under the wrong slot, a dual counted as
 * a tournament, a trend drawn against a two-match baseline — none of it
 * errors, and every number looks plausible on screen.
 */

function stats(
  partial: Partial<Omit<ProfileStatRow, "rates">> & {
    rates?: Record<string, number | null>;
  } = {},
): ProfileStatRow {
  const { rates, ...counts } = partial;
  return {
    rates: rates ?? {},
    breakPointsConverted: null,
    breakPointOpportunities: null,
    serviceGames: null,
    serviceGamesWon: null,
    returnGames: null,
    returnGamesWon: null,
    winners: null,
    errors: null,
    ...counts,
  };
}

/** Newest first, like the loader's list. */
function result(
  id: string,
  won: boolean | null,
  overrides: Partial<ProfileResult> = {},
): ProfileResult {
  return {
    id,
    date: null,
    isPlayer1: true,
    won,
    entryId: null,
    opponentName: "Opponent",
    score: null,
    tournamentName: null,
    stats: null,
    ...overrides,
  };
}

function entry(
  id: string,
  slot: string | null,
  eventId = "e1",
  opponentSchool: string | null = null,
): ProfileEntry {
  return { id, eventId, slot, discipline: null, opponentSchool, forfeit: null };
}

function event(
  id: string,
  kind: string,
  name = "Meridian State",
): ProfileEvent {
  return { id, kind, name, startsOn: null };
}

const NO_ENTRIES = new Map<string, ProfileEntry>();
const NO_EVENTS = new Map<string, ProfileEvent>();

test.describe("resolveSchool", () => {
  test("the entry names the opponent first", () => {
    expect(
      resolveSchool(
        entry("x", "S1", "e1", "Big Sky"),
        event("e1", "dual"),
        "Invitational",
      ),
    ).toBe("Big Sky");
  });

  test("a dual is named after its opponent", () => {
    expect(
      resolveSchool(
        entry("x", "S1"),
        event("e1", "dual", "Meridian State"),
        "Invitational",
      ),
    ).toBe("Meridian State");
  });

  test("a tournament falls back to the match event name", () => {
    expect(
      resolveSchool(
        entry("x", null),
        event("e1", "tournament", "Fall Classic"),
        "Fall Classic",
      ),
    ).toBe("Fall Classic");
  });

  test("nothing named is null, not an empty string", () => {
    expect(resolveSchool(null, null, null)).toBeNull();
    expect(resolveSchool(null, null, "   ")).toBeNull();
  });

  test("resolveLine reads the slot and nothing else", () => {
    expect(resolveLine(entry("x", "S3"))).toBe("S3");
    expect(resolveLine(entry("x", null))).toBeNull();
    expect(resolveLine(null)).toBeNull();
  });
});

test.describe("gamesWonPct", () => {
  test("sums the serve and return halves", () => {
    expect(
      gamesWonPct(
        stats({
          serviceGames: 10,
          serviceGamesWon: 8,
          returnGames: 10,
          returnGamesWon: 4,
        }),
      ),
    ).toBe(60);
  });

  test("is null when either half is unmeasured", () => {
    expect(
      gamesWonPct(stats({ serviceGames: 10, serviceGamesWon: 8 })),
    ).toBeNull();
    expect(gamesWonPct(null)).toBeNull();
  });

  test("is null, not zero, when no game was played", () => {
    expect(
      gamesWonPct(
        stats({
          serviceGames: 0,
          serviceGamesWon: 0,
          returnGames: 0,
          returnGamesWon: 0,
        }),
      ),
    ).toBeNull();
  });
});

test.describe("dualRecordFrom", () => {
  const entries = new Map([
    ["d1", entry("d1", "S3", "dual")],
    ["t1", entry("t1", null, "tourn")],
  ]);
  const events = new Map([
    ["dual", event("dual", "dual")],
    ["tourn", event("tourn", "tournament")],
  ]);

  test("counts decided matches in duals only", () => {
    const results = [
      result("a", true, { entryId: "d1" }),
      result("b", false, { entryId: "d1" }),
      result("c", true, { entryId: "t1" }), // tournament — not a dual
      result("d", true), // unscheduled upload — no entry
      result("e", null, { entryId: "d1" }), // unscored
    ];
    expect(dualRecordFrom(results, entries, events)).toEqual({
      wins: 1,
      losses: 1,
    });
  });
});

test.describe("lineHistoryFrom", () => {
  const entries = new Map([
    ["s3", entry("s3", "S3")],
    ["s2", entry("s2", "S2")],
    ["d1", entry("d1", "D1")],
    ["draw", entry("draw", null)],
  ]);

  test("groups by slot and orders singles before doubles, low to high", () => {
    const rows = lineHistoryFrom(
      [
        result("a", true, { entryId: "d1" }),
        result("b", true, { entryId: "s3" }),
        result("c", false, { entryId: "s2" }),
        result("d", false, { entryId: "s3" }),
      ],
      entries,
    );
    expect(rows.map((r) => r.slot)).toEqual(["S2", "S3", "D1"]);
    expect(rows[1]).toMatchObject({
      slot: "S3",
      wins: 1,
      losses: 1,
      winPct: 50,
    });
  });

  test("leaves out matches with no entry or no slot", () => {
    const rows = lineHistoryFrom(
      [
        result("a", true),
        result("b", true, { entryId: "draw" }),
        result("c", true, { entryId: "s3" }),
      ],
      entries,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe("S3");
  });

  test("form is the last five decided results, oldest left", () => {
    // Newest first in, as the loader hands them over.
    const results = ["w", "l", "w", "w", "l", "l", "w"].map((r, i) =>
      result(`m${i}`, r === "w", { entryId: "s3" }),
    );
    const [row] = lineHistoryFrom(results, entries);
    expect(row.form.map((bar) => bar.result)).toEqual([
      "loss",
      "win",
      "win",
      "loss",
      "win",
    ]);
    // Each bar is the match it draws, from this player's side, oldest left.
    expect(row.form.map((bar) => bar.match.id)).toEqual([
      "m4",
      "m3",
      "m2",
      "m1",
      "m0",
    ]);
    expect(row).toMatchObject({ wins: 4, losses: 3, winPct: 57 });
  });

  test("an unscored match at a line adds no record and no tick", () => {
    const [row] = lineHistoryFrom(
      [result("a", null, { entryId: "s3" })],
      entries,
    );
    expect(row).toMatchObject({
      slot: "S3",
      wins: 0,
      losses: 0,
      winPct: null,
      form: [],
    });
  });
});

test.describe("kpiSeries", () => {
  test("the sparkline is the last eight measured values, oldest → newest", () => {
    const newestFirst = [10, null, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(kpiSeries(newestFirst).sparkline).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("one measured match is no trend; two start one", () => {
    expect(kpiSeries([60]).trend).toBeNull();
    expect(kpiSeries([]).trend).toBeNull();
    // The newest against the one before it.
    expect(kpiSeries([62, 50]).trend).toEqual({
      change: 12,
      changeLabel: "vs earlier",
    });
  });

  test("the recent half is capped at five once the season is long", () => {
    // Newest five average 62; the six before them average 50.
    const { trend } = kpiSeries([60, 61, 62, 63, 64, 50, 50, 50, 50, 50, 50]);
    expect(trend).toEqual({ change: 12, changeLabel: "vs earlier" });
  });

  test("a short season splits in half, newest half first", () => {
    // Four matches: [70, 70] against [50, 50].
    expect(kpiSeries([70, 70, 50, 50]).trend?.change).toBe(20);
  });
});

test.describe("the statistic catalogue", () => {
  test("every key is offered once, and the defaults are the first five", () => {
    const keys = SEASON_KPI_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SEASON_KPI_DEFAULT_KEYS).toEqual(keys.slice(0, SEASON_KPI_MAX));
  });

  test("there are more statistics than slots, so the picker has something to swap", () => {
    expect(SEASON_KPI_SPECS.length).toBeGreaterThan(SEASON_KPI_MAX);
    expect(SEASON_KPI_MIN).toBeLessThan(SEASON_KPI_MAX);
  });

  test("every tile the catalogue names is built, in catalogue order", () => {
    // The picker renders the catalogue and looks each tile up by key; a spec
    // with no tile behind it would silently drop a chosen statistic.
    const tiles = seasonKpis([], {
      wins: 0,
      losses: 0,
      duals: { wins: 0, losses: 0 },
    });
    expect(tiles.map((t) => t.key)).toEqual(SEASON_KPI_SPECS.map((s) => s.key));
    expect(tiles.every((t) => t.label && t.category)).toBe(true);
  });
});

test.describe("the hover chart's points", () => {
  test("carries each match's own opponent and date, oldest first", () => {
    const results = [
      result("a", true, {
        date: "2026-04-12",
        opponentName: "D. Fontaine",
        stats: stats({ rates: { first_serve_pct: 60 } }),
      }),
      result("b", true, {
        date: "2026-04-05",
        opponentName: "L. Ortega",
        stats: null,
      }),
      result("c", true, {
        date: "2026-03-28",
        opponentName: "J. Park",
        stats: stats({ rates: { first_serve_pct: 50 } }),
      }),
    ];
    const firstServe = seasonKpis(results, {
      wins: 3,
      losses: 0,
      duals: { wins: 0, losses: 0 },
    })[1];
    // The unmeasured middle match is absent, and the two that remain keep
    // their own opponent — the alignment `presentPairs` exists to protect.
    expect(firstServe.points).toEqual([
      { value: 50, date: "2026-03-28", opponent: "J. Park" },
      { value: 60, date: "2026-04-12", opponent: "D. Fontaine" },
    ]);
  });

  test("the chart is the sparkline enlarged — one window, same order", () => {
    // Twelve measured matches against a window of eight. Before this was one
    // window the tile drew the last eight and the hover drew all twelve, so
    // one statistic showed two different lines depending on where you looked.
    const results = Array.from({ length: 12 }, (_, i) =>
      result(`m${i}`, true, {
        date: `2026-04-${String(28 - i).padStart(2, "0")}`,
        opponentName: `Opp ${i}`,
        stats: stats({ rates: { first_serve_pct: 50 + i } }),
      }),
    );
    const tile = seasonKpis(results, {
      wins: 12,
      losses: 0,
      duals: { wins: 0, losses: 0 },
    })[1];
    expect(tile.sparkline).toHaveLength(8);
    expect(tile.points).toHaveLength(8);
    expect(tile.points!.map((p) => p.value)).toEqual(tile.sparkline);
    // Oldest left, and each point still carries its own match.
    expect(tile.points![0].opponent).toBe("Opp 7");
    expect(tile.points![7].opponent).toBe("Opp 0");
  });

  test("a record has no chart, because it is not a per-match rate", () => {
    const results = [
      result("a", true, { stats: stats({ rates: { first_serve_pct: 60 } }) }),
    ];
    expect(
      seasonKpis(results, {
        wins: 1,
        losses: 0,
        duals: { wins: 0, losses: 0 },
      })[0].points,
    ).toBeUndefined();
  });
});

test.describe("clipText", () => {
  test("leaves a short paragraph alone", () => {
    expect(clipText("The serve decided the second set.", 60)).toBe(
      "The serve decided the second set.",
    );
  });

  test("cuts on a word and ends with an ellipsis", () => {
    const long =
      "You won 78% of first-serve points but landed only 54% in, and the second serve did not hold up.";
    const clipped = clipText(long, 50);
    expect(clipped.length).toBeLessThanOrEqual(50);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped).toBe("You won 78% of first-serve points but landed…");
  });
});

test.describe("runningDifferential", () => {
  test("walks the season oldest → newest, skipping unscored matches", () => {
    expect(
      runningDifferential([
        result("c", true),
        result("b", null),
        result("a", false),
      ]),
    ).toEqual([-1, 0]);
  });
});

test.describe("seasonKpis", () => {
  const input = { wins: 12, losses: 4, duals: { wins: 8, losses: 2 } };

  test("the record tile and its dual subtext", () => {
    const [record] = seasonKpis([], input);
    expect(record).toMatchObject({ value: "12–4", subtext: "8–2 in duals" });
  });

  test("no dual subtext before a dual has been decided", () => {
    const [record] = seasonKpis([], {
      ...input,
      duals: { wins: 0, losses: 0 },
    });
    expect(record.subtext).toBeUndefined();
  });

  test("break points won is a sum, so the value agrees with its subtext", () => {
    const results = [
      result("a", true, {
        stats: stats({ breakPointsConverted: 30, breakPointOpportunities: 60 }),
      }),
      result("b", true, {
        stats: stats({ breakPointsConverted: 4, breakPointOpportunities: 21 }),
      }),
    ];
    const breakTile = seasonKpis(results, input)[3];
    // 34 of 81 = 41.97%, rounded 42 — a mean of per-match rates (50%, 19%)
    // would print 35% over a subtext that says otherwise.
    expect(breakTile).toMatchObject({ value: "42%", subtext: "34 of 81" });
  });

  test("1st serve won is the player's own, with no team average beside it", () => {
    const results = [
      result("a", true, {
        stats: stats({ rates: { first_serve_won_pct: 74 } }),
      }),
    ];
    const tile = seasonKpis(results, input)[2];
    expect(tile).toMatchObject({
      value: "74%",
      hintText: "1 more match for a trend",
    });
    expect(tile.subtext).toBeUndefined();
  });

  test("an unmeasured rate prints a dash and says what it is waiting on", () => {
    const [, firstServe] = seasonKpis([result("a", true)], input);
    expect(firstServe).toMatchObject({
      value: "—",
      hintText: "After the first report",
    });
  });

  test("one measured match says one more is needed; two draw a trend", () => {
    const one = [
      result("m1", true, { stats: stats({ rates: { first_serve_pct: 60 } }) }),
    ];
    const [, firstServe] = seasonKpis(one, input);
    expect(firstServe.trend).toBeUndefined();
    expect(firstServe.hintText).toBe("1 more match for a trend");

    const two = [65, 60].map((v, i) =>
      result(`m${i}`, true, {
        stats: stats({ rates: { first_serve_pct: v } }),
      }),
    );
    expect(seasonKpis(two, input)[1].trend).toEqual({
      change: 5,
      changeLabel: "vs earlier",
    });
  });
});

/**
 * A claimed player's own profile, across both id eras (T29).
 *
 * Their matches from before the claim carry their USER id; the ones after
 * carry their PROFILE id. The loader names every id that folds onto the
 * profile in its query (`idsResolvingTo`) and then sides each row it gets
 * back through the same fold (`sideOf`). These assert both halves against the
 * roster shapes that matter, and that the side it picks is the one the
 * outcome is read from.
 */
test.describe("a claimed player's pre-claim match on their profile", () => {
  const ANA_PROFILE = "profile-ana";
  const ANA_USER = "user-ana";
  const COACH = "user-coach";
  const BEN_PROFILE = "profile-ben";
  const canonical = canonicalRosterIds([
    { player_id: ANA_PROFILE, user_id: ANA_USER },
    { player_id: COACH, user_id: COACH },
    { player_id: BEN_PROFILE, user_id: null },
  ]);

  test("the fetch names both of a claimed player's ids", () => {
    expect(idsResolvingTo(canonical, ANA_PROFILE).sort()).toEqual(
      [ANA_PROFILE, ANA_USER].sort(),
    );
  });

  test("a staff seat and an unclaimed player are fetched by one id", () => {
    expect(idsResolvingTo(canonical, COACH)).toEqual([COACH]);
    expect(idsResolvingTo(canonical, BEN_PROFILE)).toEqual([BEN_PROFILE]);
  });

  test("a pre-claim match is theirs, on the side the user id is on", () => {
    // Ana is player TWO here and won. Siding against the profile id alone
    // would not find her on either side; siding against the wrong column
    // would hand her the opponent's loss.
    const match = { player1_id: "stranger", player2_id: ANA_USER };
    const isPlayer1 = sideOf(match, canonical, ANA_PROFILE);
    expect(isPlayer1).toBe(false);
    expect(
      matchOutcome({ player1: [4, 3], player2: [6, 6] }, isPlayer1 as boolean),
    ).toBe(true);
  });

  test("a post-claim match is sided by the profile id", () => {
    const match = { player1_id: ANA_PROFILE, player2_id: "stranger" };
    expect(sideOf(match, canonical, ANA_PROFILE)).toBe(true);
  });

  test("a teammate's match is not theirs, whichever of Ana's ids it carries", () => {
    // Ben vs a stranger: nothing of Ana's on it.
    expect(
      sideOf(
        { player1_id: BEN_PROFILE, player2_id: "x" },
        canonical,
        ANA_PROFILE,
      ),
    ).toBeNull();
    // Ana (by her user id) vs Ben, read from Ben's profile: Ben is player two.
    expect(
      sideOf(
        { player1_id: ANA_USER, player2_id: BEN_PROFILE },
        canonical,
        BEN_PROFILE,
      ),
    ).toBe(false);
  });
});

test.describe("last-match chips: errors are never split", () => {
  /** One side's raw row, as `STAT_COLUMNS` selects it. */
  function dbRow(overrides: Partial<DbStatRow> = {}): DbStatRow {
    return {
      match_id: "m1",
      is_player1: true,
      break_points_converted: null,
      break_point_opportunities: null,
      service_games: null,
      service_games_won: null,
      return_games: null,
      return_games_won: null,
      winners: null,
      unforced_errors: null,
      forced_errors: null,
      ...overrides,
    };
  }

  function chipsOf(row: DbStatRow) {
    const stats = statRowsByKey([row]).values().next().value ?? null;
    return chipsFrom(stats);
  }

  test("forced 3 + unforced 10 reads as Errors 13", () => {
    const chips = chipsOf(dbRow({ unforced_errors: 10, forced_errors: 3 }));
    expect(chips).toContainEqual({ label: "Errors", value: "13" });
    expect(chips.some((c) => c.label === "Unforced")).toBe(false);
  });

  test("a null forced count adds nothing", () => {
    const chips = chipsOf(dbRow({ unforced_errors: 8, forced_errors: null }));
    expect(chips).toContainEqual({ label: "Errors", value: "8" });
  });

  test("no unforced count, no Errors chip", () => {
    const chips = chipsOf(dbRow({ unforced_errors: null, forced_errors: 3 }));
    expect(chips.some((c) => c.label === "Errors")).toBe(false);
  });
});

test.describe("fromPlayerSide", () => {
  const match: DisplayMatch = {
    id: "m1",
    tournamentName: "Fall dual",
    date: "October 24, 2026",
    matchType: "Dual",
    player1: { name: "Avery Teammate", id: "p-avery" },
    player2: { name: "Maya Okafor" },
    player2Hand: "right",
    player2Backhand: "two-handed",
    score: {
      sets: [
        { player1: 6, player2: 4 },
        { player1: 6, player2: 7, player1Tiebreak: 5, player2Tiebreak: 7 },
        { player1: 3, player2: 6 },
      ],
      winner: "player2",
    },
  };

  test("leaves a player1 row alone", () => {
    expect(fromPlayerSide(match, true)).toBe(match);
  });

  test("turns a player2 row to their side: names, sets, tiebreaks, winner", () => {
    const turned = fromPlayerSide(match, false);
    expect(turned.player1.name).toBe("Maya Okafor");
    expect(turned.player2.name).toBe("Avery Teammate");
    expect(turned.score.winner).toBe("player1");
    expect(turned.score.sets).toEqual([
      {
        player1: 4,
        player2: 6,
        player1Tiebreak: undefined,
        player2Tiebreak: undefined,
      },
      { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 5 },
      {
        player1: 6,
        player2: 3,
        player1Tiebreak: undefined,
        player2Tiebreak: undefined,
      },
    ]);
  });

  test("an undecided score keeps its winner, so both sides read alike", () => {
    expect(fromPlayerSide(match, false, false).score.winner).toBe("player2");
  });

  test("drops the style it carried, which was this player's own", () => {
    const turned = fromPlayerSide(match, false);
    expect(turned.player2Hand).toBeUndefined();
    expect(turned.player2Backhand).toBeUndefined();
  });
});

/**
 * Practice is listed, never counted (product decision, no opt-in).
 *
 * `readPlayerMatchSides` hands the profile every match, practice included —
 * for both seated players when the opponent is a teammate
 * (`tests/player-season-loader.spec.ts` pins that read). Everything the
 * profile COUNTS starts from `countedSides`, so each assertion here builds
 * the same player twice, with and without practice rows that would each move
 * a figure, and expects nothing but `practiceCount` to differ.
 */
test.describe("practice on a player's profile: listed, never counted", () => {
  const ROW: DbRosterFullRow = {
    player_id: "p-ada",
    profile_id: "p-ada",
    user_id: null,
    display_name: "Ada Okafor",
    email: null,
    role: "player",
    class_year: "2027",
    lineup_spot: 1,
    managed_by: "coach",
  };
  const P1_WON = { player1: [6, 6], player2: [3, 4] };
  const P1_LOST = { player1: [3, 4], player2: [6, 6] };

  function side(
    overrides: Partial<DbPlayerMatchRow> & { id: string },
    isPlayer1 = true,
  ): PlayerMatchSide {
    return {
      isPlayer1,
      match: {
        player1_id: "p-ada",
        player2_id: null,
        player1_name: "Ada Okafor",
        player2_name: "Opponent",
        score: P1_WON,
        date: "2026-03-01T00:00:00+00:00",
        tournament_name: null,
        event_entry_id: null,
        round: null,
        result: null,
        match_type: "Singles",
        court_type: null,
        verified: null,
        verified_at: null,
        errors_judged_at: null,
        duration: null,
        source_provider: null,
        created_by: null,
        opponent_player_id: null,
        player_hand: null,
        opponent_hand: null,
        ...overrides,
      },
    };
  }

  // Newest first, as the loader hands them over: W (dual, S1), L, W.
  const COUNTED = [
    side({
      id: "m-3",
      date: "2026-03-20T00:00:00+00:00",
      event_entry_id: "en-1",
      match_type: "Dual Match",
    }),
    side({ id: "m-2", date: "2026-03-10T00:00:00+00:00", score: P1_LOST }),
    side({ id: "m-1", match_type: "Tournament" }),
  ];
  // Three practice sessions, newest of all, every one a win that would lead
  // the form bar: against a teammate from seat one, against a teammate from
  // seat TWO (the teammate recorded it), and one filed on the dual's line.
  const PRACTICE = [
    side({
      id: "p-3",
      date: "2026-04-03T00:00:00+00:00",
      match_type: "Practice",
      event_entry_id: "en-1",
    }),
    side(
      {
        id: "p-2",
        date: "2026-04-02T00:00:00+00:00",
        match_type: " practice ",
        player1_id: "p-bea",
        player2_id: "p-ada",
        player1_name: "Bea Lindqvist",
        player2_name: "Ada Okafor",
        opponent_player_id: "p-ada",
        score: {
          player1: [6, 6, 4],
          player2: [7, 3, 6],
          player1_tiebreaks: [3, null, null],
          player2_tiebreaks: [7, null, null],
        },
      },
      false,
    ),
    side({
      id: "p-1",
      date: "2026-04-01T00:00:00+00:00",
      match_type: "PRACTICE",
      player2_id: "p-bea",
      player2_name: "Bea Lindqvist",
      opponent_player_id: "p-bea",
    }),
  ];
  const WITH_PRACTICE = [...PRACTICE, ...COUNTED];

  const ENTRIES = new Map([["en-1", entry("en-1", "S1", "ev-1")]]);
  const EVENTS = new Map([["ev-1", event("ev-1", "dual")]]);

  test("the record, form bar, dual record and line history do not move", () => {
    const without = buildPlayerProfile(ROW, COUNTED, ENTRIES, EVENTS);
    const withPractice = buildPlayerProfile(
      ROW,
      WITH_PRACTICE,
      ENTRIES,
      EVENTS,
    );

    expect(withPractice).toEqual({ ...without, practiceCount: 3 });
    // And the figures are the counted matches' own, not empty.
    expect(without).toMatchObject({
      matchesPlayed: 3,
      practiceCount: 0,
      wins: 2,
      losses: 1,
      duals: { wins: 1, losses: 0 },
    });
    expect(without.form.map((bar) => bar.match.id)).toEqual([
      "m-1",
      "m-2",
      "m-3",
    ]);
    expect(without.lines).toMatchObject([{ slot: "S1", wins: 1, losses: 0 }]);
  });

  test("the KPI strip and every KPI series do not move", () => {
    // The stats rows a season strip reads, one per match INCLUDING the
    // practice ones, so a practice row that reached the strip would carry a
    // figure with it.
    const rates = new Map(
      WITH_PRACTICE.map((s, i) => [s.match.id, 40 + i * 7] as const),
    );
    const strip = (own: readonly PlayerMatchSide[]) =>
      seasonStrip(
        profileResultsFrom(own).map((r) => ({
          ...r,
          stats: stats({
            rates: { first_serve_pct: rates.get(r.id) ?? null },
            breakPointsConverted: 2,
            breakPointOpportunities: 5,
          }),
        })),
        dualRecordFrom(profileResultsFrom(own), ENTRIES, EVENTS),
      );

    const without = strip(COUNTED);
    const withPractice = strip(WITH_PRACTICE);
    // Every tile: value, subtext, trend, sparkline and the hover chart's
    // points (`kpiSeries`), plus the strip's own counts.
    expect(withPractice).toEqual(without);
    expect(without.matchesPlayed).toBe(3);
    const firstServe = without.kpis.find((k) => k.key === "first_serve_pct");
    expect(firstServe?.sparkline).toHaveLength(3);
    expect(firstServe?.points).toHaveLength(3);
    expect(without.kpis.find((k) => k.key === "record")?.value).toBe("2–1");
  });

  test("a profile with nothing but practice has no record at all", () => {
    const profile = buildPlayerProfile(ROW, PRACTICE, ENTRIES, EVENTS);
    expect(profile).toMatchObject({
      matchesPlayed: 0,
      practiceCount: 3,
      wins: 0,
      losses: 0,
      duals: { wins: 0, losses: 0 },
      form: [],
      lines: [],
    });
  });

  test("practice rows stay in the list, and the list row is turned to this player's seat", () => {
    // Nothing is dropped from what the profile lists: the six rows are all
    // still there, and `countedSides` is the only place practice leaves.
    expect(WITH_PRACTICE.map((s) => s.match.id)).toHaveLength(6);
    expect(countedSides(WITH_PRACTICE).map((s) => s.match.id)).toEqual([
      "m-3",
      "m-2",
      "m-1",
    ]);

    // The teammate-recorded practice, as the Matches list's own row turned to
    // Ada's seat (`fromPlayerSide` with the seat `readPlayerMatchSides` gave):
    // her games first in every set, her tiebreak points with her set, and
    // Bea named as the opponent. Stored 6-7(3) 6-3 4-6 from Bea's side.
    const { match, isPlayer1 } = PRACTICE[1];
    expect(isPracticeMatch(match.match_type)).toBe(true);
    const row = transformDbMatch(match as unknown as DbMatch, "viewer");
    expect(row).not.toBeNull();
    const turned = fromPlayerSide(row!, isPlayer1);
    expect(turned.player2.name).toBe("Bea Lindqvist");
    expect(turned.player1.name).toBe("Ada Okafor");
    expect(turned.score.sets).toEqual([
      { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 3 },
      { player1: 3, player2: 6, player1Tiebreak: null, player2Tiebreak: null },
      { player1: 6, player2: 4, player1Tiebreak: null, player2Tiebreak: null },
    ]);
    // From seat one it is left exactly as stored.
    expect(fromPlayerSide(row!, true)).toBe(row);
  });
});
