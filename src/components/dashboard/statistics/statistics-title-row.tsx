import type { StatisticsMatch } from "@/lib/data/statistics";
import { StatisticsTitleFrame } from "./statistics-layout";

/**
 * "22 analyzed matches · Jan 18 – Sep 28 · 14 won" — the page's one line of
 * facts, over every analyzed match rather than the filtered set: the title
 * says what the page holds, the controls row says how much of it is on
 * screen.
 */

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DAY_AND_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A match date as a UTC instant. `matches.date` is a calendar date with no
 * zone, so it is read and printed in UTC — parsed as local time it prints as
 * the day before anywhere west of Greenwich.
 */
function parseDate(date: string): Date | null {
  const parsed = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * "Jan 18 – Sep 28", or null when no match carries a date.
 *
 * The year is printed only where the reader could not supply it: a range
 * inside the current year has none, one that ended in an earlier year names
 * it once, and one that crosses a year names both ends.
 */
export function statisticsDateRange(
  matches: readonly Pick<StatisticsMatch, "date">[],
  now: Date = new Date(),
): string | null {
  // Oldest → newest already; undated rows sort first and are skipped.
  const dated = matches
    .map((match) => (match.date ? parseDate(match.date) : null))
    .filter((date): date is Date => date !== null);
  if (dated.length === 0) return null;
  const first = dated[0];
  const last = dated[dated.length - 1];
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const thisYear = last.getUTCFullYear() === now.getUTCFullYear();

  if (DAY_AND_YEAR.format(first) === DAY_AND_YEAR.format(last)) {
    return (thisYear ? DAY : DAY_AND_YEAR).format(last);
  }
  if (!sameYear) {
    return `${DAY_AND_YEAR.format(first)} – ${DAY_AND_YEAR.format(last)}`;
  }
  return `${DAY.format(first)} – ${(thisYear ? DAY : DAY_AND_YEAR).format(last)}`;
}

export function statisticsSummary(
  matches: readonly Pick<StatisticsMatch, "date" | "won">[],
  now?: Date,
): string {
  const count = matches.length;
  const won = matches.filter((match) => match.won === true).length;
  return [
    `${count} analyzed ${count === 1 ? "match" : "matches"}`,
    statisticsDateRange(matches, now),
    `${won} won`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function StatisticsTitleRow({
  matches,
}: {
  matches: readonly Pick<StatisticsMatch, "date" | "won">[];
}) {
  return (
    <StatisticsTitleFrame>
      <span className="text-body-sm tabular">{statisticsSummary(matches)}</span>
    </StatisticsTitleFrame>
  );
}
