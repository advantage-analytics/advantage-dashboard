import { expect, test } from "@playwright/test";
import {
  flagGroups,
  flagStepOrigin,
  flagStopLabel,
  openFlags,
  scoreStop,
  stepFlag,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import { REVIEW_ITEM_QUESTION } from "@/lib/services/labels/marks-copy";
import type {
  ReviewItem,
  ReviewItemId,
} from "@/lib/services/labels/marks-state";
import type { LabelPointStatus } from "@/lib/services/labels/session";
import type { LabelScoreMismatch } from "@/lib/services/labels/set-scores";
import { labelPoint } from "./fixtures/label-session";

const points = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

/** An open item with no members: all a stop's words and grouping read. */
const item = (id: ReviewItemId): ReviewItem => ({
  id,
  question: REVIEW_ITEM_QUESTION[id],
  tone: "score",
  state: "open",
  members: [],
});

const flag = (
  pointId: string,
  ids: ReviewItemId[],
  pointNumber = points.findIndex((p) => p.id === pointId) + 1,
): OpenFlag => ({ pointId, pointNumber, data: false, items: ids.map(item) });

const flags = [flag("b", [1, 4]), flag("d", [6])];

test("forward: the first flagged point after the current one, wrapping", () => {
  expect(stepFlag(flags, points, "a", 1)?.pointId).toBe("b");
  // The current point's own flag is not "next".
  expect(stepFlag(flags, points, "b", 1)?.pointId).toBe("d");
  expect(stepFlag(flags, points, "d", 1)?.pointId).toBe("b");
  expect(stepFlag(flags, points, "e", 1)?.pointId).toBe("b");
  // From nowhere: the top.
  expect(stepFlag(flags, points, null, 1)?.pointId).toBe("b");
});

test("back: the last flagged point before the current one, wrapping", () => {
  expect(stepFlag(flags, points, "e", -1)?.pointId).toBe("d");
  expect(stepFlag(flags, points, "d", -1)?.pointId).toBe("b");
  expect(stepFlag(flags, points, "b", -1)?.pointId).toBe("d");
  expect(stepFlag(flags, points, null, -1)?.pointId).toBe("d");
});

test("a jump names the point's first open question; nothing open, nowhere to go", () => {
  const next = stepFlag(flags, points, "a", 1);
  expect(next && flagStopLabel(next)).toBe("Missing shot?");
  expect(stepFlag([], points, "a", 1)).toBeNull();
});

test("groups are the six items in order, each point once, counted in points", () => {
  const groups = flagGroups([
    ...flags,
    flag("c", [4, 5]),
    flag("e", [2, 3, 6]),
  ]);
  expect(groups.map((g) => [g.name, g.count])).toEqual([
    ["Missing shot?", 1],
    ["Extra shots / two points in one?", 1],
    ["Serves", 1],
    ["How did the last ball end?", 2],
    ["Who won?", 1],
    ["Game & serve order", 2],
  ]);
  // One row per item, keyed by its id, so the lists keep their rows.
  expect(groups[3].rows).toEqual([
    {
      code: "4",
      label: "How did the last ball end?",
      points: [
        { pointId: "b", pointNumber: 2 },
        { pointId: "c", pointNumber: 3 },
      ],
    },
  ]);
  // Only the items something is open on.
  expect(flagGroups([flag("a", [5])]).map((g) => g.name)).toEqual(["Who won?"]);
  expect(flagGroups([])).toEqual([]);
});

test.describe("openFlags", () => {
  const mark = (code: LabelMarkCode): LabelMark => {
    const meta = LABEL_MARK_META[code];
    const params =
      code === "winner_disputed"
        ? { scoreWinner: "p2", lastStrokeWinner: "p1" }
        : {};
    return { code, tier: meta.tier, scope: meta.scope, params } as LabelMark;
  };
  const marksOf = (byPoint: Record<string, LabelMarkCode[]>): LabelMarks => ({
    points: Object.fromEntries(
      Object.entries(byPoint).map(([id, codes]) => [id, codes.map(mark)]),
    ),
    shots: {},
    suggestions: [],
    serveSides: {},
  });

  test("a point carrying three open count marks is one flag, its items in id order", () => {
    const rows = [labelPoint("x", 0), labelPoint("y", 1)];
    const open = openFlags(
      rows,
      marksOf({ x: ["pick_winner", "winner_disputed", "reserve_after_in"] }),
    );
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      pointId: "x",
      pointNumber: 1,
      data: false,
    });
    expect(open[0].items.map((i) => i.id)).toEqual([2, 4, 5]);
  });

  test("a demoted point has none; a grey one kept is data", () => {
    const rows = [labelPoint("x", 0), labelPoint("y", 1)];
    expect(openFlags(rows, marksOf({ x: ["ending_suspect_line"] }))).toEqual(
      [],
    );
    const grey = openFlags(rows, marksOf({ y: ["winner_to_error_by_bounce"] }));
    expect(grey).toHaveLength(1);
    expect(grey[0]).toMatchObject({ pointId: "y", pointNumber: 2, data: true });
  });

  test("a deleted point has none", () => {
    const rows = [labelPoint("x", 0, { status: "deleted" })];
    expect(openFlags(rows, marksOf({ x: ["pick_winner"] }))).toEqual([]);
  });
});

test.describe("the score stop", () => {
  const rows = points.map((p, i) => ({
    ...p,
    pointIndex: i,
    status: i === 4 ? ("deleted" as const) : ("unchanged" as const),
  }));
  const mismatch: LabelScoreMismatch = {
    setNumber: 1,
    labelled: "5–5",
    entered: "6–4",
    firstPointId: "a",
    lastPointId: "c",
    reasons: [],
  };

  test("sits on the set's last point, or the last live point when the rows never reach the set", () => {
    expect(scoreStop(mismatch, rows)).toEqual({
      pointId: "c",
      pointNumber: 3,
      label: "Set 1 ends 5–5, record 6–4",
    });
    const unreached = { ...mismatch, firstPointId: null, lastPointId: null };
    expect(scoreStop(unreached, rows)?.pointId).toBe("d");
    expect(scoreStop(null, rows)).toBeNull();
  });

  test("appended after the marks, it is stepped in rail order and named in its own words", () => {
    const stop = scoreStop(mismatch, rows)!;
    const stops = [...flags, stop];
    expect(stepFlag(stops, points, "b", 1)?.pointId).toBe("c");
    expect(stepFlag(stops, points, "c", 1)?.pointId).toBe("d");
    expect(stepFlag(stops, points, "d", -1)?.pointId).toBe("c");
    expect(flagStopLabel(stop)).toBe("Set 1 ends 5–5, record 6–4");
    expect(flagStopLabel(flags[0])).toBe("Missing shot?");
  });
});

test.describe("flagStepOrigin", () => {
  const live = points.map((p) => ({
    ...p,
    status: "unchanged" as LabelPointStatus,
  }));
  const flags = [flag("b", [1]), flag("d", [6])];

  test("steps on from the last flag landed on while the film plays past it", () => {
    // Landed on b; the film played on into e. ] goes to d, not round to b.
    const from = flagStepOrigin("b", "e", live);
    expect(from).toBe("b");
    expect(stepFlag(flags, live, from, 1)?.pointId).toBe("d");
    // From where the film is, the same key would have wrapped to b.
    expect(stepFlag(flags, live, "e", 1)?.pointId).toBe("b");
    // [ from d, the film now on a: back to b.
    expect(stepFlag(flags, live, flagStepOrigin("d", "a", live), -1)).toEqual(
      flags[0],
    );
  });

  test("falls back to the current point with none, or when its point is gone", () => {
    expect(flagStepOrigin(null, "c", live)).toBe("c");
    expect(flagStepOrigin(null, null, live)).toBeNull();
    const gone = live.map((p) =>
      p.id === "b" ? { ...p, status: "deleted" as const } : p,
    );
    expect(flagStepOrigin("b", "c", gone)).toBe("c");
    expect(flagStepOrigin("zz", "c", live)).toBe("c");
  });
});
