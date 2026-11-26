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
 * Five scenes from four ways in:
 *
 *   choose               Settings › Plan "Choose a plan", or `?plan=&period=`
 *   hours                "Buy hours" anywhere: 1–50 extra hours
 *   paywall-free         the upload wizard at Send, a Free player
 *   paywall-subscriber   the upload wizard at Send, a subscriber out of hours
 *   upgrade              Coach → Coach Pro, charged to the card on file
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

/** Whole hours one purchase may hold — `MIN/MAX_EXTRA_HOURS` on the server. */
export const EXTRA_HOURS_MIN = 1;
export const EXTRA_HOURS_MAX = 50;

/** How the dialog was opened. */
export type CheckoutMode =
  | { kind: "choose"; plan?: PaidPlan; period?: PlanPeriod }
  | { kind: "hours" }
  /** The upload wizard, at Send: the trimmed video costs `neededSeconds`. */
  | { kind: "paywall"; neededSeconds: number }
  | { kind: "upgrade" };

export type CheckoutScene =
  "choose" | "hours" | "paywall-free" | "paywall-subscriber" | "upgrade";

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
}

/** `/api/billing/upgrade/preview`'s answer. */
export type UpgradePreviewView = UpgradeQuote & { period: PlanPeriod };

export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: UpgradePreviewView }
  | { status: "failed"; message: string };

export type CheckoutChoice = PaidPlan | "hours" | "upgrade";

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
  | { kind: "upgrade"; payTodayCents: number };

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
  secondary: "Not now" | "Shorten the trim instead";
  primary: string;
  action: CheckoutAction | null;
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

/** Which scene this account is shown for the mode the caller asked for. */
export function checkoutScene(
  mode: CheckoutMode,
  account: Pick<CheckoutAccount, "plan">,
): CheckoutScene {
  if (mode.kind === "paywall") {
    return isPaid(account.plan) ? "paywall-subscriber" : "paywall-free";
  }
  if (mode.kind === "hours") return "hours";
  // Choosing or upgrading: by the plan the account is already on.
  if (account.plan === "free") return "choose";
  if (account.plan === "coach") return "upgrade";
  return "hours";
}

/** Whether the scene needs `/api/billing/upgrade/preview`. */
export function needsUpgradePreview(
  mode: CheckoutMode,
  account: Pick<CheckoutAccount, "plan">,
): boolean {
  const scene = checkoutScene(mode, account);
  return (
    scene === "upgrade" ||
    (scene === "paywall-subscriber" && account.plan === "coach")
  );
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
    offerDetail: account.resetsOn ? `Hours reset ${account.resetsOn}` : "",
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
    const chosen: CheckoutChoice =
      selection.choice === "upgrade" ? "coach" : selection.choice;
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
    const canUpgrade = account.plan === "coach";
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
      aside: account.resetsOn
        ? `Or keep it as a draft and send it when your hours reset on ${account.resetsOn}.`
        : "Or keep it as a draft and send it later.",
      sampleLink: false,
      problem: null,
      secondary,
      primary: payLabel(
        action.kind === "upgrade" ? action.payTodayCents : action.amountCents,
        sendsAfterPay,
      ),
      action,
    };
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
    aside =
      `Your credit is the smaller of what's left of your ${coach.name} ${yearly ? "year" : "month"}: ` +
      `${plural(quote.daysLeft, "day", "days")} (${formatUsdCents(quote.daysCreditCents)}) or ` +
      `${hoursLeftLabel(quote.periodHoursLeftSeconds)} of hours (${formatUsdCents(quote.hoursCreditCents)}). ` +
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
  };
}

/* ---------- The upload wizard's file step and footer ---------- */

/**
 * The one-line grey note above the drop zone, when hours are the news:
 *
 *  - `no-hours`: a Free player with nothing to spend, told before they pick a
 *    video that a plan or hours comes before analysis;
 *  - `too-long`: a subscriber whose picked video is longer than what is left.
 *
 * `remainingSeconds` is plan hours and extra hours together, undefined while
 * the reading loads — an unread number never puts a note on screen.
 */
export type FileStepHoursNote =
  | { kind: "none" }
  | { kind: "no-hours" }
  | { kind: "too-long"; leftSeconds: number };

export function fileStepHoursNote(input: {
  /** Plans are on sale, the upload bills a personal workspace, and it is a video. */
  enabled: boolean;
  plan: CoachPlanId;
  remainingSeconds: number | undefined;
  /** The picked video's length, when one is picked and measured. */
  videoSeconds?: number | null;
}): FileStepHoursNote {
  const { enabled, plan, remainingSeconds, videoSeconds } = input;
  if (!enabled || remainingSeconds === undefined) return { kind: "none" };
  if (!isPaid(plan)) {
    return remainingSeconds <= 0 ? { kind: "no-hours" } : { kind: "none" };
  }
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
}): string | null {
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
  | { kind: "upgrade"; plan: PaidPlan; period: PlanPeriod };

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
    const lasts = Number.isNaN(until.getTime())
      ? ""
      : `They last until ${until.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })}. `;
    return {
      lead: `${hoursName(result.hours)} added.`,
      rest: `${lasts}A receipt is on its way to your email.`,
    };
  }
  const plan = coachPlan(result.plan);
  return {
    lead:
      result.kind === "upgrade"
        ? `You're on ${plan.name}.`
        : `${plan.name} started.`,
    rest: `Your ${plan.hours ?? 0} hours are ready. A receipt is on its way to your email.`,
  };
}
