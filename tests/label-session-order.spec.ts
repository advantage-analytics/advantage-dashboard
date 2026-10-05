import { expect, test } from "@playwright/test";

import {
  isGhostShot,
  labelProgress,
  orderLabelShots,
} from "@/lib/services/labels/session";
import { labelSessionFixture } from "./fixtures/label-session";

/**
 * The console's one ordering rule (T5): strokes within a point are in video
 * order — `video_time`, never a stored shot number — with untimed strokes
 * last, then the vendor `event_id`, then the row id.
 */

const row = (id: string, videoTime: number | null, eventId: number | null) => ({
  id,
  videoTime,
  eventId,
});

test("orders by video time, not by the order the rows arrived in", () => {
  const ordered = orderLabelShots([
    row("c", 12.4, 1),
    row("a", 10.0, 3),
    row("b", 11.2, 2),
  ]);
  // event_id alone would say c, b, a — video time says a, b, c.
  expect(ordered.map((shot) => shot.id)).toEqual(["a", "b", "c"]);
});

test("untimed strokes go last, then event_id breaks ties, added last", () => {
  const ordered = orderLabelShots([
    row("added-untimed", null, null),
    row("untimed-9", null, 9),
    row("tie-8", 5, 8),
    row("tie-7", 5, 7),
    row("untimed-4", null, 4),
    row("first", 1, 99),
  ]);
  expect(ordered.map((shot) => shot.id)).toEqual([
    "first",
    "tie-7",
    "tie-8",
    "untimed-4",
    "untimed-9",
    "added-untimed",
  ]);
});

test("the row id settles a full tie, and the input is not mutated", () => {
  const input = [row("z", 3, null), row("m", 3, null)];
  expect(orderLabelShots(input).map((shot) => shot.id)).toEqual(["m", "z"]);
  expect(input.map((shot) => shot.id)).toEqual(["z", "m"]);
});

test("progress counts checked points and never a tombstone", () => {
  expect(labelProgress(labelSessionFixture().points)).toEqual({
    checked: 1,
    total: 3,
  });
});

test.describe("isGhostShot", () => {
  const ghost = {
    siteRemoval: "hit_after_fault" as const,
    siteRemovalRestoredAt: null,
    status: "kept" as const,
  };

  test("a site-removed stroke, not restored and not deleted, is a ghost", () => {
    expect(isGhostShot(ghost)).toBe(true);
    // An edited ghost is still a ghost: the site's removal is what counts.
    expect(isGhostShot({ ...ghost, status: "edited" })).toBe(true);
  });

  test("a restored stroke is an ordinary row again", () => {
    expect(
      isGhostShot({ ...ghost, siteRemovalRestoredAt: "2026-10-05T09:00:00Z" }),
    ).toBe(false);
  });

  test("the labeller's own delete wins over the site's removal", () => {
    expect(isGhostShot({ ...ghost, status: "deleted" })).toBe(false);
  });

  test("a stroke the site never removed is not a ghost", () => {
    expect(isGhostShot({ ...ghost, siteRemoval: null })).toBe(false);
    // Every fixture row is a kept, edited, added or labeller-deleted stroke.
    for (const point of labelSessionFixture().points) {
      for (const shot of point.shots) expect(isGhostShot(shot)).toBe(false);
    }
  });
});
