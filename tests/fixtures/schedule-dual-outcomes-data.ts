import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

function match(
  id: string,
  won: boolean,
  overrides: Partial<EntryMatch> = {},
): EntryMatch {
  return {
    id,
    round: null,
    status: "manual",
    score: {
      player1: won ? [6, 6] : [2, 2],
      player2: won ? [2, 2] : [6, 6],
    },
    opponentLabels: [],
    hasVideo: false,
    ...overrides,
  };
}

function entry(slot: string, overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id: `entry-${slot.toLowerCase()}`,
    eventId: "dual-outcomes",
    discipline: slot.startsWith("D") ? "doubles" : "singles",
    slot,
    position: Number(slot.slice(1)) - 1,
    draw: null,
    seed: null,
    playerUserIds: [`player-${slot.toLowerCase()}`],
    playerLabels: [`Our ${slot}`],
    opponentLabels: [`Opponent ${slot}`],
    opponentSchool: "Meridian State",
    forfeit: null,
    matches: [],
    outcomes: [],
    ...overrides,
  };
}

function outcomeEntry(
  slot: string,
  kind: OutcomeKind,
  side: OutcomeSide,
  overrides: Partial<EventEntry> = {},
): EventEntry {
  return entry(slot, {
    outcomes: [
      {
        id: `outcome-${slot.toLowerCase()}`,
        round: null,
        kind,
        side,
        actorUserId: "coach",
        recordedAt: "2026-09-10T00:00:00Z",
      },
    ],
    ...overrides,
  });
}

export const OUTCOME_ENTRIES: EventEntry[] = [
  // The ready match is deliberately contradictory legacy input. The outcome
  // must remain authoritative for rendering, coverage and team-total ids.
  outcomeEntry("S1", "forfeit", "theirs", {
    matches: [
      match("ignored-ready-match", false, {
        status: "imported",
        hasVideo: true,
      }),
    ],
  }),
  outcomeEntry("S2", "forfeit", "ours"),
  outcomeEntry("S3", "default", "theirs"),
  outcomeEntry("S4", "default", "ours"),
  outcomeEntry("S5", "withdrawal", "theirs"),
  outcomeEntry("S6", "withdrawal", "ours"),
  entry("D1", {
    matches: [
      match("ready-played-match", true, {
        status: "imported",
        hasVideo: true,
      }),
    ],
  }),
  entry("D2", { matches: [match("manual-win", true)] }),
  entry("D3", { matches: [match("manual-loss", false)] }),
];

export const NORMAL_ENTRIES: EventEntry[] = [
  entry("S1"),
  entry("S2", {
    matches: [
      match("normal-ready-match", true, {
        status: "imported",
        hasVideo: true,
      }),
    ],
  }),
];

export function detail(entries: EventEntry[]): EventDetail {
  return {
    event: {
      id: "dual-outcomes",
      programId: "program",
      kind: "dual",
      name: "Meridian State",
      startsOn: "2026-09-10",
      endsOn: "2026-09-10",
      site: "home",
      surface: "Hard",
      host: null,
      format: { bestOf: 3, adScoring: false },
    },
    entries,
  };
}
