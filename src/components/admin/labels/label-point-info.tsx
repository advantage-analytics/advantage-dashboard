/**
 * The court panel's one line about the open point while the film runs: the
 * score before the point, who served, how far the rally has got and how much
 * of the point is still to review. Pure (`pointInfoLine`) so a spec reads
 * every rule, and one small component (`PointInfoLine`) so the panel can
 * change where it sits without touching the words.
 */

export interface PointInfo {
  /** The score before the point, as the rail prints it ("30–15"); null with none. */
  score: string | null;
  /** The server's name; null when the rows do not say. */
  server: string | null;
  /** How many live strokes the point has. */
  rallyLength: number;
  /**
   * The playing stroke's number among them (1…n), while the film is on one
   * of this point's strokes; null otherwise.
   */
  rallySoFar: number | null;
  /** The point's open review items, as "n of m" counts them. */
  openItems: number;
}

/** "30–15 · Lee serving · shot 2 of 3 · 2 to review" — nulls dropped. */
export function pointInfoLine(info: PointInfo): string {
  const rally =
    info.rallySoFar !== null
      ? `shot ${info.rallySoFar} of ${info.rallyLength}`
      : info.rallyLength === 0
        ? "no shots"
        : `${info.rallyLength} ${info.rallyLength === 1 ? "shot" : "shots"}`;
  const open = info.openItems === 0 ? null : `${info.openItems} to review`;
  return [
    info.score,
    info.server ? `${info.server} serving` : null,
    rally,
    open,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** The line, quiet, under the court panel's header. */
export function PointInfoLine({ info }: { info: PointInfo }) {
  return (
    <span
      data-court-info=""
      className="tabular block h-4 shrink-0 truncate text-[11px] leading-4 text-white/55"
    >
      {pointInfoLine(info)}
    </span>
  );
}
