export const COL = {
  spot: "w-6 shrink-0",
  /**
   * 32% of the card's width, clamped to 240–340px, so a long name and its pill
   * (Emon van Loben Sels, "Coach-managed") have room on a wide screen. It is a
   * function of the CARD (`cqw`, see `ROSTER_MIN_WIDTH`), never of the row, so
   * every row gets the same width and Record stays on one x. A flex-grow share
   * did not: a row whose Last match yields its floor took a different cut.
   */
  player: "w-[clamp(240px,32cqw,340px)] shrink-0",
  record: "w-[72px] shrink-0",
  form: "w-24 shrink-0",
  /** The one fluid cell: it takes whatever width the other four leave. */
  last: "min-w-[196px] flex-1",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The row's intrinsic width, not a round number: 24 + 240 (Player's floor) + 72 + 96 + 196 of
 * columns, four 16px gaps between the five items, and the 48px the card pads
 * by. Below it the card scrolls sideways instead of letting a cell overflow
 * its own padding box.
 *
 * It is also the size container `COL.player`'s `cqw` measures, so every box
 * that draws this table (the table, day-zero, loading) takes it.
 */
export const ROSTER_MIN_WIDTH = "min-w-[740px] @container";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` and rendered by the header below, so `roster-day-zero`
 * draws the real words rather than a copy that agrees with them today. There is
 * no spacer entry: Record, Form and Last match follow the name at a constant
 * gap, and Last match is the one fluid column.
 */
export const ROSTER_COLUMNS: readonly {
  label: string;
  col: string;
  center?: boolean;
}[] = [
  { label: "#", col: COL.spot, center: true },
  { label: "Player", col: COL.player },
  { label: "Record", col: COL.record },
  { label: "Form", col: COL.form },
  { label: "Last Match", col: COL.last },
];
