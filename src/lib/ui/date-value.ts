import { CalendarDate, parseDate } from '@internationalized/date';

/**
 * The two functions that know the product's date wire format: `YYYY-MM-DD`,
 * the shape every date column and every form value already uses.
 *
 * They live here rather than inside `date-field.tsx` because that component is
 * `"use client"` and pulls react-aria with it. A Server Component that only
 * needs to normalise a stored date string must not drag a date picker into its
 * bundle to do it.
 */

/**
 * `""`, a malformed string and an impossible date (`2026-02-30`) all return
 * `null` — never a throw. A bad value in the database has to render an empty
 * field, because a throw here happens inside a render and takes the page with
 * it.
 *
 * `parseDate` is strict, which is the whole reason this wraps it rather than
 * validating by hand. Measured on the library, not assumed: it rejects
 * `2026-02-30` and `2025-02-29` as out of range, `2026-13-01` on the month,
 * and `""`, `2026-2-3` and `2026-09-26T10:00` as malformed, while accepting
 * `2024-02-29`. What must NOT be used is the `CalendarDate` constructor —
 * `new CalendarDate(2026, 2, 30)` silently clamps to the 28th, and an earlier
 * draft of this file hand-rolled a field round-trip to catch exactly that.
 * Not calling the constructor removes the need for the check.
 */
export function parseIsoDate(value: string): CalendarDate | null {
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/**
 * The inverse. `null` — an empty field — is the empty string, not `"null"`.
 * `CalendarDate.toString()` is already the ISO form and already pads, year
 * included (`new CalendarDate(26, 9, 6)` prints `0026-09-06`).
 */
export function formatIsoDate(value: CalendarDate | null): string {
  return value ? value.toString() : '';
}
