import { expect, test } from '@playwright/test';

import {
  daysUntilReset,
  formatHoursLong,
  hoursSeverity,
} from '@/lib/data/usage-format';

/**
 * The three helpers Settings › Teams' Program hours summary leans on. Pure,
 * so they are tested as arithmetic: the figure a coach reads under "left",
 * the countdown beside "Resets", and the threshold that turns the meter amber.
 */
test.describe('formatHoursLong', () => {
  test('reads as hours and minutes, minutes padded', () => {
    expect(formatHoursLong(8 * 3600 + 12 * 60)).toBe('8h 12m');
    expect(formatHoursLong(11 * 3600 + 48 * 60)).toBe('11h 48m');
    expect(formatHoursLong(20 * 3600)).toBe('20h 00m');
  });

  test('drops the hours word under an hour, and never goes negative', () => {
    expect(formatHoursLong(48 * 60)).toBe('48m');
    expect(formatHoursLong(0)).toBe('0m');
    expect(formatHoursLong(-30)).toBe('0m');
  });
});

test.describe('daysUntilReset', () => {
  test('counts whole days to the first of the next month, in UTC', () => {
    expect(daysUntilReset('2026-09-01', new Date('2026-09-07T03:00:00Z'))).toBe(24);
    expect(daysUntilReset('2026-09-01', new Date('2026-09-30T23:59:00Z'))).toBe(1);
    expect(daysUntilReset('2026-12-01', new Date('2026-12-01T00:00:00Z'))).toBe(31);
  });

  test('is zero on and after the reset, never negative', () => {
    expect(daysUntilReset('2026-09-01', new Date('2026-10-01T00:00:00Z'))).toBe(0);
    expect(daysUntilReset('2026-09-01', new Date('2026-10-15T00:00:00Z'))).toBe(0);
  });
});

test.describe('hoursSeverity', () => {
  test('is quiet below 80%, amber from 80%, red at the cap', () => {
    expect(hoursSeverity(0)).toBe('ok');
    expect(hoursSeverity(0.41)).toBe('ok');
    expect(hoursSeverity(0.799)).toBe('ok');
    expect(hoursSeverity(0.8)).toBe('low');
    expect(hoursSeverity(0.99)).toBe('low');
    expect(hoursSeverity(1)).toBe('spent');
    expect(hoursSeverity(1.2)).toBe('spent');
  });
});
