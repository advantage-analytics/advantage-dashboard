import { expect, test } from "@playwright/test";

import { canonicalRosterIds, rosterMatchIds } from "@/lib/data/roster-ids";
import {
  teamAttention,
  teamFirstReport,
  teamSeasonKpis,
  teamMatchRow,
  type DbRecentMatch,
  type DbSeasonMatch,
  type RosterProgress,
} from "@/lib/data/team-home-server";
import type { AnalysisStatus, MatchAnalysis } from "@/lib/data/match-analysis";
import type { DbStatRow } from "@/lib/data/player-profile";
import type { MatchScore } from "@/lib/data/match-utils";
import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";

/**
 * The strip reads dual matches only, so a season row reaches a card through
 * its `event_entry_id`. One dual and one line are enough: `teamSeasonKpis`
 * reads the event's kind and name and the entry's labels, nothing else.
 */
const DUAL_EVENT: ProgramEvent = {
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
const S1: EventEntry = {
  id: "entry-S1",
  eventId: DUAL_EVENT.id,
  discipline: "singles",
  slot: "S1",
  position: 0,
  draw: null,
  seed: null,
  playerUserIds: [],
  playerLabels: ["Ana Vasquez"],
  opponentLabels: ["Rival One"],
  opponentSchool: "Rival State",
  forfeit: null,
  matches: [],
};
const ON_DUAL = new Map([[S1.id, { event: DUAL_EVENT, entry: S1 }]]);
/** The season row as the schedule writes it: on S1 of the dual, ours in `player1`. */
const onDual = (row: DbSeasonMatch): DbSeasonMatch => ({
  ...row,
  event_entry_id: S1.id,
});

/**
 * A claimed player's pre-claim match, on Team Home.
 *
 * `program_roster_full` returns TWO ids for every person — `player_id` and
 * `user_id` — and for a staff seat, and for a coach-managed player who has not
 * claimed, they hold the same value. **Only a CLAIMED player has two distinct
 * ids**, which is exactly why a loader that reads `player_id` alone looks
 * correct against every seat anyone tests it with.
 *
 * The row it drops is the worst kind of wrong: correct names, a real date, a
 * real score, and no outcome mark — a match the program played that Team Home
 * does not know is theirs. It falls out of the sets-won tile, the first-serve
 * tile, the checklist receipt and the alert list at the same time, and nothing
 * on screen looks broken.
 *
 * Every fixture below therefore puts the USER id on the match, never the
 * profile id, and asserts what a coach would see.
 */

/** A claimed player: the profile id their matches carry NOW, and their login. */
const ANA_PROFILE = "profile-ana";
const ANA_USER = "user-ana";

/** A staff seat: one person, one id, in both columns. This must not regress. */
const COACH = "user-coach";

/** A coach-managed player who has never claimed: no login at all. */
const BEN_PROFILE = "profile-ben";

const ROSTER_ROWS = [
  { player_id: ANA_PROFILE, user_id: ANA_USER },
  { player_id: COACH, user_id: COACH },
  { player_id: BEN_PROFILE, user_id: null },
];

/** What the loader hands `programSide()`. */
const ROSTER_IDS = rosterMatchIds(ROSTER_ROWS);

/** Two sets to nil, from `player1`'s side of the row as stored. */
const P1_WON: MatchScore = { player1: [6, 6], player2: [4, 3] };

const NO_JOBS = new Map<string, MatchAnalysis>();

/**
 * One side's first-serve reading for a match, every other column unmeasured.
 * The strip's cards are built from these, so which side's row a card reads is
 * the attribution made visible: ours is 60, the opponent's is 20, and a card
 * printing 20 under the program's name is the misattribution the guardrails
 * exist for.
 */
function statFor(
  matchId: string,
  isPlayer1: boolean,
  firstServe: number,
): DbStatRow {
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
  };
}

/** Both sides of one match: ours 60, theirs 20, on the columns the caller says. */
function bothSides(matchId: string, oursIsPlayer1: boolean): DbStatRow[] {
  return [
    statFor(matchId, oursIsPlayer1, 60),
    statFor(matchId, !oursIsPlayer1, 20),
  ];
}

const NO_DUALS = { wins: 0, losses: 0 };

const firstServe = ({ kpis }: ReturnType<typeof teamSeasonKpis>) =>
  kpis.find((kpi) => kpi.key === "first_serve_pct");

/**
 * The list's row, carrying `ourId` in whichever column the caller names.
 *
 * `event_entry_id` is null throughout — that is the point. The column is
 * `programSide`'s SECOND clause, and a row that has one is attributed to
 * `player1` whether or not any id is recognised. Leaving it null is what makes
 * every assertion below a test of the id rule rather than of the fallback.
 */
function recentMatch(opts: {
  id?: string;
  ourId: string;
  column?: "player1" | "player2";
  provider?: string | null;
}): DbRecentMatch {
  const column = opts.column ?? "player1";
  return {
    id: opts.id ?? "pre-claim",
    player1_id: column === "player1" ? opts.ourId : "stranger-1",
    player2_id: column === "player2" ? opts.ourId : "stranger-2",
    event_entry_id: null,
    player1_name: column === "player1" ? "Ana Vasquez" : "Rival One",
    player2_name: column === "player2" ? "Ana Vasquez" : "Rival Two",
    score: P1_WON,
    tournament_name: "Spring Invitational",
    round: "QF",
    date: "2026-03-20",
    match_type: "singles",
    source_provider:
      opts.provider === undefined ? "swingvision" : opts.provider,
    verified: true,
  };
}

/**
 * The same row as the season read holds it — which is to say, the same row.
 *
 * `DbRecentMatch extends DbSeasonMatch`, so the recent row IS a season row
 * plus the three columns `matchContext` prints. This used to hand-copy field
 * by field, and had to launder `player1_name ?? ''` because the two types
 * disagreed about nullability; making the extension explicit in the loader
 * retired both the copy and the laundering. Kept as a named alias so the
 * tests below still read as "the season read's view of this match".
 */
function seasonMatch(opts: {
  id?: string;
  ourId: string;
  column?: "player1" | "player2";
}): DbSeasonMatch {
  return recentMatch(opts);
}

function jobsFor(
  entries: { id: string; status: AnalysisStatus }[],
): Map<string, MatchAnalysis> {
  return new Map(
    entries.map((entry) => [
      entry.id,
      { status: entry.status, providerId: "splitstep" } as MatchAnalysis,
    ]),
  );
}

/** No invitations outstanding — the alert list's other half, silenced. */
const NO_INVITES: RosterProgress = {
  players: 3,
  outstanding: 0,
  expiringSoon: 0,
  expiringInDays: null,
};

test.describe("the roster id rule", () => {
  test("a claimed player is BOTH of their ids", () => {
    // The whole bug in one assertion. `user_id` is not display data: it is the
    // id every match recorded before this player claimed their profile carries.
    expect(ROSTER_IDS.has(ANA_PROFILE)).toBe(true);
    expect(ROSTER_IDS.has(ANA_USER)).toBe(true);
  });

  test("a staff seat and an unclaimed player contribute exactly one id", () => {
    // Both columns hold one value on a staff seat, so the rule must not double
    // count it — and an unclaimed player has no login to add.
    expect(ROSTER_IDS.has(COACH)).toBe(true);
    expect(ROSTER_IDS.has(BEN_PROFILE)).toBe(true);
    expect(ROSTER_IDS.size).toBe(4);
  });

  test("an id belonging to nobody on this roster is not ours", () => {
    expect(ROSTER_IDS.has("stranger-1")).toBe(false);
    expect(ROSTER_IDS.has("stranger-2")).toBe(false);
  });

  test("the membership set is the resolution map, not a second reading of it", () => {
    // Criterion 2 in one assertion: `rosterMatchIds` is a view of
    // `canonicalRosterIds`, so the Roster page and Team Home cannot disagree
    // about who is on this team without the shared builder changing under both.
    const canonical = canonicalRosterIds(ROSTER_ROWS);
    expect([...ROSTER_IDS].sort()).toEqual([...canonical.keys()].sort());
    // And the map still answers the Roster page's own question: both eras of
    // Ana's id fold onto the one roster key.
    expect(canonical.get(ANA_USER)).toBe(ANA_PROFILE);
    expect(canonical.get(ANA_PROFILE)).toBe(ANA_PROFILE);
    expect(canonical.get(COACH)).toBe(COACH);
  });
});

test.describe("a match carrying the pre-claim user id", () => {
  test("the list row draws its outcome mark", () => {
    // `won` IS the mark. Null is the empty slot the row printed before: right
    // names, right score, nothing saying the program won it.
    const row = teamMatchRow(
      recentMatch({ ourId: ANA_USER }),
      NO_JOBS,
      ROSTER_IDS,
    );

    expect(row.won).toBe(true);
    expect(row.title).toBe("Ana Vasquez vs Rival Two");
    // Ours first in the games too — the flip and the title travel together.
    expect(row.sets.map((set) => [set.player1, set.player2])).toEqual([
      [6, 4],
      [6, 3],
    ]);
  });

  test("it counts toward the first-serve card, on our side", () => {
    const card = firstServe(
      teamSeasonKpis(
        [onDual(seasonMatch({ ourId: ANA_USER }))],
        NO_JOBS,
        bothSides("pre-claim", true),
        ROSTER_IDS,
        ON_DUAL,
        NO_DUALS,
      ),
    );

    // The card reads OUR row of the two: the figure exists at all only because
    // the match was attributed, and it is 60 rather than 20 because it was
    // attributed to the right side. An unattributed match contributes nothing.
    expect(card?.sparkline).toEqual([60]);
    expect(card?.value).toBe("60%");
  });

  test("the checklist receipt names it, our side first", () => {
    // Stored `player2`, deliberately: a receipt built from an UNATTRIBUTED row
    // keeps the stored order, so a fixture with Ana already in `player1` would
    // print the right title for the wrong reason and pass either way. Only a
    // row whose side was established reverses it.
    const report = teamFirstReport(
      [seasonMatch({ ourId: ANA_USER, column: "player2" })],
      NO_JOBS,
      ROSTER_IDS,
    );

    expect(report?.state).toBe("done");
    if (report?.state !== "done") return;
    expect(report.title).toBe("Ana Vasquez vs Rival One");
  });

  test("a failed one is named our side first in the alert list", () => {
    // `teamAttention` takes the built rows rather than `rosterIds`, so its
    // attribution is the row's title — which is `oursFirst`, which is
    // `programSide`. A row nothing attributes reads "Rival One vs Ana Vasquez"
    // in an alert addressed to Ana's own coach.
    // Stored `player2` for the same reason as the receipt above: the stored
    // order already names Ana first, so only a row that was attributed flips.
    const failed = teamMatchRow(
      recentMatch({ id: "broken", ourId: ANA_USER, column: "player2" }),
      jobsFor([{ id: "broken", status: "failed" }]),
      ROSTER_IDS,
    );

    const alerts = teamAttention(
      [failed],
      NO_INVITES,
      Date.parse("2026-03-21T00:00:00.000Z"),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("match-failed");
    expect(alerts[0].subject).toBe("Ana Vasquez vs Rival One");
  });
});

test.describe("which side, not merely whose match", () => {
  test("the user id in player2_id attributes player2 — the losing side here", () => {
    // Worse than not attributing at all: `P1_WON` is two sets to nil for
    // `player1`, so an id recognised on the wrong side prints a win under a
    // player who lost. `programSide` reads the column the id sits in, so the
    // membership fix must not touch the side — this is the assertion that says
    // so.
    const row = teamMatchRow(
      recentMatch({ ourId: ANA_USER, column: "player2" }),
      NO_JOBS,
      ROSTER_IDS,
    );

    expect(row.won).toBe(false);
    expect(row.title).toBe("Ana Vasquez vs Rival One");
    // Games flipped to our perspective as well.
    expect(row.sets.map((set) => [set.player1, set.player2])).toEqual([
      [4, 6],
      [3, 6],
    ]);

    // The strip has no player2 case to read: a match reaches a card only
    // through a dual line, and the schedule writes our side as `player1`. A
    // row like this one — ours in `player2`, off the schedule — is the
    // list's business above, and contributes nothing to the average.
    const card = firstServe(
      teamSeasonKpis(
        [seasonMatch({ ourId: ANA_USER, column: "player2" })],
        NO_JOBS,
        bothSides("pre-claim", false),
        ROSTER_IDS,
        ON_DUAL,
        NO_DUALS,
      ),
    );
    expect(card?.value).toBe("—");
  });

  test("the profile id keeps working on both sides", () => {
    // The era the loader already handled. Nothing about the fix may change it.
    expect(
      teamMatchRow(recentMatch({ ourId: ANA_PROFILE }), NO_JOBS, ROSTER_IDS)
        .won,
    ).toBe(true);
    expect(
      teamMatchRow(
        recentMatch({ ourId: ANA_PROFILE, column: "player2" }),
        NO_JOBS,
        ROSTER_IDS,
      ).won,
    ).toBe(false);
  });
});

test.describe("staff seats keep working exactly as they do now", () => {
  test("a coach uploading without a schedule preset is still our side", () => {
    // The case the old `player_id`-only rule got right, and the reason it hid:
    // a staff seat has the same value in both columns.
    const row = teamMatchRow(
      recentMatch({ ourId: COACH }),
      NO_JOBS,
      ROSTER_IDS,
    );
    expect(row.won).toBe(true);

    // On the strip, the same upload counts once it is on a dual's lineup.
    const card = firstServe(
      teamSeasonKpis(
        [onDual(seasonMatch({ ourId: COACH }))],
        NO_JOBS,
        bothSides("pre-claim", true),
        ROSTER_IDS,
        ON_DUAL,
        NO_DUALS,
      ),
    );
    expect(card?.sparkline).toEqual([60]);
  });

  test("an unclaimed coach-managed player is still our side", () => {
    expect(
      teamMatchRow(recentMatch({ ourId: BEN_PROFILE }), NO_JOBS, ROSTER_IDS)
        .won,
    ).toBe(true);
  });

  test("a match between two strangers is still attributed to nobody", () => {
    // The refusal has to survive the fix: widening the id set must not widen it
    // to everyone. No id of ours and no `event_entry_id` means no mark.
    const row = teamMatchRow(
      { ...recentMatch({ ourId: ANA_USER }), player1_id: "stranger-1" },
      NO_JOBS,
      ROSTER_IDS,
    );
    expect(row.won).toBeNull();

    // The card exists — every spec gets one — but nothing fed it: stats for
    // the match are on file and are NOT read, because no side is ours.
    const card = firstServe(
      teamSeasonKpis(
        [{ ...seasonMatch({ ourId: ANA_USER }), player1_id: "stranger-1" }],
        NO_JOBS,
        bothSides("pre-claim", true),
        ROSTER_IDS,
        ON_DUAL,
        NO_DUALS,
      ),
    );
    expect(card?.value).toBe("—");
    expect(card?.sparkline).toEqual([]);
  });
});
