/**
 * The paid plans, from January 1, 2027 — the ONE place the dashboard writes a
 * price, an hour count, a match estimate, an Ask limit or a season date.
 *
 * These are the final 2027 figures (docs/plans/2027-pricing.md, "Final
 * pricing"). Pages, quota code, Stripe setup and emails read from here;
 * nothing is typed into a page. `tests/billing-plans.spec.ts` pins each
 * figure, so a change is one edit here plus that spec, and the landing site's
 * `advantage-landing/src/lib/plans.ts` by hand (the two repos share no code;
 * docs/plans/2027-landing-handoff.md lists what the landing site shows).
 *
 * Two spellings to know:
 *  - Free has NO video: no hours and no free match.
 *  - A full-year term is spelled `full_year`, the value `program_plans.plan_term`
 *    stores; the landing file's `Season` spells it `full-year`.
 *
 * Client-safe and pure: no `"use client"`, no server imports, no I/O. Client
 * components and server loaders both import it.
 */

/** About this many hours of video for one singles match. */
export const HOURS_PER_MATCH = 1.8;

/* ---------- Add-ons and terms that apply across plans ---------- */

/** One extra hour of video, US dollars. Anyone can buy, with or without a plan. */
export const EXTRA_HOUR_PRICE = 35;
/** Extra hours last this long from the moment they are bought. */
export const EXTRA_HOUR_VALIDITY_MONTHS = 12;
/**
 * About what one more match costs in extra hours, US dollars. A stated
 * figure, agreed with the price: not `EXTRA_HOUR_PRICE × HOURS_PER_MATCH`.
 */
export const EXTRA_MATCH_PRICE = 60;

/**
 * Rush and Priority. Not in any plan and not on sale: every job runs
 * Standard. The two prices are kept for the later build that sells them; do
 * not read them into a gate or a price yet. Where a plan's contents are
 * listed, `RUSH_PRIORITY_COMING_SOON` is the one line that mentions them.
 */
export const RUSH_PRICE = 25;
export const PRIORITY_ADDON_PERCENT = 15;
export const RUSH_PRIORITY_COMING_SOON = "Rush and Priority: coming soon";

/**
 * The paywall's offer: this much off the first month. Monthly billing only,
 * Player and Player Pro, first-time customers only. Checkout applies it;
 * nobody types a code. Yearly already has a month free and gets no discount.
 * Every sentence that names the offer is built from this number.
 */
export const FIRST_MONTH_DISCOUNT_PERCENT = 30;

/** `30% off your first month` — the offer, as every surface names it. */
export function firstMonthOffer(): string {
  return `${FIRST_MONTH_DISCOUNT_PERCENT}% off your first month`;
}

/** The first day plans are enforced, a UTC calendar day. */
export const PLANS_BEGIN = "2027-01-01";

/** Whether `now` is on or after `PLANS_BEGIN`, read in UTC. */
export function plansHaveBegun(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(`${PLANS_BEGIN}T00:00:00Z`);
}

/** `January 2027` — the month plans begin, as a sentence says it. */
export function plansBeginMonth(): string {
  return new Date(`${PLANS_BEGIN}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether plans and extra hours can be BOUGHT at `now`. From `PLANS_BEGIN`
 * always. Before it, only once the owner sets `NEXT_PUBLIC_PLANS_ON_SALE=1`
 * (decision 8: a subscription bought in December is billed that day and its
 * hours start that day) — which waits on the Stripe products existing.
 * Unset, checkout opens on January 1.
 *
 * Selling and enforcing are two switches: `plansHaveBegun()` is when the
 * beta allowances end for everyone, this is when a card can be charged.
 */
export function plansOnSale(now: Date = new Date()): boolean {
  return plansHaveBegun(now) || process.env.NEXT_PUBLIC_PLANS_ON_SALE === "1";
}

/** No pilot runs past this day, whatever its own end date says. */
export const PILOT_LATEST_END = "2027-05-31";

/** `$1,650` — whole US dollars, which every price here is. */
export function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/**
 * `$288.50`, `$225`, `$1,650` — an amount in US cents, with the cents shown
 * only when there are any. The one money formatter for a figure that can
 * carry cents (an upgrade's credit, what is due today); `usd()` is for the
 * whole-dollar prices above.
 */
export function formatUsdCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safe < 0 ? "-" : "";
  const whole = safe % 100 === 0;
  return `${sign}$${(Math.abs(safe) / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/**
 * A match estimate for an hour count that is not a plan's own — extra hours,
 * what is left of a balance. A plan's card shows its stored `matches`, which
 * are the rounded figures agreed with the plans and are not this arithmetic.
 */
export function aboutMatches(hours: number): number {
  return Math.max(0, Math.round(hours / HOURS_PER_MATCH));
}

/**
 * `$35 an hour (about $60 per extra match)` — the extra-hours price as the
 * extra-hours row says it. The only place a price per hour is shown.
 */
export function extraHourRate(): string {
  return `${usd(EXTRA_HOUR_PRICE)} an hour (about ${usd(EXTRA_MATCH_PRICE)} per extra match)`;
}

/* ---------- Personal plans: billed monthly or yearly ---------- */

export type PersonalPlanId = "free" | "player" | "player-pro";
export type PlanPeriod = "monthly" | "yearly";

/** Who the personal plans are for, wherever one is introduced. */
export const PERSONAL_PLAN_AUDIENCE = "For players and parents.";

export type PersonalPlan = {
  id: PersonalPlanId;
  name: string;
  /** US dollars a month, billed monthly. */
  monthly: number;
  /** US dollars a year, billed yearly: eleven months' price. */
  yearly: number;
  /** Hours of video a month, which do not carry over. Null: the plan has none. */
  hours: number | null;
  /** About this many verified singles matches a month. Stated, not computed. */
  matches: number;
  /** Whether every match on the plan is Verified by Advantage. */
  verified: boolean;
};

export const PERSONAL_PLANS: readonly PersonalPlan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    // No free match. Free is SwingVision imports and Ask.
    hours: null,
    matches: 0,
    verified: false,
  },
  {
    id: "player",
    name: "Player",
    monthly: 150,
    yearly: 1650,
    hours: 5,
    matches: 3,
    verified: true,
  },
  {
    id: "player-pro",
    name: "Player Pro",
    monthly: 300,
    yearly: 3300,
    hours: 10,
    matches: 6,
    verified: true,
  },
];

export function isPersonalPlanId(value: unknown): value is PersonalPlanId {
  return PERSONAL_PLANS.some((plan) => plan.id === value);
}

/**
 * The ids the personal plans were sold under before they were renamed. Only
 * a link from outside still carries one (`?plan=coach` from the landing
 * site, a plan-intent cookie set before the rename); nothing stores them.
 */
const LEGACY_PERSONAL_PLAN_IDS: Readonly<Record<string, PersonalPlanId>> = {
  coach: "player",
  "coach-pro": "player-pro",
};

/**
 * The plan a value from OUTSIDE names (a query string, a cookie): a current
 * id as it is, a pre-rename id as the plan it became, anything else null.
 */
export function personalPlanIdFrom(value: unknown): PersonalPlanId | null {
  if (isPersonalPlanId(value)) return value;
  if (typeof value !== "string") return null;
  return Object.hasOwn(LEGACY_PERSONAL_PLAN_IDS, value)
    ? LEGACY_PERSONAL_PLAN_IDS[value]
    : null;
}

export function personalPlan(id: PersonalPlanId): PersonalPlan {
  const plan = PERSONAL_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** A personal plan's monthly video allowance in seconds; 0 for Free. */
export function planHoursSeconds(id: PersonalPlanId): number {
  return (personalPlan(id).hours ?? 0) * 3600;
}

/** What Free is, where a paid plan says its matches. */
export const FREE_PLAN_HEADLINE = "Free for SwingVision users";

/**
 * A personal plan in one line, matches first: `About 3 verified matches a
 * month`. Free has no video and says what it is instead.
 */
export function planHeadline(id: PersonalPlanId): string {
  const { hours, matches } = personalPlan(id);
  return hours === null
    ? FREE_PLAN_HEADLINE
    : `About ${matches} verified ${matches === 1 ? "match" : "matches"} a month`;
}

/**
 * The line under the headline: `5 hours of match video · every match
 * verified`. Null for Free, which has no hours.
 */
export function planHoursLine(id: PersonalPlanId): string | null {
  const { hours, verified } = personalPlan(id);
  if (hours === null) return null;
  return `${hours} ${hours === 1 ? "hour" : "hours"} of match video${
    verified ? " · every match verified" : ""
  }`;
}

/* ---------- College programs: priced by the season ---------- */

export type CollegePlanId = "starter" | "program" | "elite";
/** `program_plans.plan_term`. */
export type PlanTerm = "spring" | "full_year";

/** A term's price, its hours, and about how many verified matches that is. */
export type Allowance = { price: number; hours: number; matches: number };

export type CollegePlan = {
  id: CollegePlanId;
  name: string;
  spring: Allowance;
  fullYear: Allowance;
  /** What the hours cover, as a coach would say it. */
  covers: string;
  /** Rush jobs included a season. None in any plan — see `RUSH_PRICE`. */
  rushIncluded: number;
  /** Hours a month that go at Priority. None in any plan. */
  priorityHours: number | null;
  /** Priority bought on top (+`PRIORITY_ADDON_PERCENT`). Not on sale. */
  priorityAddon: boolean;
};

export const COLLEGE_PLANS: readonly CollegePlan[] = [
  {
    id: "starter",
    name: "Starter",
    spring: { price: 3000, hours: 80, matches: 45 },
    fullYear: { price: 4800, hours: 130, matches: 70 },
    covers: "Your top courts, every dual",
    rushIncluded: 0,
    priorityHours: null,
    priorityAddon: false,
  },
  {
    id: "program",
    name: "Program",
    spring: { price: 7500, hours: 225, matches: 125 },
    fullYear: { price: 10500, hours: 325, matches: 180 },
    covers: "Nearly every singles match, every dual",
    rushIncluded: 0,
    priorityHours: null,
    priorityAddon: false,
  },
  {
    id: "elite",
    name: "Elite",
    spring: { price: 12000, hours: 400, matches: 220 },
    fullYear: { price: 16500, hours: 550, matches: 305 },
    covers: "Every match, plus fall and practice",
    rushIncluded: 0,
    priorityHours: null,
    priorityAddon: false,
  },
];

export function isCollegePlanId(value: unknown): value is CollegePlanId {
  return COLLEGE_PLANS.some((plan) => plan.id === value);
}

export function isPlanTerm(value: unknown): value is PlanTerm {
  return value === "spring" || value === "full_year";
}

/** A term's name wherever one is printed: `Spring`, `Full year`. */
export const PLAN_TERM_LABELS = {
  spring: "Spring",
  full_year: "Full year",
} as const satisfies Record<PlanTerm, string>;

export function collegePlan(id: CollegePlanId): CollegePlan {
  const plan = COLLEGE_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown college plan: ${id}`);
  return plan;
}

/** What a college plan costs and holds for one term. */
export function seasonAllowance(
  planId: CollegePlanId,
  term: PlanTerm,
): Allowance {
  const plan = collegePlan(planId);
  return term === "spring" ? plan.spring : plan.fullYear;
}

/* ---------- Seasons ---------- */

/**
 * The dates Admin prefills for a term, as month-day pairs. Admin can set any
 * dates; these are only the defaults.
 *
 * Spring runs January 1 to May 31 of one year, and an admin may extend it to
 * `extendableTo` for a team still playing (NCAA championships). A full year
 * runs August 1 to July 31 of the NEXT year, and is never labelled "Spring".
 */
export const SEASON_DEFAULTS = {
  spring: { starts: "01-01", ends: "05-31", extendableTo: "06-30" },
  full_year: { starts: "08-01", ends: "07-31" },
} as const;

/**
 * A term's default window as ISO calendar days. `year` is the year the season
 * STARTS in: `("spring", 2027)` is 2027-01-01 to 2027-05-31, and
 * `("full_year", 2026)` is 2026-08-01 to 2027-07-31.
 */
export function defaultSeasonDates(
  term: PlanTerm,
  year: number,
): { startsOn: string; endsOn: string } {
  const season = SEASON_DEFAULTS[term];
  const endYear = term === "full_year" ? year + 1 : year;
  return {
    startsOn: `${year}-${season.starts}`,
    endsOn: `${endYear}-${season.ends}`,
  };
}

/** The latest day an admin extends a Spring plan starting in `year` to. */
export function springExtendedEnd(year: number): string {
  return `${year}-${SEASON_DEFAULTS.spring.extendableTo}`;
}

/* ---------- A team's assigned plan ---------- */

/**
 * The plan an admin assigned to a program: its `program_plans` row (`plan_id`,
 * `plan_term`, `starts_on`, `ends_on`). Rides on `Workspace.programPlan`.
 */
export type ProgramPlanRef = {
  id: CollegePlanId;
  term: PlanTerm;
  /** First day of the season, inclusive, `YYYY-MM-DD`. */
  startsOn: string;
  /** Last day of the season, inclusive, `YYYY-MM-DD`. Unused hours expire here. */
  endsOn: string;
  /**
   * `program_plans.hours_from`, an ISO instant: the moment the plan was first
   * saved. The season pool counts video analysed from the LATER of this and
   * `startsOn`, so nothing a team analysed before it had the plan is drawn
   * from it. Absent on a database without the column, which reads as "from
   * `startsOn`".
   */
  hoursFrom?: string | null;
};

export type ProgramPlan = ProgramPlanRef & {
  plan: CollegePlan;
  /** The plan's price, hours and match estimate for this term. */
  allowance: Allowance;
};

/**
 * The college plan a team workspace is on, with its season window, or null
 * for a personal workspace and for a team with no plan assigned. It says what
 * was assigned, not whether today falls inside the window: the caller that
 * gates on dates compares `startsOn` / `endsOn` itself.
 */
export function programPlanFor(
  workspace: { programPlan?: ProgramPlanRef | null } | null | undefined,
): ProgramPlan | null {
  const ref = workspace?.programPlan;
  if (!ref || !isCollegePlanId(ref.id) || !isPlanTerm(ref.term)) return null;
  return {
    ...ref,
    plan: collegePlan(ref.id),
    allowance: seasonAllowance(ref.id, ref.term),
  };
}

/* ---------- Ask ---------- */

/**
 * Ask questions a month on a personal plan, app and connector together.
 * Working numbers owned by the Ask session: change them here only, never in
 * the gate.
 */
export const ASK_QUESTIONS_PER_MONTH = {
  free: 20,
  player: 150,
  "player-pro": 300,
} as const satisfies Record<PersonalPlanId, number>;

/**
 * Ask questions a month for a team on a college plan: ONE pool the whole
 * team draws from, not a figure per person.
 */
export const ASK_TEAM_QUESTIONS_PER_MONTH = {
  starter: 500,
  program: 1000,
  elite: 2000,
} as const satisfies Record<CollegePlanId, number>;

/** An agent-mode question counts as this many. */
export const ASK_AGENT_QUESTION_WEIGHT = 3;
