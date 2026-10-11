import { expect, test } from "@playwright/test";
import {
  flagGroups,
  stepFlag,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";

const points = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const flag = (
  pointId: string,
  code: OpenFlag["code"],
  pointNumber = points.findIndex((p) => p.id === pointId) + 1,
): OpenFlag => ({ pointId, pointNumber, code });

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
  const groups = flagGroups([flag("a", "winner_to_error_by_bounce")]);
  expect(groups.map((g) => g.name)).toEqual(["Other"]);
  expect(groups[0].rows[0].label).toBe("Winner or error?");
});
