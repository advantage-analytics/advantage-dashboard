import { siteUrl } from "@/lib/site-url";
import {
  formatHoursLong,
  formatResetDate,
  secondsLeft,
} from "@/lib/data/usage-format";
import {
  preferenceNote,
  renderEmail,
  renderText,
  type EmailContent,
} from "../shell";
import type { EmailMessage } from "../send";

/**
 * The program's monthly analysis allowance is running out, or has.
 *
 * Two thresholds and two mails a month at most, one per threshold, to the
 * people who can act on it — the owner and coaches. Fired from the submit
 * handler at the moment a reservation crosses the line, because that is the
 * only moment the number is known to have changed; the meter on Settings ›
 * Usage says the same thing to whoever happens to look.
 *
 * 80% is the wizard's own amber line (`hoursSeverity`), and the copy says what
 * can still be done at each: hold the remaining uploads for the matches that
 * matter, or wait for the reset.
 */
export type UsageAlertSeverity = "low" | "spent";

export interface UsageAlertInput {
  to: string;
  recipientName: string | null;
  programName: string;
  severity: UsageAlertSeverity;
  usedSeconds: number;
  capSeconds: number;
  /** `YYYY-MM-01` — the billing month the numbers belong to. */
  billingMonth: string;
}

export function usageAlertEmail(input: UsageAlertInput): EmailMessage {
  const {
    to,
    recipientName,
    programName,
    severity,
    usedSeconds,
    capSeconds,
    billingMonth,
  } = input;

  const left = secondsLeft(usedSeconds, capSeconds);
  const resets = formatResetDate(billingMonth);
  const greeting = recipientName ? `${recipientName}, ` : "";

  const content: EmailContent =
    severity === "low"
      ? {
          preheader: `${formatHoursLong(left)} of analysis time left for ${programName} this month.`,
          eyebrow: "Allowance running low",
          heading: `${programName} has used 80% of this month's analysis time`,
          body: [
            `${greeting}the program has ${formatHoursLong(left)} of video analysis left before the allowance renews on ${resets}.`,
            "Nothing stops yet. If there are matches this month that matter more than others, this is the point to hold the remaining time for them.",
          ],
          facts: [
            {
              label: "Used",
              value: `${formatHoursLong(usedSeconds)} of ${formatHoursLong(capSeconds)}`,
            },
            { label: "Left", value: formatHoursLong(left) },
            { label: "Renews", value: resets },
          ],
          cta: { label: "See who used what", url: usageUrl() },
          note: preferenceNote("Analysis allowance alerts"),
        }
      : {
          preheader: `${programName}'s analysis allowance is spent — uploads pause until ${resets}.`,
          eyebrow: "Allowance spent",
          heading: `${programName} has used this month's analysis time`,
          body: [
            `${greeting}the program's ${formatHoursLong(capSeconds)} of video analysis for the month is fully reserved. New video uploads will be refused until the allowance renews on ${resets}.`,
            "Matches already submitted are unaffected and will finish. SwingVision imports don't count against this allowance and keep working.",
          ],
          facts: [
            {
              label: "Used",
              value: `${formatHoursLong(usedSeconds)} of ${formatHoursLong(capSeconds)}`,
            },
            { label: "Renews", value: resets },
          ],
          cta: { label: "Open usage", url: usageUrl() },
          note: preferenceNote("Analysis allowance alerts"),
        };

  return {
    to,
    subject:
      severity === "low"
        ? `${programName}: 80% of this month's analysis time used`
        : `${programName}: this month's analysis time is spent`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "usage_alert", severity },
  };
}

function usageUrl(): string {
  return `${siteUrl()}/dashboard/settings/usage`;
}
