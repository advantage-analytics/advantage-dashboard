import type { CSSProperties } from "react";

/**
 * The Opponents tables' tracks and page frame — the personal table first, the
 * team table under its own heading below — shared by the populated table, the
 * loading skeleton and the day-zero ghost table: a ghost table never restates
 * its own geometry (`reference/tables.md` → Table page states).
 *
 * Personal: Opponent · Plays · Record · Last match
 *
 * No JSX here, so the skeleton and the day zero can import the grid without
 * pulling the table's client code with it.
 */

// Deviation from Data Table law 1 (2026-10-02, "the last column takes the slack"): the frame (`project/Main.dc.html`) puts the one fluid track FIRST, on Opponent, by the author's instruction.
/**
 * Four tracks, the team table's own widths for the three merged cells
 * (`opponent-cells.tsx`): Plays 150px ("Right · Two-handed"), Record 100px
 * (the figure beside its five ticks), Last match 220px (date · result ·
 * score, a three-set score with a tiebreak whole).
 *
 * Nothing collapses beside the drawer, because the floor fits either way:
 * 160 + 150 + 100 + 220 = 630px of minimums, plus three 16px gaps = 678px.
 * At 1440 with the 232px sidebar the column is 1208px, less its 2 × 56px
 * padding and the card's 2 × 24px inset = 1048px inside the card; the 340px
 * drawer leaves 708px. 678 ≤ 708, so the open drawer only takes Opponent's
 * slack (530px → 190px) and the score is never clipped.
 */
export const OPPONENTS_GRID_TEMPLATE = "minmax(160px,1fr) 150px 100px 220px";

export const OPPONENTS_GRID_COLS = {
  gridTemplateColumns: OPPONENTS_GRID_TEMPLATE,
} as const;

/* ── The team table ──────────────────────────────────────────────────────── */

/**
 * Opponent · Program · Faced by · Plays · Record · Last match
 *
 * Six tracks at rest, one line per row. As on the personal table the one fluid
 * track is the first, Opponent; Program is bounded (120–180px) so a long
 * school name truncates instead of pushing Faced by off its x.
 */
export const TEAM_OPPONENTS_GRID_TEMPLATE =
  "minmax(160px,1fr) minmax(120px,180px) 124px 150px 100px 220px";

/**
 * Beside the open drawer Program and Plays slide shut — the drawer states both
 * under the name — and the other four keep their order and content. The same
 * six tracks, so the browser can interpolate the shift.
 */
export const TEAM_OPPONENTS_GRID_TEMPLATE_COMPACT =
  "minmax(160px,1fr) minmax(0px,0px) 124px 0px 100px 220px";

export const TEAM_OPPONENTS_GRID_COLS = {
  gridTemplateColumns: TEAM_OPPONENTS_GRID_TEMPLATE,
} as const;

/**
 * The live team table's tracks as the class and custom properties that switch
 * between resting and compact. Two custom properties and a class rather than
 * one inline `gridTemplateColumns`: the drawer only renders at `lg`, so the
 * collapse must be a breakpoint rule, and an inline style cannot carry one.
 * Spread `style` on the element that takes `className`.
 */
export function teamOpponentsGrid(compact: boolean) {
  return {
    className: compact
      ? "[grid-template-columns:var(--opp-cols)] lg:[grid-template-columns:var(--opp-cols-compact)]"
      : "[grid-template-columns:var(--opp-cols)]",
    style: {
      "--opp-cols": TEAM_OPPONENTS_GRID_TEMPLATE,
      "--opp-cols-compact": TEAM_OPPONENTS_GRID_TEMPLATE_COMPACT,
    } as CSSProperties,
  };
}

/** One header label per team track, in track order. */
export const TEAM_OPPONENTS_COLUMNS = [
  "Opponent",
  "Program",
  "Faced by",
  "Plays",
  "Record",
  "Last match",
] as const;

/** The team tracks' floor: 874px of minimums plus five 16px gaps. */
export const TEAM_OPPONENTS_MIN_WIDTH = "min-w-[954px]";

/** The floor beside the open drawer: 604px of minimums plus the same gaps. */
export const TEAM_OPPONENTS_MIN_WIDTH_COMPACT =
  "min-w-[954px] lg:min-w-[684px]";

/** Which of the two tables a shared piece — header, skeleton, ghost — draws. */
export type OpponentsScope = "personal" | "team";

/** The row's grid and its 16px column gap; header, rows and ghost rows alike. */
export const OPPONENTS_ROW_FRAME = "grid items-center gap-x-4";

/** One header label per track, in track order. */
export const OPPONENTS_COLUMNS = [
  "Opponent",
  "Plays",
  "Record",
  "Last match",
] as const;

/** The table card's inset: 2px above the header, 24px sides, 6px under the rows. */
export const OPPONENTS_CARD_PADDING = "2px 24px 6px";

/**
 * The tracks' own floor — 630px of minimums plus three 16px gaps (the
 * arithmetic is on `OPPONENTS_GRID_TEMPLATE`) — so a narrow window scrolls the
 * card rather than crushing a track. The same floor with the drawer open.
 */
export const OPPONENTS_MIN_WIDTH = "min-w-[678px]";

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
