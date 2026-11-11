import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { canonicalRosterIds, rosterMatchIds } from "@/lib/data/roster-ids";
import {
  teamMatchRow,
  teamSeasonKpis,
  type DbRecentMatch,
  type DbSeasonMatch,
} from "@/lib/data/team-home-server";
import { courtRecordFrom } from "@/lib/data/team-court-record";
import {
  memberResultsByPlayer,
  rosterRecordFrom,
  type DbMatchRow,
} from "@/lib/data/team-roster-server";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import type { DbStatRow } from "@/lib/data/player-profile";
import type { MatchScore } from "@/lib/data/match-utils";
import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * T8 — practice never counts on Team Home or the Roster.
 *
 * Product decision: a practice session is never part of win–loss, the season
 * record, head-to-head or season statistics; it is still listed where matches
 * are listed, with no result mark. Every assertion below compares a reader's
 * output with and without practice rows added, so a practice row that leaks
 * into a figure fails here rather than quietly moving a coach's number.
 *
 * Since T5 a teammate practice carries roster ids in BOTH seats, so the
 * fixtures include one: neither player may count it, and neither may count it
 * twice.
 */

const ROOT = process.cwd();

// ── Shared fixtures ──────────────────────────────────────────────────────────

const ANA = "profile-ana";
const BEN = "profile-ben";
const ROSTER_ROWS = [
  { player_id: ANA, user_id: null },
  { player_id: BEN, user_id: null },
];
const ROSTER_IDS = rosterMatchIds(ROSTER_ROWS);

const P1_WON: MatchScore = { player1: [6, 6], player2: [3, 4] };
const P1_LOST: MatchScore = { player1: [3, 4], player2: [6, 6] };

const DUAL: ProgramEvent = {
  id: "e-dual",
  programId: "p-1",
  kind: "dual",
  name: "Rival State",
  startsOn: "2026-03-20",
  endsOn: "2026-03-20",
  site: "home",
  surface: null,
  host: null,
  format: { bestOf: 3, adScoring: true },
};

function singlesLine(slot: string, matches: EntryMatch[] = []): EventEntry {
  return {
    id: `entry-${slot}`,
    eventId: DUAL.id,
    discipline: "singles",
    slot,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: [ANA],
    playerLabels: ["Ana Vasquez"],
    opponentLabels: ["Rival One"],
    opponentSchool: "Rival State",
    forfeit: null,
    matches,
  };
}

const S1 = singlesLine("S1");
const S2 = singlesLine("S2");
const ON_DUAL = new Map([
  [S1.id, { event: DUAL, entry: S1 }],
  [S2.id, { event: DUAL, entry: S2 }],
]);

function seasonRow(opts: {
  id: string;
  date: string;
  matchType: string | null;
  entry?: string | null;
  p1?: string | null;
  p2?: string | null;
  score?: MatchScore;
}): DbRecentMatch {
  return {
    id: opts.id,
    player1_id: opts.p1 === undefined ? ANA : opts.p1,
    player2_id: opts.p2 === undefined ? "stranger" : opts.p2,
    player1_name: "Ana Vasquez",
    player2_name: "Rival One",
    event_entry_id: opts.entry ?? null,
    score: opts.score ?? P1_WON,
    date: opts.date,
    source_provider: "swingvision",
    tournament_name: null,
    round: null,
    match_type: opts.matchType,
  };
}

function statFor(matchId: string, isPlayer1: boolean, firstServe: number) {
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    first_serve_pct: String(firstServe),
    break_points_converted: null,
    break_point_opportunities: null,
    service_games: null,
    service_games_won: null,
    return_games: null,
    return_games_won: null,
    winners: null,
    unforced_errors: null,
  } as DbStatRow;
}

/** An import has no job row and reads as ready, so no jobs map is needed. */
const NO_JOBS = new Map<string, MatchAnalysis>();
const DUALS = { wins: 3, losses: 1 };

// ── teamSeasonKpis ───────────────────────────────────────────────────────────

test.describe("teamSeasonKpis leaves practice out", () => {
  const competitive: DbSeasonMatch[] = [
    seasonRow({
      id: "dual-1",
      date: "2026-03-20",
      matchType: "Singles",
      entry: S1.id,
    }),
    seasonRow({
      id: "dual-2",
      date: "2026-03-21",
      matchType: "Dual Match",
      entry: S2.id,
      score: P1_LOST,
    }),
  ];
  const competitiveStats = [
    statFor("dual-1", true, 60),
    statFor("dual-1", false, 20),
    statFor("dual-2", true, 70),
    statFor("dual-2", false, 30),
  ];

  // Three practice rows, each with stats that would move every tile: one
  // relabelled on a dual line (the case the dual filter alone would miss), a
  // teammate practice with roster ids in both seats, and one in odd case.
  const practice: DbSeasonMatch[] = [
    seasonRow({
      id: "practice-on-line",
      date: "2026-03-22",
      matchType: "Practice",
      entry: S1.id,
    }),
    seasonRow({
      id: "practice-teammate",
      date: "2026-03-23",
      matchType: "Practice",
      p1: ANA,
      p2: BEN,
    }),
    seasonRow({
      id: "practice-case",
      date: "2026-03-24",
      matchType: " PRACTICE ",
      entry: S2.id,
      score: P1_LOST,
    }),
  ];
  const practiceStats = practice.flatMap((row) => [
    statFor(row.id, true, 99),
    statFor(row.id, false, 1),
  ]);

  test("the strip is identical with and without practice rows", () => {
    const without = teamSeasonKpis(
      competitive,
      NO_JOBS,
      competitiveStats,
      ROSTER_IDS,
      ON_DUAL,
      DUALS,
    );
    const withPractice = teamSeasonKpis(
      [...practice, ...competitive],
      NO_JOBS,
      [...practiceStats, ...competitiveStats],
      ROSTER_IDS,
      ON_DUAL,
      DUALS,
    );
    expect(withPractice).toEqual(without);
    expect(withPractice.matchesPlayed).toBe(2);
  });

  test("the exclusion is the match type: the same row as Singles does count", () => {
    // Proves the test above is not passing on the dual filter by accident —
    // the on-line row is a dual match in every respect but its type.
    const relabelled = { ...practice[0], match_type: "Singles" };
    const strip = teamSeasonKpis(
      [relabelled, ...competitive],
      NO_JOBS,
      [...practiceStats, ...competitiveStats],
      ROSTER_IDS,
      ON_DUAL,
      DUALS,
    );
    expect(strip.matchesPlayed).toBe(3);
  });
});

// ── courtRecordFrom ──────────────────────────────────────────────────────────

test.describe("courtRecordFrom never sees a practice row", () => {
  const entryMatch = (id: string, score: MatchScore): EntryMatch => ({
    id,
    round: null,
    status: "imported",
    score,
    opponentLabels: ["Rival One"],
    hasVideo: false,
  });

  test("the record is identical with and without practice rows added", () => {
    const events = [DUAL];
    const lines = [
      singlesLine("S1", [entryMatch("dual-1", P1_WON)]),
      singlesLine("S2", [entryMatch("dual-2", P1_LOST)]),
    ];
    const without = courtRecordFrom(events, new Map([[DUAL.id, lines]]));

    // What a practice session looks like next to the schedule: a match on no
    // line. The schedule reader groups matches by `event_entry_id` (pinned
    // below), so the most a stray row could become is entries under an id
    // that is no dual's — and the record must ignore that too.
    const withPractice = courtRecordFrom(
      events,
      new Map([
        [DUAL.id, lines],
        [
          "no-event",
          [
            {
              ...singlesLine("S3", [entryMatch("practice-1", P1_WON)]),
              eventId: "no-event",
            },
          ],
        ],
      ]),
    );
    expect(withPractice).toEqual(without);
    expect(without.rows[0]).toMatchObject({ slot: "S1", wins: 1, losses: 0 });
  });

  test("the schedule reader only attaches matches that sit on a line", () => {
    // The court record and the dual record are both built from
    // `readSchedule`'s entries. A practice session never has an
    // `event_entry_id`, and these two lines are why it cannot reach either.
    const source = readFileSync(
      path.join(ROOT, "src/lib/data/schedule-server.ts"),
      "utf8",
    );
    expect(source).toContain('.in("event_entry_id", entryIds)');
    expect(source).toContain("if (!match.event_entry_id) continue;");
  });
});

// ── teamMatchRow ─────────────────────────────────────────────────────────────

test.describe("teamMatchRow lists practice without a result", () => {
  test("a practice row has no result and says Practice", () => {
    for (const matchType of ["Practice", " practice "]) {
      const row = teamMatchRow(
        seasonRow({ id: "p", date: "2026-03-20", matchType }),
        NO_JOBS,
        ROSTER_IDS,
      );
      // `won` IS the `<ResultMark>`: null renders the row without one.
      expect(row.won).toBeNull();
      expect(row.context).toBe("Practice");
      // Still a listed match, with its score.
      expect(row.sets.length).toBeGreaterThan(0);
    }
  });

  test("the same row as any other type keeps its result and its label", () => {
    const untyped = teamMatchRow(
      seasonRow({ id: "m", date: "2026-03-20", matchType: null }),
      NO_JOBS,
      ROSTER_IDS,
    );
    expect(untyped.won).toBe(true);
    expect(untyped.context).toBe("Match");

    const singles = teamMatchRow(
      seasonRow({ id: "m", date: "2026-03-20", matchType: "Singles" }),
      NO_JOBS,
      ROSTER_IDS,
    );
    expect(singles.won).toBe(true);
    expect(singles.context).toBe("Singles");
  });
});

// ── Roster: memberResultsByPlayer + rosterRecordFrom ─────────────────────────

test.describe("the roster's record, form and measures leave practice out", () => {
  function rosterMatch(opts: {
    id: string;
    date: string;
    p1: string | null;
    p2: string | null;
    score: MatchScore;
    matchType: string | null;
  }): DbMatchRow {
    return {
      id: opts.id,
      player1_id: opts.p1,
      player2_id: opts.p2,
      player1_name: opts.p1 === BEN ? "Ben Ortiz" : "Ana Vasquez",
      player2_name: opts.p2 === BEN ? "Ben Ortiz" : "Rival One",
      score: opts.score,
      date: opts.date,
      tournament_name: null,
      match_type: opts.matchType,
    };
  }

  // Newest first, as the loader reads them.
  const competitive: DbMatchRow[] = [
    rosterMatch({
      id: "c-3",
      date: "2026-03-18",
      p1: ANA,
      p2: "stranger",
      score: P1_LOST,
      matchType: "Tournament",
    }),
    rosterMatch({
      id: "c-2",
      date: "2026-03-17",
      p1: "stranger",
      p2: BEN,
      score: P1_LOST,
      matchType: "Dual Match",
    }),
    rosterMatch({
      id: "c-1",
      date: "2026-03-16",
      p1: ANA,
      p2: "stranger",
      score: P1_WON,
      matchType: null,
    }),
  ];
  const practice: DbMatchRow[] = [
    // A teammate practice: both seats are roster ids (T5).
    rosterMatch({
      id: "p-teammate",
      date: "2026-03-20",
      p1: ANA,
      p2: BEN,
      score: P1_WON,
      matchType: "Practice",
    }),
    rosterMatch({
      id: "p-solo",
      date: "2026-03-19",
      p1: ANA,
      p2: "stranger",
      score: P1_WON,
      matchType: "practice",
    }),
  ];

  const canonical = canonicalRosterIds(ROSTER_ROWS);
  const values = new Map<string, Record<string, number | null>>();

  const recordOf = (rows: DbMatchRow[], member: string) => {
    const results = memberResultsByPlayer(rows, canonical, values).get(member);
    const { wins, losses, form, recentResults, earlierResults } =
      rosterRecordFrom(results ?? []);
    return {
      wins,
      losses,
      form,
      recent: recentResults.map((r) => r.match.id),
      earlier: earlierResults.map((r) => r.match.id),
    };
  };

  test("wins, losses and form match the record without practice, for both seats", () => {
    const withPractice = [...practice, ...competitive];
    for (const member of [ANA, BEN]) {
      expect(recordOf(withPractice, member)).toEqual(
        recordOf(competitive, member),
      );
    }
    // And the record itself is the competitive one.
    expect(recordOf(withPractice, ANA)).toMatchObject({ wins: 1, losses: 1 });
    expect(recordOf(withPractice, BEN)).toMatchObject({ wins: 1, losses: 0 });
    expect(recordOf(withPractice, ANA).form).toHaveLength(2);
  });

  test("practice is still listed, once per player, with no result", () => {
    const filed = memberResultsByPlayer(
      [...practice, ...competitive],
      canonical,
      values,
    );
    const ana = filed.get(ANA) ?? [];
    const ben = filed.get(BEN) ?? [];
    // `matchesPlayed` and "Last match" read these lists.
    expect(ana.map((r) => r.match.id)).toEqual([
      "p-teammate",
      "p-solo",
      "c-3",
      "c-1",
    ]);
    expect(ben.map((r) => r.match.id)).toEqual(["p-teammate", "c-2"]);
    for (const result of [...ana, ...ben]) {
      if (result.match.match_type?.toLowerCase().includes("practice")) {
        expect(result.practice).toBe(true);
        expect(result.won).toBeNull();
      }
    }
  });

  test("a match whose two seats resolve to one member is filed once", () => {
    const self = rosterMatch({
      id: "self",
      date: "2026-03-21",
      p1: ANA,
      p2: ANA,
      score: P1_WON,
      matchType: "Practice",
    });
    const filed = memberResultsByPlayer([self], canonical, values);
    expect(filed.get(ANA)).toHaveLength(1);
  });
});

// ── Every exclusion asks T1's predicate ──────────────────────────────────────

test("every T8 exclusion calls isPracticeMatch, never a literal", () => {
  for (const file of [
    "src/lib/data/team-home-server.ts",
    "src/lib/data/team-roster-server.ts",
  ]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    expect(source).toContain(
      'import { isPracticeMatch } from "@/lib/matches/match-type";',
    );
    expect(source).not.toMatch(/===\s*["']Practice["']/i);
  }
});
