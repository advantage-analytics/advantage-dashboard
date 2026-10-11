import { expect, test } from "@playwright/test";

import type { DbStatRow } from "@/lib/data/player-profile";
import {
  toStatisticsMatches,
  type StatisticsMatch,
  type StatisticsMatchRow,
} from "@/lib/data/statistics";
import {
  DEFAULT_STATISTICS_SEARCH,
  applyStatisticsFilters,
  hasStatisticsFilters,
  parseStatisticsSearch,
  serializeStatisticsSearch,
  type StatisticsSearchState,
} from "@/components/dashboard/statistics/statistics-search";

/**
 * The Statistics page's URL contract — `parseStatisticsSearch`,
 * `serializeStatisticsSearch` and `applyStatisticsFilters`.
 *
 * Pure and offline. The query string is the page's only filter state, so
 * these three are the whole of "which matches am I looking at": a parse that
 * drifts from the serializer breaks every shared link, and a filter computed
 * anywhere else is two regions on one screen disagreeing about the season.
 */

const parse = (query: string) =>
  parseStatisticsSearch(new URLSearchParams(query));

const state = (
  overrides: Partial<StatisticsSearchState> = {},
): StatisticsSearchState => ({ ...DEFAULT_STATISTICS_SEARCH, ...overrides });

test.describe("parseStatisticsSearch", () => {
  test("a bare URL is the defaults", () => {
    expect(parse("")).toEqual({
      opponent: null,
      hand: null,
      backhand: null,
      courtType: null,
      matches: "all",
      window: 5,
      stat: "firstServeWinPct",
    });
  });

  test("reads every param", () => {
    expect(
      parse(
        "opponent=Olivia+Opponent&hand=left&backhand=one-handed&courtType=clay&matches=10&window=3&stat=aces",
      ),
    ).toEqual({
      opponent: "Olivia Opponent",
      hand: "left",
      backhand: "one-handed",
      courtType: "clay",
      matches: 10,
      window: 3,
      stat: "aces",
    });
  });

  test("an unknown value falls back to its default", () => {
    expect(
      parse(
        "hand=both&backhand=slice&matches=7&window=4&stat=firstServeSpeed&opponent=+&courtType=",
      ),
    ).toEqual(DEFAULT_STATISTICS_SEARCH);
  });

  test("matches takes all, 5, 10 and 20 and nothing else", () => {
    expect(parse("matches=all").matches).toBe("all");
    expect(parse("matches=5").matches).toBe(5);
    expect(parse("matches=10").matches).toBe(10);
    expect(parse("matches=20").matches).toBe(20);
    for (const raw of ["0", "15", "-5", "5.0", "twenty", ""]) {
      expect(parse(`matches=${raw}`).matches, raw).toBe("all");
    }
  });

  test("window goes through parseWindow: off is null, junk is the default", () => {
    expect(parse("window=off").window).toBeNull();
    expect(parse("window=10").window).toBe(10);
    expect(parse("window=7").window).toBe(5);
  });

  test("closed lists are case-insensitive; court is lower-cased; a name is kept as typed", () => {
    const parsed = parse(
      "hand=LEFT&backhand=Two-Handed&courtType=Indoor+Hard&opponent=+Sam+Okafor+",
    );
    expect(parsed.hand).toBe("left");
    expect(parsed.backhand).toBe("two-handed");
    expect(parsed.courtType).toBe("indoor hard");
    expect(parsed.opponent).toBe("Sam Okafor");
  });

  test("stat is case-sensitive, as the catalogue keys are", () => {
    expect(parse("stat=doubleFaults").stat).toBe("doubleFaults");
    expect(parse("stat=doublefaults").stat).toBe("firstServeWinPct");
  });

  test("reads a page's searchParams record, first value of a repeated param", () => {
    expect(
      parseStatisticsSearch({
        hand: ["left", "right"],
        matches: "20",
        stat: undefined,
      }),
    ).toEqual(state({ hand: "left", matches: 20 }));
  });
});

test.describe("serializeStatisticsSearch", () => {
  test("the defaults serialize to a bare URL", () => {
    expect(serializeStatisticsSearch(DEFAULT_STATISTICS_SEARCH)).toBe("");
  });

  test("writes only what is off its default, in one fixed order", () => {
    expect(
      serializeStatisticsSearch(
        state({ stat: "aces", window: null, hand: "left", matches: 5 }),
      ),
    ).toBe("hand=left&matches=5&window=off&stat=aces");
    expect(
      serializeStatisticsSearch(
        state({
          opponent: "Olivia Opponent",
          backhand: "two-handed",
          courtType: "clay",
          window: 10,
        }),
      ),
    ).toBe(
      "opponent=Olivia+Opponent&backhand=two-handed&courtType=clay&window=10",
    );
  });
});

test.describe("round trip", () => {
  const STATES: StatisticsSearchState[] = [
    DEFAULT_STATISTICS_SEARCH,
    state({ opponent: "Zoë O'Neil & Co", hand: "right" }),
    state({ backhand: "one-handed", courtType: "indoor hard", matches: 20 }),
    state({ window: null, stat: "totalPointsWon" }),
    state({ window: 3, matches: 5, stat: "unforcedErrors", hand: "left" }),
    {
      opponent: "Sam Okafor",
      hand: "left",
      backhand: "two-handed",
      courtType: "grass",
      matches: 10,
      window: 10,
      stat: "breakpointsSaved",
    },
  ];

  test("parse(serialize(state)) is state", () => {
    for (const each of STATES) {
      expect(parse(serializeStatisticsSearch(each))).toEqual(each);
    }
  });

  test("serialize(parse(query)) drops the junk and keeps the rest", () => {
    expect(
      serializeStatisticsSearch(
        parse("stat=aces&utm_source=mail&hand=left&window=5&matches=all"),
      ),
    ).toBe("hand=left&stat=aces");
  });
});

/* ── applyStatisticsFilters ───────────────────────────────────────────────── */

const ME = "user-me";

function row(overrides: Partial<StatisticsMatchRow>): StatisticsMatchRow {
  return {
    id: "m",
    date: "2026-03-01",
    player1_id: ME,
    player2_id: null,
    player1_name: "Me Myself",
    player2_name: "Olivia Opponent",
    created_by: ME,
    score: null,
    court_type: "hard",
    opponent_hand: "right",
    opponent_backhand: "two-handed",
    source_provider: null,
    ...overrides,
  };
}

function season(rows: StatisticsMatchRow[]): StatisticsMatch[] {
  const stats = rows.map(
    (each) => ({ match_id: each.id, is_player1: true }) as unknown as DbStatRow,
  );
  return toStatisticsMatches(rows, stats, [ME], ME);
}

/** Seven matches, a → g oldest → newest. */
const ALL = season([
  row({ id: "a", date: "2026-01-10" }),
  row({ id: "b", date: "2026-02-10", opponent_hand: "left" }),
  row({ id: "c", date: "2026-03-10", court_type: "Clay" }),
  row({
    id: "d",
    date: "2026-04-10",
    player2_name: "Sam Okafor",
    opponent_hand: "left",
    opponent_backhand: "one-handed",
  }),
  row({ id: "e", date: "2026-05-10", opponent_hand: null, court_type: null }),
  row({ id: "f", date: "2026-06-10", opponent_hand: "left" }),
  row({ id: "g", date: "2026-07-10", player2_name: "Sam Okafor" }),
]);

const ids = (overrides: Partial<StatisticsSearchState>) =>
  applyStatisticsFilters(ALL, state(overrides)).map((match) => match.id);

test.describe("applyStatisticsFilters", () => {
  test("the defaults keep every match, in order", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  test("each attribute narrows on its own", () => {
    expect(ids({ opponent: "Sam Okafor" })).toEqual(["d", "g"]);
    expect(ids({ hand: "left" })).toEqual(["b", "d", "f"]);
    expect(ids({ backhand: "one-handed" })).toEqual(["d"]);
    expect(ids({ courtType: "clay" })).toEqual(["c"]);
  });

  test("attributes combine, and names and courts match whatever their casing", () => {
    expect(ids({ opponent: "sam okafor", hand: "left" })).toEqual(["d"]);
    expect(ids({ courtType: "hard", hand: "left" })).toEqual(["b", "d", "f"]);
  });

  test("a match that never recorded the attribute does not fit a filter on it", () => {
    expect(ids({ hand: "right" })).not.toContain("e");
    expect(ids({ courtType: "hard" })).not.toContain("e");
  });

  test("matches keeps the most recent N of what the other filters leave", () => {
    expect(ids({ matches: 5 })).toEqual(["c", "d", "e", "f", "g"]);
    // The last five left-handers — all three — not the left-handers among
    // the last five matches, which would lose "b".
    expect(ids({ hand: "left", matches: 5 })).toEqual(["b", "d", "f"]);
    expect(ids({ matches: 20 })).toHaveLength(7);
  });

  test("window and stat are not filters", () => {
    expect(ids({ window: null, stat: "aces" })).toHaveLength(7);
    expect(hasStatisticsFilters(state({ window: 3, stat: "aces" }))).toBe(
      false,
    );
    expect(hasStatisticsFilters(state({ matches: 10 }))).toBe(true);
  });

  test("a set that fits nothing is empty, and the input is left alone", () => {
    expect(ids({ opponent: "Nobody Atall" })).toEqual([]);
    expect(ALL).toHaveLength(7);
  });
});
