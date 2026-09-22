import { expect, test } from "@playwright/test";

import {
  MARK_OPACITY_STEP,
  OPP,
  OUT,
  YOU,
  estimatedBounceTime,
  markOpacity,
  matchMarks,
  pointMarks,
  readoutPlacement,
  toCourtPercent,
  youAreAtLowEnd,
  type CourtMark,
  type TimedShot,
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

/**
 * Puts a rally on the film's clock: the first contact at t = 10, one a second
 * after that. `bounces` overrides a shot's landing time by id; without one the
 * landing is `estimatedBounceTime`, so the five-shot `RALLY` below lands at
 * 10.6, 11.6, 12.6, 13.6 and — having no next contact — 14.75.
 */
const timed = (
  shots: readonly MatchShot[],
  bounces: Record<string, number> = {},
): TimedShot[] =>
  shots.map((s, i) => ({
    shot: s,
    contactTime: 10 + i,
    ...(s.id in bounces ? { bounceTime: bounces[s.id] } : {}),
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
 * same fade, same shots behind them, whichever end you were standing at.
 */
const drawn = (marks: readonly CourtMark[]) =>
  marks.map(({ shot, ...rest }) => ({ ...rest, shot: shot.id }));

const bounceOf = (marks: ReturnType<typeof pointMarks>, id: string) =>
  marks.find((m) => m.shotId === id && m.kind === "bounce");
const contactOf = (marks: ReturnType<typeof pointMarks>, id: string) =>
  marks.find((m) => m.shotId === id && m.kind === "contact");

/** Shorthand: the whole rally, read at one moment of film time. */
const at = (
  filmTime: number,
  shots: readonly MatchShot[] = RALLY,
  bounces: Record<string, number> = {},
) =>
  pointMarks(timed(shots, bounces), {
    youIsPlayer1: true,
    filmTime,
  });

test("the chart literals are the frame's", () => {
  expect(YOU).toBe("#60A5FA");
  expect(OPP).toBe("#94A3B8");
  expect(OUT).toBe("#FF6478");
});

test("a mark holds two seconds at full, fades over three, and is gone at five", () => {
  expect(markOpacity(10, 10)).toBe(1);
  expect(markOpacity(12, 10)).toBe(1);
  expect(markOpacity(13.5, 10)).toBe(0.5);
  expect(markOpacity(14.25, 10)).toBe(0.25);
  expect(markOpacity(15, 10)).toBe(0);
  expect(markOpacity(20, 10)).toBe(0);
});

test("the moment is admitted a seek's epsilon early, and never before that", () => {
  // Clicking a shot lands the playhead a hair before its contact.
  expect(markOpacity(9.95, 10)).toBe(1);
  expect(markOpacity(9.89, 10)).toBe(0);
});

test("every opacity is a multiple of the step, so a ticking playhead is still", () => {
  const steps = Math.round(1 / MARK_OPACITY_STEP);
  expect(steps).toBe(20);
  for (let t = 9; t <= 16.0001; t += 0.01) {
    const value = markOpacity(t, 10);
    expect(Math.abs(value * steps - Math.round(value * steps))).toBeLessThan(
      1e-9,
    );
  }
});

test("a bounce is estimated 0.6 of the way to the next contact, or 0.75s after the last", () => {
  expect(estimatedBounceTime(10, 11)).toBe(10.6);
  expect(estimatedBounceTime(10, null)).toBe(10.75);
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
  const marks = at(11, [shot("a", true, [0, 0], [0, LENGTH])]);
  const bounce = bounceOf(marks, "a")!;
  expect({ x: bounce.x, y: bounce.y }).toEqual({ x: 50, y: 3 });
  // …and you struck it from the bottom.
  expect(contactOf(marks, "a")).toMatchObject({ x: 50, y: 97 });
});

test("the court draws the moment, not the shot count", () => {
  // 12.3 s: s3 has just been struck but its ball is still in the air (12.6),
  // and s1's contact — 2.3 s old — has begun to fade.
  const marks = at(12.3);
  expect(marks.map((m) => [m.shotId, m.kind, m.opacity, m.live])).toEqual([
    ["s1", "contact", 0.9, false],
    ["s1", "bounce", 1, false],
    ["s2", "contact", 1, false],
    ["s2", "bounce", 1, true],
    ["s3", "contact", 1, false],
  ]);
  expect(marks.map((m) => m.role)).toEqual(["opp", "opp", "you", "you", "opp"]);

  // 0.3 s later the ball has landed: its bounce is drawn, and takes the ring.
  const landed = at(12.6);
  expect(bounceOf(landed, "s3")).toMatchObject({ opacity: 1, live: true });
  expect(landed.filter((m) => m.live)).toHaveLength(1);
});

test("a measured landing time beats the estimate, in both directions", () => {
  // s3's ball is known to have landed at 12.2, before the 12.6 estimate.
  const early = at(12.3, RALLY, { s3: 12.2 });
  expect(bounceOf(early, "s3")).toMatchObject({ opacity: 1, live: true });

  // A landing recorded BEFORE its own contact is nonsense: the estimate stands,
  // so the bounce is still in the air at 12.3.
  const nonsense = at(12.3, RALLY, { s3: 11.5 });
  expect(bounceOf(nonsense, "s3")).toBeUndefined();
  expect(drawn(nonsense)).toEqual(drawn(at(12.3)));
});

test("a mark is gone five seconds after its moment, and never drawn early", () => {
  // s1's contact happened at 10.
  expect(contactOf(at(15), "s1")).toBeUndefined();
  // Before the first contact there is nothing to draw at all.
  expect(at(9.5)).toEqual([]);
  // Opacity is a pure function of film time, so seeking back to 12.3 from the
  // end of the rally draws exactly what playing to 12.3 drew.
  const first = drawn(at(12.3));
  at(16);
  expect(drawn(at(12.3))).toEqual(first);
});

test("a faded-out mark is omitted, never returned at 0", () => {
  for (const t of [9.5, 10.7, 12.3, 13.5, 15, 16, 25]) {
    expect(at(t).every((m) => m.opacity > 0)).toBe(true);
  }
});

test("the ring is on the most recent bounce on show, and on nothing else", () => {
  for (const t of [9.5, 10.7, 12.3, 12.6, 13.5, 15, 16, 25]) {
    const marks = at(t);
    const live = marks.filter((m) => m.live);
    const bounces = marks.filter((m) => m.kind === "bounce");
    expect(live).toHaveLength(bounces.length === 0 ? 0 : 1);
    if (live.length) expect(live[0].kind).toBe("bounce");
  }
  // Before anything has landed, a struck ball rings nothing.
  const struck = at(10.4);
  expect(struck.map((m) => [m.shotId, m.kind])).toEqual([["s1", "contact"]]);
  expect(struck.some((m) => m.live)).toBe(false);
});

test("the first shot stands alone until the second is struck", () => {
  const first = at(10.7);
  expect(first.map((m) => m.shotId)).toEqual(["s1", "s1"]);
  expect(first.every((m) => m.role === "opp")).toBe(true);
});

test("you are drawn at the bottom", () => {
  const marks = at(13.5);
  expect(contactOf(marks, "s4")!.y).toBeGreaterThan(50);
  expect(bounceOf(marks, "s4")!.y).toBeLessThan(50);
  expect(contactOf(marks, "s3")!.y).toBeLessThan(50);
  // The frame is right-handed from your end: +x is screen right.
  expect(contactOf(marks, "s4")!.x).toBeGreaterThan(50);

  // The same data read as the OTHER player puts that player at the bottom.
  const asP2 = pointMarks(timed(RALLY), {
    youIsPlayer1: false,
    filmTime: 13.5,
  });
  expect(contactOf(asP2, "s3")!.y).toBeGreaterThan(50);
  expect(contactOf(asP2, "s3")!.role).toBe("you");
});

test("an end change flips the coordinates, not the picture", () => {
  for (const t of [9.5, 10.7, 12.3, 13.5, 15, 16]) {
    expect(drawn(at(t, mirrored(RALLY)))).toEqual(drawn(at(t)));
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
  expect(at(11, blind)).toEqual([]);
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
  const marks = at(12.3, shots);
  expect(marks.map((m) => [m.shotId, m.kind])).toEqual([
    ["c-only", "contact"],
    ["l-only", "bounce"],
  ]);
  // A shot with no usable landing has no bounce mark, so it can never be the
  // ring: the only bounce on show carries it.
  expect(marks.filter((m) => m.live).map((m) => m.shotId)).toEqual(["l-only"]);
});

test("the verdict comes from result, never from position", () => {
  // Called Out although it landed well inside the lines.
  const out = at(11, [shot("o", true, [0, 0], [0.5, 18], "Out")]);
  expect(out.map((m) => m.role)).toEqual(["out", "out"]);

  // Called In although it landed a metre long: still yours, not red.
  const inn = at(11, [shot("i", true, [0, 0], [0, LENGTH + 1], "In")]);
  expect(bounceOf(inn, "i")!.role).toBe("you");
});

test("a long or wide ball is clamped onto the card", () => {
  const marks = at(11, [shot("far", true, [0, -6], [9, LENGTH + 3], "Out")]);
  expect(bounceOf(marks, "far")).toMatchObject({ x: 100, y: 0 });
  expect(contactOf(marks, "far")).toMatchObject({ x: 50, y: 100 });
});

test("a net ball sits on the hitter's side, decided by contactY", () => {
  // You, at the bottom, net a ball whose recorded landing is on the FAR side.
  const yours = [shot("n1", true, [1, 1], [0.8, NET + 2.5], "Net")];
  const a = bounceOf(at(11, yours), "n1")!;
  expect(a.y).toBeGreaterThan(50);
  expect(a.y).toBeLessThan(55);
  expect(a.role).toBe("you");

  // The opponent nets one; its landing is recorded on YOUR side.
  const theirs = [
    shot("r1", true, [0, 0], [0, 20]),
    shot("n2", false, [-1, 23], [-0.5, NET - 3], "Net"),
  ];
  const b = bounceOf(at(12, theirs), "n2")!;
  expect(b.y).toBeLessThan(50);
  expect(b.y).toBeGreaterThan(45);
  expect(b.role).toBe("opp");

  // An imputed landing already on the hitter's side is left where it is.
  const imputed = [shot("n3", true, [1, 1], [0.8, NET - 1.5], "Net")];
  const c = bounceOf(at(11, imputed), "n3")!;
  expect(c).toMatchObject(toCourtPercent(0.8, NET - 1.5, true));

  // Same answers after an end change.
  expect(drawn(at(11, mirrored(yours)))).toEqual(drawn(at(11, yours)));
});

test("match mode plots bounces only, with no fade", () => {
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
  const live = bounceOf(at(13.5), "s4")!;
  expect(live.shot).toBe(RALLY[3]);
  expect(live.order).toBe(4);
  expect(live.rallyShots).toBe(RALLY.length);
  // The verdict can read "out" for either player, so the hitter is its own
  // field: the readout still has to name whoever struck it.
  expect(live.hitter).toBe("you");
  const outMark = bounceOf(at(14.8), "s5")!;
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

test("the camera view draws the frame as the film shows it, whoever is at which end", () => {
  // You are player 1 and you are at the FAR end (high y) — the top of the film.
  const farEnd = mirrored(RALLY);
  const camera = pointMarks(timed(farEnd), {
    youIsPlayer1: true,
    filmTime: 12,
    view: "camera",
  });
  const yourContact = contactOf(camera, "s2")!;
  // Struck behind the far baseline: drawn at the top, not rotated to the bottom.
  expect(yourContact.y).toBeLessThan(10);
  expect(yourContact).toMatchObject(toCourtPercent(2.6, LENGTH + 0.8, true));
  // …and its ball lands in the near half, at the bottom.
  expect(bounceOf(camera, "s2")!.y).toBeGreaterThan(50);

  // The other view still turns the same point so you are at the bottom.
  expect(contactOf(at(12, farEnd), "s2")!.y).toBeGreaterThan(90);
});
