import { test, expect } from "@playwright/test";
import { emptyScore } from "@/lib/admin/results/dual-form";
import {
  freezeTournamentRequest,
  validateTournamentDraft,
  type TournamentDraft,
  type AdminTournamentContext,
} from "@/lib/admin/results/tournament-form";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const draft = (): TournamentDraft => ({
  tournament: {
    name: "Fall invitational",
    startsOn: "2026-09-16",
    endsOn: "2026-09-18",
    site: "neutral",
    surface: "hard",
    host: null,
    bestOf: 3,
    adScoring: false,
  },
  entryId: "",
  playerId: id(1),
  playerLabel: "Alex",
  draw: "Main",
  seed: "2",
  round: "R16",
  score: {
    ...emptyScore(3, "Robin"),
    playerScores: [6, 6, null],
    opponentScores: [4, 3, null],
  },
  outcome: "",
});
const existing: AdminTournamentContext = {
  eventId: id(2),
  fingerprint: "a".repeat(32),
  tournament: draft().tournament,
  entries: [
    {
      id: id(3),
      playerId: id(1),
      label: "Alex",
      draw: "Main",
      seed: 2,
      fingerprint: "b".repeat(32),
      forfeit: null,
      saved: { R16: "6–4 6–3" },
    },
  ],
};
test("new tournament review freezes one player, round, score and durable operation identities", () => {
  const d = draft();
  let next = 20;
  const request = freezeTournamentRequest(id(9), d, null, () => id(next++));
  expect(request.operationId).toBe(id(20));
  expect(request.itemId).toBe(id(21));
  expect(request.event.kind).toBe("new");
  expect(request.entry).toEqual({
    kind: "new",
    playerId: id(1),
    playerLabel: "Alex",
    draw: "Main",
    seed: 2,
  });
  expect(request.round).toBe("R16");
  d.score.playerScores[0] = 0;
  d.tournament.name = "Changed";
  expect(request.result).toMatchObject({ kind: "score", ourGames: [6, 6] });
  expect(request.event).toMatchObject({
    tournament: { name: "Fall invitational" },
  });
});
test("existing tournaments support existing and new entries; recorded rounds cannot be submitted", () => {
  const d = draft();
  d.entryId = id(3);
  expect(validateTournamentDraft(d, existing).errors.join(" ")).toContain(
    "read-only",
  );
  d.round = "QF";
  const r = freezeTournamentRequest(id(9), d, existing, () => id(7));
  expect(r.entry).toEqual({
    kind: "existing",
    entryId: id(3),
    playerId: id(1),
    fingerprint: "b".repeat(32),
  });
  expect(r.event).toEqual({
    kind: "existing",
    eventId: id(2),
    fingerprint: "a".repeat(32),
  });
  d.entryId = "";
  d.playerId = id(4);
  d.playerLabel = "Sam";
  expect(
    freezeTournamentRequest(id(9), d, existing, () => id(7)).entry.kind,
  ).toBe("new");
});
test("invalid dates, seed, round and incomplete score block review", () => {
  const d = draft();
  d.tournament.endsOn = "2026-09-15";
  d.seed = "1.5";
  d.round = "fake";
  d.score.opponentScores[0] = null;
  expect(validateTournamentDraft(d, null).errors.length).toBe(4);
  expect(() => freezeTournamentRequest(id(9), d, null, () => id(7))).toThrow();
});
test("outcomes and stopped matches retain their sides; no-result and forfeited entries are refused", () => {
  const d = draft();
  d.score = emptyScore(3);
  expect(validateTournamentDraft(d, null).valid).toBe(false);
  d.outcome = "theirs-withdrawal";
  expect(validateTournamentDraft(d, null).result).toEqual({
    kind: "outcome",
    side: "theirs",
    outcome: "withdrawal",
  });
  d.entryId = id(3);
  d.round = "QF";
  expect(
    validateTournamentDraft(d, {
      ...existing,
      entries: [{ ...existing.entries[0], forfeit: "ours" }],
    }).valid,
  ).toBe(false);
  d.entryId = "";
  d.outcome = "";
  d.score = {
    ...emptyScore(3, "Robin"),
    playerScores: [2, null, null],
    opponentScores: [3, null, null],
    ending: "retired",
    stoppedBy: "ours",
  };
  expect(validateTournamentDraft(d, null).result).toMatchObject({
    kind: "score",
    ending: { kind: "retired", side: "ours" },
  });
});
