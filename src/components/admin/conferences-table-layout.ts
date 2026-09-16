/**
 * Column tracks for the Admin › Conferences table.
 *
 * The frame's grid is `minmax(0,1fr) 64px 56px 104px 48px`; these are the same
 * tracks as flex widths, the shape `requests-table-layout.ts` and
 * `teams-table-layout.ts` use. Conference is the one fluid cell (Data Table
 * law 1). The three counts are measures compared down their columns, so they
 * sit flush right — header and value on one x.
 */
export const COL = {
  conference: "min-w-0 flex-1",
  division: "w-[64px] shrink-0",
  teams: "w-[56px] shrink-0 text-right",
  onAdvantage: "w-[104px] shrink-0 text-right",
  pilot: "w-[48px] shrink-0 text-right",
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
];

/**
 * The DOM id of one row, for the drawer's selection machine: returning focus
 * to the row it closed from and scrolling the next one into view on `↑`/`↓`.
 * Mirrors `requestRowId` in `requests-table.tsx`.
 */
export function conferenceRowId(id: string): string {
  return `admin-conference-${id}`;
}
