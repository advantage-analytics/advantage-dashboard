/**
 * What the one checkout dialog says — every line, price and button label, as
 * data, for each of its entry points.
 *
 * `PlanCheckoutDialog` (`components/dashboard/billing/`) draws exactly this
 * and holds no copy of its own, so the rows a player reads can be checked
 * without a browser (`tests/plan-checkout-view.spec.ts`). Every figure comes
 * from the plan module or from `/api/billing/upgrade/preview`; nothing here is
 * a typed price.
 *
 * Six scenes from five ways in, and one more that is a mock:
 *
 *   choose               Settings › Plan "Choose a plan", or `?plan=&period=`
 *   hours                "Buy hours" anywhere: 1–50 extra hours
 *   paywall-free         the upload wizard at Send, a Free player
 *   paywall-subscriber   the upload wizard at Send, a subscriber out of hours
 *   upgrade              Coach → Coach Pro, charged to the card on file
 *   pay-yearly           monthly → yearly on the same plan, charged the same way
 *   change               MOCK ONLY: a move that waits for renewal (a smaller
 *                        plan, yearly → monthly). No page opens it and no
 *                        endpoint makes it; `/design/plans-2027` draws it.
 *
 * The mode is what the caller asked for; the scene is what this account can
 * actually be shown (`checkoutScene()`): a subscriber asking to "choose a
 * plan" is shown the upgrade, and Coach Pro has nothing above it to move to.
 *
 * Client-safe and pure.
 */

import { formatHoursLong } from "@/lib/data/usage-format";
import {
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  aboutMatches,
  coachPlan,
  formatUsdCents,
  planHoursSeconds,
  usd,
  type CoachPlanId,
  type PlanPeriod,
} from "./plans";
import type { UpgradeQuote } from "./upgrade";

/** A plan that is sold: every `CoachPlanId` but Free. */
export type PaidPlan = Exclude<CoachPlanId, "free">;

/**
 * What every surface says to a subscriber whose renewal failed. The plan and
 * everything else on it stay while Stripe retries; this month's plan hours
 * arrive when the invoice is paid.
 */
export const PAST_DUE_SENTENCE =
  "Your last payment failed. Update your card to get this month's hours.";

/** Whole hours one purchase may hold — `MIN/MAX_EXTRA_HOURS` on the server. */
export const EXTRA_HOURS_MIN = 1;
export const EXTRA_HOURS_MAX = 50;

/** How the dialog was opened. */
export type CheckoutMode =
  | { kind: "choose"; plan?: PaidPlan; period?: PlanPeriod }
  | { kind: "hours" }
  /** The upload wizard, at Send: the trimmed video costs `neededSeconds`. */
  | { kind: "paywall"; neededSeconds: number }
  | { kind: "upgrade" }
  /** Settings › Plan "Switch to yearly": the same plan, paid yearly from today. */
  | { kind: "yearly" }
  /**
   * MOCK ONLY — nothing on a real page builds this mode and no endpoint
   * carries it out. A change that takes effect at renewal, as data.
   */
  | { kind: "change"; change: ScheduledChange };

/** A plan change that waits for the current period to end. Data only. */
export interface ScheduledChange {
  to: { plan: PaidPlan; period: PlanPeriod };
  /** The renewal day it takes effect, `YYYY-MM-DD` (UTC). */
  effectiveOn: string;
}

export type CheckoutScene =
  | "choose"
  | "hours"
  | "paywall-free"
  | "paywall-subscriber"
  | "upgrade"
  | "pay-yearly"
  | "change";

/** What the dialog knows about the buyer. */
export interface CheckoutAccount {
  /** The plan the account is on — `planFor(users.plan).id`. */
  plan: CoachPlanId;
  /** `users.plan_period`, when subscribed. */
  period: PlanPeriod | null;
  /** Hours left in the current window that are not extra hours. */
  planLeftSeconds: number;
  /** Extra hours (credits) left. */
  extraSeconds: number;
  /** When the plan's hours reset — "Feb 14" — or null when nothing does. */
  resetsOn: string | null;
  /**
   * Whether our own row says this account never subscribed. Checkout asks
   * Stripe too and has the last word (`firstMonthDiscount` in its answer).
   */
  firstMonthEligible: boolean;
  /**
   * The subscriber's last payment failed (`users.plan_status = 'past_due'`):
   * the plan stays, this month's plan hours wait on the card, and no plan
   * change is offered until it is updated.
   */
  pastDue?: boolean;
}

/**
 * `/api/billing/upgrade/preview`'s answer. `period` is how the subscription
 * is billed AFTER the change; `fromPeriod` how it is billed now, which
 * differs only for the switch to yearly (left out, the same).
 */
export type UpgradePreviewView = UpgradeQuote & {
  period: PlanPeriod;
  fromPeriod?: PlanPeriod;
};

export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: UpgradePreviewView }
  | { status: "failed"; message: string };

/**
 * What a refused `POST /api/billing/upgrade` does to the quote on screen.
 * A refusal says why the charge did not go through, not that the price is
 * gone: the row, the figure and "Continue to pay $X" stay, the sentence
 * shows beside them and the button stays pressable once the card is fixed.
 * Only `quote_changed` — the figure moved — asks for the price again.
 */
export function afterUpgradeRefusal(
  preview: PreviewState,
  code: string | undefined,
): { preview: PreviewState; refetch: boolean } {
  if (code === "quote_changed") {
    return { preview: { status: "loading" }, refetch: true };
  }
  return { preview, refetch: false };
}

export type CheckoutChoice =
  PaidPlan | "hours" | "upgrade" | "yearly" | "change";

export interface CheckoutSelection {
  choice: CheckoutChoice;
  period: PlanPeriod;
  /** Extra hours in the hours row, `EXTRA_HOURS_MIN`–`EXTRA_HOURS_MAX`. */
  hours: number;
}

/** What the primary button does. Null while there is nothing to pay for. */
export type CheckoutAction =
  | { kind: "plan"; plan: PaidPlan; period: PlanPeriod; amountCents: number }
  | { kind: "hours"; hours: number; amountCents: number }
  /** `period: "yearly"` is the switch to yearly; left out, Coach → Coach Pro. */
  | { kind: "upgrade"; payTodayCents: number; period?: "yearly" }
  /** MOCK ONLY: a change at renewal. The dialog closes; nothing is called. */
  | { kind: "schedule"; change: ScheduledChange };

export interface CheckoutRowView {
  id: CheckoutChoice | "current";
  name: string;
  /** A grey `StatePill` beside the name ("Your plan"). */
  pill?: string;
  line: string;
  price: string;
  /** The full price, struck through beside `price` when a discount applies. */
  was?: string;
  then?: string;
  selectable: boolean;
  selected: boolean;
  /** A caption printed above the row ("Or pay for just this match"). */
  caption?: string;
  /** The hours in this row can be changed with the quick picks above it. */
  adjustable?: boolean;
  /** The figures are still being fetched: draw bars, not numbers. */
  pending?: boolean;
}

export interface CheckoutView {
  scene: CheckoutScene;
  band: {
    lead: string;
    figure: string;
    trail: string;
    body: string;
    offer: string;
    offerDetail: string;
  };
  /** Monthly / Yearly pills above the rows. */
  periodPills: boolean;
  radioLabel: string;
  rows: CheckoutRowView[];
  aside: string | null;
  /** "See a sample report" closes the aside. */
  sampleLink: boolean;
  /** Why there is nothing to pay for (the upgrade could not be priced). */
  problem: string | null;
  /**
   * The aside ends with "Update card", which opens Stripe's portal: a
   * subscriber whose payment failed.
   */
  portalLink?: boolean;
  secondary: "Not now" | "Shorten the trim instead";
  primary: string;
  action: CheckoutAction | null;
  /** What the dialog says while the card on file is being charged. */
  working?: string;
}

function isPaid(plan: CoachPlanId): plan is PaidPlan {
  return plan !== "free";
}

/** `0h`, `23m`, `3h 12m` — a balance, which reads "0h" at nothing, not "0m". */
export function hoursLeftLabel(seconds: number): string {
  return seconds <= 0 ? "0h" : formatHoursLong(seconds);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `26` → `26th`. */
export function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

function clampHours(hours: number): number {
  if (!Number.isFinite(hours)) return EXTRA_HOURS_MIN;
  return Math.min(
    EXTRA_HOURS_MAX,
    Math.max(EXTRA_HOURS_MIN, Math.round(hours)),
  );
}

/** Whole extra hours that cover a shortfall, within what one purchase holds. */
export function extraHoursToCover(shortSeconds: number): number {
  return clampHours(Math.ceil(Math.max(0, shortSeconds) / 3600));
}

/** What of the account decides the scene: the plan, and how it is billed. */
type SceneAccount = Pick<CheckoutAccount, "plan"> &
  Partial<Pick<CheckoutAccount, "period" | "pastDue">>;

/** Which scene this account is shown for the mode the caller asked for. */
export function checkoutScene(
  mode: CheckoutMode,
  account: SceneAccount,
): CheckoutScene {
  if (mode.kind === "paywall") {
    return isPaid(account.plan) ? "paywall-subscriber" : "paywall-free";
  }
  if (mode.kind === "hours") return "hours";
  // A plan to change is a plan held: anyone else is choosing their first.
  if (account.plan === "free") return "choose";
  if (mode.kind === "change") return "change";
  if (mode.kind === "yearly") {
    // Only a monthly subscriber has a year to switch to.
    return account.period === "monthly" ? "pay-yearly" : "hours";
  }
  // Choosing or upgrading: by the plan the account is already on.
  if (account.plan === "coach") return "upgrade";
  return "hours";
}

/** Whether the scene needs `/api/billing/upgrade/preview`. */
export function needsUpgradePreview(
  mode: CheckoutMode,
  account: SceneAccount,
): boolean {
  const scene = checkoutScene(mode, account);
  return (
    scene === "upgrade" ||
    scene === "pay-yearly" ||
    // No plan change is offered over a failed payment, so none is priced.
    (scene === "paywall-subscriber" &&
      account.plan === "coach" &&
      !account.pastDue)
  );
}

/**
 * What `/api/billing/upgrade` and its preview are sent for the scene: the
 * switch to yearly names its period, the plan upgrade sends nothing.
 */
export function upgradeRequestFor(
  mode: CheckoutMode,
  account: SceneAccount,
): { period: "yearly" } | undefined {
  return checkoutScene(mode, account) === "pay-yearly"
    ? { period: "yearly" }
    : undefined;
}

/** Seconds the video is short of what the account holds. */
function shortfall(mode: CheckoutMode, account: CheckoutAccount): number {
  if (mode.kind !== "paywall") return 0;
  return Math.max(
    0,
    mode.neededSeconds - account.planLeftSeconds - account.extraSeconds,
  );
}

/** What is chosen when the dialog opens. */
export function initialSelection(
  mode: CheckoutMode,
  account: CheckoutAccount,
): CheckoutSelection {
  const scene = checkoutScene(mode, account);
  const hours = extraHoursToCover(shortfall(mode, account));
  switch (scene) {
    case "choose":
      return {
        choice: (mode.kind === "choose" && mode.plan) || "coach",
        period: (mode.kind === "choose" && mode.period) || "monthly",
        hours,
      };
    case "paywall-free":
      return { choice: "coach", period: "monthly", hours };
    case "upgrade":
      return { choice: "upgrade", period: account.period ?? "monthly", hours };
    case "pay-yearly":
      return { choice: "yearly", period: "yearly", hours };
    case "change":
      return {
        choice: "change",
        period:
          mode.kind === "change"
            ? mode.change.to.period
            : (account.period ?? "monthly"),
        hours,
      };
    case "paywall-subscriber":
    case "hours":
      return { choice: "hours", period: account.period ?? "monthly", hours };
  }
}

/** What a new subscription costs today, and what it costs after. */
export function planPricing(
  plan: PaidPlan,
  period: PlanPeriod,
  firstMonthEligible: boolean,
): { dueCents: number; wasCents: number | null; then: string } {
  const { monthly, yearly } = coachPlan(plan);
  if (period === "yearly") {
    // Eleven months' price: the struck figure is the twelve it replaces.
    return {
      dueCents: yearly * 100,
      wasCents: monthly * 12 * 100,
      then: "a year",
    };
  }
  if (firstMonthEligible) {
    return {
      dueCents: Math.round(
        (monthly * 100 * (100 - FIRST_MONTH_DISCOUNT_PERCENT)) / 100,
      ),
      wasCents: monthly * 100,
      then: `then ${usd(monthly)} a month`,
    };
  }
  return { dueCents: monthly * 100, wasCents: null, then: "a month" };
}

/** "Half off your first month". */
function firstMonthOffer(): string {
  return FIRST_MONTH_DISCOUNT_PERCENT === 50
    ? "Half off your first month"
    : `${FIRST_MONTH_DISCOUNT_PERCENT}% off your first month`;
}

/** `5h a month, about 3 matches`. */
function planLine(plan: PaidPlan): string {
  const { hours, matches } = coachPlan(plan);
  return `${hours ?? 0}h a month, about ${matches} matches`;
}

function hoursName(hours: number): string {
  return plural(hours, "extra hour", "extra hours");
}

const HOUR_RATE = `${usd(EXTRA_HOUR_PRICE)} an hour`;
const HOURS_LAST = `Last ${EXTRA_HOUR_VALIDITY_MONTHS} months`;
const SALES_FINAL = "All sales final, except where required by law.";

function planRow(
  plan: PaidPlan,
  selection: CheckoutSelection,
  account: CheckoutAccount,
  period: PlanPeriod,
  line: string,
): { row: CheckoutRowView; dueCents: number } {
  const pricing = planPricing(plan, period, account.firstMonthEligible);
  return {
    dueCents: pricing.dueCents,
    row: {
      id: plan,
      name: coachPlan(plan).name,
      line,
      price: formatUsdCents(pricing.dueCents),
      ...(pricing.wasCents !== null
        ? { was: formatUsdCents(pricing.wasCents) }
        : {}),
      then: pricing.then,
      selectable: true,
      selected: selection.choice === plan,
    },
  };
}

/** What the credit is "for": the share that set it. */
function creditFor(preview: UpgradePreviewView): string {
  return preview.creditBasis === "days"
    ? `your ${plural(preview.daysLeft, "day", "days")} left`
    : `your ${hoursLeftLabel(preview.periodHoursLeftSeconds)}`;
}

function upgradeRow(
  preview: PreviewState,
  selected: boolean,
): CheckoutRowView | null {
  const pro = coachPlan("coach-pro");
  if (preview.status === "failed" || preview.status === "idle") return null;
  if (preview.status === "loading") {
    return {
      id: "upgrade",
      name: pro.name,
      line: "Checking today's price",
      price: "",
      selectable: false,
      selected,
      pending: true,
    };
  }
  const quote = preview.preview;
  return {
    id: "upgrade",
    name: pro.name,
    line:
      quote.creditCents > 0
        ? `${pro.hours ?? 0} fresh hours today · ${formatUsdCents(quote.creditCents)} credit for ${creditFor(quote)}`
        : `${pro.hours ?? 0} fresh hours today`,
    price: formatUsdCents(quote.payTodayCents),
    then:
      quote.period === "yearly"
        ? `then ${usd(pro.yearly)} a year`
        : `then ${usd(pro.monthly)} a month`,
    selectable: true,
    selected,
  };
}

/** "…billed $300 on the 26th of each month" / "…$3,300 a year, next on Nov 26, 2027". */
function billedFrom(quote: UpgradePreviewView): string {
  const price = formatUsdCents(quote.newPeriodPriceCents);
  const next = new Date(`${quote.nextBillingDay}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return `From today you're billed ${price}`;
  if (quote.period === "yearly") {
    const day = next.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `From today you're billed ${price} a year, next on ${day}`;
  }
  return `From today you're billed ${price} on the ${ordinal(next.getUTCDate())} of each month`;
}

function payLabel(amountCents: number, sendsAfterPay: boolean): string {
  const amount = formatUsdCents(amountCents);
  return sendsAfterPay ? `Pay ${amount} and send` : `Continue to pay ${amount}`;
}

export function buildCheckoutView(input: {
  mode: CheckoutMode;
  account: CheckoutAccount;
  selection: CheckoutSelection;
  preview?: PreviewState;
  /** The wizard carries on once the hours land: "Pay $X and send". */
  sendsAfterPay?: boolean;
  /** The dialog sits over the trim step: closing it is shortening the trim. */
  canShortenTrim?: boolean;
}): CheckoutView {
  const { mode, account, selection } = input;
  const preview: PreviewState = input.preview ?? { status: "idle" };
  const sendsAfterPay = input.sendsAfterPay === true;
  const scene = checkoutScene(mode, account);
  const hours = clampHours(selection.hours);
  const hoursCents = hours * EXTRA_HOUR_PRICE * 100;
  const secondary =
    input.canShortenTrim && mode.kind === "paywall"
      ? "Shorten the trim instead"
      : "Not now";
  const current = isPaid(account.plan) ? coachPlan(account.plan) : null;
  const subscriberOffer = {
    offer: `${current?.name ?? "Free"} · ${hoursLeftLabel(account.planLeftSeconds)} left this month`,
    offerDetail: account.pastDue
      ? "Payment failed"
      : account.resetsOn
        ? `Hours reset ${account.resetsOn}`
        : "",
  };

  if (scene === "choose") {
    const chosen: PaidPlan =
      selection.choice === "coach-pro" ? "coach-pro" : "coach";
    const plan = coachPlan(chosen);
    const rows = (["coach", "coach-pro"] as const).map((id) =>
      planRow(
        id,
        { ...selection, choice: chosen },
        account,
        selection.period,
        planLine(id),
      ),
    );
    const due = rows.find((entry) => entry.row.id === chosen)!.dueCents;
    const pricing = planPricing(
      chosen,
      selection.period,
      account.firstMonthEligible,
    );
    return {
      scene,
      band: {
        lead: "Start",
        figure: plan.name,
        trail: ".",
        body: `${plan.hours ?? 0} hours of match video a month, about ${plan.matches} matches, with Verified by Advantage on every match.`,
        offer:
          selection.period === "yearly"
            ? "One month free"
            : pricing.wasCents !== null
              ? firstMonthOffer()
              : "Billed monthly",
        offerDetail:
          selection.period === "yearly"
            ? `${usd(plan.yearly)} a year`
            : pricing.wasCents !== null
              ? `${formatUsdCents(due)} today, then ${usd(plan.monthly)} a month`
              : `${usd(plan.monthly)} a month`,
      },
      periodPills: true,
      radioLabel: "Plan",
      rows: rows.map((entry) => entry.row),
      aside:
        "Cancel any time in Settings › Plan. Tax is added where it applies.",
      sampleLink: true,
      problem: null,
      secondary,
      primary: payLabel(due, false),
      action: {
        kind: "plan",
        plan: chosen,
        period: selection.period,
        amountCents: due,
      },
    };
  }

  if (scene === "hours") {
    const left = account.planLeftSeconds + account.extraSeconds;
    return {
      scene,
      band: {
        lead: "Add",
        figure: "extra hours",
        trail: ".",
        body: current
          ? `${HOUR_RATE}. Extra hours last ${EXTRA_HOUR_VALIDITY_MONTHS} months and are used after your plan's hours.`
          : `${HOUR_RATE}, no plan needed. Extra hours last ${EXTRA_HOUR_VALIDITY_MONTHS} months.`,
        ...(current
          ? subscriberOffer
          : {
              offer: `Free · ${hoursLeftLabel(left)} left`,
              offerDetail: HOUR_RATE,
            }),
      },
      periodPills: false,
      radioLabel: "Extra hours",
      rows: [
        {
          id: "hours",
          name: hoursName(hours),
          line: `About ${plural(aboutMatches(hours), "match", "matches")} · ${HOURS_LAST}`,
          price: formatUsdCents(hoursCents),
          then: HOUR_RATE,
          selectable: true,
          selected: true,
          adjustable: true,
        },
      ],
      aside: SALES_FINAL,
      sampleLink: false,
      problem: null,
      secondary,
      primary: payLabel(hoursCents, false),
      action: { kind: "hours", hours, amountCents: hoursCents },
    };
  }

  const needed = mode.kind === "paywall" ? mode.neededSeconds : 0;
  const neededBand = {
    lead: "This match needs",
    figure: formatHoursLong(needed),
    trail: ".",
  };
  const afterHours =
    account.planLeftSeconds + account.extraSeconds + hours * 3600;

  if (scene === "paywall-free") {
    const chosen: PaidPlan | "hours" =
      selection.choice === "hours" || selection.choice === "coach-pro"
        ? selection.choice
        : "coach";
    const picked = { ...selection, choice: chosen };
    const plans = (["coach", "coach-pro"] as const).map((id) =>
      planRow(
        id,
        picked,
        account,
        "monthly",
        `${planLine(id)} · Verified by Advantage`,
      ),
    );
    const coach = coachPlan("coach");
    const coachPricing = planPricing(
      "coach",
      "monthly",
      account.firstMonthEligible,
    );
    const hoursRow: CheckoutRowView = {
      id: "hours",
      name: hoursName(hours),
      line: `${HOUR_RATE} · No plan · ${HOURS_LAST}`,
      price: formatUsdCents(hoursCents),
      selectable: true,
      selected: chosen === "hours",
      caption: "Or pay for just this match",
    };

    let aside: string;
    let action: CheckoutAction;
    if (chosen === "hours") {
      aside =
        afterHours >= needed
          ? `Covers it, ${formatHoursLong(afterHours - needed)} to spare. ${SALES_FINAL}`
          : `Covers ${formatHoursLong(afterHours)} of this match; shorten the trim to fit. ${SALES_FINAL}`;
      action = { kind: "hours", hours, amountCents: hoursCents };
    } else {
      const plan = coachPlan(chosen);
      // A new plan's hours replace whatever the month held; extra hours stay.
      const after = planHoursSeconds(chosen) + account.extraSeconds;
      const covers =
        after >= needed
          ? `${plan.name} covers this match with ${formatHoursLong(after - needed)} to spare.`
          : `${plan.name} covers ${formatHoursLong(after)} of this match; shorten the trim to fit.`;
      aside = `${covers} Prefer yearly? ${usd(plan.yearly)}, one month free.`;
      action = {
        kind: "plan",
        plan: chosen,
        period: "monthly",
        amountCents: plans.find((entry) => entry.row.id === chosen)!.dueCents,
      };
    }

    return {
      scene,
      band: {
        ...neededBand,
        body: "Pick how to pay and it's analyzed right away. Your file and trim stay put while you pay.",
        offer:
          coachPricing.wasCents !== null
            ? firstMonthOffer()
            : `Plans from ${usd(coach.monthly)} a month`,
        offerDetail:
          coachPricing.wasCents !== null
            ? `${coach.name} ${formatUsdCents(coachPricing.dueCents)} today, then ${usd(coach.monthly)} a month`
            : `Extra hours ${HOUR_RATE}`,
      },
      periodPills: false,
      radioLabel: "How to pay",
      rows: [...plans.map((entry) => entry.row), hoursRow],
      aside,
      sampleLink: chosen !== "hours",
      problem: null,
      secondary,
      primary: payLabel(action.amountCents, sendsAfterPay),
      action,
    };
  }

  if (scene === "paywall-subscriber") {
    // A failed payment: no plan change is offered; extra hours still work.
    const pastDue = account.pastDue === true;
    const canUpgrade = account.plan === "coach" && !pastDue;
    const upgrade = canUpgrade
      ? upgradeRow(preview, selection.choice === "upgrade")
      : null;
    const upgrading =
      selection.choice === "upgrade" && upgrade?.selectable === true;
    const hoursRow: CheckoutRowView = {
      id: "hours",
      name: hoursName(hours),
      line:
        afterHours >= needed
          ? `Covers it, ${formatHoursLong(afterHours - needed)} to spare · ${HOURS_LAST}`
          : HOURS_LAST,
      price: formatUsdCents(hoursCents),
      then: HOUR_RATE,
      selectable: true,
      selected: !upgrading,
    };
    const rows = [hoursRow];
    if (upgrade) {
      rows.push({
        ...upgrade,
        name: `Move up to ${upgrade.name}`,
        selected: upgrading,
      });
    }
    const action: CheckoutAction =
      upgrading && preview.status === "ready"
        ? { kind: "upgrade", payTodayCents: preview.preview.payTodayCents }
        : { kind: "hours", hours, amountCents: hoursCents };
    return {
      scene,
      band: {
        ...neededBand,
        body: canUpgrade
          ? "Add hours or move up a plan and it's analyzed right away. Your file and trim stay put while you pay."
          : "Add hours and it's analyzed right away. Your file and trim stay put while you pay.",
        ...subscriberOffer,
      },
      periodPills: false,
      radioLabel: "How to pay",
      rows,
      aside: pastDue
        ? PAST_DUE_SENTENCE
        : account.resetsOn
          ? `Or keep it as a draft and send it when your hours reset on ${account.resetsOn}.`
          : "Or keep it as a draft and send it later.",
      sampleLink: false,
      ...(pastDue ? { portalLink: true } : {}),
      problem: null,
      secondary,
      primary: payLabel(
        action.kind === "upgrade" ? action.payTodayCents : action.amountCents,
        sendsAfterPay,
      ),
      action,
    };
  }

  if (scene === "pay-yearly" && current) {
    return payYearlyView({ account, current, preview, secondary });
  }
  if (scene === "change" && current && mode.kind === "change") {
    return scheduledChangeView({
      account,
      current,
      change: mode.change,
      secondary,
    });
  }

  // Upgrade, from Settings › Plan: Coach → Coach Pro on the same period.
  const pro = coachPlan("coach-pro");
  const coach = coachPlan("coach");
  const period =
    preview.status === "ready"
      ? preview.preview.period
      : (account.period ?? "monthly");
  const yearly = period === "yearly";
  const row = upgradeRow(preview, true);
  const currentRow: CheckoutRowView = {
    id: "current",
    name: coach.name,
    pill: "Your plan",
    line: planLine("coach"),
    price: usd(yearly ? coach.yearly : coach.monthly),
    then: yearly ? "a year" : "a month",
    selectable: false,
    selected: false,
  };

  let aside: string | null = null;
  let action: CheckoutAction | null = null;
  let primary = "Continue to pay";
  if (preview.status === "ready") {
    const quote = preview.preview;
    const extra =
      account.extraSeconds > 0
        ? `, and your ${formatHoursLong(account.extraSeconds)} of extra hours stays`
        : "";
    // A discount cut what was paid: say what the two shares are of.
    const paidNote =
      quote.creditBaseCents < quote.oldPeriodPriceCents
        ? `, of the ${formatUsdCents(quote.creditBaseCents)} you paid this ${yearly ? "year" : "month"}`
        : "";
    aside =
      `Your credit is the smaller of what's left of your ${coach.name} ${yearly ? "year" : "month"}: ` +
      `${plural(quote.daysLeft, "day", "days")} (${formatUsdCents(quote.daysCreditCents)}) or ` +
      `${hoursLeftLabel(quote.periodHoursLeftSeconds)} of hours (${formatUsdCents(quote.hoursCreditCents)})${paidNote}. ` +
      `${billedFrom(quote)}${extra}.`;
    action = { kind: "upgrade", payTodayCents: quote.payTodayCents };
    primary = payLabel(quote.payTodayCents, false);
  }

  return {
    scene,
    band: {
      lead: "Move up to",
      figure: pro.name,
      trail: ".",
      body: `${pro.hours ?? 0} hours of match video a month, about ${pro.matches} matches. Your new ${yearly ? "year" : "month"} starts today with all ${pro.hours ?? 0} hours.`,
      ...subscriberOffer,
    },
    periodPills: false,
    radioLabel: "Plan",
    rows: row ? [row, currentRow] : [currentRow],
    aside,
    sampleLink: false,
    problem: preview.status === "failed" ? preview.message : null,
    secondary,
    primary,
    action,
    working: `Moving you up to ${pro.name}…`,
  };
}

/* ---------- Pay yearly ---------- */

/**
 * `Feb 14`, or `Apr 29, 2028` with the year, UTC, from an ISO day or instant.
 * Null when unreadable.
 */
export function utcDayLabel(iso: string, withYear: boolean): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * Monthly → yearly on the same plan, from Settings › Plan. The card on file
 * is charged the yearly price less the credit for the unused month, exactly
 * as the upgrade is; the rows are the year and the month it replaces.
 */
function payYearlyView(input: {
  account: CheckoutAccount;
  current: ReturnType<typeof coachPlan>;
  preview: PreviewState;
  secondary: CheckoutView["secondary"];
}): CheckoutView {
  const { account, current, preview, secondary } = input;
  const hours = current.hours ?? 0;
  const name = `${current.name}, yearly`;

  const rows: CheckoutRowView[] = [];
  let aside: string | null = null;
  let action: CheckoutAction | null = null;
  let primary = "Continue to pay";

  if (preview.status === "loading") {
    rows.push({
      id: "yearly",
      name,
      line: "Checking today's price",
      price: "",
      selectable: false,
      selected: true,
      pending: true,
    });
  } else if (preview.status === "ready") {
    const quote = preview.preview;
    rows.push({
      id: "yearly",
      name,
      line:
        quote.creditCents > 0
          ? `${formatUsdCents(quote.creditCents)} credit for ${creditFor(quote)}`
          : `${hours} fresh hours today, then ${hours} each month`,
      price: formatUsdCents(quote.payTodayCents),
      then: `then ${usd(current.yearly)} a year`,
      selectable: true,
      selected: true,
    });
    const extra =
      account.extraSeconds > 0
        ? `, and your ${formatHoursLong(account.extraSeconds)} of extra hours stays`
        : "";
    const paidNote =
      quote.creditBaseCents < quote.oldPeriodPriceCents
        ? `, of the ${formatUsdCents(quote.creditBaseCents)} you paid this month`
        : "";
    const next = utcDayLabel(quote.nextBillingDay, true);
    aside =
      `Your credit is the smaller of what's left of your ${current.name} month: ` +
      `${plural(quote.daysLeft, "day", "days")} (${formatUsdCents(quote.daysCreditCents)}) or ` +
      `${hoursLeftLabel(quote.periodHoursLeftSeconds)} of hours (${formatUsdCents(quote.hoursCreditCents)})${paidNote}. ` +
      `Then ${usd(current.yearly)} a year${next ? `, next on ${next}` : ""}${extra}.`;
    action = {
      kind: "upgrade",
      payTodayCents: quote.payTodayCents,
      period: "yearly",
    };
    primary = payLabel(quote.payTodayCents, false);
  }

  rows.push({
    id: "current",
    name: `${current.name}, monthly`,
    pill: "Your plan",
    line: planLine(current.id as PaidPlan),
    price: usd(current.monthly),
    then: "a month",
    selectable: false,
    selected: false,
  });

  return {
    scene: "pay-yearly",
    band: {
      lead: "Pay",
      figure: "yearly",
      trail: ".",
      body: `${current.name} for ${usd(current.yearly)} a year: one month free. Your year starts today with a fresh ${hours} hours, and ${hours} more each month.`,
      offer: `${current.name} · ${hoursLeftLabel(account.planLeftSeconds)} left this month`,
      offerDetail: account.resetsOn ? `Hours reset ${account.resetsOn}` : "",
    },
    periodPills: false,
    radioLabel: "Billing",
    rows,
    aside,
    sampleLink: false,
    problem: preview.status === "failed" ? preview.message : null,
    secondary,
    primary,
    action,
    working: "Switching you to yearly…",
  };
}

/* ---------- A change at renewal (MOCK ONLY) ---------- */

/**
 * MOCK ONLY. A smaller plan, or yearly → monthly: both wait for the current
 * period to end and charge nothing today. Composed from the plan module and
 * the change's own data so the owner can see it on the real dialog; there is
 * no endpoint behind the button and no page that opens it.
 */
function scheduledChangeView(input: {
  account: CheckoutAccount;
  current: ReturnType<typeof coachPlan>;
  change: ScheduledChange;
  secondary: CheckoutView["secondary"];
}): CheckoutView {
  const { account, current, change, secondary } = input;
  const to = coachPlan(change.to.plan);
  const wasYearly = account.period === "yearly";
  // A year's renewal is far enough off to want its year.
  const on = utcDayLabel(change.effectiveOn, wasYearly) ?? "renewal";
  const toPrice =
    change.to.period === "yearly"
      ? `${usd(to.yearly)} a year`
      : `${usd(to.monthly)} a month`;
  const periodOnly = change.to.plan === current.id;
  const currentHours = current.hours ?? 0;
  const offer = {
    offer: `${current.name} · ${hoursLeftLabel(account.planLeftSeconds)} left this month`,
    offerDetail: account.resetsOn ? `Hours reset ${account.resetsOn}` : "",
  };

  return {
    scene: "change",
    band: periodOnly
      ? {
          lead: "Pay",
          figure: change.to.period,
          trail: ".",
          body: `${to.name} at ${toPrice} from ${on}. Your hours stay ${to.hours ?? 0} a month.`,
          ...offer,
        }
      : {
          lead: "Move down to",
          figure: to.name,
          trail: ".",
          body: `${to.hours ?? 0} hours of match video a month, about ${to.matches} matches, from ${on}.`,
          ...offer,
        },
    periodPills: false,
    radioLabel: "Plan",
    rows: [
      {
        id: "change",
        name: periodOnly ? `${to.name}, ${change.to.period}` : to.name,
        line: periodOnly
          ? `${toPrice} from ${on}`
          : `${toPrice} from ${on} · ${to.hours ?? 0} hours a month`,
        price: formatUsdCents(0),
        then: "today",
        selectable: true,
        selected: true,
      },
      {
        id: "current",
        name: periodOnly
          ? `${current.name}, ${wasYearly ? "yearly" : "monthly"}`
          : current.name,
        pill: "Your plan",
        line: planLine(current.id as PaidPlan),
        price: usd(wasYearly ? current.yearly : current.monthly),
        then: wasYearly ? "a year" : "a month",
        selectable: false,
        selected: false,
      },
    ],
    aside: periodOnly
      ? `Your ${wasYearly ? "year" : "month"} is paid through ${on}. Nothing is charged today.`
      : `You keep ${current.name} and its ${currentHours} hours until ${on}. Nothing is charged today.`,
    sampleLink: false,
    problem: null,
    secondary,
    primary: periodOnly ? `Switch on ${on}` : `Move to ${to.name} on ${on}`,
    action: { kind: "schedule", change },
  };
}

/* ---------- The upload wizard's file step and footer ---------- */

/**
 * The one-line grey note above the drop zone, when hours are the news:
 *
 *  - `no-hours`: a Free player with nothing to spend, told before they pick a
 *    video that a plan or hours comes before analysis;
 *  - `too-long`: a subscriber whose picked video is longer than what is left;
 *  - `past-due`: a subscriber whose last payment failed, so this month's plan
 *    hours are not there yet. Said whatever is left, before the other two.
 *
 * `remainingSeconds` is plan hours and extra hours together, undefined while
 * the reading loads — an unread number never puts a note on screen.
 */
export type FileStepHoursNote =
  | { kind: "none" }
  | { kind: "no-hours" }
  | { kind: "too-long"; leftSeconds: number }
  /** A subscriber whose last payment failed: this month's hours wait on it. */
  | { kind: "past-due" };

export function fileStepHoursNote(input: {
  /** Plans are on sale, the upload bills a personal workspace, and it is a video. */
  enabled: boolean;
  plan: CoachPlanId;
  remainingSeconds: number | undefined;
  /** The picked video's length, when one is picked and measured. */
  videoSeconds?: number | null;
  /** `VideoAllowance.pastDue` for the billed workspace. */
  pastDue?: boolean;
}): FileStepHoursNote {
  const { enabled, plan, remainingSeconds, videoSeconds } = input;
  if (!enabled || remainingSeconds === undefined) return { kind: "none" };
  if (!isPaid(plan)) {
    return remainingSeconds <= 0 ? { kind: "no-hours" } : { kind: "none" };
  }
  if (input.pastDue) return { kind: "past-due" };
  return typeof videoSeconds === "number" && videoSeconds > remainingSeconds
    ? { kind: "too-long", leftSeconds: remainingSeconds }
    : { kind: "none" };
}

/**
 * What follows the footer meter's figure, true for the allowance in force:
 * a plan's reset day, "Free plan" where there are no plan hours, and the
 * beta's own wording until plans begin. Null keeps the caller's default.
 */
export function meterSuffix(input: {
  /** `VideoAllowance.kind` for the billed workspace. */
  allowanceKind: string;
  resetsOn: string | null;
  /** `VideoAllowance.pastDue`: no reset day to name, only the failed payment. */
  pastDue?: boolean;
}): string | null {
  if (input.pastDue) return "payment failed";
  if (input.allowanceKind === "plan") {
    return input.resetsOn ? `resets ${input.resetsOn}` : "plan hours";
  }
  if (input.allowanceKind === "none") return "Free plan";
  return null;
}

/* ---------- A finished purchase ---------- */

/** What a finished purchase hands back to the page that opened the dialog. */
export type CheckoutResult =
  | { kind: "hours"; hours: number; seconds: number; expiresAt: string }
  | { kind: "plan"; plan: PaidPlan; period: PlanPeriod }
  | { kind: "upgrade"; plan: PaidPlan; period: PlanPeriod }
  /** The same plan, now paid yearly. */
  | { kind: "yearly"; plan: PaidPlan; period: "yearly" };

/**
 * The one line a page shows after a purchase: what was added, in bold, then
 * what it means. A changed state, not a tick.
 */
export function purchaseNote(result: CheckoutResult): {
  lead: string;
  rest: string;
} {
  if (result.kind === "hours") {
    const until = new Date(result.expiresAt);
    // One hour is "it": "1 extra hour added. They last…" did not agree.
    const verb = result.hours === 1 ? "It lasts" : "They last";
    const day = until.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const lasts = Number.isNaN(until.getTime()) ? "" : `${verb} until ${day}. `;
    return {
      lead: `${hoursName(result.hours)} added.`,
      rest: `${lasts}A receipt is on its way to your email.`,
    };
  }
  const plan = coachPlan(result.plan);
  if (result.kind === "yearly") {
    return {
      lead: `${plan.name} is now paid yearly.`,
      rest: `Your ${plan.hours ?? 0} hours are ready. A receipt is on its way to your email.`,
    };
  }
  return {
    lead:
      result.kind === "upgrade"
        ? `You're on ${plan.name}.`
        : `${plan.name} started.`,
    rest: `Your ${plan.hours ?? 0} hours are ready. A receipt is on its way to your email.`,
  };
}
