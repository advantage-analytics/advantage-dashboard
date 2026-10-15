import { formatMatchDayMedium } from "@/lib/data/match-day";

/**
 * `match.date` ("August 2, 2026") → the page's short-month form ("Aug 2, 2026").
 *
 * The label is read back by `match-day.ts`'s month table, not by
 * `new Date(label)`: the day the server printed is the day this prints, in
 * every zone and every browser's date parser.
 */
export function shortMonthDate(displayDate: string): string {
  return formatMatchDayMedium(displayDate);
}

/**
 * Whole seconds → a mono machine-value clock reading — "44:28" by default,
 * or "1:26:00" with `alwaysShowHours` (the rail's static duration fact,
 * which reads oddly as "0:26:00" but should never silently drop the hour
 * segment on a live scrubber where the same reading needs to track a
 * currently-unknown or still-loading duration).
 */
export function formatClock(
  totalSeconds: number,
  { alwaysShowHours = false }: { alwaysShowHours?: boolean } = {},
): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const seconds = Math.floor(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 || alwaysShowHours
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
