export const COL = {
  request: "min-w-0 flex-1",
  emailCheck: "w-[140px] shrink-0",
  received: "w-[100px] shrink-0",
} as const;

export const ROW = "flex items-center gap-4";

/**
 * The header row's labels and the column each sits over, in row order
 * (Requests2: Request · Email check · Received).
 *
 * Exported alongside `COL` so the header draws the real words rather than a
 * copy that agrees with them today — same reasoning as
 * `teams-table-layout.ts`'s `TEAMS_COLUMNS`. Request is the table's one fluid
 * cell (Data Table law 1): the person, their role and the program under
 * them all truncate, so it absorbs whatever width the fixed columns leave.
 */
export const REQUESTS_COLUMNS: readonly {
  label: string;
  col: string;
}[] = [
  { label: "Request", col: COL.request },
  { label: "Email check", col: COL.emailCheck },
  { label: "Received", col: COL.received },
];
