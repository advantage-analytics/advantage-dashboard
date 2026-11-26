/**
 * The paid plans, from January 1, 2027 — the ONE place the dashboard writes a
 * price, an hour count, a match estimate, an Ask limit or a season date.
 *
 * Every figure is a copy of the landing site's
 * `advantage-landing/src/lib/plans.ts`, which is the source of truth for what
 * we sell. Pages, quota code, Stripe setup and emails read from here; nothing
 * is typed into a page. `tests/billing-plans.spec.ts` pins each figure to the
 * literal the landing file holds, so a change is one edit here plus that spec
 * (and the landing file, by hand — the two repos share no code).
 *
 * Two places this file deliberately differs from the landing file, both by
 * decision (docs/plans/2027-pricing.md, "Decisions"):
 *  - Free has NO video: no hours and no free match (decision 2). The landing
 *    file still carries a one-match offer behind `FREE_MATCH_OFFER`.
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
 * Rush and Priority. Kept for a later build: THIS build ignores them and
 * every job runs Standard. Do not read them into a gate or a price yet.
 */
export const RUSH_PRICE = 25;
export const PRIORITY_ADDON_PERCENT = 15;

/**
 * The paywall's offer: this much off the first month. Monthly billing only,
 * Coach and Coach Pro, first-time customers only. Checkout applies it; nobody
 * types a code. Yearly already has a month free and gets no discount.
 */
export const FIRST_MONTH_DISCOUNT_PERCENT = 50;

/** The first day plans are enforced, a UTC calendar day. */
export const PLANS_BEGIN = "2027-01-01";

/** Whether `now` is on or after `PLANS_BEGIN`, read in UTC. */
export function plansHaveBegun(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(`${PLANS_BEGIN}T00:00:00Z`);
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

/* ---------- Players and coaches: billed monthly or yearly ---------- */

export type CoachPlanId = "free" | "coach" | "coach-pro";
export type PlanPeriod = "monthly" | "yearly";

export type CoachPlan = {
  id: CoachPlanId;
  name: string;
  /** US dollars a month, billed monthly. */
  monthly: number;
  /** US dollars a year, billed yearly: eleven months' price. */
  yearly: number;
  /** Hours of video a month, which do not carry over. Null: the plan has none. */
  hours: number | null;
  /** About this many singles matches a month. Stored, not computed. */
  matches: number;
  /** Whether every match on the plan is Verified by Advantage. */
  verified: boolean;
};

export const COACH_PLANS: readonly CoachPlan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    // Decision 2: no free match. Free is SwingVision imports and Ask.
    hours: null,
    matches: 0,
    verified: false,
  },
  {
    id: "coach",
    name: "Coach",
    monthly: 150,
    yearly: 1650,
    hours: 5,
    matches: 3,
    verified: true,
  },
  {
    id: "coach-pro",
    name: "Coach Pro",
    monthly: 300,
    yearly: 3300,
    hours: 10,
    matches: 5,
    verified: true,
  },
];

export function isCoachPlanId(value: unknown): value is CoachPlanId {
  return COACH_PLANS.some((plan) => plan.id === value);
}

export function coachPlan(id: CoachPlanId): CoachPlan {
  const plan = COACH_PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** A personal plan's monthly video allowance in seconds; 0 for Free. */
export function planHoursSeconds(id: CoachPlanId): number {
  return (coachPlan(id).hours ?? 0) * 3600;
}

/* ---------- College programs: priced by the season ---------- */

export type CollegePlanId = "starter" | "program" | "elite";
/** `program_plans.plan_term`. */
export type PlanTerm = "spring" | "full_year";

export type Allowance = { price: number; hours: number; matches: number };

export type CollegePlan = {
  id: CollegePlanId;
  name: string;
  spring: Allowance;
  fullYear: Allowance;
  /** Rush jobs included a season. Ignored by this build — see `RUSH_PRICE`. */
  rushIncluded: number;
  /** Hours a month that go at Priority, when the plan includes any. Ignored by this build. */
  priorityHours: number | null;
  /** Priority can be bought on top (+`PRIORITY_ADDON_PERCENT`). Ignored by this build. */
  priorityAddon: boolean;
};

export const COLLEGE_PLANS: readonly CollegePlan[] = [
  {
    id: "starter",
    name: "Starter",
    spring: { price: 3000, hours: 80, matches: 45 },
    fullYear: { price: 4800, hours: 130, matches: 70 },
    rushIncluded: 0,
    priorityHours: null,
    priorityAddon: false,
  },
  {
    id: "program",
    name: "Program",
    spring: { price: 7500, hours: 200, matches: 110 },
    fullYear: { price: 10500, hours: 280, matches: 155 },
    rushIncluded: 3,
    priorityHours: null,
    priorityAddon: true,
  },
  {
    id: "elite",
    name: "Elite",
    spring: { price: 11000, hours: 300, matches: 165 },
    fullYear: { price: 15000, hours: 400, matches: 220 },
    rushIncluded: 6,
    priorityHours: 30,
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
 * Ask questions a month, app and connector together. Working numbers owned by
 * the Ask session: change them here only, never in the gate. Free's 20 is
 * advertised; the paid figures are a fair-use limit we do not advertise, and
 * at the limit the message is "Contact us", not a paywall.
 */
export const ASK_QUESTIONS_PER_MONTH = {
  free: 20,
  coach: 150,
  "coach-pro": 300,
  /** Each member of a team on a college plan. */
  teamMember: 300,
} as const satisfies Record<CoachPlanId | "teamMember", number>;

/** An agent-mode question counts as this many. */
export const ASK_AGENT_QUESTION_WEIGHT = 3;
