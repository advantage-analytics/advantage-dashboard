import { expect, test } from "@playwright/test";

import { isDimmed } from "@/components/dashboard/matches/match-detail/differential-card";
import {
  H2H_GROUPS,
  withoutShotKindRows,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import { REPORT_OMITTED_POINT_ROWS } from "@/components/dashboard/loading/match-report-pending";

/**
 * The Differential card's hover rule (`isDimmed`): which halves of the two
 * players' bars stay lit for each target under the cursor. Pure and offline.
 *
 * - a bar half lights itself alone;
 * - a figure lights its own player's row, both halves;
 * - a legend key lights its kind for both players.
 */

const SIDES = ["you", "opp"] as const;
const HALVES = ["winners", "unforcedErrors"] as const;

/** Every half that stays lit for `hovered`, as `side-half`. */
function lit(hovered: string | null): string[] {
  return SIDES.flatMap((side) =>
    HALVES.filter((half) => !isDimmed(hovered, side, half)).map(
      (half) => `${side}-${half}`,
    ),
  );
}

test.describe("Differential hover", () => {
  test("nothing hovered: nothing fades", () => {
    expect(lit(null)).toEqual([
      "you-winners",
      "you-unforcedErrors",
      "opp-winners",
      "opp-unforcedErrors",
    ]);
  });

  test("a bar half lights itself alone", () => {
    expect(lit("you-winners")).toEqual(["you-winners"]);
    expect(lit("opp-unforcedErrors")).toEqual(["opp-unforcedErrors"]);
  });

  test("a figure lights its own row", () => {
    expect(lit("fig-you")).toEqual(["you-winners", "you-unforcedErrors"]);
    expect(lit("fig-opp")).toEqual(["opp-winners", "opp-unforcedErrors"]);
  });

  test("a legend key lights its kind for both players", () => {
    expect(lit("key-winners")).toEqual(["you-winners", "opp-winners"]);
    expect(lit("key-unforcedErrors")).toEqual([
      "you-unforcedErrors",
      "opp-unforcedErrors",
    ]);
  });
});

test("the report skeleton leaves off as many Points rows as the table does", () => {
  const points = (groups: { title: string; configs: unknown[] }[]) =>
    groups.find((g) => g.title === "Points")!.configs.length;
  expect(points(H2H_GROUPS) - points(withoutShotKindRows(H2H_GROUPS))).toBe(
    REPORT_OMITTED_POINT_ROWS,
  );
});
