import { id } from "./admin-schedule-harness.mjs";
export function dualRequest(op = 100) {
  const lines = Array.from({ length: 9 }, (_, n) => {
    const doubles = n >= 6;
    const indexes = doubles ? [(n - 6) * 2, (n - 6) * 2 + 1] : [n];
    return {
      slot: doubles ? `D${n - 5}` : `S${n + 1}`,
      discipline: doubles ? "doubles" : "singles",
      position: n,
      playerUserIds: indexes.map((i) => id(20 + i)),
      playerLabels: indexes.map((i) => `Player${i + 1} Athlete`),
      opponentLabels: indexes.map((i) => `Opponent${i + 1}`),
    };
  });
  return {
    operationId: id(op),
    programId: id(10),
    event: {
      kind: "new",
      dual: {
        opponent: "Other",
        opponentProgramKey: "other",
        date: "2026-09-15",
        startsAtTime: null,
        site: "home",
        surface: "Hard",
        bestOf: 3,
        adScoring: null,
        doublesGamesTo: 8,
        doublesAdScoring: false,
        lines,
      },
    },
    items: [
      {
        itemId: id(op + 1),
        slot: "S1",
        result: {
          kind: "score",
          ourGames: [6, 7],
          theirGames: [4, 6],
          ourTiebreaks: [null, 7],
          theirTiebreaks: [null, 4],
          opponentLabels: ["Opponent1"],
          ending: null,
        },
      },
      {
        itemId: id(op + 2),
        slot: "S2",
        result: { kind: "outcome", outcome: "default", side: "theirs" },
      },
    ],
  };
}
export function tournamentRequest(op = 100) {
  return {
    operationId: id(op),
    itemId: id(op + 1),
    programId: id(10),
    event: {
      kind: "new",
      tournament: {
        name: "Invitational",
        startsOn: "2026-09-15",
        endsOn: "2026-09-20",
        site: "away",
        surface: "Hard",
        host: "Host",
        bestOf: 3,
        adScoring: false,
      },
    },
    entry: {
      kind: "new",
      playerId: id(20),
      playerLabel: "Player1 Athlete",
      draw: "Main",
      seed: 2,
    },
    round: "R16",
    result: {
      kind: "score",
      ourGames: [6, 7],
      theirGames: [4, 6],
      ourTiebreaks: [null, 7],
      theirTiebreaks: [null, 5],
      opponentLabels: ["Opponent"],
      ending: null,
    },
  };
}
