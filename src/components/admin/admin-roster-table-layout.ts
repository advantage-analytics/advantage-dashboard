/**
 * The Admin › Teams Roster card's column geometry — the one place that knows
 * how wide each cell is and what sits over it.
 *
 * Lifted from `TeamPage.dc.html`'s `.rg` rule (its line 924,
 * `grid-template-columns: 20px minmax(0, 1fr) 48px 96px 64px 168px`) and the
 * `.inner .tr` row metrics beside it (line 914: `margin: 0 -12px; padding: 8px
 * 12px; min-height: 52px`; line 919 for the header row). The labels come from
 * the card's own header row (canvas lines 1083–1088).
 *
 * A grid rather than the flex-plus-width-classes shape of
 * `teams-table-layout.ts` and `requests-table-layout.ts`, because the canvas
 * draws it as one: a six-track grid has no per-cell width to keep in step with
 * a separate header, so `ADMIN_ROSTER_COLUMNS`' ORDER is the column order and
 * nothing can disagree with it. The tracks are named once, in `GRID`.
 *
 * Data Table law 1 governs the rest: exactly one fluid cell (Player), every
 * measure fixed so a date starts at the same x on every row, and Matches —
 * the one number compared down its column — flush right. Nothing is centred.
 */

/** The six tracks, spelled once. */
export const GRID =
  "grid grid-cols-[20px_minmax(0,1fr)_48px_96px_64px_168px] items-center gap-x-6";

/**
 * One player's line. The negative margin plus matching padding is the canvas'
 * 12px bleed into the card's 24px gutter, so a row's ink lines up with the card
 * title above it while the row itself can hold a wash later.
 *
 * No hover wash today, deliberately: nothing in this row is clickable yet (the
 * roster drawer is not part of this card), and a wash plus a pointer on a row
 * that does nothing is a promise the card cannot keep — Data Table law 5 ties
 * the wash to row actions. The canvas' `.tr:hover` is drawn for a table that
 * has them.
 */
export const ROW = `${GRID} -mx-3 min-h-[52px] px-3 py-2`;

/** The header row: the same tracks, no bleed, tighter. */
export const HEADER_ROW = `${GRID} min-h-8 pt-1 pb-1.5`;

/**
 * The header's labels, in row order — which IS the grid's column order.
 *
 * `# · Player · Class · Account · Matches · Last match`, verbatim from the
 * canvas. This is not the dashboard Roster's `# · Player · Record · Form ·
 * Last match`: that page is a coach ranking a lineup, and this one is an admin
 * asking who is on the program and whether they can log in — Record and Form
 * answer neither question, and Class and Account are not on the coach's page at
 * all. Same noun, different reading, and the canvas rules on it.
 */
export const ADMIN_ROSTER_COLUMNS: readonly {
  label: string;
  /** Matches is the one measure compared down its column — flush right. */
  align?: "right";
}[] = [
  { label: "#" },
  { label: "Player" },
  { label: "Class" },
  { label: "Account" },
  { label: "Matches", align: "right" },
  { label: "Last match" },
];
