/**
 * Column tracks for the Admin › Conferences table.
 *
 * Conferences2's grid is `minmax(240px,1fr) 84px 56px 160px 48px 13px`; these
 * are the same tracks as flex widths, the shape `requests-table-layout.ts`
 * and `teams-table-layout.ts` use. Conference is the one fluid cell (Data
 * Table law 1). Teams and Pilot are counts compared down their columns, so
 * they sit flush right; On Advantage is "5 of 18" over a thin bar, read left
 * to right like the board.
 */
export const COL = {
  conference: "min-w-[240px] flex-1",
  division: "w-[84px] shrink-0",
  teams: "w-[56px] shrink-0 text-right",
  onAdvantage: "w-[160px] shrink-0",
  pilot: "w-[48px] shrink-0 text-right",
  chevron: "w-[13px] shrink-0",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` so the header draws the real words rather than a
 * copy that agrees with them today — same reasoning as
 * `teams-table-layout.ts`'s `TEAMS_COLUMNS`. Alignment is already carried by
 * each `COL` entry, so no separate `align` flag is needed here.
 */
export const CONFERENCES_COLUMNS: readonly {
  label: string;
  col: string;
}[] = [
  { label: "Conference", col: COL.conference },
  { label: "Division", col: COL.division },
  { label: "Teams", col: COL.teams },
  { label: "On Advantage", col: COL.onAdvantage },
  { label: "Pilot", col: COL.pilot },
  { label: "", col: COL.chevron },
];

/**
 * The DOM id of one row, for the drawer's selection machine: returning focus
 * to the row it closed from and scrolling the next one into view on `↑`/`↓`.
 * Mirrors `requestRowId` in `requests-table.tsx`.
 */
export function conferenceRowId(id: string): string {
  return `admin-conference-${id}`;
}
