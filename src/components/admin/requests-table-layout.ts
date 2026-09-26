export const COL = {
  date: "w-[72px] shrink-0",
  team: "w-[220px] shrink-0",
  for: "w-[140px] shrink-0",
  from: "min-w-0 flex-1",
  emailCheck: "w-[180px] shrink-0",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order.
 *
 * Exported alongside `COL` so the header draws the real words rather than a
 * copy that agrees with them today — same reasoning as
 * `teams-table-layout.ts`'s `TEAMS_COLUMNS`. From is the table's one fluid
 * cell (Data Table law 1): it carries a name and an email that both truncate,
 * so it is the column that absorbs whatever width the fixed columns leave
 * behind.
 */
export const REQUESTS_COLUMNS: readonly {
  label: string;
  col: string;
}[] = [
  { label: "Date", col: COL.date },
  { label: "Team", col: COL.team },
  { label: "For", col: COL.for },
  { label: "From", col: COL.from },
  { label: "Email check", col: COL.emailCheck },
];
