import { expect, test } from "@playwright/test";

import {
  pickRallyShots,
  pickReturnShot,
  pickServeShot,
} from "@/lib/data/serve-return-shots";

/**
 * `pickServeShot` picks the serve that was actually played by ROLE, not
 * position — see serve-return-shots.ts for why positional indexing
 * mislabels points. It must return `undefined` rather than falling back to
 * `shots[0]` when a point carries no serve row at all: that fallback was
 * how a truncated read (feeds-first, serve row not yet fetched) plotted a
 * `Feed` row's landing coordinates as a serve.
 */
test.describe("pickServeShot", () => {
  test("returns the Second Serve row when both serve rows exist", () => {
    const firstServe = { shot_type: "First Serve" };
    const secondServe = { shot_type: "Second Serve" };
    expect(pickServeShot([firstServe, secondServe])).toBe(secondServe);
  });

  test("returns the First Serve row when only that one exists", () => {
    const firstServe = { shot_type: "First Serve" };
    expect(pickServeShot([firstServe])).toBe(firstServe);
  });

  test("returns undefined for a shot list with no serve row", () => {
    const feed = { shot_type: "Feed" };
    expect(pickServeShot([feed])).toBeUndefined();
  });

  test("[Feed, Forehand] returns undefined", () => {
    const feed = { shot_type: "Feed" };
    const forehand = { shot_type: "Forehand" };
    expect(pickServeShot([feed, forehand])).toBeUndefined();
  });
});

/**
 * Shot 0 holds every stroke before the serve that counted. On a hand-labelled
 * point that can be a let or a fault the players played out, rally and all —
 * live shapes from Moore v Baek point 29 (an ace) and Sage v Hunter point 25.
 * None of it is the point's serve, return or rally: reading its backhand as
 * the return drew a "backhand return" on an ace.
 */
test.describe("strokes before the counted serve", () => {
  const row = (shot_number: number, shot_type: string) => ({
    shot_number,
    shot_type,
  });

  test("an ace after a played-out serve has no return and serves shot 1", () => {
    const ace = row(1, "First Serve");
    const shots = [
      row(0, "First Serve"),
      row(0, "Second Serve"),
      row(0, "Backhand"),
      row(0, "Forehand"),
      ace,
    ];
    expect(pickServeShot(shots)).toBe(ace);
    expect(pickReturnShot(shots)).toBeUndefined();
    expect(
      pickRallyShots(
        shots,
        (s) => s.shot_type,
        (s) => s.shot_number,
      ),
    ).toEqual([]);
  });

  test("a replayed point returns the counted serve's return", () => {
    const serve = row(1, "First Serve");
    const ret = row(2, "Backhand");
    const shots = [row(0, "First Serve"), row(0, "Backhand"), serve, ret];
    expect(pickServeShot(shots)).toBe(serve);
    expect(pickReturnShot(shots)).toBe(ret);
  });

  test("a faulted first serve still yields the second serve", () => {
    const second = row(1, "Second Serve");
    const ret = row(2, "Forehand");
    const shots = [row(0, "First Serve"), second, ret, row(3, "Backhand")];
    expect(pickServeShot(shots)).toBe(second);
    expect(pickReturnShot(shots)).toBe(ret);
  });

  test("a serve-less SwingVision point's shot-0 stroke is its feed", () => {
    // Live shape: no serve row, a Forehand at 0, the rally from 1
    // (rally_length 2). Shot 0 is the feed, so the return is shot 1.
    const ret = row(1, "Forehand");
    const shots = [row(0, "Forehand"), ret, row(2, "Forehand")];
    expect(pickReturnShot(shots)).toBe(ret);
  });

  test("a point numbered only 0 keeps every shot", () => {
    const forehand = row(0, "Forehand");
    expect(pickReturnShot([row(0, "Feed"), forehand])).toBe(forehand);
  });
});
