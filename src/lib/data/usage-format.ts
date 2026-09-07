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

/**
 * Hours with one decimal — "5.5", "8" — for the Home sentences that say the
 * word "hours" (the usage footer) or abbreviate it ("5.5 h left this month" in
 * the personal Home title, Platform Audit Pa2). `formatAnalysisTime`'s `H:MM`
 * is Settings › Usage's form; inside a sentence it makes the reader do
 * arithmetic to answer "roughly how much is left".
 *
 * A tenth of an hour is six minutes — fine enough to show movement, coarse
 * enough that the number does not change while someone is reading it.
 */
export function formatHoursShort(seconds: number): string {
  const rounded = Math.round((Math.max(0, seconds) / 3600) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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

/**
 * Seconds as `8h 12m` — the form a sentence or a figure wants.
 *
 * `formatAnalysisTime`'s `H:MM` is a ledger column: it lines up. Beside the
 * word "left" it reads as a clock time, and "11:48 left" is a question. Under
 * a minute rounds to "0m" rather than inventing seconds nobody plans around.
 */
export function formatHoursLong(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * Whole days until the allowance renews, from `now` — never negative.
 *
 * UTC both sides, because the billing month is a UTC key and the reset is the
 * first instant of the next one. Counted in whole days from the calendar date,
 * so "in 1 day" the evening before rather than "in 0 days".
 */
export function daysUntilReset(
  billingMonth: string,
  now: Date = new Date()
): number {
  const reset = new Date(`${billingMonth}T00:00:00Z`);
  reset.setUTCMonth(reset.getUTCMonth() + 1);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return Math.max(0, Math.round((reset.getTime() - today) / 86_400_000));
}

/**
 * How loudly a quota meter should speak.
 *
 * Three states and two thresholds, chosen so the warning arrives while there
 * is still something to do about it: at 80% a coach can hold the last two
 * uploads for the matches that matter; at 100% the only move is to wait.
 */
export type HoursSeverity = "ok" | "low" | "spent";

export function hoursSeverity(fraction: number): HoursSeverity {
  if (fraction >= 1) return "spent";
  if (fraction >= 0.8) return "low";
  return "ok";
}
