export const COL = {
  team: "w-[220px] shrink-0",
  division: "w-[100px] shrink-0",
  conference: "w-[160px] shrink-0",
  state: "w-10 shrink-0",
  members: "w-12 shrink-0",
  plan: "w-20 shrink-0",
  owner: "min-w-0 flex-1",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` so the header draws the real words rather than a
 * copy that agrees with them today — the same reasoning as
 * `roster-table-layout.ts`'s `ROSTER_COLUMNS`. Owner is the table's one fluid
 * cell (Data Table law 1) and needs no separate spacer entry: its own column
 * class already takes the slack.
 */
export const TEAMS_COLUMNS: readonly {
  label: string;
  col: string;
  /** Members is the one measure compared down its column — flush right. */
  align?: "right";
}[] = [
  { label: "Team", col: COL.team },
  { label: "Division", col: COL.division },
  { label: "Conference", col: COL.conference },
  { label: "State", col: COL.state },
  { label: "Members", col: COL.members, align: "right" },
  { label: "Plan", col: COL.plan },
  { label: "Owner", col: COL.owner },
];
