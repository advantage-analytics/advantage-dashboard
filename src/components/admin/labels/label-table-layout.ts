/**
 * The labelling console's two grids — board 08g's `.pr` (point) and board
 * 08g's `.srw` (shot) tracks.
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
  "grid grid-cols-[16px_30px_32px_76px_96px_150px_104px_44px_minmax(220px,1fr)_150px_32px] items-center gap-x-3";

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

/**
 * The shot tracks — board 08g's `.srw`, with the board's Type and Speed
 * columns dropped for the two positions:
 *
 *   Shot 32 · Time 76 · Player 120 · Stroke 132 · Spin 96 · Hit at 124 ·
 *   Landed at 124 · Placement 104 · Result 64 · Status (124px, then the
 *   slack) · ✕ 28
 *
 * with 16px between them. Player holds a name alone (no chip). Hit at and
 * Landed at are sized for the longest pair the court can give
 * ("-10.00, 23.77") in the text AND in the editor's field chrome, so a
 * coordinate is never cut. Fixed tracks and gaps come to 1184px.
 */
export const SHOT_TRACKS =
  "grid grid-cols-[32px_76px_120px_132px_96px_124px_124px_104px_64px_minmax(124px,1fr)_28px] items-center gap-x-4";

/**
 * The shot HEADER's grid, on the fold's own ground. Its padding is the shot
 * card's inset plus the card's border plus a row's padding — 32 + 1 + 11 on
 * the left, 16 + 1 + 11 on the right — so each label sits over its column in
 * the card (`label-shot-row.tsx`).
 */
export const SHOT_GRID = `${SHOT_TRACKS} pr-7 pl-11`;

/** A shot ROW's grid, inside the card. */
export const SHOT_ROW_GRID = `${SHOT_TRACKS} px-[11px]`;

/**
 * The points table's least width: the shot tracks (1184) inside the header's
 * padding (72) is the fold's 1256, the fold overhangs the table's content by
 * 16px a side, and the table pads that content by 24px a side.
 */
export const TABLE_MIN_WIDTH = "min-w-[1272px]";

/** Placement and Result follow the positions; the last track is the ✕. */
export const SHOT_COLUMNS: readonly string[] = [
  "Shot",
  "Time",
  "Player",
  "Stroke",
  "Spin",
  "Hit at",
  "Landed at",
  "Placement",
  "Result",
  "Status",
  "",
];
