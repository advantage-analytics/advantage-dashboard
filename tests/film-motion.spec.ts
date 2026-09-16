import { expect, test } from "@playwright/test";

import {
  collapsedRoomFrame,
  FRAME_RADIUS_PX,
} from "@/components/dashboard/matches/match-detail/film/film-motion";

/**
 * The room must start exactly on top of the report player's frame, or the
 * "grow into fullscreen" reads as a jump. Checked by mapping the clip box
 * through the transform back to screen coordinates.
 */

function screenBox(
  kf: { transform: string; clipPath: string },
  room: { width: number; height: number },
) {
  const [, x, y, s] = kf.transform
    .match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/)!
    .map(Number);
  const [, iy, ix, r] = kf.clipPath
    .match(/inset\(([\d.]+)px ([\d.]+)px round ([\d.]+)px\)/)!
    .map(Number);
  return {
    left: x + ix * s,
    top: y + iy * s,
    width: (room.width - 2 * ix) * s,
    height: (room.height - 2 * iy) * s,
    radiusOnScreen: r * s,
  };
}

test("a 16:9 frame inside a taller 16:10 room", () => {
  const frame = { left: 320, top: 110, width: 640, height: 360 };
  const room = { width: 1280, height: 800 };
  const box = screenBox(collapsedRoomFrame(frame, room), room);
  expect(box.left).toBeCloseTo(320, 1);
  expect(box.top).toBeCloseTo(110, 1);
  expect(box.width).toBeCloseTo(640, 1);
  expect(box.height).toBeCloseTo(360, 1);
  expect(box.radiusOnScreen).toBeCloseTo(FRAME_RADIUS_PX, 1);
});

test("a frame inside a wider room crops the sides instead", () => {
  const frame = { left: 40, top: 60, width: 480, height: 270 };
  const room = { width: 2560, height: 1080 };
  const box = screenBox(collapsedRoomFrame(frame, room), room);
  expect(box.left).toBeCloseTo(40, 1);
  expect(box.top).toBeCloseTo(60, 1);
  expect(box.width).toBeCloseTo(480, 1);
  expect(box.height).toBeCloseTo(270, 1);
});
