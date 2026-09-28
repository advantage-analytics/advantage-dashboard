import { expect, test } from "@playwright/test";

import {
  OUTCOME_ROUNDS,
  ROUND_ORDER,
  drawOfRound,
  roundLongLabel,
  roundRank,
} from "@/lib/schedule/format";
import {
  compareTournamentRows,
  groupByDraw,
  nextRound,
  nextRoundAfter,
  runFinish,
} from "@/lib/schedule/tournament-run";
import type { EntryMatch, EventEntry } from "@/lib/schedule/types";

/**
 * `roundLongLabel` and `runFinish` — the two sentences the tournament page
 * writes about a run, pinned as pure functions.
 *
 * Hand-built entries rather than a loader, so a drift in `EventEntry` fails at
 * compile time rather than at runtime. Nothing here renders: the point of
 * moving these out of `tournament-detail.tsx` was that a run's shape and its
 * one-line summary can be checked without a browser.
 */

function match(
  id: string,
  round: string | null,
  winner: "us" | "them" | null,
): EntryMatch {
  const won = [6, 6];
  const lost = [3, 4];
  return {
    id,
    round,
    status: "imported",
    score:
      winner === null
        ? null
        : winner === "us"
          ? { player1: won, player2: lost }
          : { player1: lost, player2: won },
    opponentLabels: ["Rival Player"],
    hasVideo: false,
  };
}

function entry(
  matches: EntryMatch[],
  draw: string | null = "Main draw",
): EventEntry {
  return {
    id: "e-1",
    eventId: "ev-1",
    discipline: "singles",
    slot: null,
    position: 1,
    draw,
    seed: 3,
    playerUserIds: [],
    playerLabels: ["Dana Brooks"],
    opponentLabels: ["Rival Player"],
    opponentSchool: "Ridgeline",
    opponentProgramId: null,
    forfeit: null,
    matches,
  };
}

/**
 * T10: the ladder, in the order a weekend is played — the ITA draws page's
 * flights laid end to end. Pinned whole, because every sorter on the event page
 * and the drawer reads this array as the chronology.
 */
test.describe("ROUND_ORDER and drawOfRound", () => {
  test("runs PQ, PQ consolation, qualifying, main draw, consolation", () => {
    expect(ROUND_ORDER).toEqual([
      "PQ1",
      "PQ2",
      "PQ3",
      "PQ4",
      "PC1",
      "PC2",
      "PC3",
      "PC4",
      "Q1",
      "Q2",
      "Q3",
      "R256",
      "R128",
      "R64",
      "R32",
      "R16",
      "QF",
      "SF",
      "F",
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ]);
  });

  test("maps each code to its draw, read from the round", () => {
    const draws = Object.fromEntries(
      ROUND_ORDER.map((round) => [round, drawOfRound(round)]),
    );
    expect(draws).toEqual({
      PQ1: "Prequalifying",
      PQ2: "Prequalifying",
      PQ3: "Prequalifying",
      PQ4: "Prequalifying",
      PC1: "PQ Consolation",
      PC2: "PQ Consolation",
      PC3: "PQ Consolation",
      PC4: "PQ Consolation",
      Q1: "Qualifying",
      Q2: "Qualifying",
      Q3: "Qualifying",
      R256: "Main draw",
      R128: "Main draw",
      R64: "Main draw",
      R32: "Main draw",
      R16: "Main draw",
      QF: "Main draw",
      SF: "Main draw",
      F: "Main draw",
      C1: "Consolation",
      C2: "Consolation",
      C3: "Consolation",
      C4: "Consolation",
      C5: "Consolation",
    });
    // Case-blind, and nothing for a code the ladder does not know.
    expect(drawOfRound("pq2")).toBe("Prequalifying");
    expect(drawOfRound("pc1")).toBe("PQ Consolation");
    expect(drawOfRound("S1")).toBeNull();
    expect(drawOfRound(null)).toBeNull();
  });

  /**
   * Every round stored before T10 is one of the thirteen older codes. New
   * codes were only ever inserted around them, so any run made of them sorts
   * exactly as it did — Osei's weekend still reads Q1, Q2, R32, R16, C1.
   */
  test("roundRank sorts the pre-T10 rounds exactly as before", () => {
    const before = [
      "Q1",
      "Q2",
      "Q3",
      "R128",
      "R64",
      "R32",
      "R16",
      "QF",
      "SF",
      "F",
      "C1",
      "C2",
      "C3",
    ];
    expect([...OUTCOME_ROUNDS]).toEqual(before);
    const shuffled = [...before].reverse();
    expect(shuffled.sort((a, b) => roundRank(a) - roundRank(b))).toEqual(
      before,
    );
    const osei = ["C1", "R32", "Q2", "R16", "Q1"];
    expect(osei.sort((a, b) => roundRank(a) - roundRank(b))).toEqual([
      "Q1",
      "Q2",
      "R32",
      "R16",
      "C1",
    ]);
    // An unknown round still sorts last.
    expect(roundRank("Final 4")).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("the new codes sit where they are played", () => {
    const run = ["R32", "PC2", "Q1", "PQ3", "C4", "R256", "PQ1", "C5"];
    expect(run.sort((a, b) => roundRank(a) - roundRank(b))).toEqual([
      "PQ1",
      "PQ3",
      "PC2",
      "Q1",
      "R256",
      "R32",
      "C4",
      "C5",
    ]);
  });
});

test.describe("roundLongLabel", () => {
  /**
   * Every code in `ROUND_ORDER`, spelled out. The article is part of the label
   * for a main-draw round and absent for qualifying and consolation, which is
   * the whole reason the mapping is a table rather than a template.
   */
  const EXPECTED: Record<string, string> = {
    PQ1: "prequalifying round 1",
    PQ2: "prequalifying round 2",
    PQ3: "prequalifying round 3",
    PQ4: "prequalifying round 4",
    PC1: "PQ consolation round 1",
    PC2: "PQ consolation round 2",
    PC3: "PQ consolation round 3",
    PC4: "PQ consolation round 4",
    Q1: "qualifying round 1",
    Q2: "qualifying round 2",
    Q3: "qualifying round 3",
    R256: "the round of 256",
    R128: "the round of 128",
    R64: "the round of 64",
    R32: "the round of 32",
    R16: "the round of 16",
    QF: "the quarter-final",
    SF: "the semi-final",
    F: "the final",
    C1: "consolation round 1",
    C2: "consolation round 2",
    C3: "consolation round 3",
    C4: "consolation round 4",
    C5: "consolation round 5",
  };

  test("maps every round in ROUND_ORDER", () => {
    for (const code of ROUND_ORDER) {
      expect(roundLongLabel(code)).toBe(EXPECTED[code]);
    }
    // The record and the ladder describe the same set — a round added to one
    // and not the other is a run that prints a bare code mid-sentence.
    expect(Object.keys(EXPECTED).sort()).toEqual([...ROUND_ORDER].sort());
  });

  test("is case-insensitive and passes an unknown code through", () => {
    expect(roundLongLabel("qf")).toBe("the quarter-final");
    expect(roundLongLabel("R7")).toBe("R7");
  });
});

test.describe("runFinish", () => {
  test("is null before anything is played", () => {
    expect(runFinish(entry([]))).toBeNull();
  });

  test('"out in …" when the furthest round was lost', () => {
    expect(
      runFinish(entry([match("m1", "R16", "us"), match("m2", "QF", "them")])),
    ).toBe("out in the quarter-final");
  });

  test('"won the final" when F was won', () => {
    expect(
      runFinish(entry([match("m1", "SF", "us"), match("m2", "F", "us")])),
    ).toBe("won the final");
  });

  test('"through …" when the furthest round was won and is not the final', () => {
    expect(
      runFinish(entry([match("m1", "R32", "us"), match("m2", "R16", "us")])),
    ).toBe("through the round of 16");
  });

  /**
   * The furthest round decides, not the array's last row. `matches` arrives in
   * whatever order Postgres returned, and reading the tail reported a qualifier
   * as out in Q2 after they had come through it.
   */
  test("reads the ladder, not the array order", () => {
    expect(
      runFinish(
        entry(
          [match("m1", "R32", "us"), match("m2", "Q2", "us")],
          "Qualifying",
        ),
      ),
    ).toBe("through the round of 32");
  });
});

test.describe("groupByDraw", () => {
  test("buckets a run by the draw each ROUND belongs to", () => {
    const run = entry(
      [
        match("m1", "Q1", "us"),
        match("m2", "Q2", "us"),
        match("m3", "R32", "them"),
      ],
      "Qualifying",
    );
    expect(groupByDraw(run).map((segment) => segment.draw)).toEqual([
      "Qualifying",
      "Main draw",
    ]);
  });

  test("a run inside one draw is one segment", () => {
    const run = entry([match("m1", "R32", "us"), match("m2", "R16", "them")]);
    const segments = groupByDraw(run);
    expect(segments).toHaveLength(1);
    expect(segments[0].matches).toHaveLength(2);
  });

  test("a prequalifier's PQ2 → PC1 → PC2 is two segments", () => {
    const run = entry(
      [
        match("m1", "PQ2", "them"),
        match("m2", "PC1", "us"),
        match("m3", "PC2", "us"),
      ],
      "Prequalifying",
    );
    const segments = groupByDraw(run);
    expect(segments.map((segment) => segment.draw)).toEqual([
      "Prequalifying",
      "PQ Consolation",
    ]);
    expect(
      segments.map((segment) => segment.matches.map((m) => m.round)),
    ).toEqual([["PQ2"], ["PC1", "PC2"]]);
  });

  test("falls back to the entry draw when the round says nothing", () => {
    const run = entry([match("m1", null, "us")], "Flight B");
    expect(groupByDraw(run).map((segment) => segment.draw)).toEqual([
      "Flight B",
    ]);
  });
});

test.describe("nextRound", () => {
  function runOf(rounds: string[], draw: string | null = null): EventEntry {
    return {
      id: "entry",
      eventId: "event",
      discipline: "singles",
      slot: null,
      position: 0,
      draw,
      seed: null,
      playerUserIds: [],
      playerLabels: ["Ana Vasquez"],
      opponentLabels: [],
      opponentSchool: null,
      forfeit: null,
      matches: rounds.map((round, index) => ({
        id: `m-${index}`,
        round,
        status: "imported",
        score: { player1: [6], player2: [3] },
        opponentLabels: [],
        hasVideo: false,
      })),
    };
  }

  test("a fresh main-draw entry starts at R32, a qualifier at Q1", () => {
    expect(nextRound(runOf([]))).toBe("R32");
    expect(nextRound(runOf([], "Main draw"))).toBe("R32");
    expect(nextRound(runOf([], "Qualifying"))).toBe("Q1");
  });

  test("a fresh prequalifying entry starts at PQ1", () => {
    // Tested before "qualif", which the word also contains.
    expect(nextRound(runOf([], "Prequalifying"))).toBe("PQ1");
    // Free text: an older spelling still reads as its draw.
    expect(nextRound(runOf([], "prequal"))).toBe("PQ1");
    expect(nextRound(runOf([], "Flight B"))).toBe("R32");
  });

  test("the round after the last one recorded", () => {
    expect(nextRound(runOf(["R32", "R16"]))).toBe("QF");
    expect(nextRound(runOf(["Q1", "Q2"]))).toBe("Q3");
  });
});

test.describe("nextRoundAfter", () => {
  const run = (rounds: string[], draw: string | null = null) =>
    entry(
      rounds.map((round, index) => match(`m-${index}`, round, "us")),
      draw,
    );

  test("a win moves one step up the same draw", () => {
    expect(nextRoundAfter(run(["R32"]), "R32", true)).toBe("R16");
    expect(nextRoundAfter(run(["QF"]), "QF", true)).toBe("SF");
    expect(nextRoundAfter(run(["Q1"]), "Q1", true)).toBe("Q2");
    expect(nextRoundAfter(run(["C1"]), "C1", true)).toBe("C2");
    // Codes are read case-blind, like `roundRank`.
    expect(nextRoundAfter(run(["r32"]), "r32", true)).toBe("R16");
  });

  test("the step is read off ROUND_ORDER, never a list of its own", () => {
    for (const [index, round] of ROUND_ORDER.entries()) {
      const next = ROUND_ORDER[index + 1];
      if (round === "F" || !next || drawOfRound(next) !== drawOfRound(round)) {
        continue;
      }
      expect(nextRoundAfter(run([round]), round, true)).toBe(next);
    }
  });

  test("nothing follows a won final", () => {
    expect(nextRoundAfter(run(["SF", "F"]), "F", true)).toBeNull();
  });

  test("the last qualifying round won leads into the main draw", () => {
    // Nothing held in the main draw: its usual start, as `nextRound` opens it.
    expect(
      nextRoundAfter(run(["Q1", "Q2", "Q3"], "Qualifying"), "Q3", true),
    ).toBe("R32");
    // A main-draw round already held: the first one after it.
    expect(nextRoundAfter(run(["Q3", "R32"], "Qualifying"), "Q3", true)).toBe(
      "R16",
    );
  });

  test("the last consolation round and an unknown round lead nowhere", () => {
    expect(nextRoundAfter(run(["C3"]), "C3", true)).toBe("C4");
    expect(nextRoundAfter(run(["C5"]), "C5", true)).toBeNull();
    expect(nextRoundAfter(run(["Final 4"]), "Final 4", true)).toBeNull();
  });

  test("prequalifying and its consolation step within their own draw only", () => {
    expect(nextRoundAfter(run(["PQ1"]), "PQ1", true)).toBe("PQ2");
    expect(nextRoundAfter(run(["PC3"]), "PC3", true)).toBe("PC4");
    // Where a prequalifier goes after their last round is T11's question.
    expect(nextRoundAfter(run(["PQ4"]), "PQ4", true)).toBeNull();
    expect(nextRoundAfter(run(["PC4"]), "PC4", true)).toBeNull();
  });

  test("a loss answers what nextRound always has (until T11)", () => {
    for (const rounds of [["R32"], ["R32", "R16"], ["Q1", "Q2"], ["F"]]) {
      const entryRun = run(rounds);
      expect(nextRoundAfter(entryRun, rounds.at(-1)!, false)).toBe(
        nextRound(entryRun),
      );
    }
  });
});

test.describe("compareTournamentRows", () => {
  const row = (round: string | null, date: string | null) => ({
    round,
    match: date === null ? null : { date },
  });
  const order = (rows: ReturnType<typeof row>[]) =>
    [...rows].sort(compareTournamentRows).map((r) => r.round);

  test("a later day sorts after an earlier one, whatever the round", () => {
    const r32 = row("R32", "2026-09-11T12:00:00+00:00");
    const r16 = row("R16", "2026-09-12T12:00:00+00:00");
    expect(order([r16, r32])).toEqual(["R32", "R16"]);
    expect(compareTournamentRows(r16, r32)).toBeGreaterThan(0);
  });

  test("the same day orders by roundRank, not by the time saved", () => {
    const r32 = row("R32", "2026-09-11T09:00:00+00:00");
    const q2 = row("Q2", "2026-09-11T18:00:00+00:00");
    expect(order([r32, q2])).toEqual(["Q2", "R32"]);
  });

  test("undated rows follow every dated row, by roundRank among themselves", () => {
    const r16 = row("R16", "2026-09-12T12:00:00+00:00");
    const qf = row("QF", null);
    const q1 = row("Q1", null);
    expect(order([qf, r16, q1])).toEqual(["R16", "Q1", "QF"]);
    expect(compareTournamentRows(qf, r16)).toBeGreaterThan(0);
    expect(compareTournamentRows(q1, qf)).toBeLessThan(0);
  });

  test("a match with a null date counts as undated", () => {
    const undated = { round: "Q1", match: { date: null } };
    const dated = row("F", "2026-09-13T12:00:00+00:00");
    expect(compareTournamentRows(undated, dated)).toBeGreaterThan(0);
  });
});
