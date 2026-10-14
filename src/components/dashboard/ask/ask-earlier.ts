/**
 * "Earlier questions", arranged for the Ask rail: one group per calendar
 * month, newest month first.
 *
 * Pure on purpose — no React, no clock. "This year" is the newest year in the
 * list (or the one handed in), never `Date.now()`: the server's render and
 * the browser's must agree, and a spec must be able to hold the answer.
 *
 * Months and days are read in a zone the caller names — the workspace's
 * (`Workspace.timeZone`) — never the machine's own, for the same reason: the
 * server (UTC on Vercel) and the browser are handed the same string, so they
 * file a question under the same day. Read in UTC instead, a question asked
 * on the evening of Oct 12 in California was dated "Oct 13", and one asked on
 * a month's last evening was filed under the next month. A zone that is
 * missing or that `Intl` does not know reads as UTC rather than throwing.
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

/** The zone dates are read in when none is given, or the one given is bad. */
export const ASK_DEFAULT_TIME_ZONE = "UTC";

const PARTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The formatter for one zone, built once. The locale is fixed ("en-US") so
 * the parts read the same on every machine; an unknown zone makes `Intl`
 * throw a RangeError, which is answered with UTC's formatter.
 */
function formatterFor(
  timeZone: string | null | undefined,
): Intl.DateTimeFormat {
  const zone = timeZone || ASK_DEFAULT_TIME_ZONE;
  const known = formatters.get(zone);
  if (known) return known;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { ...PARTS, timeZone: zone });
  } catch {
    formatter =
      zone === ASK_DEFAULT_TIME_ZONE
        ? new Intl.DateTimeFormat("en-US", PARTS)
        : formatterFor(ASK_DEFAULT_TIME_ZONE);
  }
  formatters.set(zone, formatter);
  return formatter;
}

/** The calendar day `updatedAt` falls on in `timeZone`; `month` is 0-based. */
function zonedDay(
  updatedAt: string,
  timeZone: string | null | undefined,
): { year: number; month: number; day: number } | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  const read: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      read[part.type] = Number(part.value);
    }
  }
  const { year, month, day } = read;
  if (!Number.isFinite(year) || !(month >= 1 && month <= 12) || !(day >= 1)) {
    return null;
  }
  return { year, month: month - 1, day };
}

/**
 * Group rows by the month `updatedAt` falls in, read in `timeZone` (UTC when
 * omitted or not a zone `Intl` knows). Groups come out newest month
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
  timeZone?: string | null,
  currentYear?: number | null,
): AskMonthGroup<Row>[] {
  const dated = new Map<string, { year: number; month: number; rows: Row[] }>();
  const undated: Row[] = [];

  for (const row of rows) {
    const date = zonedDay(row.updatedAt, timeZone);
    if (!date) {
      undated.push(row);
      continue;
    }
    const { year, month } = date;
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
 * `2026-10-07T…` → `Oct 7`, the day it is in `timeZone` (UTC when omitted or
 * unknown); null when the date cannot be read. Never carries a year: the row
 * sits under a month label that does.
 */
export function askDayLabel(
  updatedAt: string,
  timeZone?: string | null,
): string | null {
  const date = zonedDay(updatedAt, timeZone);
  if (!date) return null;
  return `${MONTHS[date.month].slice(0, 3)} ${date.day}`;
}
