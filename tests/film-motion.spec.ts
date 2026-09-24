import { expect, test } from "@playwright/test";

import {
  collapsedRoomFrame,
  FRAME_RADIUS_PX,
  OPEN_ROOM_FRAME,
  roomMotionPath,
} from "@/components/dashboard/matches/match-detail/film/film-motion";

import { screenBox } from "./fixtures/film-motion-box";

/**
 * The room must start exactly on top of the report player's frame, or the
 * "grow into fullscreen" reads as a jump. Checked by mapping the clip box
 * through the transform back to screen coordinates — about the room's
 * top-left corner, which every keyframe carries as `transformOrigin`.
 */

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

test("every room keyframe carries the top-left origin its maths assumes", () => {
  const room = { width: 1280, height: 720 };
  const frame = { left: 200, top: 48, width: 720, height: 405 };
  expect(collapsedRoomFrame(frame, room).transformOrigin).toBe("0 0");
  expect(OPEN_ROOM_FRAME.transformOrigin).toBe("0 0");
});

test("a bottom-right frame maps back onto itself", () => {
  // Under a centre origin this frame is where the room would drift furthest:
  // (rw − fw)/2 = 400px right and (rh − fh)/2 = 225px down of where it is.
  const frame = { left: 760, top: 400, width: 480, height: 270 };
  const room = { width: 1280, height: 720 };
  const box = screenBox(collapsedRoomFrame(frame, room), room);
  expect(Math.abs(box.left - 760)).toBeLessThan(0.1);
  expect(Math.abs(box.top - 400)).toBeLessThan(0.1);
  expect(Math.abs(box.width - 480)).toBeLessThan(0.1);
  expect(Math.abs(box.height - 270)).toBeLessThan(0.1);
});

test.describe("roomMotionPath: grow from the frame only when it is on screen", () => {
  const room = { width: 1280, height: 720 };

  test("no frame fades", () => {
    expect(roomMotionPath(null, room)).toBe("fade");
  });

  test("a frame wholly above the room fades", () => {
    // top + height <= 0: the player scrolled away before the ⇧-click.
    expect(
      roomMotionPath({ left: 200, top: -413, width: 720, height: 405 }, room),
    ).toBe("fade");
    expect(
      roomMotionPath({ left: 200, top: -405, width: 720, height: 405 }, room),
    ).toBe("fade");
  });

  test("a frame wholly right of the room fades", () => {
    expect(
      roomMotionPath({ left: 1280, top: 100, width: 480, height: 270 }, room),
    ).toBe("fade");
  });

  test("a frame partly on screen grows", () => {
    expect(
      roomMotionPath({ left: 200, top: -300, width: 720, height: 405 }, room),
    ).toBe("frame");
  });

  test("a frame fully inside grows", () => {
    expect(
      roomMotionPath({ left: 200, top: 48, width: 720, height: 405 }, room),
    ).toBe("frame");
  });
});
