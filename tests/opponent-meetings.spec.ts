import { expect, test } from "@playwright/test";

import {
  opponentDualHistory,
  opponentMeetings,
} from "@/lib/schedule/opponent-history";
import type { ProgramSchedule } from "@/lib/data/schedule-server";
import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * `opponentMeetings` beside `opponentDualHistory` — same fixture shape as
 * `tests/weekend-dual-reads.spec.ts` (hand-built `ProgramEvent`/`EventEntry`),
 * built by hand rather than through a loader so a shape drift in
 * `ProgramSchedule` fails at compile time, not at runtime.
 */

const FORMAT = { bestOf: 3, adScoring: true };

function baseEvent(
  id: string,
  kind: "dual" | "tournament",
  name: string,
  startsOn: string,
  site: "home" | "away" | "neutral" = "home",
): ProgramEvent {
  return {
    id,
    programId: "p-1",
    kind,
    name,
    startsOn,
    endsOn: startsOn,
    site,
    surface: "hard",
    host: null,
    format: FORMAT,
  };
}

/** A decided singles match, straight sets to whichever side is named. */
function match(id: string, winner: "us" | "them"): EntryMatch {
  const won = [6, 6];
  const lost = [3, 4];
  return {
    id,
    round: null,
    status: "imported",
    score:
      winner === "us"
        ? { player1: won, player2: lost }
        : { player1: lost, player2: won },
    opponentLabels: ["Rival Player"],
    hasVideo: false,
  };
}

function entry(
  eventId: string,
  slot: string,
  matches: EntryMatch[],
): EventEntry {
  return {
    id: `${eventId}-${slot}`,
    eventId,
    discipline: "singles",
    slot,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: [`Player ${slot}`],
    opponentLabels: ["Rival Player"],
    opponentSchool: "Rival State",
    forfeit: null,
    matches,
  };
}

/** Six singles lines, all decided, the given number going our way. */
function decidedSinglesEntries(eventId: string, usWins: number): EventEntry[] {
  return Array.from({ length: 6 }, (_, index) => {
    const slot = `S${index + 1}`;
    const winner = index < usWins ? "us" : "them";
    return entry(eventId, slot, [match(`${eventId}-${slot}-m`, winner)]);
  });
}

// Won dual: 2026-03-21, we take 4 of 6 singles lines (no doubles entries —
// dualScore only awards a doubles point when doubles entries exist, so this
// dual settles 4-2 in our favour and stays decided since every entry is played).
const WON_EVENT = baseEvent("e-won", "dual", "Rival State", "2026-03-21");
const WON_ENTRIES = decidedSinglesEntries(WON_EVENT.id, 4);

// Lost dual: 2026-03-14, we take 2 of 6.
const LOST_EVENT = baseEvent("e-lost", "dual", "Rival State", "2026-03-14");
const LOST_ENTRIES = decidedSinglesEntries(LOST_EVENT.id, 2);

// Undecided dual: 2026-03-28, only half the lines played.
const UNDECIDED_EVENT = baseEvent(
  "e-undecided",
  "dual",
  "Rival State",
  "2026-03-28",
);
const UNDECIDED_ENTRIES = [
  entry(UNDECIDED_EVENT.id, "S1", [match("e-undecided-S1-m", "us")]),
  entry(UNDECIDED_EVENT.id, "S2", []),
];

// Level dual: 2026-03-07, 3-3 split with no doubles entries to break the tie.
const LEVEL_EVENT = baseEvent("e-level", "dual", "Rival State", "2026-03-07");
const LEVEL_ENTRIES = decidedSinglesEntries(LEVEL_EVENT.id, 3);

// A tournament whose own name happens to equal the opponent's school name.
const TOURNAMENT_EVENT = baseEvent(
  "e-tourney",
  "tournament",
  "Rival State",
  "2026-03-01",
);
const TOURNAMENT_ENTRIES = [entry(TOURNAMENT_EVENT.id, "S1", [])];

const SCHEDULE: ProgramSchedule = {
  events: [
    // Deliberately not newest-first, so a correct implementation must sort
    // rather than trust `schedule.events` order.
    LOST_EVENT,
    WON_EVENT,
    TOURNAMENT_EVENT,
    UNDECIDED_EVENT,
    LEVEL_EVENT,
  ],
  entriesByEvent: new Map([
    [WON_EVENT.id, WON_ENTRIES],
    [LOST_EVENT.id, LOST_ENTRIES],
    [UNDECIDED_EVENT.id, UNDECIDED_ENTRIES],
    [LEVEL_EVENT.id, LEVEL_ENTRIES],
    [TOURNAMENT_EVENT.id, TOURNAMENT_ENTRIES],
  ]),
};

test.describe("opponentMeetings · decided duals only, newest first", () => {
  test("excludes the tournament and the undecided dual, sorts newest-first", () => {
    const meetings = opponentMeetings(SCHEDULE, "Rival State");

    expect(meetings.map((m) => m.eventId)).toEqual([
      WON_EVENT.id,
      LOST_EVENT.id,
      LEVEL_EVENT.id,
    ]);
  });

  test("a name is matched case/whitespace-insensitively, same normaliser as opponentDualHistory", () => {
    const meetings = opponentMeetings(SCHEDULE, "  rival   state ");
    expect(meetings.map((m) => m.eventId)).toEqual([
      WON_EVENT.id,
      LOST_EVENT.id,
      LEVEL_EVENT.id,
    ]);
  });

  test("won is true, false, or null on a level dual", () => {
    const meetings = opponentMeetings(SCHEDULE, "Rival State");
    const byId = new Map(meetings.map((m) => [m.eventId, m]));

    expect(byId.get(WON_EVENT.id)?.won).toBe(true);
    expect(byId.get(LOST_EVENT.id)?.won).toBe(false);
    expect(byId.get(LEVEL_EVENT.id)?.won).toBeNull();
  });

  test("rows carry the site and the score", () => {
    const meetings = opponentMeetings(SCHEDULE, "Rival State");
    const won = meetings.find((m) => m.eventId === WON_EVENT.id);

    expect(won?.site).toBe("home");
    expect(won).toMatchObject({ us: 4, them: 2 });
  });

  test("excludeEventId drops one row", () => {
    const meetings = opponentMeetings(SCHEDULE, "Rival State", {
      excludeEventId: WON_EVENT.id,
    });
    expect(meetings.map((m) => m.eventId)).toEqual([
      LOST_EVENT.id,
      LEVEL_EVENT.id,
    ]);
  });

  test("a name with no meetings returns an empty array", () => {
    expect(opponentMeetings(SCHEDULE, "Nobody U")).toEqual([]);
  });

  test("agrees with opponentDualHistory: us/them equal the won-row counts", () => {
    const meetings = opponentMeetings(SCHEDULE, "Rival State");
    const wonCount = meetings.filter((m) => m.won === true).length;
    const lostCount = meetings.filter((m) => m.won === false).length;

    const histories = opponentDualHistory(SCHEDULE);
    const history = histories.get("rival state");

    expect(history?.us).toBe(wonCount);
    expect(history?.them).toBe(lostCount);
  });
});
