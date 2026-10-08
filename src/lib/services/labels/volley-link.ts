/**
 * A ball taken out of the air has no bounce between two strokes: where the
 * previous stroke's ball "landed" is where the volley (or the overhead) met it,
 * so the labeller sets that place once. Pure; the console calls it after each
 * of the labeller's own shot writes (`patchShot`).
 *
 * - The stroke changed to an air stroke: the previous stroke's landing becomes
 *   its contact or, when it has no contact, its contact becomes that landing.
 * - An air stroke's contact was set: the previous stroke's landing follows it.
 * - A landing was set and the next stroke is an air stroke: that stroke's
 *   contact follows it.
 *
 * "Previous" and "next" are the nearest live strokes of the point: never a
 * tombstone, nor a ghost while the session draws ghosts (`ghosts`). Clearing a
 * coordinate clears nothing else, and no write goes out when the two already
 * agree. The follower's patch is coordinates only: its In / Out / Net is left
 * as stored, since a ball met in the air was played wherever the hitter stood.
 */

import type { LabelShotPatch } from "./edit";
import { isLiveShot, type LabelPoint, type LabelShot } from "./session";

/** A volley or an overhead: the ball is hit before it bounces. */
export function isAirStroke(stroke: LabelShot["stroke"] | undefined): boolean {
  return (
    stroke === "forehand_volley" ||
    stroke === "backhand_volley" ||
    stroke === "overhead"
  );
}

/** One follower write: the stroke it goes to, and its patch. */
export interface VolleyLinkWrite {
  shotId: string;
  patch: LabelShotPatch;
}

type End = "contact" | "landing";
type Place = { x: number; y: number };

/** The end's place, or null unless BOTH of its coordinates are set. */
function placeOf(shot: LabelShot, end: End): Place | null {
  const x = end === "contact" ? shot.contactX : shot.landingX;
  const y = end === "contact" ? shot.contactY : shot.landingY;
  return x === null || y === null ? null : { x, y };
}

function touches(patch: LabelShotPatch, end: End): boolean {
  return end === "contact"
    ? "contact_x" in patch || "contact_y" in patch
    : "landing_x" in patch || "landing_y" in patch;
}

/** `shot`'s `end` moved to `place` — or nothing when it is already there. */
function follow(shot: LabelShot, end: End, place: Place): VolleyLinkWrite[] {
  const now = placeOf(shot, end);
  if (now && now.x === place.x && now.y === place.y) return [];
  return [
    {
      shotId: shot.id,
      patch:
        end === "contact"
          ? { contact_x: place.x, contact_y: place.y }
          : { landing_x: place.x, landing_y: place.y },
    },
  ];
}

/**
 * The follower writes the labeller's `patch` to stroke `shotId` asks for.
 *
 * `strokeBefore` is that stroke's `stroke` before the patch; `point` is its
 * point AFTER the patch (the updated rows). Empty when nothing follows.
 */
export function volleyLinkWrites({
  point,
  shotId,
  strokeBefore,
  patch,
  ghosts = true,
}: {
  point: Pick<LabelPoint, "shots">;
  shotId: string;
  strokeBefore: LabelShot["stroke"];
  patch: LabelShotPatch;
  ghosts?: boolean;
}): VolleyLinkWrite[] {
  const live = point.shots.filter((shot) => isLiveShot(shot, ghosts));
  const at = live.findIndex((shot) => shot.id === shotId);
  // Not a live stroke of this point: a tombstone's values link to nothing.
  if (at === -1) return [];
  const shot = live[at];
  const previous = at > 0 ? live[at - 1] : null;
  const next = live[at + 1] ?? null;
  const writes: VolleyLinkWrite[] = [];

  if (isAirStroke(shot.stroke) && previous) {
    const contact = placeOf(shot, "contact");
    if (touches(patch, "contact")) {
      // A cleared (or half-set) contact leaves the landing where it is.
      if (contact) writes.push(...follow(previous, "landing", contact));
    } else if ("stroke" in patch && !isAirStroke(strokeBefore)) {
      const landing = placeOf(previous, "landing");
      if (contact) writes.push(...follow(previous, "landing", contact));
      else if (landing) writes.push(...follow(shot, "contact", landing));
    }
  }

  if (touches(patch, "landing") && next && isAirStroke(next.stroke)) {
    const landing = placeOf(shot, "landing");
    if (landing) writes.push(...follow(next, "contact", landing));
  }

  return writes;
}
