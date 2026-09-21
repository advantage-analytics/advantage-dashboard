import { expect, test } from "@playwright/test";

import {
  OPP,
  OUT,
  TRAIL,
  YOU,
  matchMarks,
  pointMarks,
  readoutPlacement,
  toCourtPercent,
  youAreAtLowEnd,
  type CourtMark,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import type { MatchShot } from "@/lib/data/match-points-server";

import { pt } from "./fixtures/film-point";

const LENGTH = 23.77;
const NET = 11.885;

type Pair = [number, number] | null;

/** `contact` / `landing` are [x, y] in the DB frame: metres, y 0 → 23.77. */
const shot = (
  id: string,
  isPlayer1: boolean,
  contact: Pair,
  landing: Pair,
  result: string | null = "In",
): MatchShot => ({
  id,
  shotNumber: 1,
  isPlayer1,
  shotType: "Forehand",
  spinType: "topspin",
  speedMph: 70,
  zone: null,
  result,
  videoTime: null,
  contactX: contact?.[0] ?? null,
  contactY: contact?.[1] ?? null,
  landingX: landing?.[0] ?? null,
  landingY: landing?.[1] ?? null,
});

/** The same rally after an end change: the world frame rotated 180°. */
const mirrored = (shots: MatchShot[]): MatchShot[] =>
  shots.map((s) => ({
    ...s,
    contactX: s.contactX == null ? null : -s.contactX,
    contactY: s.contactY == null ? null : LENGTH - s.contactY,
    landingX: s.landingX == null ? null : -s.landingX,
    landingY: s.landingY == null ? null : LENGTH - s.landingY,
  }));

/** You are player 1, at the y = 0 end. Opponent serves; you hit the last ball long. */
const RALLY: MatchShot[] = [
  shot("s1", false, [0.4, 24.3], [-1.2, 7.1]),
  shot("s2", true, [-2.6, -0.8], [1.5, 18.9]),
  shot("s3", false, [2.1, 22.0], [2.9, 5.2]),
  shot("s4", true, [3.3, -1.1], [-2.8, 20.4]),
  shot("s5", true, [-3.0, 0.6], [0.3, 24.2], "Out"),
];

/**
 * Everything a mark DRAWS, with the shot it carries reduced to its id.
 *
 * A mark also hands `FilmCourt` the shot itself, so the readout can print its
 * stroke, speed, placement and result — and an end change rewrites that shot's
 * coordinates, which the readout never prints. Comparing the drawn mark plus
 * the shot's identity is therefore the whole claim: same dots, same colours,
 * same trail, same shots behind them, whichever end you were standing at.
 */
const drawn = (marks: readonly CourtMark[]) =>
  marks.map(({ shot, ...rest }) => ({ ...rest, shot: shot.id }));

const bounceOf = (marks: ReturnType<typeof pointMarks>, id: string) =>
  marks.find((m) => m.shotId === id && m.kind === "bounce");
const contactOf = (marks: ReturnType<typeof pointMarks>, id: string) =>
  marks.find((m) => m.shotId === id && m.kind === "contact");

test("the chart literals are the frame's", () => {
  expect(YOU).toBe("#60A5FA");
  expect(OPP).toBe("#94A3B8");
  expect(OUT).toBe("#FF6478");
  expect([...TRAIL]).toEqual([1, 0.5, 0.22]);
});

test("the DB frame lands on the C2 court box's lines", () => {
  // Singles sidelines.
  expect(toCourtPercent(4.115, NET, true).x).toBeCloseTo(83, 1);
  expect(toCourtPercent(-4.115, NET, true).x).toBeCloseTo(17, 1);
  expect(Math.abs(toCourtPercent(4.115, NET, true).x - 83)).toBeLessThan(0.1);
  expect(Math.abs(toCourtPercent(-4.115, NET, true).x - 17)).toBeLessThan(0.1);
  // The net.
  expect(toCourtPercent(0, NET, true).y).toBe(50);
  expect(toCourtPercent(0, NET, false).y).toBe(50);
  // Service lines, 6.40 m either side of the net.
  expect(Math.abs(toCourtPercent(0, NET + 6.4, true).y - 24.7)).toBeLessThan(
    0.1,
  );
  expect(Math.abs(toCourtPercent(0, NET - 6.4, true).y - 75.3)).toBeLessThan(
    0.1,
  );
  // Doubles sidelines and your own baseline.
  expect(toCourtPercent(5.485, 0, true)).toEqual({ x: 94, y: 97 });
});

test("a landing on the far baseline centre is { x: 50, y: 3 }", () => {
  const marks = pointMarks([shot("a", true, [0, 0], [0, LENGTH])], {
    youIsPlayer1: true,
    activeShot: 1,
  });
  const bounce = bounceOf(marks, "a")!;
  expect({ x: bounce.x, y: bounce.y }).toEqual({ x: 50, y: 3 });
  // …and you struck it from the bottom.
  expect(contactOf(marks, "a")).toMatchObject({ x: 50, y: 97 });
});

test("point mode draws the shots aged 0–2, a contact and a bounce each", () => {
  const marks = pointMarks(RALLY, { youIsPlayer1: true, activeShot: 4 });
  expect(marks.map((m) => [m.shotId, m.kind, m.opacity, m.live])).toEqual([
    ["s2", "contact", 0.22, false],
    ["s2", "bounce", 0.22, false],
    ["s3", "contact", 0.5, false],
    ["s3", "bounce", 0.5, false],
    ["s4", "contact", 1, false],
    ["s4", "bounce", 1, true],
  ]);
  expect(marks.map((m) => m.role)).toEqual([
    "you",
    "you",
    "opp",
    "opp",
    "you",
    "you",
  ]);
});

test("no active shot means no marks, and the first shot stands alone", () => {
  expect(pointMarks(RALLY, { youIsPlayer1: true, activeShot: 0 })).toEqual([]);
  const first = pointMarks(RALLY, { youIsPlayer1: true, activeShot: 1 });
  expect(first.map((m) => m.shotId)).toEqual(["s1", "s1"]);
  expect(first.every((m) => m.role === "opp")).toBe(true);
});

test("you are drawn at the bottom", () => {
  const marks = pointMarks(RALLY, { youIsPlayer1: true, activeShot: 4 });
  expect(contactOf(marks, "s4")!.y).toBeGreaterThan(50);
  expect(bounceOf(marks, "s4")!.y).toBeLessThan(50);
  expect(contactOf(marks, "s3")!.y).toBeLessThan(50);
  // The frame is right-handed from your end: +x is screen right.
  expect(contactOf(marks, "s4")!.x).toBeGreaterThan(50);

  // The same data read as the OTHER player puts that player at the bottom.
  const asP2 = pointMarks(RALLY, { youIsPlayer1: false, activeShot: 4 });
  expect(contactOf(asP2, "s3")!.y).toBeGreaterThan(50);
  expect(contactOf(asP2, "s3")!.role).toBe("you");
});

test("an end change flips the coordinates, not the picture", () => {
  for (let active = 0; active <= RALLY.length; active += 1) {
    const opts = { youIsPlayer1: true, activeShot: active };
    expect(drawn(pointMarks(mirrored(RALLY), opts))).toEqual(
      drawn(pointMarks(RALLY, opts)),
    );
  }
  const before = pt({ id: "p1", shots: RALLY });
  const after = pt({ id: "p1", shots: mirrored(RALLY) });
  expect(drawn(matchMarks([after], { youIsPlayer1: true }))).toEqual(
    drawn(matchMarks([before], { youIsPlayer1: true })),
  );
});

test("which end you are on is a vote of the point's contacts", () => {
  expect(youAreAtLowEnd(RALLY, true)).toBe(true);
  expect(youAreAtLowEnd(mirrored(RALLY), true)).toBe(false);
  expect(youAreAtLowEnd(RALLY, false)).toBe(false);
  // One stray contact across the net does not turn the court round.
  const stray = [...RALLY, shot("s6", true, [0, NET + 0.4], [0, 20])];
  expect(youAreAtLowEnd(stray, true)).toBe(true);
  // No contacts measured: a ball you hit lands on the far side.
  expect(youAreAtLowEnd([shot("l", true, null, [1, 19])], true)).toBe(true);
  // Nothing measured: no answer, and so no marks.
  const blind = [shot("n", true, null, null)];
  expect(youAreAtLowEnd(blind, true)).toBeNull();
  expect(pointMarks(blind, { youIsPlayer1: true, activeShot: 1 })).toEqual([]);
});

test("a null coordinate pair yields no mark for that pair, never one at 0,0", () => {
  const shots = [
    shot("c-only", false, [1, 23], null),
    shot("l-only", true, null, [2, 18]),
    shot(
      "half",
      true,
      [1, null as unknown as number],
      [null as unknown as number, 18],
    ),
  ];
  const marks = pointMarks(shots, { youIsPlayer1: true, activeShot: 3 });
  expect(marks.map((m) => [m.shotId, m.kind])).toEqual([
    ["c-only", "contact"],
    ["l-only", "bounce"],
  ]);
  // The live shot had no usable landing, so nothing is live.
  expect(marks.some((m) => m.live)).toBe(false);
});

test("the verdict comes from result, never from position", () => {
  // Called Out although it landed well inside the lines.
  const calledOut = [shot("o", true, [0, 0], [0.5, 18], "Out")];
  const out = pointMarks(calledOut, { youIsPlayer1: true, activeShot: 1 });
  expect(out.map((m) => m.role)).toEqual(["out", "out"]);

  // Called In although it landed a metre long: still yours, not red.
  const calledIn = [shot("i", true, [0, 0], [0, LENGTH + 1], "In")];
  const inn = pointMarks(calledIn, { youIsPlayer1: true, activeShot: 1 });
  expect(bounceOf(inn, "i")!.role).toBe("you");
});

test("a long or wide ball is clamped onto the card", () => {
  const marks = pointMarks(
    [shot("far", true, [0, -6], [9, LENGTH + 3], "Out")],
    { youIsPlayer1: true, activeShot: 1 },
  );
  expect(bounceOf(marks, "far")).toMatchObject({ x: 100, y: 0 });
  expect(contactOf(marks, "far")).toMatchObject({ x: 50, y: 100 });
});

test("a net ball sits on the hitter's side, decided by contactY", () => {
  // You, at the bottom, net a ball whose recorded landing is on the FAR side.
  const yours = [shot("n1", true, [1, 1], [0.8, NET + 2.5], "Net")];
  const a = bounceOf(
    pointMarks(yours, { youIsPlayer1: true, activeShot: 1 }),
    "n1",
  )!;
  expect(a.y).toBeGreaterThan(50);
  expect(a.y).toBeLessThan(55);
  expect(a.role).toBe("you");

  // The opponent nets one; its landing is recorded on YOUR side.
  const theirs = [
    shot("r1", true, [0, 0], [0, 20]),
    shot("n2", false, [-1, 23], [-0.5, NET - 3], "Net"),
  ];
  const b = bounceOf(
    pointMarks(theirs, { youIsPlayer1: true, activeShot: 2 }),
    "n2",
  )!;
  expect(b.y).toBeLessThan(50);
  expect(b.y).toBeGreaterThan(45);
  expect(b.role).toBe("opp");

  // An imputed landing already on the hitter's side is left where it is.
  const imputed = [shot("n3", true, [1, 1], [0.8, NET - 1.5], "Net")];
  const c = bounceOf(
    pointMarks(imputed, { youIsPlayer1: true, activeShot: 1 }),
    "n3",
  )!;
  expect(c).toMatchObject(toCourtPercent(0.8, NET - 1.5, true));

  // Same answers after an end change.
  expect(
    drawn(pointMarks(mirrored(yours), { youIsPlayer1: true, activeShot: 1 })),
  ).toEqual(drawn(pointMarks(yours, { youIsPlayer1: true, activeShot: 1 })));
});

test("match mode plots bounces only, with no trail", () => {
  const points = [
    pt({ id: "p1", shots: RALLY }),
    pt({ id: "p2", shots: mirrored(RALLY.slice(0, 2)) }),
    pt({ id: "p3" }),
  ];
  const marks = matchMarks(points, { youIsPlayer1: true });
  expect(marks).toHaveLength(7);
  expect(marks.every((m) => m.kind === "bounce")).toBe(true);
  expect(marks.every((m) => m.opacity === 1 && !m.live)).toBe(true);
  expect(marks.map((m) => m.pointId)).toEqual([
    "p1",
    "p1",
    "p1",
    "p1",
    "p1",
    "p2",
    "p2",
  ]);
  expect(marks.map((m) => m.role)).toEqual([
    "opp",
    "you",
    "opp",
    "you",
    "out",
    "opp",
    "you",
  ]);
  // Your balls land in the top half whichever end you were on.
  expect(marks.filter((m) => m.role === "you").every((m) => m.y < 50)).toBe(
    true,
  );
});

test("a mark carries the shot its readout describes", () => {
  const marks = pointMarks(RALLY, { youIsPlayer1: true, activeShot: 4 });
  const live = bounceOf(marks, "s4")!;
  expect(live.shot).toBe(RALLY[3]);
  expect(live.order).toBe(4);
  expect(live.rallyShots).toBe(RALLY.length);
  // The verdict can read "out" for either player, so the hitter is its own
  // field: the readout still has to name whoever struck it.
  expect(live.hitter).toBe("you");
  const outMark = bounceOf(
    pointMarks(RALLY, { youIsPlayer1: true, activeShot: 5 }),
    "s5",
  )!;
  expect([outMark.role, outMark.hitter]).toEqual(["out", "you"]);
  expect(
    matchMarks([pt({ id: "p1", shots: RALLY })], { youIsPlayer1: true })[0],
  ).toMatchObject({ order: 1, rallyShots: 5, hitter: "opp" });
});

test("the readout hangs opposite the mark and stays in frame", () => {
  // A mark on the left is read on the right, and one on the right on the left.
  expect(readoutPlacement(17, 50).side).toBe("right");
  expect(readoutPlacement(83, 50).side).toBe("left");
  // The centre line reads right, so a serve down the T does not flip sides.
  expect(readoutPlacement(50, 50).side).toBe("right");
  // It rides a little above the mark…
  expect(readoutPlacement(17, 50).top).toBe(38);
  // …and is clamped at both ends so three lines always fit on the card.
  expect(readoutPlacement(17, 3).top).toBe(0);
  expect(readoutPlacement(83, 97).top).toBe(70);
});
