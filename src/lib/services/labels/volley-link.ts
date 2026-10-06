/**
 * A ball taken out of the air has no bounce between two strokes: where the
 * previous stroke's ball "landed" IS where the volley (or the overhead) met
 * it. So the two coordinates are one place, and the labeller sets it once.
 *
 * Pure and import-free of anything server-side — the `"use client"` console
 * calls it after each of the labeller's own shot writes
 * (label-console.tsx `patchShot`) and sends what it answers through the same
 * shot autosave. It only ever plans `label_shots` patches.
 *
 * The rule, for the labeller's patch to ONE stroke:
 *
 * - the stroke CHANGED TO an air stroke (it was not one before): when it has
 *   a contact, the previous stroke's landing becomes that contact; else when
 *   the previous stroke has a landing, the air stroke's contact becomes that
 *   landing; with neither, nothing.
 * - the CONTACT of an air stroke was set or changed: the previous stroke's
 *   landing follows it.
 * - the LANDING of a stroke was set or changed and the NEXT stroke is an air
 *   stroke: that stroke's contact follows it.
 *
 * "Previous" and "next" are the nearest LIVE strokes of the same point, in
 * the point's own (video) order: a tombstone (`status: "deleted"`) is never
 * one, and nor is a ghost — a stroke the site removed and nobody restored —
 * while the session draws ghosts (`ghosts`, on by default; the marks-off
 * session numbers a ghost as an ordinary stroke, and passes `false`).
 *
 * Clearing a coordinate never clears the other side, and changing an air
 * stroke back to anything else (or one air stroke to another) changes
 * nothing. When the two already agree there is no write — so no "edited"
 * pencil on a row nobody moved.
 *
 * The follower's patch is the two coordinates and nothing else. Its In / Out
 * / Net is left as stored: a ball met in the air was played, wherever the
 * hitter stood, so a contact beyond the baseline must not turn the stroke
 * before it into "out".
 */

import type { LabelShotPatch } from "./edit";
import { isGhostShot, type LabelPoint, type LabelShot } from "./session";

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
  const live = point.shots.filter(
    (shot) => shot.status !== "deleted" && !(ghosts && isGhostShot(shot)),
  );
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
