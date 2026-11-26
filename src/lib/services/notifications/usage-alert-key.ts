import type { VideoAllowance } from "@/lib/services/splitstep/allowance";

/**
 * The one-send key for a usage alert: one mail per threshold per account per
 * HOURS WINDOW, whatever that window is.
 *
 *  - a player's plan: the instant the hours window starts — the subscription
 *    month, which is not the calendar month, and which an upgrade restarts
 *    (so the new plan's hours get their own alerts, even the same day);
 *  - a program's season: the day the season starts, so the mail goes out once
 *    a season, not once a month;
 *  - everything else (the beta, a pilot): the calendar billing month.
 *
 * Pure, so the rule is testable without a database.
 */
export function usageAlertDedupeKey(
  severity: "low" | "spent",
  accountId: string,
  allowance: Pick<VideoAllowance, "kind" | "windowStart" | "billingMonth">,
): string {
  const period =
    allowance.kind === "plan"
      ? allowance.windowStart.toISOString()
      : allowance.kind === "season"
        ? allowance.windowStart.toISOString().slice(0, 10)
        : allowance.billingMonth;
  return `usage_${severity}:${accountId}:${period}`;
}
