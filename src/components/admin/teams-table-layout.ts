/**
 * Column tracks for the Admin › Teams table — Teams2's grid
 * `minmax(260px,1.6fr) 84px 100px 44px 64px 84px minmax(150px,1fr) 13px` as
 * flex widths. Team and Owner are the two fluid cells, sharing the slack
 * 1.6 : 1 like the board.
 */
export const COL = {
  team: "min-w-[260px] flex-[1.6]",
  division: "w-[84px] shrink-0",
  conference: "w-[100px] shrink-0",
  state: "w-[44px] shrink-0",
  members: "w-[64px] shrink-0",
  plan: "w-[84px] shrink-0",
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
