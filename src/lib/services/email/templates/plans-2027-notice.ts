import {
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  personalPlan,
  usd,
  type PersonalPlanId,
} from "@/lib/billing/plans";
import { emailOrigin } from "@/lib/site-url";
import {
  renderEmail,
  renderText,
  type EmailContent,
  type EmailFact,
} from "../shell";
import type { EmailMessage } from "../send";

/**
 * The December notice: free beta hours end December 31 (stage 0 of
 * `docs/plans/2027-pricing.md`).
 *
 * Sent once, by hand, by `scripts/send-plans-2027-notice.ts` — never from an
 * event. Two wordings:
 *
 *  - `plans2027NoticeEmail` — every player with an account. Copy approved by
 *    Cj on 2026-11-26 (the plan's "Email copy" table, December notice
 *    column); `tests/plans-2027-notice-email.spec.ts` pins it word for word,
 *    so a change here is a change Cj has to approve first.
 *  - `plans2027PilotNoticeEmail` — owners and coaches of the pilot teams
 *    (UGA, UCLA, Babson, TCU), whose team keeps its hours until its pilot
 *    ends. DRAFTED in the same voice, NOT yet approved — the send script
 *    refuses to send it until `PILOT_NOTICE_APPROVED` is true.
 *
 * Every plan name, price, hour count and the first-month discount come from
 * `src/lib/billing/plans.ts`; nothing here is typed. (Approved as "Coach /
 * Coach Pro, half off"; the plans were renamed Player / Player Pro and the
 * offer set to 30% before the send, which only swaps those words.)
 */

/** Flip to true only once Cj has approved the pilot wording below. */
export const PILOT_NOTICE_APPROVED = false;

const SUBJECT = "Free beta hours end December 31";
const EYEBROW = "Plans from January 1";

export interface Plans2027NoticeInput {
  to: string;
}

export function plans2027NoticeEmail(
  input: Plans2027NoticeInput,
): EmailMessage {
  const content: EmailContent = {
    preheader:
      "From January 1, a new match needs a plan or extra hours. Everything you've uploaded stays.",
    eyebrow: EYEBROW,
    heading: SUBJECT,
    body: [
      [
        {
          text: "From January 1, analyzing a new match needs a plan or extra hours. ",
        },
        { text: "Everything you've already uploaded stays", strong: true },
        {
          text: ": your matches, reports and film. SwingVision imports stay free. Your first month of a monthly plan is ",
        },
        { text: `${FIRST_MONTH_DISCOUNT_PERCENT}% off`, strong: true },
        { text: "." },
      ],
    ],
    facts: planFacts(),
    cta: { label: "Choose a plan", url: planUrl() },
    note: "You're getting this because you have an Advantage account. Nothing is charged until you choose a plan.",
  };

  return {
    to: input.to,
    subject: SUBJECT,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "plans_2027_notice" },
  };
}

export interface Plans2027PilotNoticeInput {
  to: string;
  /** The team as the app names it, e.g. "UCLA Men's Tennis". */
  programName: string;
  programId: string;
  /** `YYYY-MM-DD` — `programs.pilot_ends_on`. Formatted in UTC. */
  pilotEndsOn: string;
}

/**
 * DRAFT — pilot teams' wording, pending Cj's approval. Same subject, eyebrow
 * and voice as the general notice; it leads with what does NOT change for the
 * team, then says the one thing that does (their own workspace), so a coach
 * doesn't read the general mail and think the pilot is over.
 */
export function plans2027PilotNoticeEmail(
  input: Plans2027PilotNoticeInput,
): EmailMessage {
  const ends = formatPilotEnd(input.pilotEndsOn);
  const content: EmailContent = {
    preheader: `${input.programName}'s pilot carries on until ${ends}. Free beta hours end December 31 everywhere else.`,
    eyebrow: EYEBROW,
    heading: `${input.programName}'s pilot continues until ${ends}`,
    body: [
      [
        { text: "Free beta hours end December 31, but " },
        { text: input.programName, strong: true },
        {
          text: ` stays on its pilot until ${ends}: the team keeps analyzing matches as it does today, and nothing is charged.`,
        },
      ],
      [
        {
          text: "Your own workspace is separate. From January 1, analyzing a match there needs a plan or extra hours. ",
        },
        { text: "Everything you've already uploaded stays", strong: true },
        { text: "." },
      ],
    ],
    facts: [
      { label: "Team", value: input.programName },
      { label: "Pilot ends", value: ends },
      { label: "After the pilot", value: "A season plan, by the season" },
    ],
    cta: {
      label: "Open the team's page",
      url: `${emailOrigin()}/dashboard/settings/teams/${input.programId}`,
    },
    note: `You're getting this because you run ${input.programName} on Advantage. Nothing is charged until your program chooses a plan.`,
  };

  return {
    to: input.to,
    subject: `${input.programName}'s pilot continues until ${ends}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "plans_2027_pilot_notice" },
  };
}

function planFacts(): EmailFact[] {
  const plan = (id: PersonalPlanId): EmailFact => {
    const { name, monthly, hours } = personalPlan(id);
    return {
      label: name,
      value: `${usd(monthly)} a month · ${hours}h of match video`,
    };
  };
  return [
    plan("player"),
    plan("player-pro"),
    {
      label: "Extra hours",
      value: `${usd(EXTRA_HOUR_PRICE)} each · last ${EXTRA_HOUR_VALIDITY_MONTHS} months`,
    },
  ];
}

function planUrl(): string {
  return `${emailOrigin()}/dashboard/settings/plan`;
}

/** "Mar 31, 2027" — UTC, so the date never slips a day west of Greenwich. */
function formatPilotEnd(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
