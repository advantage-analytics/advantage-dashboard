import { expect, test } from '@playwright/test';

import { localDay, weekBounds } from '@/lib/data/team-home-server';

/**
 * Which day Team Home thinks it is.
 *
 * `program_events.starts_on` is a date, not an instant, so every schedule
 * question on this page — the next event, and above all the weekend dual sheet
 * — is decided by string-comparing a YYYY-MM-DD day against a Monday-to-Sunday
 * window. Both come out of `localDay` and `weekBounds`, and both are only as
 * right as the zone they are computed in.
 *
 * The failure this guards is silent by construction. These getters used to read
 * the day off a `Date`'s local getters, which on Vercel is UTC: at 17:00 Pacific
 * on a Sunday the week rolls forward, and Friday's and Saturday's dual drop out
 * of "this week" while the coach is still reading about them. Nothing errors and
 * nothing renders broken — the card is simply gone, on the exact evening the
 * Monday-start rule exists to keep it on screen.
 *
 * So the assertions below pin an instant and a zone and check the week is the
 * one a person in that zone is living in. A test that let the runner's own `TZ`
 * decide would pass on a Californian laptop and prove nothing about production.
 */

/** Sunday 30 Aug 2026, 18:00 US Pacific (PDT, UTC-7) — Monday 01:00 UTC. */
const SUNDAY_EVENING_PACIFIC = new Date('2026-08-31T01:00:00.000Z');

const PACIFIC = 'America/Los_Angeles';

test.describe('localDay', () => {
  test('is the day in the zone it is given, not the one the process runs in', () => {
    expect(localDay(SUNDAY_EVENING_PACIFIC, PACIFIC)).toBe('2026-08-30');
    expect(localDay(SUNDAY_EVENING_PACIFIC, 'UTC')).toBe('2026-08-31');
  });

  test('pads months and days, because the comparison is a string compare', () => {
    // '2026-9-5' sorts before '2026-08-30'. `weekendDualRow` and the `ends_on`
    // filter both compare these as text, so an unpadded day is not a near miss.
    expect(localDay(new Date('2026-09-05T12:00:00.000Z'), 'UTC')).toBe('2026-09-05');
  });
});

test.describe('weekBounds', () => {
  test('Sunday evening in Pacific is still the week holding Friday and Saturday', () => {
    const week = weekBounds(SUNDAY_EVENING_PACIFIC, PACIFIC);

    expect(week).toEqual({ start: '2026-08-24', end: '2026-08-30' });

    // Stated the way the page asks it: `weekendDualRow` keeps a dual whose
    // `starts_on` falls inside these bounds. Friday's and Saturday's duals are
    // the weekend's story right through Sunday night.
    for (const dual of ['2026-08-28', '2026-08-29']) {
      expect(dual >= week.start && dual <= week.end).toBe(true);
    }
  });

  test('the same instant read in UTC has already rolled the week forward', () => {
    // Not an aspiration — this is what the page ships with today, and the
    // reason `PROGRAM_TIME_ZONE` carries the comment it does. It is here so
    // that a change of pinned zone is a change to a test, not a surprise.
    const week = weekBounds(SUNDAY_EVENING_PACIFIC, 'UTC');

    expect(week).toEqual({ start: '2026-08-31', end: '2026-09-06' });
    expect('2026-08-29' >= week.start).toBe(false);
  });

  test('a week is seven days across a DST boundary, not six or eight', () => {
    // US DST began Sunday 8 Mar 2026. Stepping days on a zoned `Date` loses an
    // hour here and can land the end of the week on the wrong day; the
    // arithmetic runs on UTC midnights so that it cannot.
    const week = weekBounds(new Date('2026-03-08T19:00:00.000Z'), PACIFIC);
    expect(week).toEqual({ start: '2026-03-02', end: '2026-03-08' });
  });

  test('Monday is the first day of its own week, not the last of the one before', () => {
    const week = weekBounds(new Date('2026-08-31T12:00:00.000Z'), 'UTC');
    expect(week.start).toBe('2026-08-31');
  });
});
