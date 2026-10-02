import { expect, test } from "@playwright/test";

import {
  MATCH_VIDEO_EXPIRY_DAYS,
  MATCH_VIDEO_EXPIRY_WARN_DAYS,
  matchVideoExpiry,
} from "@/lib/match-video/expiry";

/**
 * `matchVideoExpiry` (SwingVision Add video T8) — pure, so every case is a
 * pair of timestamps and a `now`. The clock is
 * `coalesce(lastViewedAt, activatedAt)`, the same expression the migration
 * documents.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATED = "2025-01-15T12:00:00.000Z";
const VIEWED = "2025-06-01T08:30:00.000Z";

function daysAfter(iso: string, days: number): Date {
  return new Date(new Date(iso).getTime() + days * DAY_MS);
}

test("policy constants: a year, warned a month out", () => {
  expect(MATCH_VIDEO_EXPIRY_DAYS).toBe(365);
  expect(MATCH_VIDEO_EXPIRY_WARN_DAYS).toBe(30);
});

test("never viewed: the clock falls back to activatedAt", () => {
  const result = matchVideoExpiry(
    { activatedAt: ACTIVATED, lastViewedAt: null },
    daysAfter(ACTIVATED, 10),
  );
  expect(result.expiresAt.toISOString()).toBe(
    daysAfter(ACTIVATED, 365).toISOString(),
  );
  expect(result.warning).toBe(false);
  expect(result.monthsUnwatched).toBe(0);
});

test("an unparseable lastViewedAt falls back to activatedAt too", () => {
  const result = matchVideoExpiry(
    { activatedAt: ACTIVATED, lastViewedAt: "not a date" },
    daysAfter(ACTIVATED, 10),
  );
  expect(result.expiresAt.toISOString()).toBe(
    daysAfter(ACTIVATED, 365).toISOString(),
  );
});

test("a view restarts the clock from lastViewedAt", () => {
  const result = matchVideoExpiry(
    { activatedAt: ACTIVATED, lastViewedAt: VIEWED },
    daysAfter(VIEWED, 1),
  );
  expect(result.expiresAt.toISOString()).toBe(
    daysAfter(VIEWED, 365).toISOString(),
  );
  // Long past a year since activation, but viewed yesterday: no warning.
  const late = matchVideoExpiry(
    { activatedAt: ACTIVATED, lastViewedAt: VIEWED },
    daysAfter(ACTIVATED, 400),
  );
  expect(late.warning).toBe(false);
  expect(
    matchVideoExpiry(
      { activatedAt: ACTIVATED, lastViewedAt: null },
      daysAfter(ACTIVATED, 400),
    ).warning,
  ).toBe(true);
});

test("day 334 is quiet; day 335 warns", () => {
  const input = { activatedAt: ACTIVATED, lastViewedAt: VIEWED };
  expect(matchVideoExpiry(input, daysAfter(VIEWED, 334)).warning).toBe(false);
  expect(matchVideoExpiry(input, daysAfter(VIEWED, 335)).warning).toBe(true);
  // The boundary is the instant 30 days before expiry, not the day's end.
  expect(
    matchVideoExpiry(input, new Date(daysAfter(VIEWED, 335).getTime() - 1))
      .warning,
  ).toBe(false);
  // Past expiry it still warns.
  expect(matchVideoExpiry(input, daysAfter(VIEWED, 366)).warning).toBe(true);
});

test("11 months unwatched", () => {
  const input = { activatedAt: ACTIVATED, lastViewedAt: VIEWED };
  // 2025-06-01 → 2026-05-01: eleven whole calendar months.
  const eleven = matchVideoExpiry(input, new Date("2026-05-01T08:30:00.000Z"));
  expect(eleven.monthsUnwatched).toBe(11);
  // That is day 334 of this clock — still quiet. The next day warns, and
  // still reads as eleven months.
  expect(eleven.warning).toBe(false);
  const warned = matchVideoExpiry(input, daysAfter(VIEWED, 335));
  expect(warned.warning).toBe(true);
  expect(warned.monthsUnwatched).toBe(11);
  // One second short of the eleventh month is still ten.
  expect(
    matchVideoExpiry(input, new Date("2026-05-01T08:29:59.000Z"))
      .monthsUnwatched,
  ).toBe(10);
  expect(
    matchVideoExpiry(input, new Date("2026-04-30T23:00:00.000Z"))
      .monthsUnwatched,
  ).toBe(10);
});

test("a clock in the future never reports negative months", () => {
  const result = matchVideoExpiry(
    { activatedAt: ACTIVATED, lastViewedAt: VIEWED },
    daysAfter(VIEWED, -5),
  );
  expect(result.monthsUnwatched).toBe(0);
  expect(result.warning).toBe(false);
});

test("accepts Date inputs as well as ISO strings", () => {
  const result = matchVideoExpiry(
    { activatedAt: new Date(ACTIVATED), lastViewedAt: new Date(VIEWED) },
    daysAfter(VIEWED, 335),
  );
  expect(result.warning).toBe(true);
});

test("an invalid activatedAt is a caller bug and throws", () => {
  expect(() =>
    matchVideoExpiry({ activatedAt: "nope", lastViewedAt: null }, new Date()),
  ).toThrow(RangeError);
});
