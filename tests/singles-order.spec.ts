import { expect, test } from "@playwright/test";
import {
  BENCH,
  aboveBench,
  applySinglesOrder,
  fitLineup,
  moveToken,
  type SinglesOccupant,
} from "@/lib/schedule/singles-order";
import type { LineupLine } from "@/lib/schedule/types";

function line(key: string, ours: string | null, theirs: string): LineupLine {
  return {
    key,
    slot: key,
    discipline: key.startsWith("S") ? "singles" : "doubles",
    ourIds: ours ? [ours] : [],
    ourLabels: ours ? [ours.toUpperCase()] : [],
    theirLabels: theirs ? [theirs] : [],
    noPlayer: false,
    theirNoPlayer: false,
  };
}

const occ = (id: string | null): SinglesOccupant =>
  id ? { ids: [id], labels: [id.toUpperCase()] } : { ids: [], labels: [] };

test("a new order moves our side only — opponents and doubles stay", () => {
  const lines = [
    line("S1", "a", "Opp 1"),
    line("S2", "b", "Opp 2"),
    line("S3", null, ""),
    line("D1", "a", "Pair"),
  ];
  const next = applySinglesOrder(lines, [occ("b"), occ("a")], {});
  expect(next.map((row) => row.ourIds)).toEqual([["b"], ["a"], [], ["a"]]);
  expect(next.map((row) => row.theirLabels)).toEqual([
    ["Opp 1"],
    ["Opp 2"],
    [],
    ["Pair"],
  ]);
});

test("a settled singles line refuses any reorder", () => {
  const lines = [line("S1", "a", "x"), line("S2", "b", "y")];
  const next = applySinglesOrder(lines, [occ("b"), occ("a")], {
    S2: "played",
  });
  expect(next).toEqual(lines);
});

test("a sub dropped into a full lineup bumps an empty line before a player", () => {
  const occupants = new Map([
    ["t1", occ("a")],
    ["t2", occ(null)],
    ["t3", occ("c")],
    ["sub", occ("s")],
  ]);
  expect(fitLineup(["t1", "sub", "t2", "t3"], occupants, 3)).toEqual([
    "t1",
    "sub",
    "t3",
  ]);
  expect(
    fitLineup(
      ["t1", "sub", "t3"],
      new Map([...occupants, ["t2", occ("b")]]),
      2,
    ),
  ).toEqual(["t1", "sub"]);
});

test("the keyboard crosses the bench line like any neighbour", () => {
  const sequence = ["t1", "t2", BENCH, "sub"];
  const up = moveToken(sequence, "sub", -1);
  expect(up).toEqual(["t1", "t2", "sub", BENCH]);
  expect(aboveBench(up)).toEqual(["t1", "t2", "sub"]);
  expect(moveToken(up, "t1", -1)).toEqual(up);
});

test("No player stays with its court, and a player dropped onto it clears it", () => {
  const lines = [
    line("S1", "a", "Opp 1"),
    { ...line("S2", null, ""), noPlayer: true },
    line("S3", "c", "Opp 3"),
  ];
  // S1 and S3 swap; the empty S2 court keeps its No player.
  const swapped = applySinglesOrder(lines, [occ("c"), occ(null), occ("a")], {});
  expect(swapped.map((row) => row.noPlayer)).toEqual([false, true, false]);

  // A bench player dropped onto S2 answers the court.
  const filled = applySinglesOrder(lines, [occ("a"), occ("z"), occ("c")], {});
  expect(filled[1]).toMatchObject({ ourIds: ["z"], noPlayer: false });
});

test("a sub displaces a No player court before any player", () => {
  const occupants = new Map<string, SinglesOccupant>([
    ["t1", occ("a")],
    ["t2", occ(null)],
    ["t3", occ("c")],
    ["sub", occ("z")],
  ]);
  expect(fitLineup(["t1", "sub", "t2", "t3"], occupants, 3)).toEqual([
    "t1",
    "sub",
    "t3",
  ]);
});
