/**
 * The Admin › Teams Schedule card's column geometry — the one place that knows
 * how wide each cell is and what sits over it.
 *
 * Lifted from `TeamPage.dc.html`'s `.eg` rule (its line 927,
 * `grid-template-columns: 52px minmax(0, 1fr) 72px 56px 124px`) and the
 * `.inner .tr` row metrics beside it (line 914: `margin: 0 -12px; padding: 8px
 * 12px; min-height: 52px`; line 919 for the header row, `margin: 0; padding:
 * 4px 0 6px; min-height: 32px`). The 24px column gap is `.tr`'s own
 * (line 535). The labels come from the card's header row, canvas lines
 * 1153–1156.
 *
 * A grid, like `admin-roster-table-layout.ts` and for the same reason: the
 * canvas draws one, and a five-track grid has no per-cell width that could
 * fall out of step with a separately-written header, so
 * `ADMIN_SCHEDULE_COLUMNS`' ORDER is the column order and nothing can
 * disagree with it.
 *
 * Data Table law 1 governs the rest: exactly one fluid cell (Event), every
 * other measure fixed so a date and a score start at the same x on every row,
 * Score and Result flush left in fixed tracks. Nothing is centred, and no
 * cell is right-aligned — nothing in this table is a measure compared down
 * its column.
 */

/** The five tracks, spelled once. */
export const GRID =
  "grid grid-cols-[52px_minmax(0,1fr)_72px_56px_124px] items-center gap-x-6";

/**
 * One event's line. The negative margin plus matching padding is the canvas'
 * 12px bleed into the card's 24px gutter, so a row's ink lines up with the
 * card title above it.
 *
 * No hover wash and no cursor, deliberately: this card is read-only — the
 * console has no event drawer and no score entry — and Data Table law 5 ties
 * the wash to a row action. A wash on a row that does nothing is a promise
 * the card cannot keep. The canvas' `.tr:hover` is drawn for the tables that
 * have one.
 */
export const ROW = `${GRID} -mx-3 min-h-[52px] px-3 py-2`;

/** The header row: the same tracks, no bleed, tighter. */
export const HEADER_ROW = `${GRID} min-h-8 pt-1 pb-1.5`;

/**
 * The header's labels, in row order — which IS the grid's column order.
 *
 * `Date · Event · Type · Score · Result`, verbatim from the canvas. This is
 * the program's own Schedule page (`Date · Event · Type · Venue · Lines ·
 * Score · Result`) with Venue and Lines dropped: an admin is asking how a
 * season went, not who travelled or how far through a dual is, and the two
 * facts the console does need — where the event was, and whether the lines
 * are in — are already in the Event cell's `vs`/`at` and in the Result word.
 * Dropping a column is allowed; merging one that a filter or sort acts on is
 * not, and this card has neither.
 */
export const ADMIN_SCHEDULE_COLUMNS: readonly string[] = [
  "Date",
  "Event",
  "Type",
  "Score",
  "Result",
];
