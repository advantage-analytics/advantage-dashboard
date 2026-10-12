/**
 * "Earlier questions", arranged for the Ask rail: one group per calendar
 * month, newest month first.
 *
 * Pure on purpose — no React, no clock. "This year" is the newest year in the
 * list (or the one handed in), never `Date.now()`: the server's render and
 * the browser's must agree, and a spec must be able to hold the answer.
 * Months and days are read in UTC for the same reason — a question asked at
 * 23:30 on the 31st is in one month on every machine.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface AskMonthGroup<Row> {
  /** `2026-10`, or `""` for rows whose date could not be read. */
  key: string;
  /** "October", or "December 2025" when it is not this year's. */
  label: string;
  rows: Row[];
}

/** What the rail calls the group of rows with no readable date. */
export const ASK_UNDATED_LABEL = "Undated";

function parse(updatedAt: string): Date | null {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Group rows by the UTC month of `updatedAt`. Groups come out newest month
 * first whatever order the rows arrive in; inside a group the rows keep the
 * order they were given (the loader's: most recently used first). A row whose
 * date cannot be read is kept — a question nobody can reach is worse than one
 * filed oddly — in a last group of its own.
 *
 * `currentYear` defaults to the newest year among the rows, so a list that is
 * all last year's still reads "November", "October" without a year on every
 * label.
 */
export function askMonthGroups<Row extends { updatedAt: string }>(
  rows: readonly Row[],
  currentYear?: number | null,
): AskMonthGroup<Row>[] {
  const dated = new Map<string, { year: number; month: number; rows: Row[] }>();
  const undated: Row[] = [];

  for (const row of rows) {
    const date = parse(row.updatedAt);
    if (!date) {
      undated.push(row);
      continue;
    }
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const group = dated.get(key);
    if (group) group.rows.push(row);
    else dated.set(key, { year, month, rows: [row] });
  }

  const ordered = [...dated.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  const thisYear = currentYear ?? ordered[0]?.[1].year ?? null;

  const groups: AskMonthGroup<Row>[] = ordered.map(([key, group]) => ({
    key,
    label:
      group.year === thisYear
        ? MONTHS[group.month]
        : `${MONTHS[group.month]} ${group.year}`,
    rows: group.rows,
  }));
  if (undated.length > 0) {
    groups.push({ key: "", label: ASK_UNDATED_LABEL, rows: undated });
  }
  return groups;
}

/**
 * `2026-10-07T…` → `Oct 7`, in UTC; null when the date cannot be read. Never
 * carries a year: the row sits under a month label that does.
 */
export function askDayLabel(updatedAt: string): string | null {
  const date = parse(updatedAt);
  if (!date) return null;
  return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}
