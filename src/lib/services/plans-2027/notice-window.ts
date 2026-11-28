import { plansHaveBegun } from "@/lib/billing/plans";

/**
 * When the December plans notice shows in the app: December 2026, UTC.
 *
 * From December 1 the beta hours have a month left; once plans begin
 * (`plansHaveBegun()`, January 1) the notice would be describing the past.
 * Keyed on the date so nothing has to ship on either day. UTC, like every
 * other date the allowance code compares (`PILOT_ENDS_AT`, the billing month).
 */
const PLANS_NOTICE_FROM = Date.UTC(2026, 11, 1);

export function plansNoticeShowing(now: Date = new Date()): boolean {
  return now.getTime() >= PLANS_NOTICE_FROM && !plansHaveBegun(now);
}
