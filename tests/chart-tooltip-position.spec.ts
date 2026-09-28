import { expect, test } from "@playwright/test";

import { positionReadout } from "@/components/dashboard/matches/match-detail/chart-tooltip-position";

/**
 * The Statistics chart readout that follows the cursor (T7). Pure and
 * offline, same model as `tests/report-view.spec.ts`.
 */

const size = { width: 120, height: 60 };
const bounds = { width: 400, height: 300 };
const offset = 12;

test.describe("positionReadout", () => {
  test("hangs the box's bottom-left corner above and right of the pointer", () => {
    expect(
      positionReadout({ pointer: { x: 100, y: 150 }, size, bounds, offset }),
    ).toEqual({ left: 112, top: 150 - 60 - 12 });
  });

  test("clamps to the right edge of the bounds", () => {
    expect(
      positionReadout({ pointer: { x: 350, y: 150 }, size, bounds, offset }),
    ).toEqual({ left: 400 - 120, top: 78 });
  });

  test("clamps to the left edge of the bounds", () => {
    expect(
      positionReadout({ pointer: { x: -40, y: 150 }, size, bounds, offset }),
    ).toEqual({ left: 0, top: 78 });
  });

  test("flips below the pointer when the box would pass the top", () => {
    // 50 - 60 - 12 < 0, so the box drops to `offset` px below the pointer.
    expect(
      positionReadout({ pointer: { x: 100, y: 50 }, size, bounds, offset }),
    ).toEqual({ left: 112, top: 62 });
  });
});
