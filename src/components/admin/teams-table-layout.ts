/**
 * Column tracks for the Admin › Teams table — AdminTeams's grid (Program ·
 * Members · Video hours this month · Owner · chevron) as flex widths.
 *
 * Program, Members and the hours cell are fixed tracks, so a member count and
 * the start of every hours bar sit at one x on every row; Owner is the one
 * fluid cell and, being last, takes the slack (Data Table law 1). Division,
 * conference and squad are no longer columns: they read as the facts line
 * under the program's name.
 */
export const COL = {
  program: "w-[300px] shrink-0",
  members: "w-[72px] shrink-0",
  hours: "w-[220px] shrink-0",
  owner: "min-w-[150px] flex-1",
  chevron: "w-[13px] shrink-0",
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
