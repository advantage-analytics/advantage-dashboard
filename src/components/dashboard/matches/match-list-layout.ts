import { matchDayYear, utcToday } from "@/lib/data/match-day";

/**
 * The Matches table's tracks, shared by populated rows, draft rows, the loading
 * skeleton and the day-zero ghost table — every one must keep the same order.
 *
 * Personal: Date · Opponent · Result · Score · Event · lifecycle
 * Team:     Date · Player · Opponent · Result · Score · Event · lifecycle
 *
 * The outcome glyph comes BEFORE the score, in a fixed track, so it sits at one
 * x on every row ("✓ 6-4, 3-6").
 * After the score it floated: a three-set score is wider than a two-set one.
 * Event trails the numbers — the least-scanned text, and the widest.
 *
 * No track for the trailing mark. A match row opens the report and a draft
 * row its wizard (the row-click law, `tables.md` rule 3), so each carries a
 * 13px chevron — or, on a draft, the ⋯ that holds Discard — pinned to the
 * row's right edge. The lifecycle track reserves the room (`ROW_TRAIL_PAD`)
 * rather than the grid growing a track every header, skeleton and ghost row
 * would then have to draw empty.
 */
export const DATE_COL = "72px";
export const DATE_COL_WITH_YEAR = "84px";
/**
 * Wide enough for its own "RESULT" heading, which is wider than the glyph.
 * Exported for the tournament table (`schedule/tournament-detail.tsx`), which
 * draws the same Date and Result tracks so the two lists share their x's.
 */
export const RESULT_COL = "60px";
const SCORE_COL = "116px";

export const LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(186px,276px) ${RESULT_COL} ${SCORE_COL} minmax(150px,260px) minmax(124px,1fr)`,
} as const;
export const TEAM_LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(166px,1fr) minmax(130px,1fr) ${RESULT_COL} ${SCORE_COL} minmax(150px,1fr) minmax(124px,1fr)`,
} as const;
/** Minimum inner widths, so the card scrolls rather than crushing a track. */
export const LIST_MIN_WIDTH = "min-w-[804px]";
export const TEAM_LIST_MIN_WIDTH = "min-w-[920px]";

/**
 * The room a row's lifecycle cell leaves for the trailing mark: the 28px the
 * lifecycle track's floor grew by when the mark arrived (96 → 124).
 */
export const ROW_TRAIL_PAD = "pr-7";

/** Which tracks a row uses. */
export function listGridCols(scope: "personal" | "team") {
  return scope === "personal" ? LIST_GRID_COLS : TEAM_LIST_GRID_COLS;
}

/**
 * One header label per track, shared by `MatchesGrid` and the loading skeleton
 * so the two cannot drift. Analysis labels the trailing lifecycle track.
 */
export function listColumnLabels(scope: "personal" | "team"): string[] {
  if (scope === "personal") {
    return ["Date", "Opponent", "Result", "Score", "Event", "Analysis"];
  }
  return ["Date", "Player", "Opponent", "Result", "Score", "Event", "Analysis"];
}

export const LIST_ROW_FRAME = "grid items-center gap-x-4";

/**
 * Ten rows a page. The frame's footer is a range and one quiet "Older matches"
 * link (Platform Audit Pb2) — no page-size control, so the size is a constant
 * rather than a preference.
 */
export const MATCHES_PAGE_SIZE = 10;

/** What the loading skeleton needs to draw the first page at its real size. */
export interface MatchesListShape {
  /** Draft rows plus the first page's match rows. */
  rows: number;
  /** The Date track widens for the whole card — see `DATE_COL_WITH_YEAR`. */
  needsYear: boolean;
  /** A second page exists, so the footer carries its "Older matches" link. */
  paged: boolean;
}

/**
 * Whether any row's date prints with its year — the test that widens the Date
 * track, and exactly the rule each row's own formatter applies.
 *
 * Both lists hold calendar DAYS (`match-day.ts`): a match's date, and the
 * match day a draft has entered so far (null before it has one, which prints
 * as a dash and needs no year). Each year is read off the day and compared
 * with the UTC year `formatMatchDayShortYear` uses — the same answer on the
 * server and in every browser.
 */
export function datesNeedYear(
  matchDates: readonly string[],
  draftDays: readonly (string | null)[],
): boolean {
  const thisYear = Number(utcToday().slice(0, 4));
  const differs = (date: string | null) => {
    const year = matchDayYear(date);
    return year !== null && year !== thisYear;
  };
  return matchDates.some(differs) || draftDays.some(differs);
}

/**
 * The first, unfiltered page's shape, from the dates alone. `matchDates` must
 * already be newest first — the list's default order.
 */
export function matchesListShape(
  matchDates: string[],
  draftDays: (string | null)[],
): MatchesListShape {
  const firstPage = matchDates.slice(0, MATCHES_PAGE_SIZE);
  return {
    rows: draftDays.length + firstPage.length,
    needsYear: datesNeedYear(firstPage, draftDays),
    paged: matchDates.length > MATCHES_PAGE_SIZE,
  };
}

/**
 * The column shift beside a peek drawer: the rail's own 200ms and curve
 * (`roster-drawer-in`), so tracks and rail read as one movement. `min-width`
 * rides along, or the card's scroll floor would snap mid-glide. Reduced motion
 * drops it (`.matches-track-shift` in globals.css). The Matches table no
 * longer has a rail to follow; the Opponents tables, which do, still use it.
 */
export const LIST_TRACK_TRANSITION =
  "matches-track-shift transition-[grid-template-columns,min-width,background-color] duration-200 ease-[var(--ease-primary)]";
