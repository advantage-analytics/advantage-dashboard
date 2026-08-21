/**
 * Formatting for analysis-time readouts. Pure — imported by both the server
 * page and the client month-stepper, so it must not reach for Supabase.
 */

/**
 * Seconds as `H:MM` — "0:36", "62:10".
 *
 * Hours, not minutes, because the numbers this page shows sit either side of
 * an hour boundary all day: a 2-hour personal cap and a 75-hour program one.
 * "3730 min / 4500 min" is arithmetic homework.
 */
export function formatAnalysisTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** `2026-08-01` → `Aug 2026`. */
export function formatBillingMonth(billingMonth: string): string {
  return new Date(`${billingMonth}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `2026-08-01` → `Sep 1` — when the allowance comes back. */
export function formatResetDate(billingMonth: string): string {
  const date = new Date(`${billingMonth}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Step a `YYYY-MM-01` key by whole months, in either direction. */
export function shiftBillingMonth(billingMonth: string, months: number): string {
  const date = new Date(`${billingMonth}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** Fraction of the allowance spent, clamped so a meter never overruns. */
export function usageFraction(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(1, Math.max(0, used / cap));
}
