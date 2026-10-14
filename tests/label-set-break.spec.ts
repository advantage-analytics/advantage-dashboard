import { expect, test } from "@playwright/test";
import {
  setBreakLabel,
  setBreakSuspects,
  setBreakWarning,
} from "@/lib/services/labels/set-break";
import { isWithdrawnPointAdd } from "@/lib/services/labels/session";

/**
 * The set break the clock shows (set-break.ts). The fixture is the match the
 * rule was written on: a 6–0 second set entered as 6–4, so the vendor filed
 * the third set's first four games under set 2.
 */
type Row = {
  id: string;
  pointIndex: number;
  status: "unchanged" | "deleted";
  setNumber: number;
  gameNumber: number;
  shots: { status: "kept" | "deleted"; videoTime: number | null }[];
};

/** One point per game: the game starts `gap` seconds after the last ended. */
function match(games: { set: number; gap: number }[]): Row[] {
  let clock = 0;
  return games.map((game, i) => {
    clock += game.gap;
    const start = clock;
    clock += 200;
    return {
      id: `p${i + 1}`,
      pointIndex: i,
      status: "unchanged",
      setNumber: game.set,
      gameNumber: i + 1,
      shots: [
        { status: "kept", videoTime: start },
        { status: "kept", videoTime: clock },
      ],
    };
  });
}

/** A set's sit-down rhythm: a long gap before every even game of the set. */
const rhythm = (set: number, games: number, first: number) =>
  Array.from({ length: games }, (_, i) => ({
    set,
    gap: i === 0 ? first : i % 2 === 1 ? 40 : 128,
  }));

test("a set-break-long gap six games into a set, with the same set after it", () => {
  // Set 1: ten games. "Set 2": six games, a 285 s break, then four more.
  const rows = match([
    ...rhythm(1, 10, 0),
    ...rhythm(2, 6, 288),
    ...rhythm(2, 4, 285),
  ]);
  const suspects = setBreakSuspects(rows);
  expect(suspects).toEqual([
    { pointId: "p17", pointNumber: 17, setNumber: 2, gamesBefore: 6, gap: 285 },
  ]);
  expect(setBreakLabel(suspects[0])).toBe(
    "Set break here? 4:45 gap after 6 games of set 2",
  );
  expect(setBreakWarning(suspects[0])).toBe(
    "A 4:45 break before point 17 looks like the end of set 2, but the games after it are still in that set",
  );
});

test("moved to the next set, the stop is gone; the real set breaks never were one", () => {
  const rows = match([
    ...rhythm(1, 10, 0),
    ...rhythm(2, 6, 288),
    ...rhythm(3, 4, 285),
  ]);
  expect(setBreakSuspects(rows)).toEqual([]);
});

test("an ordinary changeover, and a long stop early in a set, are not set breaks", () => {
  // 128 s changeovers all match long: nothing stands out.
  expect(setBreakSuspects(match(rhythm(1, 12, 0)))).toEqual([]);
  // A five-minute stop at 1–1: too early for the set to have ended.
  const early = match(rhythm(1, 10, 0));
  early.forEach((row, i) => {
    if (i >= 2) row.shots.forEach((s) => (s.videoTime! += 300));
  });
  expect(setBreakSuspects(early)).toEqual([]);
});

test("deleted rows, deleted strokes and untimed strokes are not on the clock", () => {
  const rows = match([
    ...rhythm(1, 10, 0),
    ...rhythm(2, 6, 288),
    ...rhythm(2, 4, 285),
  ]);
  // A tombstone inside the gap, and a dead stroke: neither shortens it.
  rows.push({
    id: "gone",
    pointIndex: 99,
    status: "deleted",
    setNumber: 2,
    gameNumber: 16,
    shots: [{ status: "kept", videoTime: rows[16].shots[0].videoTime! - 5 }],
  });
  rows[15].shots.push(
    { status: "deleted", videoTime: rows[16].shots[0].videoTime! - 5 },
    { status: "kept", videoTime: null },
  );
  expect(setBreakSuspects(rows).map((s) => s.pointId)).toEqual(["p17"]);
  expect(setBreakSuspects([])).toEqual([]);
});

test("a point added and deleted before it held a stroke leaves no marker", () => {
  const added = { status: "deleted", statusBeforeDelete: "added", shots: [] };
  expect(isWithdrawnPointAdd(added as never)).toBe(true);
  // A combine's tombstone, a deleted vendor point, and an added point that
  // had strokes keep their marker.
  expect(
    isWithdrawnPointAdd({ ...added, statusBeforeDelete: "edited" } as never),
  ).toBe(false);
  expect(isWithdrawnPointAdd({ ...added, shots: [{}] } as never)).toBe(false);
  expect(isWithdrawnPointAdd({ ...added, status: "added" } as never)).toBe(
    false,
  );
});
