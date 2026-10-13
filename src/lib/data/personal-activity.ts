import { matchDay } from "@/lib/data/match-day";

/**
 * One day-cell of the personal-Home activity heatmap (the "Activity" widget on
 * the Personal Home & Matches canvas, artboard 1b `activityUnderMatches`).
 *
 * `level` is the density bucket the cell paints with — index into
 * `--viz-heatmap-0..3`, the DS's sanctioned calendar ramp (SKILL.md "Heatmap
 * Gradient"). 0 = no match that day, 1 = one, 2 = two, 3 = three or more.
 */
export interface ActivityDay {
  /** `YYYY-MM-DD` — the calendar day the cell represents. */
  date: string;
  /** Matches the viewer played that day. */
  count: number;
  level: 0 | 1 | 2 | 3;
}

export interface PersonalActivity {
  /**
   * 52 weeks × 7 days = 364 cells in **column-major** order (week by week, each
   * week Sunday→Saturday). That is the order a CSS grid with
   * `grid-auto-flow: column` and `grid-template-rows: repeat(7,1fr)` fills, so
   * the widget can map this array straight onto the grid children.
   */
  days: ActivityDay[];
  /** Active days in the window — how many days carry at least one match. */
  sessionCount: number;
  /**
   * The 12 most recent calendar months the 52-week window touches, oldest
   * first, one label each — laid across the design's equal-flex label row.
   * Real month names for the real window, not the mock's hard-coded Sep→Aug.
   */
  monthLabels: string[];
}

const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The grid is a calendar of DAYS, and every cell is a UTC midnight: built with
 * `Date.UTC`, stepped in whole 24-hour days, and read back with the UTC
 * getters. A match's day is the UTC date part of `matches.date`
 * (`match-day.ts`), so a cell and the matches counted into it are named on the
 * same ruler, and "today" is the UTC day that module's labels use.
 *
 * It used to be built on the runtime's local midnight and local getters. That
 * is the same grid on Vercel (UTC) and a different one everywhere else: the
 * day-zero page draws this in the browser, so its "today" column could differ
 * from the server's, and stepping 24 hours from a local midnight names one
 * day twice and skips another across a DST change.
 */
function utcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function levelFor(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * The grid's first cell: the Sunday 51 weeks before this week's, at 00:00 UTC.
 * The grid ends on the current week (its rightmost column), so "today" sits in
 * the last column the way a GitHub contribution graph does.
 *
 * Its ISO string is also the query's lower bound, and a UTC midnight is the
 * one bound that keeps every match of that first day — a match's day is the
 * UTC date part of its stored value, whatever time rides along with it.
 */
export function activityWindowStart(now: Date = new Date()): Date {
  const today = utcMidnight(now);
  const startSunday = new Date(today);
  startSunday.setUTCDate(
    today.getUTCDate() - today.getUTCDay() - (WEEKS - 1) * DAYS_PER_WEEK,
  );
  return startSunday;
}

/**
 * The heatmap for a set of match dates — pure, so a client fallback can draw
 * the empty grid (`personalActivityFrom([])`) the page would draw.
 */
export function personalActivityFrom(
  matches: { date: string | null }[],
  now: Date = new Date(),
): PersonalActivity {
  const today = utcMidnight(now);
  const startSunday = activityWindowStart(now);

  const counts = new Map<string, number>();
  for (const row of matches) {
    const key = matchDay(row.date);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const days: ActivityDay[] = [];
  let sessionCount = 0;
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const cellDate = new Date(
        startSunday.getTime() + (w * DAYS_PER_WEEK + d) * MS_PER_DAY,
      );
      // Future days in the current week have no matches yet — level 0, blank.
      const isFuture = cellDate.getTime() > today.getTime();
      const key = dayKey(cellDate);
      const count = isFuture ? 0 : (counts.get(key) ?? 0);
      if (count > 0) sessionCount++;
      days.push({ date: key, count, level: levelFor(count) });
    }
  }

  // One label per calendar month the window touches, oldest first. 52 weeks
  // cross 12 or 13 month boundaries and the label row has 12 equal-flex slots,
  // so when a 13th month appears the oldest — the partial one the window
  // starts inside — is the one dropped. This used to sample the month at 12
  // equal week ticks instead, which named the same month twice whenever a
  // five-week month straddled two ticks ("Jan Jan") and skipped the next.
  const months: string[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const sample = new Date(
      startSunday.getTime() + w * DAYS_PER_WEEK * MS_PER_DAY,
    );
    const label = MONTH_SHORT[sample.getUTCMonth()];
    if (months[months.length - 1] !== label) months.push(label);
  }
  const monthLabels = months.slice(-12);

  return { days, sessionCount, monthLabels };
}
