import type { CSSProperties } from "react";

/**
 * The Opponents tables' tracks and page frame — the personal table first, the
 * team table under its own heading below — shared by the populated table, the
 * loading skeleton and the day-zero ghost table: a ghost table never restates
 * its own geometry (`reference/tables.md` → Table page states).
 *
 * Personal: Opponent · Hand · Backhand · Record · Form · Last match · Result · Score
 *
 * No JSX here, so the skeleton and the day zero can import the grid without
 * pulling the table's client code with it.
 */

// Deviation from Data Table law 1 (2026-10-02, "the last column takes the slack"): the frame (`project/Main.dc.html`) puts the one fluid track FIRST, on Opponent, by the author's instruction.
// Last match is 96px, not the frame's 72px: at 72 the header truncated to "LAST MAT…" and a date carrying its year ("Jan 31, 2025") ran into Result.
export const OPPONENTS_GRID_TEMPLATE =
  "minmax(150px,1fr) minmax(92px,92px) minmax(92px,92px) 56px 72px 96px 60px 116px";

/**
 * The tracks beside the open drawer: Hand and Backhand collapsed to nothing —
 * the drawer states both under the name — so Score stays inside the card at
 * 1440 with the sidebar open. Same `minmax()` shape per track as the resting
 * template, so the browser can interpolate the shift (the Matches table's
 * `TEAM_LIST_GRID_COLS_COMPACT` arrangement).
 */
export const OPPONENTS_GRID_TEMPLATE_COMPACT =
  "minmax(150px,1fr) minmax(0px,0px) minmax(0px,0px) 56px 72px 96px 60px 116px";

export const OPPONENTS_GRID_COLS = {
  gridTemplateColumns: OPPONENTS_GRID_TEMPLATE,
} as const;

/**
 * A resting / compact track pair as the class and custom properties that
 * switch between them. Two custom properties and a class rather than one
 * inline `gridTemplateColumns`: the drawer only renders at `lg`, so the
 * collapse must be a breakpoint rule, and an inline style cannot carry one.
 */
function trackGrid(compact: boolean, rest: string, collapsed: string) {
  return {
    className: compact
      ? "[grid-template-columns:var(--opp-cols)] lg:[grid-template-columns:var(--opp-cols-compact)]"
      : "[grid-template-columns:var(--opp-cols)]",
    style: {
      "--opp-cols": rest,
      "--opp-cols-compact": collapsed,
    } as CSSProperties,
  };
}

/**
 * The live personal table's tracks, which compact beside the drawer. Spread
 * `style` on the element that takes `className`.
 */
export function opponentsGrid(compact: boolean) {
  return trackGrid(
    compact,
    OPPONENTS_GRID_TEMPLATE,
    OPPONENTS_GRID_TEMPLATE_COMPACT,
  );
}

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

/** `opponentsGrid` for the team table: same class, same two properties. */
export function teamOpponentsGrid(compact: boolean) {
  return trackGrid(
    compact,
    TEAM_OPPONENTS_GRID_TEMPLATE,
    TEAM_OPPONENTS_GRID_TEMPLATE_COMPACT,
  );
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
 * The tracks' own floor — 734px of minimums plus seven 16px gaps — so the card
 * scrolls rather than crushing a track. The frame writes 720px, which is
 * narrower than the tracks it holds and lets the last column spill past the
 * card's right inset.
 */
export const OPPONENTS_MIN_WIDTH = "min-w-[846px]";

/** The floor beside the open drawer: 550px of minimums plus the same gaps. */
export const OPPONENTS_MIN_WIDTH_COMPACT = "min-w-[846px] lg:min-w-[662px]";

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
