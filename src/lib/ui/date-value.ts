import { CalendarDate } from '@internationalized/date';

/**
 * The two functions that know the product's date wire format: `YYYY-MM-DD`,
 * the shape every date column and every form value already uses.
 *
 * They live here rather than inside `date-field.tsx` because that component is
 * `"use client"` and pulls react-aria with it. A Server Component that only
 * needs to normalise a stored date string must not drag a date picker into its
 * bundle to do it.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `""`, a malformed string and an impossible date (`2026-02-30`) all return
 * `null` — never a throw. A bad value in the database has to render an empty
 * field, because a throw here happens inside a render and takes the page with
 * it.
 *
 * The library is not trusted to do the rejecting: `parseDate` throws on
 * `2026-02-30`, but `new CalendarDate(2026, 2, 30)` silently clamps to the
 * 28th. Confirming the parsed fields round-trip to the numbers we were handed
 * catches both the clamp and any future change of heart about which inputs the
 * library tolerates.
 */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new CalendarDate(year, month, day);
  if (date.year !== year || date.month !== month || date.day !== day) return null;

  return date;
}

/** The inverse. `null` — an empty field — is the empty string, not `"null"`. */
export function formatIsoDate(value: CalendarDate | null): string {
  if (!value) return '';

  const year = String(value.year).padStart(4, '0');
  const month = String(value.month).padStart(2, '0');
  const day = String(value.day).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
