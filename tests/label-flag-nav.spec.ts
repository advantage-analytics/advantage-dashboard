import { expect, test } from "@playwright/test";
import {
  flagGroups,
  flagStopLabel,
  scoreStop,
  stepFlag,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";
import type { LabelScoreMismatch } from "@/lib/services/labels/set-scores";

const points = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const flag = (
  pointId: string,
  code: OpenFlag["code"],
  pointNumber = points.findIndex((p) => p.id === pointId) + 1,
): OpenFlag => ({ pointId, pointNumber, code, data: false });

const flags = [
  flag("b", "winner_disputed"),
  flag("b", "same_player_consecutive"),
  flag("d", "service_court_repeat"),
];

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

test("a jump names the point's first open flag; nothing open, nowhere to go", () => {
  expect(stepFlag(flags, points, "a", 1)?.code).toBe("winner_disputed");
  expect(stepFlag([], points, "a", 1)).toBeNull();
});

test("groups are the four kinds in order, each point once per row", () => {
  const groups = flagGroups([
    ...flags,
    flag("c", "winner_disputed"),
    flag("c", "winner_disputed"),
    flag("e", "score_side_mismatch"),
  ]);
  expect(groups.map((g) => [g.name, g.count])).toEqual([
    ["Ending", 3],
    ["Missing shot", 1],
    ["Serve", 1],
    ["Score", 1],
  ]);
  expect(groups[0].rows).toEqual([
    {
      code: "winner_disputed",
      label: "Check the ending",
      points: [
        { pointId: "b", pointNumber: 2 },
        { pointId: "c", pointNumber: 3 },
      ],
    },
  ]);
});

test("a counted mark no kind names is listed under Other", () => {
  const groups = flagGroups([flag("a", "phantom_strokes_dropped")]);
  expect(groups.map((g) => g.name)).toEqual(["Other"]);
  expect(groups[0].rows).toHaveLength(1);
  // A grey one has its kind: how the point ended.
  expect(
    flagGroups([flag("a", "winner_to_error_by_bounce")]).map((g) => g.name),
  ).toEqual(["Ending"]);
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
    expect(flagStopLabel(flags[0])).toBe("Check the ending");
  });
});
