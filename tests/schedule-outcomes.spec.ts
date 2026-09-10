import { expect, test } from "@playwright/test";
import {
  dualScore,
  entryPlayed,
  entryState,
  lineCoverageFrom,
  lineWon,
  resolveEntryResult,
  resultState,
  resultWon,
  supportsVideo,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import type {
  EntryMatch,
  EntryOutcome,
  EventEntry,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

function entry(overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id: "entry",
    eventId: "event",
    discipline: "singles",
    slot: "S1",
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: [],
    opponentLabels: [],
    opponentSchool: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}
function outcome(
  kind: OutcomeKind,
  side: OutcomeSide,
  round: string | null = null,
): EntryOutcome {
  return {
    id: `outcome-${round}`,
    kind,
    side,
    round,
    actorUserId: "actor",
    recordedAt: "2026-09-10T00:00:00Z",
  };
}
function match(round: string | null = null, won = true): EntryMatch {
  return {
    id: `match-${round}`,
    round,
    status: "imported",
    score: { player1: won ? [6, 6] : [2, 2], player2: won ? [2, 2] : [6, 6] },
    opponentLabels: [],
    hasVideo: false,
  };
}

const states = {
  forfeit: "forfeited",
  default: "defaulted",
  withdrawal: "withdrawn",
} as const;
const labels = {
  forfeit: "Forfeited",
  default: "Defaulted",
  withdrawal: "Withdrawn",
};

for (const kind of ["forfeit", "default", "withdrawal"] as const) {
  for (const side of ["ours", "theirs"] as const) {
    test(`${kind} by ${side} resolves, awards the other side, and clears`, () => {
      for (const round of [null, "QF"]) {
        const e = entry({
          slot: round ? null : "S1",
          outcomes: [outcome(kind, side, round)],
        });
        const result = resolveEntryResult(e, round);
        expect(result).toEqual({
          kind: "non-played",
          source: "outcome",
          outcome: e.outcomes![0],
        });
        expect(resultWon(result)).toBe(side === "theirs");
        expect(resultState(result)).toBe(states[kind]);
        expect(entryState(e, round)).toBe(states[kind]);
        expect(LINE_STATUS[states[kind]]).toEqual({
          label: labels[kind],
          tone: "neutral",
        });
        expect(entryPlayed(e)).toBe(true);
        expect(supportsVideo(e, round)).toBe(false);
        expect(lineCoverageFrom([e])).toEqual({ analyzed: 0, total: 0 });
        expect(e.matches).toEqual([]);

        const cleared = { ...e, outcomes: [] };
        expect(resolveEntryResult(cleared, round)).toEqual({
          kind: "unanswered",
        });
        expect(resultWon(resolveEntryResult(cleared, round))).toBeNull();
        expect(entryState(cleared, round)).toBe("empty");
        expect(entryPlayed(cleared)).toBe(false);
        expect(supportsVideo(cleared, round)).toBe(true);
        expect(
          resolveEntryResult({ ...cleared, matches: [match(round)] }, round)
            .kind,
        ).toBe("played");
      }
    });

    test(`${kind} by ${side} counts singles and the doubles majority`, () => {
      const singles = Array.from({ length: 6 }, (_, i) =>
        entry({
          id: `s${i}`,
          slot: `S${i + 1}`,
          outcomes: [outcome(kind, side)],
        }),
      );
      const doubles = Array.from({ length: 3 }, (_, i) =>
        entry({
          id: `d${i}`,
          slot: `D${i + 1}`,
          discipline: "doubles",
          outcomes: [outcome(kind, side)],
        }),
      );
      expect(dualScore([...singles, ...doubles])).toEqual({
        us: side === "theirs" ? 7 : 0,
        them: side === "ours" ? 7 : 0,
        decided: true,
      });
      expect(
        dualScore([entry({ outcomes: [outcome(kind, side)] }), entry()])
          .decided,
      ).toBe(false);
      expect(lineWon(singles[0])).toBe(side === "theirs");
    });
  }
}

test("independent tournament rounds preserve played analysis and clear only one outcome", () => {
  const played = {
    ...match("R16"),
    status: "completed" as const,
    hasVideo: true,
  };
  const e = entry({
    slot: null,
    matches: [played],
    outcomes: [
      outcome("forfeit", "theirs", "Q1"),
      outcome("withdrawal", "ours", "QF"),
    ],
  });
  expect(resultWon(resolveEntryResult(e, "Q1"))).toBe(true);
  expect(resultWon(resolveEntryResult(e, "QF"))).toBe(false);
  expect(resolveEntryResult(e, "R16")).toEqual({
    kind: "played",
    match: played,
  });
  expect(entryState(e, "R16")).toBe("ready");
  expect(entryState(e)).toBe("ready");
  expect(lineWon(e, played)).toBe(true);
  expect(supportsVideo(e, "R16")).toBe(true);
  expect(resolveEntryResult(e, "SF")).toEqual({ kind: "unanswered" });
  expect(supportsVideo(e, "SF")).toBe(true);
  expect(lineCoverageFrom([e])).toEqual({ analyzed: 1, total: 1 });
  const cleared = {
    ...e,
    outcomes: e.outcomes!.filter((o) => o.round !== "Q1"),
  };
  expect(resolveEntryResult(cleared, "Q1").kind).toBe("unanswered");
  expect(resultWon(resolveEntryResult(cleared, "QF"))).toBe(false);
  expect(resolveEntryResult(cleared, "R16")).toEqual({
    kind: "played",
    match: played,
  });
});

test("played wins, losses and undecided scores retain their distinct results", () => {
  for (const won of [true, false]) {
    const e = entry({ matches: [match(null, won)] });
    expect(resolveEntryResult(e, null).kind).toBe("played");
    expect(resultWon(resolveEntryResult(e, null))).toBe(won);
    expect(lineWon(e)).toBe(won);
  }
  for (const score of [null, { player1: [6, 2], player2: [2, 6] }]) {
    const e = entry({ matches: [{ ...match(), score }] });
    expect(resolveEntryResult(e, null).kind).toBe("played");
    expect(resultWon(resolveEntryResult(e, null))).toBeNull();
    expect(entryPlayed(e)).toBe(false);
    expect(dualScore([e])).toEqual({ us: 0, them: 0, decided: false });
  }
});

test("legacy forfeits retain their precedence without invented outcome metadata", () => {
  for (const side of ["ours", "theirs"] as const) {
    const e = entry({ forfeit: side, matches: [match(null, side === "ours")] });
    expect(resolveEntryResult(e, null)).toEqual({
      kind: "non-played",
      source: "legacy",
      outcome: { kind: "forfeit", side, round: null },
    });
    expect(lineWon(e, e.matches[0])).toBe(side === "theirs");
    expect(entryState(e)).toBe("forfeited");
    expect(lineCoverageFrom([e])).toEqual({ analyzed: 0, total: 0 });
    expect(
      resolveEntryResult({ ...e, forfeit: null, matches: [] }, null).kind,
    ).toBe("unanswered");
  }
});

test("new outcomes consistently outrank conflicting matches only at their own round", () => {
  const e = entry({
    matches: [match()],
    outcomes: [outcome("default", "ours")],
  });
  expect(lineWon(e)).toBe(false);
  expect(lineWon(e, e.matches[0])).toBe(false);
  expect(entryState(e)).toBe("defaulted");
  expect(lineCoverageFrom([e])).toEqual({ analyzed: 0, total: 0 });
  expect(dualScore([e])).toEqual({ us: 0, them: 1, decided: true });
});

test("a mixed dual awards one doubles point and becomes unanswered after clearing", () => {
  const singles = [
    entry({ matches: [match()] }),
    entry({ matches: [match(null, false)] }),
    entry({ forfeit: "theirs" }),
    entry({ outcomes: [outcome("default", "ours")] }),
    entry({ outcomes: [outcome("withdrawal", "theirs")] }),
    entry({ outcomes: [outcome("forfeit", "ours")] }),
  ];
  const doubles = [
    entry({ discipline: "doubles", matches: [match()] }),
    entry({ discipline: "doubles", outcomes: [outcome("default", "theirs")] }),
    entry({ discipline: "doubles", outcomes: [outcome("withdrawal", "ours")] }),
  ];
  expect(dualScore([...singles, ...doubles])).toEqual({
    us: 4,
    them: 3,
    decided: true,
  });
  expect(
    dualScore([
      ...singles,
      doubles[0],
      { ...doubles[1], outcomes: [] },
      doubles[2],
    ]),
  ).toEqual({ us: 3, them: 3, decided: false });
});
