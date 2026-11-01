/**
 * A ball taken out of the air has no bounce between two strokes: where the
 * previous stroke's ball "landed" is where the volley (or the overhead) met it,
 * so the labeller sets that place once. Pure; the console calls it after each
 * of the labeller's own shot writes (`patchShot`).
 *
 * A stroke with no landing stored reads the next air stroke's contact
 * (`filledLanding`) wherever a landing is read on the console: the rail and the
 * court. The publish takes its placement but not its place: the ball never
 * bounced there, so no bounce goes out for it. Nothing is written, so a vendor row stays as seeded and the fill
 * keeps up with the contact by itself. It never decides In / Out: a ball
 * volleyed was played (`playedOnResult`). A stroke called out or net gets none:
 * it never reached anyone, so what follows is a dead ball.
 *
 * Stored ends are linked while they agree. The writes that keep them so:
 *
 * - The stroke changed to an air stroke: the previous stroke's stored landing
 *   becomes its contact or, when it has no contact, its contact becomes that
 *   landing.
 * - An air stroke's contact was set: the previous stroke's stored landing
 *   follows it, unless the two were already apart.
 * - A landing was set and the next stroke is an air stroke: that stroke's
 *   contact follows it, unless the two were already apart or the labeller
 *   asked to move the landing alone (`landingOnly`).
 *
 * "Previous" and "next" are the nearest live strokes of the point: never a
 * tombstone, nor a ghost while the session draws ghosts (`ghosts`). A serve is
 * never linked: its landing is a bounce, since a return cannot be volleyed.
 * Clearing a coordinate clears nothing else, and no write goes out when the two
 * already agree. The follower's patch is coordinates only: its In / Out / Net is
 * left as stored, since a ball met in the air was played wherever the hitter
 * stood.
 */

import type { LabelShotPatch } from "./edit";
import {
  isMissedResult,
  isServeStroke,
  liveShotsInOrder,
  type LabelPoint,
  type LabelShot,
  type LiveOrderableShot,
} from "./session";

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
type ShotEnds = Pick<
  LabelShot,
  "contactX" | "contactY" | "landingX" | "landingY"
>;
/** What the link reads of the stroke whose landing it is. */
type LinkShot = ShotEnds & Pick<LabelShot, "stroke" | "result">;
/** What the link reads of the stroke after it. */
type NextShot = ShotEnds & Pick<LabelShot, "stroke">;

/** The end's place, or null unless BOTH of its coordinates are set. */
function placeOf(shot: ShotEnds, end: End): Place | null {
  const x = end === "contact" ? shot.contactX : shot.landingX;
  const y = end === "contact" ? shot.contactY : shot.landingY;
  return x === null || y === null ? null : { x, y };
}

function touches(patch: LabelShotPatch, end: End): boolean {
  return end === "contact"
    ? "contact_x" in patch || "contact_y" in patch
    : "landing_x" in patch || "landing_y" in patch;
}

const samePlace = (a: Place, b: Place) => a.x === b.x && a.y === b.y;

/**
 * Whether `next` is an air stroke that met the ball `shot` hit. A serve bounces,
 * and a stroke called out or net reached nobody.
 */
function linked(
  shot: Pick<LabelShot, "stroke" | "result">,
  next: Pick<LabelShot, "stroke">,
): boolean {
  return (
    isAirStroke(next.stroke) &&
    !isServeStroke(shot.stroke) &&
    !isMissedResult(shot.result)
  );
}

/** The two ends a link joins: null when none applies or `next` has no contact. */
function linkEnds(
  shot: LinkShot,
  next: NextShot | null | undefined,
): { contact: Place; landing: Place | null } | null {
  if (!next || !linked(shot, next)) return null;
  const contact = placeOf(next, "contact");
  return contact && { contact, landing: placeOf(shot, "landing") };
}

/**
 * Where `shot`'s landing reads from when none is stored: `next`'s contact, for
 * the stroke before an air stroke. Null when a landing is stored or nothing
 * fills it.
 */
export function filledLanding(
  shot: LinkShot,
  next: NextShot | null | undefined,
): Place | null {
  const ends = linkEnds(shot, next);
  return ends && !ends.landing ? ends.contact : null;
}

/** `shot` with its filled landing in the landing's place, if it has one. */
export function withFilledLanding<T extends LinkShot>(
  shot: T,
  next: NextShot | null | undefined,
): T {
  const place = filledLanding(shot, next);
  return place ? { ...shot, landingX: place.x, landingY: place.y } : shot;
}

/**
 * The live stroke after `shotId` in rally order. Null for the last, and for a
 * stroke that is not live, which has no place in the rally.
 */
export function nextLiveStroke<T extends LiveOrderableShot>(
  point: { shots: readonly T[] },
  shotId: string,
  ghosts = true,
): T | null {
  const live = liveShotsInOrder(point, ghosts);
  const at = live.findIndex((shot) => shot.id === shotId);
  return at === -1 ? null : (live[at + 1] ?? null);
}

/**
 * The point's shots, in their stored order, each live one with its filled
 * landing: what a reader draws. A tombstone or a ghost is left as it is.
 */
export function withFilledLandings(
  point: { shots: readonly LabelShot[] },
  ghosts = true,
): LabelShot[] {
  const live = liveShotsInOrder(point, ghosts);
  const nextOf = new Map(live.map((shot, i) => [shot.id, live[i + 1]]));
  return point.shots.map((shot) =>
    withFilledLanding(shot, nextOf.get(shot.id)),
  );
}

/**
 * How `shot`'s landing stands to `next`'s contact: `filled` reads from it,
 * `agrees` is stored at the same place, `apart` is stored elsewhere. Null when
 * no link applies, or `next` has no contact to read.
 */
export function landingLink(
  shot: LinkShot,
  next: NextShot | null | undefined,
): "filled" | "agrees" | "apart" | null {
  const ends = linkEnds(shot, next);
  if (!ends) return null;
  if (!ends.landing) return "filled";
  return samePlace(ends.landing, ends.contact) ? "agrees" : "apart";
}

/**
 * A court click's patch to `shot`, with any out or net its coordinates derived
 * taken off when the next stroke met the ball in the air: that ball was played,
 * wherever it was met, and a stored miss would remove the strokes after it.
 */
export function playedOnPatch(
  patch: LabelShotPatch,
  shot: LinkShot,
  next: NextShot | null | undefined,
): LabelShotPatch {
  if (!next || !linked(shot, next) || !isMissedResult(patch.result)) {
    return patch;
  }
  const { result: _result, ...rest } = patch;
  return rest;
}

/** Whether placing `shot`'s landing now takes `next`'s contact with it. */
export function landingTakesContact(
  shot: LinkShot,
  next: NextShot | null | undefined,
  landingOnly: boolean,
): boolean {
  if (landingOnly) return false;
  const link = landingLink(shot, next);
  return link === "filled" || link === "agrees";
}

/**
 * What the court's link toggle does: ends apart go back to reading the contact
 * (`clearLanding`); otherwise it arms or disarms moving the landing alone.
 */
export function landingLinkToggle(
  shot: LinkShot,
  next: NextShot | null | undefined,
  landingOnly: boolean,
): { clearLanding: true } | { landingOnly: boolean } {
  return landingLink(shot, next) === "apart"
    ? { clearLanding: true }
    : { landingOnly: !landingOnly };
}

/** Metres between a stored landing and the next stroke's contact. */
export function landingGapMetres(
  shot: ShotEnds,
  next: ShotEnds,
): number | null {
  const landing = placeOf(shot, "landing");
  const contact = placeOf(next, "contact");
  if (!landing || !contact) return null;
  return Math.hypot(landing.x - contact.x, landing.y - contact.y);
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
 * `before` is that stroke before the patch; `point` is its point AFTER the
 * patch (the updated rows). `landingOnly` leaves the next stroke's contact where
 * it is. Empty when nothing follows.
 */
export function volleyLinkWrites({
  point,
  shotId,
  before,
  patch,
  ghosts = true,
  landingOnly = false,
}: {
  point: Pick<LabelPoint, "shots">;
  shotId: string;
  before: ShotEnds & Pick<LabelShot, "stroke">;
  patch: LabelShotPatch;
  ghosts?: boolean;
  landingOnly?: boolean;
}): VolleyLinkWrite[] {
  const live = liveShotsInOrder(point, ghosts);
  const at = live.findIndex((shot) => shot.id === shotId);
  // Not a live stroke of this point: a tombstone's values link to nothing.
  if (at === -1) return [];
  const shot = live[at];
  const previous = at > 0 ? live[at - 1] : null;
  const next = live[at + 1] ?? null;
  const writes: VolleyLinkWrite[] = [];

  if (previous && linked(previous, shot)) {
    const contact = placeOf(shot, "contact");
    const landing = placeOf(previous, "landing");
    if (touches(patch, "contact")) {
      const was = placeOf(before, "contact");
      // A cleared (or half-set) contact leaves the landing where it is; an
      // empty landing reads the contact without a write; ends already apart
      // stay apart.
      if (contact && landing && (!was || samePlace(was, landing))) {
        writes.push(...follow(previous, "landing", contact));
      }
    } else if ("stroke" in patch && !isAirStroke(before.stroke)) {
      if (contact && landing)
        writes.push(...follow(previous, "landing", contact));
      else if (landing) writes.push(...follow(shot, "contact", landing));
    }
  }

  if (touches(patch, "landing") && !landingOnly && next && linked(shot, next)) {
    const landing = placeOf(shot, "landing");
    const contact = placeOf(next, "contact");
    const was = placeOf(before, "landing");
    if (landing && (!contact || !was || samePlace(was, contact))) {
      writes.push(...follow(next, "contact", landing));
    }
  }

  return writes;
}
