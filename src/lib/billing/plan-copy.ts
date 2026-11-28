/**
 * What the dashboard says about a workspace's plan and hours from January 1,
 * 2027 — the header pill, Home's usage card, Settings › Usage, a team page's
 * Plan & hours card and the wizard's footer suffix — as data, so each state
 * can be checked without rendering (`tests/plan-copy.spec.ts`).
 *
 * Every surface starts from one `PlanStanding`, which is `allowanceFor()`'s
 * answer plus the words that go with it, so two surfaces cannot call one
 * workspace two different things. Every figure is the plan module's or the
 * resolver's; nothing is typed here.
 *
 * WHEN this wording applies is `plansApplyTo()`: a team from `PLANS_BEGIN`; a
 * personal workspace from `PLANS_BEGIN`, or earlier once it holds a paid plan
 * (a subscription bought in December already draws its hours). Until then
 * every surface keeps the beta's wording.
 *
 * Client-safe and pure: no I/O, and `now` is always a parameter.
 */

import {
  daysUntil,
  formatHoursLong,
  formatHoursShort,
  isUnlimitedCap,
  secondsLeft,
  usageFraction,
} from "@/lib/data/usage-format";
import { formatMatchDayShort } from "@/lib/data/match-day";
import { PLAN_HREF } from "@/lib/services/credits/packs";
import {
  allowanceFor,
  allowanceResetsOn,
  type AllowanceKind,
  type AllowanceWorkspace,
} from "@/lib/services/splitstep/allowance";
import { isPaidPlan, planFor } from "@/lib/user/plan";
import type { Workspace } from "@/lib/workspace/types";
import { PAST_DUE_SENTENCE, hoursLeftLabel } from "./checkout-view";
import {
  ASK_QUESTIONS_PER_MONTH,
  COLLEGE_PLANS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  HOURS_PER_MATCH,
  PILOT_LATEST_END,
  PLAN_TERM_LABELS,
  aboutMatches,
  matchesPhrase,
  plansHaveBegun,
  programPlanFor,
  usd,
  type ProgramPlan,
  type ProgramPlanRef,
} from "./plans";

/* ---------- When ---------- */

/**
 * Whether a workspace's surfaces speak in plans at `now`. A team's switch on
 * `PLANS_BEGIN`. A personal one's do too, and earlier for an account already
 * on a paid plan, whose hours `allowanceFor()` already reads from the plan.
 */
export function plansApplyTo(
  workspace: Pick<Workspace, "kind" | "plan">,
  now: Date = new Date(),
): boolean {
  if (plansHaveBegun(now)) return true;
  return workspace.kind === "personal" && isPaidPlan(workspace.plan);
}

/* ---------- Dates ---------- */

/** `2027-05-31` → `May 31`, UTC. */
export function shortDay(day: string | Date): string {
  const date = typeof day === "string" ? new Date(`${day}T00:00:00Z`) : day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** `2027-05-31` → `May 31, 2027`, UTC. */
export function shortDayYear(day: string | Date): string {
  const date = typeof day === "string" ? new Date(`${day}T00:00:00Z`) : day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `2027-02-14` → `February 14`, UTC — the form a sentence wants. */
export function longDay(day: string | Date): string {
  const date = typeof day === "string" ? new Date(`${day}T00:00:00Z`) : day;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from `today` to `day`, both `YYYY-MM-DD`; never negative. */
function daysBetween(today: string, day: string): number {
  return daysUntil(`${day}T00:00:00Z`, new Date(`${today}T00:00:00Z`));
}

function daysLeftFact(days: number): string {
  return days === 0
    ? "Ends today"
    : `${days} ${days === 1 ? "day" : "days"} left`;
}

/* ---------- Seasons ---------- */

/**
 * A season as its team page names it: `Spring 2027 · Jan 1 – May 31`, and for
 * a full year `2026–27 season · Aug 1 – Jul 31`. A full year is never called
 * "Spring": its hours run to July 31.
 */
export function seasonTitle(plan: ProgramPlanRef): string {
  const span = `${shortDay(plan.startsOn)} – ${shortDay(plan.endsOn)}`;
  const startYear = plan.startsOn.slice(0, 4);
  const endYear = plan.endsOn.slice(0, 4);
  if (plan.term === "spring") {
    return `${PLAN_TERM_LABELS.spring} ${startYear} · ${span}`;
  }
  const years =
    startYear === endYear ? startYear : `${startYear}–${endYear.slice(2)}`;
  return `${years} season · ${span}`;
}

/** `Spring, ends May 31` / `Full year, ends Jul 31`. */
export function seasonEndsFact(plan: ProgramPlanRef): string {
  return `${PLAN_TERM_LABELS[plan.term]}, ends ${shortDay(plan.endsOn)}`;
}

/* ---------- Standing ---------- */

export interface PlanStanding {
  scope: "personal" | "team";
  /** `allowanceFor()`'s kind for the workspace. */
  kind: AllowanceKind;
  /**
   * The word a surface tags the workspace with: `Free`, `Player`, `Player Pro`,
   * a team's plan (`Starter`, `Program`, `Elite`), `Pilot` on a running
   * pilot, `No plan` for a team with neither.
   */
  name: string;
  /** What the hours are counted over, as a sentence says it. */
  period: "month" | "season";
  /** The season in force, for a team on one. */
  season: ProgramPlan | null;
  /** A running pilot's last day, `YYYY-MM-DD`, never past `PILOT_LATEST_END`. */
  pilotEndsOn: string | null;
  capSeconds: number;
  /** `allowanceResetsOn()`: `Feb 14`, or null when nothing comes back. */
  resetsOn: string | null;
  /** ISO instant the hours window ends. */
  windowEnd: string;
  /**
   * A personal plan whose last payment failed: the plan and its name stay,
   * `capSeconds` is 0 and nothing resets until the card is updated. Every
   * surface then says `PAST_DUE_SENTENCE` where it would say the hours.
   */
  pastDue: boolean;
}

/** A workspace's plan and hours window at `now`, with their words. */
export function planStandingFor(
  workspace: AllowanceWorkspace,
  now: Date = new Date(),
): PlanStanding {
  const allowance = allowanceFor(workspace, now);
  const base = {
    kind: allowance.kind,
    capSeconds: allowance.capSeconds,
    resetsOn: allowanceResetsOn(allowance),
    windowEnd: allowance.windowEnd.toISOString(),
    pastDue: allowance.pastDue === true,
  };

  if (workspace.kind === "personal") {
    return {
      ...base,
      scope: "personal",
      name: planFor(workspace.plan).name,
      period: "month",
      season: null,
      pilotEndsOn: null,
    };
  }

  if (allowance.kind === "season") {
    const season = programPlanFor(workspace);
    return {
      ...base,
      scope: "team",
      name: season?.plan.name ?? "No plan",
      period: "season",
      season,
      pilotEndsOn: null,
    };
  }
  if (allowance.kind === "pilot") {
    const own = workspace.pilotEndsOn ?? PILOT_LATEST_END;
    return {
      ...base,
      scope: "team",
      name: "Pilot",
      period: "month",
      season: null,
      pilotEndsOn: own < PILOT_LATEST_END ? own : PILOT_LATEST_END,
    };
  }
  return {
    ...base,
    scope: "team",
    name: "No plan",
    period: "month",
    season: null,
    pilotEndsOn: null,
  };
}

/** A team's own page under Settings › Teams. */
export function teamPageHref(programId: string): string {
  return `/dashboard/settings/teams/${programId}`;
}

/* ---------- The header pill ---------- */

export interface PillHours {
  /** Plan (or pilot, or season) hours left in the window. */
  remainingSeconds: number;
  capSeconds: number;
  /** Extra hours; always 0 for a team. */
  creditSeconds?: number;
  /** ISO instant the soonest extra hours expire. */
  nextCreditExpiresAt?: string | null;
}

export interface PlanPillView {
  /** The tag, and the lead of the button's accessible name. */
  tag: string;
  /** The figure beside the ring: a strong part and a quiet word after it. */
  figure: { strong: string; rest: string };
  /** The tooltip's two lines. */
  label: string;
  detail: string;
  ariaLabel: string;
  /** The ring: the share of the hours still there, 0 to 1. */
  share: number;
}

function hoursWord(seconds: number): string {
  const figure = formatHoursShort(seconds);
  return `${figure} video ${figure === "1" ? "hour" : "hours"}`;
}

/** The pill for hours that have been read. */
export function planPillView(
  standing: PlanStanding,
  hours: PillHours,
): PlanPillView {
  const tag = standing.name;
  const team = standing.scope === "team";
  const cap = hours.capSeconds;
  const left = Math.max(0, hours.remainingSeconds);
  const extra = team ? 0 : Math.max(0, hours.creditSeconds ?? 0);
  const of = `${formatHoursShort(left)} of ${formatHoursShort(cap)}`;
  const period = `this ${standing.period}`;
  const done = (view: Omit<PlanPillView, "tag" | "ariaLabel">) => ({
    tag,
    ...view,
    ariaLabel: `${tag}: ${view.detail}`,
  });

  if (isUnlimitedCap(cap)) {
    return done({
      figure: { strong: "Unlimited", rest: "" },
      label: "Unlimited video hours",
      detail: "Admin accounts have no monthly cap. Click for Plan.",
      share: 1,
    });
  }

  if (team) {
    if (standing.kind === "none") {
      return done({
        figure: { strong: "0h", rest: "left" },
        label: "No plan",
        detail:
          "Your team has no plan or video hours yet. Click for the team's page.",
        share: 0,
      });
    }
    const ends = standing.season
      ? ` The season ends ${shortDay(standing.season.endsOn)}.`
      : standing.resetsOn
        ? ` They reset on ${standing.resetsOn}.`
        : "";
    const label = standing.season
      ? `${tag} plan · ${seasonTitle(standing.season)}`
      : standing.pilotEndsOn
        ? `Pilot until ${shortDayYear(standing.pilotEndsOn)}`
        : tag;
    if (left <= 0) {
      return done({
        figure: { strong: "Out of hours", rest: "" },
        label,
        detail: `Your team has used its ${hoursWord(cap)} ${period}.${ends}`,
        share: 0,
      });
    }
    return done({
      figure: { strong: `${formatHoursShort(left)}h`, rest: "left" },
      label,
      detail: `${of} video hours left ${period}.${ends}`,
      share: 1 - usageFraction(cap - left, cap),
    });
  }

  const until = hours.nextCreditExpiresAt
    ? shortDayYear(new Date(hours.nextCreditExpiresAt))
    : null;
  const extraSentence = `Your ${formatHoursLong(extra)} of extra hours ${
    until ? `last until ${until}` : "are used after them"
  }.`;

  // A failed renewal: the plan stays, this month's hours wait on the card.
  if (standing.pastDue) {
    return done({
      figure:
        extra > 0
          ? { strong: `${formatHoursShort(extra)}h`, rest: "extra" }
          : { strong: "0h", rest: "left" },
      label: "Payment failed",
      detail: PAST_DUE_SENTENCE,
      share: extra > 0 ? 1 : 0,
    });
  }

  // No hours of the plan's own: Free, or an allowance of zero.
  if (cap <= 0) {
    if (extra > 0) {
      return done({
        figure: { strong: `${formatHoursShort(extra)}h`, rest: "extra" },
        label: "Using your extra hours",
        detail: `${formatHoursLong(extra)} of extra hours left${
          until ? `, until ${until}` : ""
        }. Click for Plan.`,
        share: 1,
      });
    }
    return done({
      figure: { strong: "0h", rest: "left" },
      label: `${tag} plan`,
      detail: `No video hours on the ${tag} plan. Click to see plans.`,
      share: 0,
    });
  }

  const own = standing.kind === "plan" ? "plan hours" : "hours";
  const resets = standing.resetsOn;
  if (left <= 0) {
    if (extra > 0) {
      return done({
        figure: { strong: `${formatHoursShort(extra)}h`, rest: "extra" },
        label: "Using your extra hours",
        detail: `This month's ${own} are used${
          resets ? ` until ${resets}` : ""
        }. ${formatHoursLong(extra)} of extra hours left.`,
        share: 1,
      });
    }
    return done({
      figure: { strong: "Out of hours", rest: "" },
      label: "Out of video hours",
      detail: resets
        ? `Your ${own} reset ${resets}. Click to add extra hours.`
        : "Click to add extra hours.",
      share: 0,
    });
  }
  if (extra > 0) {
    return done({
      figure: { strong: `${formatHoursShort(left + extra)}h`, rest: "left" },
      label: `${formatHoursShort(left + extra)}h left · ${formatHoursShort(left)}h plan + ${formatHoursShort(extra)}h extra`,
      detail: `${of} ${own} left this month, used first. ${extraSentence} Click for Plan.`,
      share: 1 - usageFraction(cap - left, cap + extra),
    });
  }
  if (left <= cap * 0.2) {
    return done({
      figure: { strong: `${formatHoursShort(left)}h`, rest: "left" },
      label: "Running low",
      detail: resets
        ? `${of} ${own} left. They reset ${resets}, or add extra hours on Plan.`
        : `${of} ${own} left. Add extra hours on Plan.`,
      share: 1 - usageFraction(cap - left, cap),
    });
  }
  return done({
    figure: { strong: `${formatHoursShort(left)}h`, rest: "left" },
    label: `${tag} plan`,
    detail: `${of} ${own} left this month.${
      resets ? ` They reset ${resets}.` : ""
    } Click for Plan.`,
    share: 1 - usageFraction(cap - left, cap),
  });
}

/** Where the pill goes: Settings › Plan, or the team's own page. */
export function planPillHref(
  workspace: Pick<Workspace, "kind" | "id">,
): string {
  return workspace.kind === "team" ? teamPageHref(workspace.id) : PLAN_HREF;
}

/* ---------- Home's usage card ---------- */

export interface HomeCardFact {
  text: string;
  /** Gives way on the narrowed rail, where the date beside it says when. */
  optional?: boolean;
}

export interface HomeCardView {
  eyebrow: string;
  /** The display figure, or null for the headline (an uncapped account). */
  figure: string | null;
  /** The two lines beside the figure — or the headline and its line. */
  line1: string;
  line2: string;
  sentence: string | null;
  facts: HomeCardFact[];
  cta: string;
  href: string;
  ariaLabel: string;
}

function analyzedFact(analyzed: number): HomeCardFact {
  return {
    text: `${analyzed} ${analyzed === 1 ? "match" : "matches"} analyzed`,
  };
}

/** "Your first month of a plan is 30% off." */
function firstMonthSentence(): string {
  return `Your first month of a plan is ${FIRST_MONTH_DISCOUNT_PERCENT}% off.`;
}

export function homeCardView(input: {
  standing: PlanStanding;
  /** The player's or the team's name — the eyebrow's lead. */
  owner: string;
  /** The team's id, for a team workspace's link. */
  programId?: string;
  usedSeconds: number;
  capSeconds: number;
  /** Extra hours; ignored for a team. */
  creditSeconds?: number;
  /** Matches with a finished report. */
  analyzed: number;
  /** UTC `YYYY-MM-DD`. */
  today: string;
  /**
   * Whether the first-month discount is still this account's to take. Left
   * out, the Free card does not promise it.
   */
  firstMonthEligible?: boolean;
}): HomeCardView {
  const { standing, owner, analyzed, today } = input;
  const team = standing.scope === "team";
  const eyebrow = `${owner} · ${standing.name}`;
  const left = secondsLeft(input.usedSeconds, input.capSeconds);
  const extra = team ? 0 : Math.max(0, input.creditSeconds ?? 0);
  const whole = Math.floor((left + extra) / 3600);
  const figure = String(whole);
  const line1 = `${whole === 1 ? "hour" : "hours"} of match video`;
  const matches = analyzedFact(analyzed);

  if (team) {
    const href = teamPageHref(input.programId ?? "");
    if (standing.kind === "season" && standing.season) {
      return {
        eyebrow,
        figure,
        line1,
        line2: "left this season",
        sentence: null,
        facts: [
          { text: seasonEndsFact(standing.season) },
          {
            text: daysLeftFact(daysBetween(today, standing.season.endsOn)),
            optional: true,
          },
          matches,
        ],
        cta: "See usage",
        href,
        ariaLabel: `${standing.name} plan: see usage`,
      };
    }
    if (standing.kind === "pilot" && standing.pilotEndsOn) {
      return {
        eyebrow,
        figure,
        line1,
        line2: "left this month",
        sentence: null,
        facts: [
          { text: `Pilot until ${shortDay(standing.pilotEndsOn)}` },
          {
            text: daysLeftFact(daysBetween(today, standing.pilotEndsOn)),
            optional: true,
          },
          matches,
        ],
        cta: "See usage",
        href,
        ariaLabel: "Advantage pilot: see usage",
      };
    }
    return {
      eyebrow,
      figure: "0",
      line1: "hours of match video",
      line2: "for team uploads",
      sentence:
        "Your team has no plan yet. A plan is set up from your team's page.",
      facts: [matches],
      cta: "See team page",
      href,
      ariaLabel: "No plan: see your team's page",
    };
  }

  if (isUnlimitedCap(input.capSeconds)) {
    return {
      eyebrow,
      figure: null,
      line1: "Unlimited video hours.",
      line2: "Admin accounts have no monthly cap.",
      sentence: null,
      facts: [matches],
      cta: "See plan",
      href: PLAN_HREF,
      ariaLabel: "Your plan: see plan",
    };
  }

  const extraFact: HomeCardFact[] =
    extra > 0 ? [{ text: `${formatHoursLong(extra)} extra` }] : [];

  // A failed renewal: the card's one sentence says so, in place of the offer.
  if (standing.pastDue) {
    return {
      eyebrow,
      figure,
      line1,
      line2: extra > 0 ? "left in extra hours" : "left this month",
      sentence: PAST_DUE_SENTENCE,
      facts: [matches],
      cta: "See plan",
      href: PLAN_HREF,
      ariaLabel: `${standing.name} plan: see plan`,
    };
  }

  if (input.capSeconds <= 0) {
    return {
      eyebrow,
      figure,
      line1,
      line2: extra > 0 ? "left in extra hours" : `on the ${standing.name} plan`,
      sentence:
        extra > 0
          ? null
          : `Choose a plan or buy extra hours to analyze your next match.${
              input.firstMonthEligible ? ` ${firstMonthSentence()}` : ""
            }`,
      facts: [
        { text: `${ASK_QUESTIONS_PER_MONTH.free} Ask questions a month` },
        matches,
      ],
      cta: "See plans",
      href: PLAN_HREF,
      ariaLabel: `${standing.name} plan: see plans`,
    };
  }

  return {
    eyebrow,
    figure,
    line1,
    line2: "left this month",
    sentence: null,
    facts: [
      ...(standing.resetsOn ? [{ text: `Resets ${standing.resetsOn}` }] : []),
      ...extraFact,
      matches,
    ],
    cta: "See plan",
    href: PLAN_HREF,
    ariaLabel: `${standing.name} plan: see plan`,
  };
}

/* ---------- Settings › Usage: the personal card ---------- */

export interface UsageMatchRow {
  id: string;
  /** The opponent, or null for a match that has since been removed. */
  opponent: string | null;
  /** `matches.date`, a calendar day. */
  date: string | null;
  seconds: number;
}

export interface UsageCardView {
  /** The title slot: `4h 12m left`, `0h left`, `Unlimited`. */
  trailing: string;
  /** Null for an uncapped account: there is no bar to draw. */
  balance: {
    freeCapSeconds: number;
    freeLeftSeconds: number;
    creditSeconds: number;
  } | null;
  line: string;
  link: { label: string; href: string };
  thisMonth: {
    /** `2 matches`, `Nothing analyzed yet`, or that the list did not load. */
    summary: string;
    rows: { id: string; name: string; date: string; seconds: number }[];
  };
  footnote: string;
}

export function usageCardView(input: {
  standing: PlanStanding;
  usedSeconds: number;
  capSeconds: number;
  creditSeconds: number;
  nextCreditExpiresAt: string | null;
  /**
   * The matches analysed in the current hours window, newest first. Null
   * when the list could not be read, which is not the same as none.
   */
  matches: readonly UsageMatchRow[] | null;
}): UsageCardView {
  const { standing, capSeconds } = input;
  const unlimited = isUnlimitedCap(capSeconds);
  const left = secondsLeft(input.usedSeconds, capSeconds);
  const extra = Math.max(0, input.creditSeconds);
  const expires = input.nextCreditExpiresAt
    ? shortDayYear(new Date(input.nextCreditExpiresAt))
    : null;
  const extraPart =
    extra > 0
      ? `Extra: ${formatHoursLong(extra)}${expires ? ` · Expires ${expires}` : ""}`
      : "Extra: none";
  const onPlan = standing.kind === "plan";
  const own = onPlan ? standing.name : "Your hours";

  const planPart = unlimited
    ? "Plan: unlimited"
    : capSeconds > 0
      ? `${own}: ${hoursLeftLabel(left)} of ${formatHoursLong(capSeconds)} this month`
      : "Plan: none";

  const rows = (input.matches ?? []).map((match) => ({
    id: match.id,
    name: match.opponent ? `v. ${match.opponent}` : "A removed match",
    date: match.date ? formatMatchDayShort(match.date) : "",
    seconds: match.seconds,
  }));

  const footnote = unlimited
    ? "Personal uploads only · Admin accounts have no monthly cap"
    : capSeconds > 0
      ? `Personal uploads only${
          standing.resetsOn
            ? ` · ${onPlan ? `${standing.name} hours` : "Your hours"} reset ${standing.resetsOn}`
            : ""
        } · Extra hours are used after ${onPlan ? "plan hours" : "them"}`
      : `Personal uploads only · ${standing.name} plan`;

  return {
    trailing: unlimited ? "Unlimited" : `${hoursLeftLabel(left + extra)} left`,
    balance: unlimited
      ? null
      : {
          freeCapSeconds: capSeconds,
          freeLeftSeconds: left,
          creditSeconds: extra,
        },
    // A failed renewal: the line is that, and any extra hours after it.
    line: standing.pastDue
      ? `${PAST_DUE_SENTENCE}${extra > 0 ? ` ${extraPart}` : ""}`
      : `${planPart} · ${extraPart}`,
    link: {
      label:
        capSeconds > 0 || unlimited || standing.pastDue
          ? "Manage on Plan"
          : "Choose a plan on Plan",
      href: PLAN_HREF,
    },
    thisMonth: {
      summary:
        input.matches === null
          ? "Couldn't load this month's matches"
          : rows.length === 0
            ? "Nothing analyzed yet"
            : `${rows.length} ${rows.length === 1 ? "match" : "matches"}`,
      rows,
    },
    footnote,
  };
}

/* ---------- A team page's Plan & hours card ---------- */

export type PlanHoursView =
  | {
      kind: "none";
      trailing: string;
      figure: string;
      sub: string;
      action: string;
      /** `Starter, Program or Elite, from $3,000 for the spring`. */
      offer: string;
      footnote: string;
    }
  | {
      kind: "season" | "pilot";
      /** `Spring 2027 · Jan 1 – May 31` / `Pilot · until May 31, 2027`. */
      trailing: string;
      /** `142h`. */
      figure: string;
      /** `left of 200h · about 79 matches`. */
      sub: string;
      balance: {
        freeCapSeconds: number;
        freeLeftSeconds: number;
        creditSeconds: number;
      };
      /** The words the breakdown uses for its window: `this season`. */
      period: string;
      /** The footnote's sentence, which the support address closes. */
      footnoteLead: string;
    };

/** `Starter, Program or Elite`. */
function collegePlanNames(): string {
  const names = COLLEGE_PLANS.map((plan) => plan.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
    : (names[0] ?? "");
}

export function planHoursView(input: {
  standing: PlanStanding;
  usedSeconds: number;
  capSeconds: number;
}): PlanHoursView {
  const { standing, capSeconds } = input;
  const left = secondsLeft(input.usedSeconds, capSeconds);
  const balance = {
    freeCapSeconds: capSeconds,
    freeLeftSeconds: left,
    creditSeconds: 0,
  };

  if (standing.kind === "season" && standing.season) {
    const matches = aboutMatches(left / 3600);
    return {
      kind: "season",
      trailing: seasonTitle(standing.season),
      figure: hoursLeftLabel(left),
      sub: `left of ${formatHoursLong(capSeconds)} · about ${matches} ${
        matches === 1 ? "match" : "matches"
      }`,
      balance,
      period: "this season",
      footnoteLead: "To add hours or renew for the fall, email ",
    };
  }
  if (standing.kind === "pilot" && standing.pilotEndsOn) {
    return {
      kind: "pilot",
      trailing: `Pilot · until ${shortDayYear(standing.pilotEndsOn)}`,
      figure: hoursLeftLabel(left),
      sub: `left of ${formatHoursLong(capSeconds)} this month${
        standing.resetsOn ? ` · resets ${standing.resetsOn}` : ""
      }`,
      balance,
      period: "this month",
      footnoteLead: `We'll talk about a season plan before ${shortDay(standing.pilotEndsOn)}: `,
    };
  }
  const cheapest = Math.min(...COLLEGE_PLANS.map((plan) => plan.spring.price));
  return {
    kind: "none",
    trailing: "No plan this season",
    figure: "0h",
    sub: "for team uploads",
    action: "Set up a plan",
    offer: `${collegePlanNames()}, from ${usd(cheapest)} for the spring`,
    footnote:
      "Your roster, matches and reports stay. Plans are set up on a short call.",
  };
}

/* ---------- The upload wizard's footer suffix, for a team ---------- */

/**
 * What follows a team's footer meter from `PLANS_BEGIN`: a season's end, a
 * pilot's own end date, or that there is no plan. Null for a personal
 * workspace, whose suffix is `meterSuffix()`.
 */
export function teamMeterSuffix(standing: PlanStanding): string | null {
  if (standing.scope !== "team") return null;
  if (standing.season) return seasonEndsFact(standing.season);
  if (standing.pilotEndsOn) {
    return `Pilot ends ${shortDay(standing.pilotEndsOn)}`;
  }
  return "No plan";
}

/* ---------- Match estimates in a sentence ---------- */

/**
 * `about half a match`, `about 1 match`, `about 3 matches` — what a balance
 * covers, for a sentence that always says something. The arithmetic is
 * `matchesPhrase()`'s; the extra-hours row reads it from one whole match up.
 */
export function aboutMatchesPhrase(seconds: number): string {
  return matchesPhrase(seconds) ?? "less than half a match";
}
