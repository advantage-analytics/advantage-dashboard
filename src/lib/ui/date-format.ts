/**
 * "Aug 23", or "Aug 23, 2025" once it's not this year. Mono table cells.
 *
 * For a real MOMENT (a draft's last edit, a claim), read in the viewer's zone.
 * A match's date is a calendar day, not a moment — print it with
 * `formatMatchDayShortYear()` from `@/lib/data/match-day`, or it shows the day
 * before to anyone west of Greenwich.
 */
export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
