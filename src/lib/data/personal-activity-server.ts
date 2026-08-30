import { createClient } from "@/lib/supabase/server";

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
   * 12 evenly-spaced month ticks across the 52 columns, matching the design's
   * equal-flex label row. Real month names for the real window, not the mock's
   * hard-coded Sep→Aug.
   */
  monthLabels: string[];
}

const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayKey(d: Date): string {
  // Build the key from local Y/M/D rather than toISOString(): the stored match
  // `date` is bucketed the same string way in calculateHeatmap(), so a cell and
  // a match agree on the day regardless of the server's timezone offset.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function levelFor(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * The last 52 weeks of the viewer's **personal** match activity, bucketed by
 * day for the Home activity heatmap.
 *
 * Scope is `created_by = me AND program_id IS NULL` — the same personal
 * predicate the Matches list uses, so a coach's program uploads never leak into
 * a personal grid. The grid ends on the current week (its rightmost column), so
 * "today" sits in the last column the way a GitHub contribution graph does.
 */
export async function getPersonalActivity(
  userId: string
): Promise<PersonalActivity> {
  // Anchor: the Sunday of the current week, then walk back 51 weeks to the
  // grid's first column. Zero the time so day arithmetic can't drift across a
  // DST boundary mid-window.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startSunday = new Date(today);
  startSunday.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * DAYS_PER_WEEK);

  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("date")
    .eq("created_by", userId)
    .is("program_id", null)
    .gte("date", startSunday.toISOString());

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = (row.date as string).slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const days: ActivityDay[] = [];
  let sessionCount = 0;
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const cellDate = new Date(
        startSunday.getTime() + (w * DAYS_PER_WEEK + d) * MS_PER_DAY
      );
      // Future days in the current week have no matches yet — level 0, blank.
      const isFuture = cellDate.getTime() > today.getTime();
      const key = dayKey(cellDate);
      const count = isFuture ? 0 : counts.get(key) ?? 0;
      if (count > 0) sessionCount++;
      days.push({ date: key, count, level: levelFor(count) });
    }
  }

  // 12 equal ticks across the 52 columns — sample the month at each tick's week.
  const monthLabels: string[] = [];
  for (let i = 0; i < 12; i++) {
    const weekIndex = Math.floor((i * WEEKS) / 12);
    const sample = new Date(
      startSunday.getTime() + weekIndex * DAYS_PER_WEEK * MS_PER_DAY
    );
    monthLabels.push(MONTH_SHORT[sample.getMonth()]);
  }

  return { days, sessionCount, monthLabels };
}
