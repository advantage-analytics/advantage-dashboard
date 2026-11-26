import { emailOrigin } from "@/lib/site-url";
import {
  formatHoursLong,
  formatResetDate,
  secondsLeft,
} from "@/lib/data/usage-format";
import { aboutMatchesPhrase, longDay, shortDay } from "@/lib/billing/plan-copy";
import {
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  coachPlan,
  usd,
  type CoachPlanId,
} from "@/lib/billing/plans";
import { SUPPORT_EMAIL } from "@/lib/constants";
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
 *
 * Three mails share the two thresholds:
 *  - `usageAlertEmail()` — a program's month: the beta's and a pilot's.
 *  - `usageAlertEmail({ period: "season" })` — a program on a season plan:
 *    "this season", and the season's end date where a month has its reset.
 *  - `planUsageAlertEmail()` — a player on Coach or Coach Pro, in the wording
 *    approved in docs/plans/2027-pricing.md ("Email copy"), every figure
 *    filled from the plan module and the allowance resolver.
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
  /**
   * The day the allowance turns over, when it is not the first of next
   * month: a season's hours run to the day after the season ends.
   */
  resetsOn?: string;
  /**
   * What the hours are counted over. `season` is a program on a season plan:
   * one pool for the season, which does not renew — the mail says "this
   * season" and names `seasonEndsOn`. Defaults to `month`.
   */
  period?: "month" | "season";
  /** The season's last day, `YYYY-MM-DD`. Required with `period: "season"`. */
  seasonEndsOn?: string;
  /**
   * The team's own page (`/dashboard/settings/teams/<id>`), where its hours
   * live from January 1, 2027. Left out, the link is Settings › Usage.
   */
  programId?: string;
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
    resetsOn,
  } = input;

  const left = secondsLeft(usedSeconds, capSeconds);
  const resets = resetsOn ?? formatResetDate(billingMonth);
  const greeting = recipientName ? `${recipientName}, ` : "";
  const url = input.programId
    ? `${emailOrigin()}/dashboard/settings/teams/${input.programId}`
    : usageUrl();

  if (input.period === "season") {
    return seasonAlert({ ...input, left, greeting, url });
  }

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
          cta: { label: "See who used what", url },
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
          cta: { label: "Open usage", url },
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
  return `${emailOrigin()}/dashboard/settings/usage`;
}

/** A program on a season plan: one pool, which ends rather than renews. */
function seasonAlert(
  input: UsageAlertInput & { left: number; greeting: string; url: string },
): EmailMessage {
  const { to, programName, severity, usedSeconds, capSeconds } = input;
  const { left, greeting, url } = input;
  const ends = input.seasonEndsOn ? longDay(input.seasonEndsOn) : null;
  const endsShort = input.seasonEndsOn ? shortDay(input.seasonEndsOn) : null;
  const used = {
    label: "Used",
    value: `${formatHoursLong(usedSeconds)} of ${formatHoursLong(capSeconds)}`,
  };
  const seasonEnds = endsShort
    ? [{ label: "Season ends", value: endsShort }]
    : [];

  const content: EmailContent =
    severity === "low"
      ? {
          preheader: `${formatHoursLong(left)} of analysis time left for ${programName} this season.`,
          eyebrow: "Season hours running low",
          heading: `${programName} has used 80% of this season's analysis time`,
          body: [
            `${greeting}the program has ${formatHoursLong(left)} of video analysis left this season${ends ? `, which ends on ${ends}` : ""}.`,
            `Nothing stops yet. If there are matches this season that matter more than others, this is the point to hold the remaining time for them. To add hours, email ${SUPPORT_EMAIL}.`,
          ],
          facts: [
            used,
            { label: "Left", value: formatHoursLong(left) },
            ...seasonEnds,
          ],
          cta: { label: "See who used what", url },
          note: preferenceNote("Analysis allowance alerts"),
        }
      : {
          preheader: `${programName}'s analysis hours for this season are spent. New uploads pause until hours are added.`,
          eyebrow: "Season hours spent",
          heading: `${programName} has used this season's analysis time`,
          body: [
            `${greeting}the program's ${formatHoursLong(capSeconds)} of video analysis for this season is fully reserved. New video uploads will be refused until hours are added${ends ? `; the season ends on ${ends}` : ""}.`,
            `Matches already submitted are unaffected and will finish. SwingVision imports don't count against these hours and keep working. To add hours, email ${SUPPORT_EMAIL}.`,
          ],
          facts: [used, ...seasonEnds],
          cta: { label: "Open usage", url },
          note: preferenceNote("Analysis allowance alerts"),
        };

  return {
    to,
    subject:
      severity === "low"
        ? `${programName}: 80% of this season's analysis time used`
        : `${programName}: this season's analysis time is spent`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "usage_alert", severity, period: "season" },
  };
}

/* ---------- A player's plan ---------- */

export interface PlanUsageAlertInput {
  to: string;
  /** The paid plan whose hours these are. */
  planId: Exclude<CoachPlanId, "free">;
  severity: UsageAlertSeverity;
  /** Plan hours used in the current hours window. */
  usedSeconds: number;
  /** The plan's hours for the window. */
  capSeconds: number;
  /** When the hours window turns over — the resolver's `windowEnd`. */
  resetsAt: Date;
  /**
   * Extra hours the player still holds. With any, running out of plan hours
   * does not stop an upload, and the mail says so instead of saying it does.
   */
  extraSeconds?: number;
}

/**
 * A player's plan hours are running out, or have — the approved wording
 * (docs/plans/2027-pricing.md, "Email copy"), with the Coach example's
 * figures replaced by this account's.
 */
export function planUsageAlertEmail(input: PlanUsageAlertInput): EmailMessage {
  const { to, planId, severity, capSeconds, resetsAt } = input;
  const plan = coachPlan(planId);
  const used = Math.min(Math.max(0, input.usedSeconds), capSeconds);
  const left = secondsLeft(used, capSeconds);
  const extra = Math.max(0, input.extraSeconds ?? 0);
  const resets = shortDay(resetsAt);
  const resetsLong = longDay(resetsAt);
  const price = usd(EXTRA_HOUR_PRICE);
  // The step up, for a plan that has one: Coach → Coach Pro.
  const next = planId === "coach" ? coachPlan("coach-pro") : null;
  const about = aboutMatchesPhrase(left);
  const planUrl = `${emailOrigin()}/dashboard/settings/plan`;

  const content: EmailContent =
    severity === "low"
      ? {
          preheader: `${about.charAt(0).toUpperCase()}${about.slice(1)} left on ${plan.name}. Your hours reset ${resets}.`,
          eyebrow: "Video hours",
          heading: `${formatHoursLong(left)} of match video left this month`,
          body: [
            `You've used ${formatHoursLong(used)} of your ${formatHoursLong(capSeconds)} on ${plan.name}. ${
              left === 3600
                ? "The hour left"
                : `The ${formatHoursLong(left)} left`
            } covers ${about}, and your hours reset on ${resetsLong}.`,
            extra > 0
              ? `You also have ${formatHoursLong(extra)} of extra hours, which are used after your plan's hours.`
              : `Playing more before then? Extra hours are ${price} each and last ${EXTRA_HOUR_VALIDITY_MONTHS} months${
                  next
                    ? `, or ${next.name} gives you ${next.hours ?? 0}h a month`
                    : ""
                }.`,
          ],
          facts: [
            { label: "Left", value: `${formatHoursLong(left)} · ${about}` },
            { label: "Resets", value: resets },
          ],
          cta: { label: "Add hours", url: planUrl },
          note: preferenceNote("Analysis allowance alerts"),
        }
      : {
          preheader:
            extra > 0
              ? `New uploads use your ${formatHoursLong(extra)} of extra hours until ${resets}.`
              : `New uploads wait until ${resets}. Add hours to send one sooner.`,
          eyebrow: "Video hours",
          heading: `You've used this month's ${formatHoursLong(capSeconds)} of match video`,
          body: [
            extra > 0
              ? `Your ${plan.name} hours reset on ${resetsLong}. Until then, new matches use your ${formatHoursLong(extra)} of extra hours. Anything you've already sent keeps processing.`
              : `New matches wait until your hours reset on ${resetsLong}. Anything you've already sent keeps processing.`,
            `To analyze ${extra > 0 ? "more" : "a match sooner"}, add extra hours at ${price} each${
              next
                ? `, or move up to ${next.name} for ${next.hours ?? 0}h a month`
                : ""
            }.`,
          ],
          facts: [
            {
              label: "Used",
              value: `${formatHoursLong(used)} of ${formatHoursLong(capSeconds)}`,
            },
            { label: "Resets", value: resets },
          ],
          cta: { label: "Add hours", url: planUrl },
          note: preferenceNote("Analysis allowance alerts"),
        };

  return {
    to,
    subject:
      severity === "low"
        ? `${formatHoursLong(left)} of match video left this month`
        : "You've used this month's video hours",
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "usage_alert", severity, plan: planId },
  };
}
