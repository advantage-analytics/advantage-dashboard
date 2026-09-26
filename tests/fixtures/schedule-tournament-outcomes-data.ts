import type {
  EntryMatch,
  EntryOutcome,
  EventDetail,
  EventEntry,
} from "@/lib/schedule/types";

const played: EntryMatch = {
  id: "played-r16",
  round: "R16",
  // What `recordResult` writes: the event's day at noon.
  date: "2026-09-11T12:00:00+00:00",
  status: "imported",
  score: { player1: [6, 6], player2: [2, 3] },
  opponentLabels: ["Played Rival"],
  hasVideo: true,
};

function outcome(
  id: string,
  round: string,
  kind: EntryOutcome["kind"],
  side: EntryOutcome["side"],
): EntryOutcome {
  return {
    id,
    round,
    kind,
    side,
    actorUserId: "coach-browser",
    recordedAt: "2026-09-10T00:00:00Z",
  };
}

export const entry: EventEntry = {
  id: "tournament-entry",
  eventId: "tournament-outcomes",
  discipline: "singles",
  slot: null,
  position: 0,
  draw: "Qualifying",
  seed: 3,
  playerUserIds: ["player-browser"],
  playerLabels: ["Jordan Lee"],
  opponentLabels: ["Fallback Rival"],
  opponentSchool: "Ridgeline",
  opponentProgramId: null,
  forfeit: null,
  matches: [played],
  // Deliberately reverse ladder order. The renderer owns the same established
  // round ordering as the loader even when a fixture or cached payload does not.
  outcomes: [
    outcome("outcome-qf", "QF", "withdrawal", "ours"),
    outcome("outcome-q1", "Q1", "default", "theirs"),
  ],
};

/**
 * A main-draw entry that has played nothing yet: its group head still draws,
 * with "No matches yet", and it contributes no rows. Its lineup id is an auth
 * uid the roster does not know, so its name stays plain text.
 */
export const waitingEntry: EventEntry = {
  id: "tournament-entry-waiting",
  eventId: "tournament-outcomes",
  discipline: "singles",
  slot: null,
  position: 1,
  draw: "main",
  seed: 1,
  playerUserIds: ["auth-uid-not-on-roster"],
  playerLabels: ["Sam Park"],
  opponentLabels: [],
  opponentSchool: null,
  opponentProgramId: null,
  forfeit: null,
  matches: [],
  outcomes: [],
};

/** Lineup id → roster profile id, as the server page builds it. */
export const rosterPlayerIds: Record<string, string> = {
  "player-browser": "player-browser",
};

export const detail: EventDetail = {
  event: {
    id: "tournament-outcomes",
    programId: "program-browser",
    kind: "tournament",
    name: "Fall Invitational",
    startsOn: "2026-09-10",
    endsOn: "2026-09-12",
    site: "neutral",
    surface: "hard",
    host: null,
    format: { bestOf: 3, adScoring: false },
  },
  entries: [entry, waitingEntry],
};
