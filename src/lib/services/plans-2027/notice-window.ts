/**
 * When the December plans notice shows in the app: December 2026, UTC.
 *
 * From December 1 the beta hours have a month left; from January 1 the
 * plans are live and the notice would be describing the past. Keyed on the
 * date so nothing has to ship on either day. UTC, like every other date the
 * allowance code compares (`PILOT_ENDS_AT`, the billing month).
 */
export const PLANS_NOTICE_FROM = Date.UTC(2026, 11, 1);
export const PLANS_NOTICE_UNTIL = Date.UTC(2027, 0, 1);

export function plansNoticeShowing(now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= PLANS_NOTICE_FROM && t < PLANS_NOTICE_UNTIL;
}
