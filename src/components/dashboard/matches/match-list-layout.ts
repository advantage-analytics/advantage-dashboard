/**
 * The Matches table's tracks, shared by populated rows, draft rows, the loading
 * skeleton and the day-zero ghost table — every one must keep the same order.
 *
 * Personal: Date · Opponent · Result · Score · Event · lifecycle · ⋯
 * Team:     Date · Player · Opponent · Result · Score · Event · lifecycle · ⋯
 *
 * The outcome glyph comes BEFORE the score, in a fixed track, so it sits at one
 * x on every row and reads the way the match drawer draws it ("✓ 6-4, 3-6").
 * After the score it floated: a three-set score is wider than a two-set one.
 * Event trails the numbers — the least-scanned text, the widest, often blank
 * for practice — and is the column the team table gives up while the drawer is
 * open (`TEAM_LIST_GRID_COLS_COMPACT`); the drawer names the event instead.
 *
 * No chevron track: a row opens the peek drawer rather than travelling.
 */
export const DATE_COL = "72px";
export const DATE_COL_WITH_YEAR = "84px";
/** Wide enough for its own "RESULT" heading, which is wider than the glyph. */
const RESULT_COL = "60px";
const SCORE_COL = "116px";

export const LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(186px,276px) ${RESULT_COL} ${SCORE_COL} minmax(150px,260px) minmax(96px,1fr) 28px`,
} as const;
export const TEAM_LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(130px,1fr) minmax(130px,1fr) ${RESULT_COL} ${SCORE_COL} minmax(150px,1fr) minmax(96px,1fr) 28px`,
} as const;
/** The team tracks beside the open drawer: Event dropped, nothing else moves. */
export const TEAM_LIST_GRID_COLS_COMPACT = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(120px,1fr) minmax(130px,1fr) ${RESULT_COL} ${SCORE_COL} minmax(96px,1fr) 28px`,
} as const;

/** Minimum inner widths, so the card scrolls rather than crushing a track. */
export const LIST_MIN_WIDTH = "min-w-[820px]";
export const TEAM_LIST_MIN_WIDTH = "min-w-[900px]";
export const TEAM_LIST_MIN_WIDTH_COMPACT = "min-w-[720px]";

/** Which tracks a row uses: the scope, and whether the team drawer is open. */
export function listGridCols(scope: "personal" | "team", compact = false) {
  if (scope === "personal") return LIST_GRID_COLS;
  return compact ? TEAM_LIST_GRID_COLS_COMPACT : TEAM_LIST_GRID_COLS;
}

export const LIST_ROW_FRAME = "grid items-center gap-x-4";
