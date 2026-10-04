/**
 * The labelling console's two grids — board 08g's `.pr` (point) and board
 * 08's `.srow` (shot) tracks.
 *
 * A point row reads left to right as the board does: the fold caret, WHO WON
 * (the winner mark leads — it is the one thing a labeller scans the column
 * for), the point's number and time in mono, the score before it, how it
 * ended, the last shot and the rally's length, a fluid Note, the row's
 * status, and a headerless last track for its ⋯ menu.
 *
 * The board spaces Score, How it ended, Note and Status 20px further from the
 * column before them, and # 4px, on top of the 12px gap; `POINT_COLUMNS`
 * carries that as each column's `className` (from `POINT_CELL`), which the
 * header AND the cell take, so a label always sits over the value it names.
 */

export const POINT_GRID =
  "grid grid-cols-[16px_30px_32px_64px_96px_150px_104px_44px_minmax(220px,1fr)_150px_32px] items-center gap-x-3";

/** Each offset column's classes, by name — the header's and the cell's. */
export const POINT_CELL = {
  number: "ml-1",
  score: "ml-5",
  ending: "ml-5",
  rally: "text-right",
  note: "ml-5",
  status: "ml-5",
} as const;

export const POINT_COLUMNS: readonly {
  label: string;
  /** The column's extra offset or alignment, shared by header and cell. */
  className?: string;
}[] = [
  // The fold caret.
  { label: "" },
  { label: "Won" },
  { label: "#", className: POINT_CELL.number },
  { label: "Time" },
  { label: "Score", className: POINT_CELL.score },
  { label: "How it ended", className: POINT_CELL.ending },
  { label: "Last shot" },
  { label: "Rally", className: POINT_CELL.rally },
  { label: "Note", className: POINT_CELL.note },
  { label: "Status", className: POINT_CELL.status },
  // The row's ⋯ menu.
  { label: "" },
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
