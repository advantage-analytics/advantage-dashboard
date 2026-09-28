/**
 * The labelling console's two grids — board 08's `.tr` (point) and `.srow`
 * (shot) tracks, cut down to the columns the label tables actually hold.
 *
 * A point row reads left to right as the board does: what the seed
 * CALCULATED (point, set · game, server, stroke count) in muted ink, one
 * fluid gap, then what the labeller DECIDES (won by, ending, ended by) and
 * whether the point has been checked. The gap falls on that boundary, so the
 * two halves never interleave.
 *
 * The header rows draw from the same arrays, so a label always sits over the
 * track it names.
 */

export const POINT_GRID =
  "grid grid-cols-[16px_36px_72px_96px_48px_minmax(0,1fr)_96px_128px_96px_92px] items-center gap-x-3";

export const POINT_COLUMNS: readonly {
  label: string;
  /** A calculated column: its header and value both read muted. */
  calculated: boolean;
}[] = [
  { label: "", calculated: true },
  { label: "Point", calculated: true },
  { label: "Set · game", calculated: true },
  { label: "Server", calculated: true },
  { label: "Shots", calculated: true },
  { label: "", calculated: true },
  { label: "Won by", calculated: false },
  { label: "Ending", calculated: false },
  { label: "Ended by", calculated: false },
  { label: "Status", calculated: false },
];

/** Shots indent under their point: 44px, the board's `.srow` left padding. */
export const SHOT_GRID =
  "grid grid-cols-[32px_76px_96px_128px_64px_112px_112px_minmax(0,1fr)] items-center gap-x-3 pr-4 pl-11";

export const SHOT_COLUMNS: readonly string[] = [
  "Shot",
  "Time",
  "Player",
  "Stroke",
  "Result",
  "Hit at",
  "Landed at",
  "Status",
];
