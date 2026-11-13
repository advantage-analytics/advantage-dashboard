/**
 * Column tracks for the Admin › Teams table — AdminTeams's grid (Program ·
 * Members · Video hours this month · Owner · chevron) as flex widths.
 *
 * Video hours is the one fluid cell (Data Table law 1): its bar grows with the
 * page from a 160px floor to a 360px cap, so on a wide screen the row reads
 * edge to edge instead of pooling a dead band after Owner, and every bar is
 * drawn on one scale because every row's track is the same width. The cap
 * keeps a 6px meter from turning into a rule across the card; past it (a
 * viewport of about 1350 and up — 89px of it at 1440) the remaining slack lands at the end of Owner, before the
 * chevron (`ml-auto`) — the last column takes the slack, never the gap
 * between a program and its numbers.
 *
 * Program is bounded, not fluid: it rests at 480px, enough for a full program
 * name ("University of California, Los Angeles Women's Tennis") with the
 * Approve chip beside it, and gives way down to 300px only when the card is
 * too narrow for the bar's floor. Members and Owner are fixed tracks, so a
 * member count, the start of every hours bar and every owner sit at one x on
 * every row. Division, conference and squad are no longer columns: they read
 * as the facts line under the program's name.
 */
export const COL = {
  program: "w-[480px] min-w-[300px] shrink",
  members: "w-[72px] shrink-0",
  hours: "min-w-[160px] max-w-[360px] flex-1",
  owner: "w-[200px] shrink-0",
  chevron: "ml-auto w-[13px] shrink-0",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` so the header draws the real words rather than a
 * copy that agrees with them today — the same reasoning as
 * `roster-table-layout.ts`'s `ROSTER_COLUMNS`. The chevron's track is drawn
 * by the table itself, unlabelled.
 */
export const TEAMS_COLUMNS: readonly {
  label: string;
  col: string;
  /** Members is the one count compared down its column — flush right. */
  align?: "right";
}[] = [
  { label: "Program", col: COL.program },
  { label: "Members", col: COL.members, align: "right" },
  { label: "Video hours this month", col: COL.hours },
  { label: "Owner", col: COL.owner },
];
