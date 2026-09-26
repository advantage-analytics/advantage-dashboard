export const COL = {
  spot: "w-6 shrink-0",
  player: "w-[230px] shrink-0",
  record: "w-14 shrink-0",
  form: "w-20 shrink-0",
  last: "w-[250px] shrink-0",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` and rendered by the header below, so `roster-day-zero`
 * draws the real words rather than a copy that agrees with them today. The
 * `spacer` entry is a column of the row too — it is what keeps Record, Form and
 * Last match over their own cells.
 */
export const ROSTER_COLUMNS: readonly (
  { spacer: true } | { label: string; col: string; center?: boolean }
)[] = [
  { label: "#", col: COL.spot, center: true },
  { label: "Player", col: COL.player },
  { spacer: true },
  { label: "Record", col: COL.record },
  { label: "Form", col: COL.form },
  { label: "Last match", col: COL.last },
];
