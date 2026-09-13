/**
 * The guardian step's field vocabulary — shared, not duplicated, because the
 * `<select>` in `onboarding-flow.tsx` and the validator in `actions.ts` must
 * agree on what a graduating class is, and `actions.ts` is a `"use server"`
 * file that may only export async functions. The constants live here instead.
 *
 * Years, not the roster's Freshman…Graduate standings
 * (`team/player-fields.tsx`): screen 3.1 asks for the junior's high-school
 * graduating class ("2029"), which is how junior tennis is actually organised
 * — recruiting classes, tournament age groups — and how the player will still
 * be described if the account is later handed to them.
 */

/** Postgres mirrors this cap in `users_junior_player_name_length`. */
export const GUARDIAN_PLAYER_NAME_MAX = 120;

/**
 * Ten years out covers the youngest player a guardian plausibly manages —
 * an eight-year-old today graduates about a decade from now.
 */
const YEARS_AHEAD = 10;

/** The `<select>`'s options: this year through ten years from now. */
export function guardianClassYears(now = new Date()): string[] {
  const first = now.getFullYear();
  return Array.from({ length: YEARS_AHEAD + 1 }, (_, i) => String(first + i));
}

/**
 * The server's rule for the same field. One year of slack behind the list the
 * client rendered, so a form filled before midnight on New Year's Eve doesn't
 * come back "invalid" for the seconds it spent in flight.
 */
export function isGuardianClassYear(value: string, now = new Date()): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  const current = now.getFullYear();
  return year >= current - 1 && year <= current + YEARS_AHEAD;
}
