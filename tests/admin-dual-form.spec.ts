import { test, expect } from "@playwright/test";
import {
  emptyDualLines,
  hasNineDualCourts,
  emptyScore,
  draftResult,
  validateDualDraft,
  freezeDualRequest,
  retainSuccesses,
  type DualResultDraft,
  type AdminDualContext,
} from "@/lib/admin/results/dual-form";
import type { CreateDualInput } from "@/lib/schedule/write-types";
import type { AdminResultItemOutcome } from "@/lib/admin/results/types";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dual: CreateDualInput = {
  opponent: "Stanford",
  opponentProgramKey: null,
  date: "2026-09-16",
  startsAtTime: null,
  site: "home",
  surface: "hard",
  bestOf: 3,
  adScoring: null,
  doublesGamesTo: 8,
  doublesAdScoring: false,
  lines: emptyDualLines().map((l, i) => ({
    ...l,
    playerUserIds:
      l.discipline === "singles" ? [id(i)] : [id(i * 2), id(i * 2 + 1)],
    playerLabels:
      l.discipline === "singles"
        ? [`Player ${i}`]
        : [`Player ${i * 2}`, `Player ${i * 2 + 1}`],
  })),
};
const drafts = (): DualResultDraft[] =>
  dual.lines.map((line) => ({
    line,
    score: emptyScore(
      line.discipline === "doubles" ? 1 : 3,
      line.discipline === "doubles" ? "One / Two" : "Opponent",
    ),
    outcome: "",
  }));
const existing: AdminDualContext = {
  eventId: id(50),
  fingerprint: "a".repeat(32),
  label: "Stanford",
  dual,
  saved: { D1: "6–4" },
};
test("nine courts follow doubles then singles and no valid changes cannot be reviewed", () => {
  expect(emptyDualLines().map((l) => l.slot)).toEqual([
    "D1",
    "D2",
    "D3",
    "S1",
    "S2",
    "S3",
    "S4",
    "S5",
    "S6",
  ]);
  expect(validateDualDraft(dual, drafts(), null).valid).toBe(false);
});
test("coach-recorded results are excluded even if a draft contains edits", () => {
  const d = drafts();
  d[0].outcome = "ours-default";
  expect(validateDualDraft(dual, d, existing).selected).toEqual([]);
  expect(() =>
    freezeDualRequest(id(90), dual, d, existing, () => id(91)),
  ).toThrow();
});
test("score conversion preserves our games first, separate tiebreak points and stopped side", () => {
  const d = drafts()[3];
  d.score = {
    ...d.score,
    playerScores: [7, 2, null],
    opponentScores: [6, 3, null],
    playerTiebreaks: [null, null, null],
    opponentTiebreaks: [5, null, null],
    ending: "retired",
    stoppedBy: "ours",
  };
  expect(draftResult(d).result).toEqual({
    kind: "score",
    ourGames: [7, 2],
    theirGames: [6, 3],
    ourTiebreaks: [null, null],
    theirTiebreaks: [5, null],
    opponentLabels: ["Opponent"],
    ending: { kind: "retired", side: "ours" },
  });
});
test("incomplete, gapped and invalid scores show feedback instead of coercing missing games to zero", () => {
  const d = drafts()[3];
  d.score.playerScores[0] = 6;
  expect(draftResult(d).error).toContain("both game counts");
  d.score = emptyScore(3, "Opponent");
  d.score.playerScores[1] = 6;
  d.score.opponentScores[1] = 4;
  expect(draftResult(d).error).toContain("consecutive");
  d.score.playerScores = [-1, null, null];
  d.score.opponentScores = [4, null, null];
  expect(draftResult(d).error).toContain("whole game counts");
});
test("No player requires matching forfeit and lineup clashes block review", () => {
  const d = drafts();
  d[3].line = {
    ...d[3].line,
    playerUserIds: [],
    playerLabels: [],
    noPlayer: true,
  };
  d[3].outcome = "theirs-forfeit";
  expect(validateDualDraft(dual, d, null).errors.S1).toContain(
    "matching forfeit",
  );
  d[3].outcome = "ours-forfeit";
  expect(validateDualDraft(dual, d, null).valid).toBe(true);
  d[4].line = {
    ...d[4].line,
    playerUserIds: d[5].line.playerUserIds,
    playerLabels: d[5].line.playerLabels,
  };
  expect(validateDualDraft(dual, d, null).valid).toBe(false);
});
test("review snapshots input and UUIDs, so retry keeps original operation and successful lines", () => {
  const d = drafts();
  d[3].outcome = "theirs-default";
  d[4].outcome = "ours-withdrawal";
  let counter = 100;
  const request = freezeDualRequest(id(90), dual, d, existing, () =>
    id(counter++),
  );
  const before = JSON.stringify(request);
  d[3].outcome = "ours-default";
  dual.opponent = "Changed";
  expect(JSON.stringify(request)).toBe(before);
  expect(request.items).toHaveLength(2);
  expect(request.operationId).toBe(id(100));
  const outcomes = request.items.map((item, i): AdminResultItemOutcome => ({
    ...item,
    status: i === 0 ? "succeeded" : "failed",
    matchId: i === 0 ? id(500) : null,
    outcomeId: null,
    error: i === 0 ? null : "conflict",
  }));
  const recovery = retainSuccesses(
    outcomes,
    outcomes.map((i) => ({
      ...i,
      status: "pending",
      matchId: null,
      error: null,
    })),
  );
  expect(recovery[0]).toEqual(outcomes[0]);
  expect(recovery[1].status).toBe("pending");
});

test("historical duals with missing, duplicate or misclassified courts refuse editing", () => {
  const lines = emptyDualLines();
  expect(hasNineDualCourts(lines)).toBe(true);
  expect(hasNineDualCourts(lines.slice(1))).toBe(false);
  expect(hasNineDualCourts([...lines.slice(1), lines[1]])).toBe(false);
  expect(
    hasNineDualCourts(
      lines.map((l, i) => (i === 0 ? { ...l, discipline: "singles" } : l)),
    ),
  ).toBe(false);
});
