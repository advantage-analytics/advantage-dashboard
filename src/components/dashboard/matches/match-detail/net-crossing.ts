/**
 * Where a net ball is drawn sideways — shared by the film-room court
 * (`film/film-court.ts`) and the Statistics court charts (`shots/viz-model.ts`).
 *
 * A ball that hit the net never landed where its recorded landing says, so the
 * charts pin its depth to the net (just onto the hitter's side). Its SIDEWAYS
 * position follows the shot's own path: the straight line from where it was
 * struck to its recorded landing, read where that line meets the net. Keeping
 * the landing's own x instead moves a diagonal ball straight up the court and
 * can put it well off the line it actually travelled.
 *
 * Only a line that reaches the net has a crossing: contact on one side, the
 * recorded landing on the other side or on the net itself. A landing on the
 * hitter's own side (SwingVision imputes every net landing there) or a missing
 * contact has none — callers keep the landing's x, as before.
 *
 * Database frame: metres, net at y = 11.885. Drawing only — nothing here feeds
 * a statistic, a filter or the published data.
 */

/** The net, in the database frame's y (metres). */
export const NET_CROSSING_NET_Y_M = 23.77 / 2;

const finite = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

/**
 * The x (database frame) of the contact → landing line at `atY` — by default
 * the net itself; a caller drawing just onto the hitter's side passes that y,
 * so the dot sits exactly on the line. Null when either end is unmeasured or
 * the line never reaches the net.
 */
export function netPathX(
  contactX: number | null | undefined,
  contactY: number | null | undefined,
  landingX: number | null | undefined,
  landingY: number | null | undefined,
  atY: number = NET_CROSSING_NET_Y_M,
): number | null {
  if (
    !finite(contactX) ||
    !finite(contactY) ||
    !finite(landingX) ||
    !finite(landingY) ||
    !finite(atY)
  )
    return null;
  const fromContact = contactY - NET_CROSSING_NET_Y_M;
  const fromLanding = landingY - NET_CROSSING_NET_Y_M;
  // Struck on the net line: no side to cross from.
  if (fromContact === 0) return null;
  // Landing on the hitter's own side: the line never reaches the net.
  if (Math.sign(fromLanding) === Math.sign(fromContact)) return null;
  const t = (atY - contactY) / (landingY - contactY);
  return contactX + t * (landingX - contactX);
}
