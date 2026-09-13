/** Shared by populated rows and loading rows; keep all eight tracks aligned. */
export const DATE_COL = "72px";
export const DATE_COL_WITH_YEAR = "84px";
export const LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(186px,276px) minmax(150px,260px) 116px 64px minmax(96px,1fr) 28px 13px`,
} as const;
export const TEAM_LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(130px,1fr) minmax(150px,1fr) minmax(130px,1fr) 116px 64px minmax(96px,1fr) 28px 13px`,
} as const;
export const LIST_ROW_FRAME = "grid items-center gap-x-4";
