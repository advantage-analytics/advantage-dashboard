import { expect, test } from '@playwright/test';

import { formatIsoDate, parseIsoDate } from '@/lib/ui/date-value';
import { CalendarDate } from '@internationalized/date';

/**
 * `parseIsoDate` / `formatIsoDate` — the only translation between the product's
 * `YYYY-MM-DD` strings and react-aria's `CalendarDate`.
 *
 * Pure, so no browser and no dev server, the same as `tests/entry-plan.spec.ts`.
 * What these pin is the one behaviour a date picker cannot get wrong: parsing
 * runs inside a render, so a rubbish value out of the database has to come back
 * as `null` and draw an empty field. A throw there blanks the whole page.
 */

test.describe('parseIsoDate · never throws, returns null instead', () => {
  test('an empty field is null, not an error', () => {
    expect(parseIsoDate('')).toBeNull();
  });

  test('anything not shaped YYYY-MM-DD is null', () => {
    // The middle two are the near-misses: right idea, wrong wire format.
    for (const value of ['not a date', '2026-3-21', '03/21/2026', '2026-03-21T00:00:00Z']) {
      expect(parseIsoDate(value), value).toBeNull();
    }
  });

  test('a well-formed but impossible date is null', () => {
    // `new CalendarDate(2026, 2, 30)` clamps to the 28th rather than
    // complaining, so a silent one-day-off is the failure being guarded here.
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2025-02-29')).toBeNull();
  });

  test('a real leap day parses', () => {
    const leap = parseIsoDate('2024-02-29');
    expect(leap).not.toBeNull();
    expect([leap!.year, leap!.month, leap!.day]).toEqual([2024, 2, 29]);
  });
});

test.describe('formatIsoDate · round-trips everything parseIsoDate accepts', () => {
  test('empty is empty', () => {
    expect(formatIsoDate(null)).toBe('');
  });

  test('every accepted string comes back unchanged', () => {
    for (const value of ['2024-02-29', '2026-03-21', '2026-12-31', '1999-01-01']) {
      expect(formatIsoDate(parseIsoDate(value)), value).toBe(value);
    }
  });

  test('single-digit months and days are zero-padded', () => {
    expect(formatIsoDate(new CalendarDate(2026, 3, 7))).toBe('2026-03-07');
  });
});
