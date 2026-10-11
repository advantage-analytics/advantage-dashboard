/**
 * The personal Opponents table's tracks and page frame, shared by the populated
 * table, the loading skeleton and the day-zero ghost table — a ghost table
 * never restates its own geometry (`reference/tables.md` → Table page states).
 *
 * Opponent · Hand · Backhand · Record · Form · Last match · Result · Score
 *
 * No JSX here, so the skeleton and the day zero can import the grid without
 * pulling the table's client code with it.
 */

// Deviation from Data Table law 1 (2026-10-02, "the last column takes the slack"): the frame (`project/Main.dc.html`) puts the one fluid track FIRST, on Opponent, by the author's instruction.
export const OPPONENTS_GRID_TEMPLATE =
  "minmax(150px,1fr) 92px 92px 56px 72px 72px 60px 116px";

export const OPPONENTS_GRID_COLS = {
  gridTemplateColumns: OPPONENTS_GRID_TEMPLATE,
} as const;

/** The row's grid and its 16px column gap; header, rows and ghost rows alike. */
export const OPPONENTS_ROW_FRAME = "grid items-center gap-x-4";

/** One header label per track, in track order. */
export const OPPONENTS_COLUMNS = [
  "Opponent",
  "Hand",
  "Backhand",
  "Record",
  "Form",
  "Last match",
  "Result",
  "Score",
] as const;

/** The table card's inset: 2px above the header, 24px sides, 6px under the rows. */
export const OPPONENTS_CARD_PADDING = "2px 24px 6px";

/**
 * The tracks' own floor — 710px of minimums plus seven 16px gaps — so the card
 * scrolls rather than crushing a track. The frame writes 720px, which is
 * narrower than the tracks it holds and lets the last column spill past the
 * card's right inset.
 */
export const OPPONENTS_MIN_WIDTH = "min-w-[822px]";

/** A 52px row, washed on an 8px-inset rounded box: 24px card inset − 16px. */
export const OPPONENTS_ROW_BOX =
  "-mx-4 h-[52px] rounded-[var(--radius-element)] px-4";

/**
 * The page's white ground, and the padded column inside it. Two elements, not
 * one, so the opponent drawer can sit beside the column flush to the right
 * edge — the Matches and Roster arrangement.
 */
export const OPPONENTS_PAGE_FRAME =
  "flex w-full flex-1 bg-[var(--surface-card)]";
export const OPPONENTS_PAGE_COLUMN =
  "flex min-w-0 flex-1 flex-col px-14 pt-5 pb-8";

/** The gap between title row, toolbar, card and footer. */
export const OPPONENTS_PAGE_GAP = "gap-[18px]";
