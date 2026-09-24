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
 *
 * Every keyframe here assumes `transform-origin: 0 0`, and carries it: under
 * the default `50% 50%`, `translate(x, y) scale(s)` puts the room's left edge
 * at `rw/2 + x − s·rw/2`, not `x` — the ~`(rw − fw)/2` offset that shipped
 * before T27 (2026-09-23), with the room growing from beside the player.
 *
 * A frame that is not on screen at all (the ⇧-click door, opened from a row
 * with the player scrolled away) has nothing to grow from, so the room fades
 * instead — `roomMotionPath`.
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
/** The points drawer's slide-out; matches its `duration-[260ms]` class. */
export const PANEL_EXIT_MS = 260;
export const ROOM_EASE_EXIT = "cubic-bezier(0.4, 0, 0.2, 1)";

/** A Web Animations keyframe carrying the room's transform and crop. */
export interface RoomKeyframe extends Keyframe {
  transform: string;
  clipPath: string;
  /** Always `"0 0"`: the maths below is about the room's top-left corner. */
  transformOrigin: "0 0";
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
    transformOrigin: "0 0",
  };
}

export const OPEN_ROOM_FRAME: RoomKeyframe = {
  transform: "translate(0px, 0px) scale(1)",
  clipPath: "inset(0px 0px round 0px)",
  transformOrigin: "0 0",
};

/**
 * How the room travels between the report frame and the screen: `"frame"`
 * grows from (or shrinks into) the frame, `"fade"` is an opacity change for a
 * frame with no visible area inside the room — none at all, or one wholly off
 * an edge — since a room that grew from off-screen would fly in from nowhere.
 * A frame partly on screen still grows: the part that shows is where it is.
 */
export function roomMotionPath(
  frame: Rect | null,
  room: { width: number; height: number },
): "frame" | "fade" {
  if (!frame) return "fade";
  const w =
    Math.min(frame.left + frame.width, room.width) - Math.max(frame.left, 0);
  const h =
    Math.min(frame.top + frame.height, room.height) - Math.max(frame.top, 0);
  return w > 0 && h > 0 ? "frame" : "fade";
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** `prefers-reduced-motion: reduce`, read once (no subscription). */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const reducedMotionNow = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches;
