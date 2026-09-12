import type {
  EntryMatch,
  EntryOutcome,
  EventDetail,
  EventEntry,
} from "@/lib/schedule/types";

const played: EntryMatch = {
  id: "played-r16",
  round: "R16",
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
  entries: [entry],
};
