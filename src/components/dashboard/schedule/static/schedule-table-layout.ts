export const SCHEDULE_GRID =
  "grid-cols-[84px_minmax(150px,1fr)_88px_56px_56px_48px_60px]";

/**
 * The header row's labels, in `SCHEDULE_GRID` order — and the header below
 * renders FROM this, rather than restating it beside it. A constant the ghost
 * reads and the real table only agrees with is a second source of truth: rename
 * a column and day zero keeps the old word, silently, with the copy test still
 * green because it asserts the constant.
 */
export const SCHEDULE_COLUMNS = [
  "Date",
  "Event",
  "Type",
  "Venue",
  "Lines",
  "Score",
  "Result",
] as const;
