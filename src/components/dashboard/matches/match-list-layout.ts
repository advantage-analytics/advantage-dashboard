/**
 * The Matches table's tracks, shared by populated rows, draft rows, the loading
 * skeleton and the day-zero ghost table — every one must keep the same order.
 *
 * Personal: Date · Opponent · Result · Score · Event · lifecycle
 * Team:     Date · Player · Opponent · Result · Score · Event · lifecycle
 *
 * The outcome glyph comes BEFORE the score, in a fixed track, so it sits at one
 * x on every row and reads the way the match drawer draws it ("✓ 6-4, 3-6").
 * After the score it floated: a three-set score is wider than a two-set one.
 * Event trails the numbers — the least-scanned text, the widest, often blank
 * for practice — and is the column the team table collapses while the drawer
 * is open (`TEAM_LIST_GRID_COLS_COMPACT`); the drawer names the event instead.
 *
 * No chevron track: a row opens the peek drawer rather than travelling. No ⋯
 * track either: Edit and Delete live in the drawer's header, one click away,
 * and the table only renders at `lg`, which is where the drawer renders too.
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
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(186px,276px) ${RESULT_COL} ${SCORE_COL} minmax(150px,260px) minmax(96px,1fr)`,
} as const;
export const TEAM_LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(166px,1fr) minmax(130px,1fr) ${RESULT_COL} ${SCORE_COL} minmax(150px,1fr) minmax(96px,1fr)`,
} as const;
/**
 * The team tracks beside the open drawer: Event collapsed to nothing.
 *
 * Collapsed, not removed. The track list keeps the wide table's seven tracks,
 * each in the same `minmax()` shape, so the browser can interpolate
 * `grid-template-columns` between the two (`LIST_TRACK_TRANSITION`) and the
 * columns glide in step with the rail. A six-track list cannot interpolate
 * against seven, so the table jumped in one frame and then crept as the
 * rail's width animated. Its leftover 16px gap is absorbed by lifecycle's 1fr.
 */
export const TEAM_LIST_GRID_COLS_COMPACT = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(156px,1fr) minmax(130px,1fr) ${RESULT_COL} ${SCORE_COL} minmax(0px,0fr) minmax(96px,1fr)`,
} as const;

/** Minimum inner widths, so the card scrolls rather than crushing a track. */
export const LIST_MIN_WIDTH = "min-w-[776px]";
export const TEAM_LIST_MIN_WIDTH = "min-w-[892px]";
export const TEAM_LIST_MIN_WIDTH_COMPACT = "min-w-[728px]";

/** Which tracks a row uses: the scope, and whether the team drawer is open. */
export function listGridCols(scope: "personal" | "team", compact = false) {
  if (scope === "personal") return LIST_GRID_COLS;
  return compact ? TEAM_LIST_GRID_COLS_COMPACT : TEAM_LIST_GRID_COLS;
}

/**
 * One header label per track, shared by `MatchesGrid` and the loading skeleton
 * so the two cannot drift. Analysis labels the trailing lifecycle track;
 * Event stays in the
 * team header beside the drawer, fading with the cells under it.
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
 * The first, unfiltered page's shape, from the dates alone. `matchDates` must
 * already be newest first — the list's default order.
 */
export function matchesListShape(
  matchDates: string[],
  draftDates: string[],
): MatchesListShape {
  const firstPage = matchDates.slice(0, MATCHES_PAGE_SIZE);
  const thisYear = new Date().getFullYear();
  return {
    rows: draftDates.length + firstPage.length,
    needsYear: [...draftDates, ...firstPage].some(
      (date) => new Date(date).getFullYear() !== thisYear,
    ),
    paged: matchDates.length > MATCHES_PAGE_SIZE,
  };
}

/**
 * The column shift beside the drawer: the rail's own 200ms and curve
 * (`roster-drawer-in`), so tracks and rail read as one movement. `min-width`
 * rides along, or the card's scroll floor would snap mid-glide; the
 * background colour keeps the rows' hover wash easing as before. Reduced
 * motion drops both (`.matches-track-shift` in globals.css).
 */
export const LIST_TRACK_TRANSITION =
  "matches-track-shift transition-[grid-template-columns,min-width,background-color] duration-200 ease-[var(--ease-primary)]";

/**
 * The Event cell's fade: out quickly as the rail arrives, back in once the
 * track has mostly reopened on close — never text squeezed through a
 * narrowing track.
 */
export function eventCellFade(compact: boolean): string {
  return compact
    ? "pointer-events-none opacity-0 transition-opacity duration-100"
    : "opacity-100 transition-opacity duration-150 delay-100";
}
