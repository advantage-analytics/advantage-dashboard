import type { CSSProperties, KeyboardEvent } from "react";

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
 * (`opponent-cells.tsx`): Plays 130px ("Right · Two-handed"), Record 92px
 * (the figure beside its five ticks), Last match 190px (date · result ·
 * score, "Nov 12 ✓ 6-4, 3-6, 7-5" whole; a longer tiebreak score truncates).
 *
 * The floor: 160 + 130 + 92 + 190 = 572px of minimums, plus three 16px gaps
 * = 620px. At 1440 with the 232px sidebar the column is 1208px, less its
 * 2 × 56px padding and the card's 2 × 24px inset = 1048px inside the card; the
 * 340px drawer leaves 708px. 620 ≤ 708, so the open drawer only takes
 * Opponent's slack and the score is never clipped. At 1280 the card has 888px
 * at rest; with the drawer open (548px) the card scrolls rather than crushing.
 */
export const OPPONENTS_GRID_TEMPLATE = "minmax(160px,1fr) 130px 92px 190px";

export const OPPONENTS_GRID_COLS = {
  gridTemplateColumns: OPPONENTS_GRID_TEMPLATE,
} as const;

/* ── The team table ──────────────────────────────────────────────────────── */

/**
 * Opponent · Program · Faced by · Plays · Record · Last match
 *
 * Six tracks at rest, one line per row. As on the personal table the one fluid
 * track is the first, Opponent; Program is bounded (120–160px) so a long
 * school name truncates instead of pushing Faced by off its x.
 *
 * Sized to fit a 1280 laptop with the sidebar pinned: the card has 888px
 * inside there, and the floor (`TEAM_OPPONENTS_MIN_WIDTH`) is 886px, so the
 * whole row — the Last match score included — shows without a sideways scroll.
 */
export const TEAM_OPPONENTS_GRID_TEMPLATE =
  "minmax(150px,1fr) minmax(120px,160px) 124px 130px 92px 190px";

/**
 * Beside the open drawer Program and Plays slide shut — the drawer states both
 * under the name — and the other four keep their order and content. The same
 * six tracks, so the browser can interpolate the shift.
 */
export const TEAM_OPPONENTS_GRID_TEMPLATE_COMPACT =
  "minmax(150px,1fr) minmax(0px,0px) 124px 0px 92px 190px";

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

/** The team tracks' floor: 806px of minimums plus five 16px gaps. */
export const TEAM_OPPONENTS_MIN_WIDTH = "min-w-[886px]";

/** The floor beside the open drawer: 556px of minimums plus the same gaps. */
export const TEAM_OPPONENTS_MIN_WIDTH_COMPACT =
  "min-w-[886px] lg:min-w-[636px]";

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
 * The tracks' own floor — 572px of minimums plus three 16px gaps (the
 * arithmetic is on `OPPONENTS_GRID_TEMPLATE`) — so a narrow window scrolls the
 * card rather than crushing a track. The same floor with the drawer open.
 */
export const OPPONENTS_MIN_WIDTH = "min-w-[620px]";

/** A 52px row, washed on an 8px-inset rounded box: 24px card inset − 16px. */
export const OPPONENTS_ROW_BOX =
  "-mx-4 h-[52px] rounded-[var(--radius-element)] px-4";

/**
 * The row's hover, focus and selected wash. A form bar has a hover of its own
 * (`data-own-hover`) and takes the row's wash away while it holds the pointer,
 * so one hover shows at a time; a selected row keeps its wash regardless.
 * `group/row` is what the Last match chevron fades in with.
 */
export function opponentRowWash(selected: boolean): string {
  return selected
    ? "group/row bg-[var(--surface-muted)] focus-visible:outline-none"
    : "group/row hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none [&:has([data-own-hover]:hover)]:bg-transparent";
}

/**
 * What makes a row the drawer's control, for both tables: a click opens it, and
 * so does Enter or Space with the row itself focused, never from a link inside.
 * `viaKeyboard` lets the drawer take focus for someone who cannot click into it.
 */
export function opponentRowControl(
  key: string,
  selected: boolean,
  onToggle: (key: string, viaKeyboard: boolean) => void,
) {
  return {
    role: "row",
    tabIndex: 0,
    "aria-current": selected ? ("true" as const) : undefined,
    onClick: () => onToggle(key, false),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle(key, true);
      }
    },
  };
}

/**
 * The page's white ground, and the padded column inside it. Two elements, not
 * one, so the opponent drawer can sit beside the column flush to the right
 * edge — the Matches and Roster arrangement.
 */
export const OPPONENTS_PAGE_FRAME =
  "flex w-full flex-1 bg-[var(--surface-card)]";
export const OPPONENTS_PAGE_COLUMN =
  "flex min-w-0 flex-1 flex-col px-8 pt-5 pb-8 xl:px-14";

/** The gap between title row, toolbar, card and footer. */
export const OPPONENTS_PAGE_GAP = "gap-[18px]";
