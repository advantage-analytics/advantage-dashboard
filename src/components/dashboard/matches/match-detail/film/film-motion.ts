/**
 * The room's entrance and exit: the report player's frame grows into the
 * whole screen, and shrinks back into it on the way out. Pure geometry, so
 * the mapping is testable.
 *
 * The room is animated with a uniform scale — a non-uniform one would squash
 * the video whenever the screen's aspect ratio differs from the 16:9 frame —
 * and a `clip-path` crops the scaled room down to the frame's exact shape,
 * with the frame's 14px corners expressed in the room's unscaled pixels.
 * Because both the frame and the room letterbox the film with
 * `object-contain`, the crop shows the same picture the frame did.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const FRAME_RADIUS_PX = 14;

/** Deliberate arrival; exits run faster than entrances. */
export const ROOM_ENTER_MS = 460;
export const ROOM_EXIT_MS = 320;
export const ROOM_EASE_ENTER = "cubic-bezier(0.23, 1, 0.32, 1)"; // --ease-out-expo
/** The points drawer's slide-out; matches its `duration-[240ms]` class. */
export const PANEL_EXIT_MS = 240;
export const ROOM_EASE_EXIT = "cubic-bezier(0.4, 0, 0.2, 1)";

/** A Web Animations keyframe carrying the room's transform and crop. */
export interface RoomKeyframe extends Keyframe {
  transform: string;
  clipPath: string;
}

/** The keyframe that makes the full-screen room look exactly like `frame`. */
export function collapsedRoomFrame(
  frame: Rect,
  room: { width: number; height: number },
): RoomKeyframe {
  const scale = Math.max(frame.width / room.width, frame.height / room.height);
  // How much of the room, in its own pixels, falls outside the frame's shape.
  const insetX = Math.max(0, (room.width - frame.width / scale) / 2);
  const insetY = Math.max(0, (room.height - frame.height / scale) / 2);
  const x = frame.left - insetX * scale;
  const y = frame.top - insetY * scale;
  const radius = FRAME_RADIUS_PX / scale;
  return {
    transform: `translate(${round(x)}px, ${round(y)}px) scale(${round(scale, 5)})`,
    clipPath: `inset(${round(insetY)}px ${round(insetX)}px round ${round(radius)}px)`,
  };
}

export const OPEN_ROOM_FRAME: RoomKeyframe = {
  transform: "translate(0px, 0px) scale(1)",
  clipPath: "inset(0px 0px round 0px)",
};

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
