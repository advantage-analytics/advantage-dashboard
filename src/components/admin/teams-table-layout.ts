/**
 * Column tracks for the Admin › Teams table — AdminTeams's grid (Program ·
 * Members · Video hours this month · Owner · chevron) as flex widths.
 *
 * Program is the one flexible cell: a full program name ("University of
 * California, Los Angeles Women's Tennis") is the longest thing in the row
 * and the one a reader needs whole. It grows from 300px to a 480px cap, so on
 * a wide screen the slack lands after Owner, before the chevron (`ml-auto`),
 * and never between a program and its numbers (Data Table law 1). Members,
 * the hours cell and Owner are fixed tracks, so a member count, the start of
 * every hours bar and every owner sit at one x on every row. Division,
 * conference and squad are no longer columns: they read as the facts line
 * under the program's name.
 */
export const COL = {
  program: "min-w-[300px] max-w-[480px] flex-1",
  members: "w-[72px] shrink-0",
  hours: "w-[220px] shrink-0",
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
