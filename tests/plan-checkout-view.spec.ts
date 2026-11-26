import { expect, test } from "@playwright/test";

import {
  EXTRA_HOURS_MAX,
  EXTRA_HOURS_MIN,
  afterUpgradeRefusal,
  buildCheckoutView,
  checkoutScene,
  extraHoursToCover,
  fileStepHoursNote,
  hoursLeftLabel,
  initialSelection,
  meterSuffix,
  needsUpgradePreview,
  ordinal,
  planPricing,
  purchaseNote,
  type CheckoutAccount,
  type CheckoutMode,
  type PreviewState,
} from "@/lib/billing/checkout-view";
import { formatUsdCents, planHoursSeconds } from "@/lib/billing/plans";
import { quoteUpgrade } from "@/lib/billing/upgrade";
import {
  MAX_EXTRA_HOURS,
  MIN_EXTRA_HOURS,
} from "@/lib/services/billing/checkout";

/**
 * The one checkout dialog's words, per entry point: which rows it lists,
 * what each costs, what the button says and what pressing it does. The
 * dialog draws `buildCheckoutView()` and nothing else, so these are the
 * lines a player reads. Every figure traces to the plan module or to the
 * real `quoteUpgrade()` on fixed dates.
 */

const H = 3600;
const M = 60;

const FREE: CheckoutAccount = {
  plan: "free",
  period: null,
  planLeftSeconds: 0,
  extraSeconds: 0,
  resetsOn: null,
  firstMonthEligible: true,
};

const COACH: CheckoutAccount = {
  plan: "coach",
  period: "monthly",
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  resetsOn: "May 14",
  firstMonthEligible: false,
};

const COACH_SPENT: CheckoutAccount = {
  ...COACH,
  planLeftSeconds: 23 * M,
  extraSeconds: 0,
};

/** A Coach month Apr 14 – May 14, read on Apr 29: 15 of 30 days left. */
function preview(planLeftSeconds: number): PreviewState {
  return {
    status: "ready",
    preview: {
      ...quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("coach") - planLeftSeconds,
      }),
      period: "monthly",
    },
  };
}

function view(
  mode: CheckoutMode,
  account: CheckoutAccount,
  extra: Partial<Parameters<typeof buildCheckoutView>[0]> = {},
) {
  return buildCheckoutView({
    mode,
    account,
    selection: initialSelection(mode, account),
    ...extra,
  });
}

const NEEDED = 1 * H + 52 * M;
const PAYWALL: CheckoutMode = { kind: "paywall", neededSeconds: NEEDED };

test.describe("money", () => {
  test("cents show only when there are any", () => {
    expect(formatUsdCents(28850)).toBe("$288.50");
    expect(formatUsdCents(22500)).toBe("$225");
    expect(formatUsdCents(165000)).toBe("$1,650");
    expect(formatUsdCents(1150)).toBe("$11.50");
    expect(formatUsdCents(5)).toBe("$0.05");
    expect(formatUsdCents(0)).toBe("$0");
    expect(formatUsdCents(123456789)).toBe("$1,234,567.89");
  });

  test("a figure that is not a number reads as nothing, never NaN", () => {
    expect(formatUsdCents(Number.NaN)).toBe("$0");
    expect(formatUsdCents(1999.6)).toBe("$20");
  });

  test("the first month is half off monthly only, for a first-time customer", () => {
    expect(planPricing("coach", "monthly", true)).toEqual({
      dueCents: 7500,
      wasCents: 15000,
      then: "then $150 a month",
    });
    expect(planPricing("coach", "monthly", false)).toEqual({
      dueCents: 15000,
      wasCents: null,
      then: "a month",
    });
    // Yearly is eleven months' price whoever buys it.
    for (const eligible of [true, false]) {
      expect(planPricing("coach-pro", "yearly", eligible)).toEqual({
        dueCents: 330000,
        wasCents: 360000,
        then: "a year",
      });
    }
  });
});

test.describe("which scene an account is shown", () => {
  test("the paywall splits on whether there is a plan", () => {
    expect(checkoutScene(PAYWALL, FREE)).toBe("paywall-free");
    expect(checkoutScene(PAYWALL, COACH)).toBe("paywall-subscriber");
    expect(checkoutScene(PAYWALL, { plan: "coach-pro" })).toBe(
      "paywall-subscriber",
    );
  });

  test("choosing a plan while on one is the upgrade, and Coach Pro has nothing above it", () => {
    expect(checkoutScene({ kind: "choose" }, FREE)).toBe("choose");
    expect(checkoutScene({ kind: "choose" }, COACH)).toBe("upgrade");
    expect(checkoutScene({ kind: "upgrade" }, FREE)).toBe("choose");
    expect(checkoutScene({ kind: "upgrade" }, { plan: "coach-pro" })).toBe(
      "hours",
    );
    expect(checkoutScene({ kind: "hours" }, COACH)).toBe("hours");
  });

  test("only Coach asks the server what an upgrade costs", () => {
    expect(needsUpgradePreview({ kind: "upgrade" }, COACH)).toBe(true);
    expect(needsUpgradePreview(PAYWALL, COACH)).toBe(true);
    expect(needsUpgradePreview(PAYWALL, { plan: "coach-pro" })).toBe(false);
    expect(needsUpgradePreview(PAYWALL, FREE)).toBe(false);
    expect(needsUpgradePreview({ kind: "choose" }, FREE)).toBe(false);
    expect(needsUpgradePreview({ kind: "hours" }, COACH)).toBe(false);
  });
});

test.describe("Choose a plan", () => {
  test("opens on Coach, monthly, with the first month half off", () => {
    const v = view({ kind: "choose" }, FREE);
    expect(v.scene).toBe("choose");
    expect(v.band).toMatchObject({
      lead: "Start",
      figure: "Coach",
      trail: ".",
      offer: "Half off your first month",
      offerDetail: "$75 today, then $150 a month",
    });
    expect(v.band.body).toBe(
      "5 hours of match video a month, about 3 matches, with Verified by Advantage on every match.",
    );
    expect(v.periodPills).toBe(true);
    expect(
      v.rows.map((r) => [r.id, r.name, r.line, r.was, r.price, r.then]),
    ).toEqual([
      [
        "coach",
        "Coach",
        "5h a month, about 3 matches",
        "$150",
        "$75",
        "then $150 a month",
      ],
      [
        "coach-pro",
        "Coach Pro",
        "10h a month, about 5 matches",
        "$300",
        "$150",
        "then $300 a month",
      ],
    ]);
    expect(v.rows.map((r) => r.selected)).toEqual([true, false]);
    expect(v.secondary).toBe("Not now");
    expect(v.primary).toBe("Continue to pay $75");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "coach",
      period: "monthly",
      amountCents: 7500,
    });
    expect(v.sampleLink).toBe(true);
  });

  test("arriving with ?plan=coach-pro&period=yearly opens on that plan", () => {
    const v = view(
      { kind: "choose", plan: "coach-pro", period: "yearly" },
      FREE,
    );
    expect(v.band.figure).toBe("Coach Pro");
    expect(v.band.offer).toBe("One month free");
    expect(v.band.offerDetail).toBe("$3,300 a year");
    expect(v.rows.map((r) => [r.was, r.price, r.then, r.selected])).toEqual([
      ["$1,800", "$1,650", "a year", false],
      ["$3,600", "$3,300", "a year", true],
    ]);
    expect(v.primary).toBe("Continue to pay $3,300");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "coach-pro",
      period: "yearly",
      amountCents: 330000,
    });
  });

  test("a returning subscriber is shown the full price, with nothing struck through", () => {
    const v = view({ kind: "choose" }, { ...FREE, firstMonthEligible: false });
    expect(v.band.offer).toBe("Billed monthly");
    expect(v.band.offerDetail).toBe("$150 a month");
    expect(v.rows.map((r) => [r.was, r.price, r.then])).toEqual([
      [undefined, "$150", "a month"],
      [undefined, "$300", "a month"],
    ]);
    expect(v.primary).toBe("Continue to pay $150");
  });
});

test.describe("Upload paywall, a Free player", () => {
  test("lists both plans, then extra hours sized to the shortfall", () => {
    const v = view(PAYWALL, FREE, {
      sendsAfterPay: true,
      canShortenTrim: true,
    });
    expect(v.scene).toBe("paywall-free");
    expect(v.band).toMatchObject({
      lead: "This match needs",
      figure: "1h 52m",
      trail: ".",
      offer: "Half off your first month",
      offerDetail: "Coach $75 today, then $150 a month",
    });
    expect(v.periodPills).toBe(false);
    expect(v.rows.map((r) => [r.id, r.name, r.price, r.caption])).toEqual([
      ["coach", "Coach", "$75", undefined],
      ["coach-pro", "Coach Pro", "$150", undefined],
      ["hours", "2 extra hours", "$70", "Or pay for just this match"],
    ]);
    expect(v.rows[0].line).toBe(
      "5h a month, about 3 matches · Verified by Advantage",
    );
    expect(v.rows[2].line).toBe("$35 an hour · No plan · Last 12 months");
    expect(v.aside).toBe(
      "Coach covers this match with 3h 08m to spare. Prefer yearly? $1,650, one month free.",
    );
    expect(v.secondary).toBe("Shorten the trim instead");
    expect(v.primary).toBe("Pay $75 and send");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "coach",
      period: "monthly",
      amountCents: 7500,
    });
  });

  test("paying for just this match buys whole hours that cover it", () => {
    const selection = {
      ...initialSelection(PAYWALL, FREE),
      choice: "hours" as const,
    };
    const v = view(PAYWALL, FREE, { selection, sendsAfterPay: true });
    expect(v.rows.map((r) => r.selected)).toEqual([false, false, true]);
    expect(v.aside).toBe(
      "Covers it, 8m to spare. All sales final, except where required by law.",
    );
    expect(v.primary).toBe("Pay $70 and send");
    expect(v.action).toEqual({ kind: "hours", hours: 2, amountCents: 7000 });
    expect(v.sampleLink).toBe(false);
    // Not over the trim step (a refusal at Save): no "and send", no trim link.
    const atSave = view(PAYWALL, FREE, { selection });
    expect(atSave.primary).toBe("Continue to pay $70");
    expect(atSave.secondary).toBe("Not now");
  });

  test("hours already held shrink the shortfall", () => {
    // 1h of extra hours against a 1h 52m match: 52m short is one hour.
    const account = { ...FREE, extraSeconds: 1 * H };
    const v = view(PAYWALL, account);
    expect(v.rows[2].name).toBe("1 extra hour");
    expect(v.rows[2].price).toBe("$35");
  });

  test("a plan that does not cover the match says so instead of promising it", () => {
    const long: CheckoutMode = { kind: "paywall", neededSeconds: 6 * H };
    const v = view(long, FREE);
    expect(v.aside).toContain(
      "Coach covers 5h of this match; shorten the trim to fit.",
    );
  });
});

test.describe("Upload paywall, a subscriber out of hours", () => {
  test("offers extra hours first, then the upgrade at the server's price", () => {
    const v = view(PAYWALL, COACH_SPENT, {
      preview: preview(23 * M),
      sendsAfterPay: true,
      canShortenTrim: true,
    });
    expect(v.scene).toBe("paywall-subscriber");
    expect(v.band.offer).toBe("Coach · 23m left this month");
    expect(v.band.offerDetail).toBe("Hours reset May 14");
    expect(
      v.rows.map((r) => [r.id, r.name, r.line, r.price, r.then, r.selected]),
    ).toEqual([
      [
        "hours",
        "2 extra hours",
        "Covers it, 31m to spare · Last 12 months",
        "$70",
        "$35 an hour",
        true,
      ],
      [
        "upgrade",
        "Move up to Coach Pro",
        "10 fresh hours today · $11.50 credit for your 23m",
        "$288.50",
        "then $300 a month",
        false,
      ],
    ]);
    expect(v.aside).toBe(
      "Or keep it as a draft and send it when your hours reset on May 14.",
    );
    expect(v.primary).toBe("Pay $70 and send");
    expect(v.action).toEqual({ kind: "hours", hours: 2, amountCents: 7000 });
  });

  test("choosing the upgrade charges the previewed figure", () => {
    const selection = {
      ...initialSelection(PAYWALL, COACH_SPENT),
      choice: "upgrade" as const,
    };
    const v = view(PAYWALL, COACH_SPENT, {
      selection,
      preview: preview(23 * M),
      sendsAfterPay: true,
    });
    expect(v.rows.map((r) => r.selected)).toEqual([false, true]);
    expect(v.primary).toBe("Pay $288.50 and send");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 28850 });
  });

  test("while the price loads the upgrade cannot be chosen, and a refusal drops the row", () => {
    const selection = {
      ...initialSelection(PAYWALL, COACH_SPENT),
      choice: "upgrade" as const,
    };
    const loading = view(PAYWALL, COACH_SPENT, {
      selection,
      preview: { status: "loading" },
    });
    expect(loading.rows[1]).toMatchObject({
      id: "upgrade",
      pending: true,
      selectable: false,
    });
    // Nothing is charged for a price nobody has seen.
    expect(loading.action).toEqual({
      kind: "hours",
      hours: 2,
      amountCents: 7000,
    });

    const failed = view(PAYWALL, COACH_SPENT, {
      preview: {
        status: "failed",
        message: "Update your card before upgrading.",
      },
    });
    expect(failed.rows.map((r) => r.id)).toEqual(["hours"]);
  });

  test("Coach Pro has no plan to move up to", () => {
    const v = view(PAYWALL, { ...COACH_SPENT, plan: "coach-pro" });
    expect(v.rows.map((r) => r.id)).toEqual(["hours"]);
    expect(v.band.offer).toBe("Coach Pro · 23m left this month");
    expect(v.band.body).not.toContain("move up");
  });
});

test.describe("Upgrade", () => {
  test("shows the credit, its basis and both numbers behind it", () => {
    const v = view({ kind: "upgrade" }, COACH, {
      preview: preview(3 * H + 12 * M),
    });
    expect(v.scene).toBe("upgrade");
    expect(v.band).toMatchObject({
      lead: "Move up to",
      figure: "Coach Pro",
      trail: ".",
      offer: "Coach · 3h 12m left this month",
      offerDetail: "Hours reset May 14",
    });
    expect(v.periodPills).toBe(false);
    expect(
      v.rows.map((r) => [r.id, r.name, r.pill, r.line, r.price, r.then]),
    ).toEqual([
      [
        "upgrade",
        "Coach Pro",
        undefined,
        "10 fresh hours today · $75 credit for your 15 days left",
        "$225",
        "then $300 a month",
      ],
      [
        "current",
        "Coach",
        "Your plan",
        "5h a month, about 3 matches",
        "$150",
        "a month",
      ],
    ]);
    expect(v.rows.map((r) => [r.selectable, r.selected])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(v.aside).toBe(
      "Your credit is the smaller of what's left of your Coach month: 15 days ($75) or 3h 12m of hours ($96). From today you're billed $300 on the 29th of each month, and your 1h of extra hours stays.",
    );
    expect(v.secondary).toBe("Not now");
    expect(v.primary).toBe("Continue to pay $225");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 22500 });
  });

  test("when the hours are the smaller share, the credit is for the hours", () => {
    const v = view({ kind: "upgrade" }, COACH_SPENT, {
      preview: preview(23 * M),
    });
    expect(v.rows[0].line).toBe(
      "10 fresh hours today · $11.50 credit for your 23m",
    );
    expect(v.rows[0].price).toBe("$288.50");
    expect(v.aside).toContain("15 days ($75) or 23m of hours ($11.50).");
    // No extra hours held: the sentence does not mention any.
    expect(v.aside).not.toContain("extra hours");
    expect(v.primary).toBe("Continue to pay $288.50");
  });

  test("the aside names what was paid only when a discount cut it", () => {
    const ready = preview(23 * M);
    if (ready.status !== "ready") throw new Error("preview not ready");
    const quote = ready.preview;
    const list = view({ kind: "upgrade" }, COACH_SPENT, { preview: ready });
    expect(list.aside).not.toContain("you paid");

    const discounted = view({ kind: "upgrade" }, COACH_SPENT, {
      preview: {
        status: "ready",
        preview: { ...quote, creditBaseCents: 7500 },
      },
    });
    expect(discounted.aside).toContain(
      "15 days ($75) or 23m of hours ($11.50), of the $75 you paid this month. From today",
    );

    const atList = view({ kind: "upgrade" }, COACH_SPENT, {
      preview: {
        status: "ready",
        preview: { ...quote, creditBaseCents: quote.oldPeriodPriceCents },
      },
    });
    expect(atList.aside).toBe(list.aside);
  });

  test("there is nothing to press until the price is known", () => {
    const loading = view({ kind: "upgrade" }, COACH, {
      preview: { status: "loading" },
    });
    expect(loading.action).toBeNull();
    expect(loading.primary).toBe("Continue to pay");
    expect(loading.rows[0]).toMatchObject({ id: "upgrade", pending: true });

    const refused = view({ kind: "upgrade" }, COACH, {
      preview: {
        status: "failed",
        message: "Update your card before upgrading.",
      },
    });
    expect(refused.action).toBeNull();
    expect(refused.problem).toBe("Update your card before upgrading.");
    expect(refused.rows.map((r) => r.id)).toEqual(["current"]);
  });
});

test.describe("A refused upgrade", () => {
  const ready = {
    status: "ready" as const,
    preview: {
      ...quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("coach") - (3 * H + 12 * M),
      }),
      period: "monthly" as const,
    },
  };

  test("payment_failed keeps the quote: same row, same amount, same action", () => {
    const next = afterUpgradeRefusal(ready, "payment_failed");
    expect(next).toEqual({ preview: ready, refetch: false });
    const before = view({ kind: "upgrade" }, COACH, { preview: ready });
    const after = view({ kind: "upgrade" }, COACH, { preview: next.preview });
    expect(after).toEqual(before);
    expect(after.rows.map((r) => r.id)).toEqual(["upgrade", "current"]);
    expect(after.primary).toBe("Continue to pay $225");
    expect(after.action).toEqual({ kind: "upgrade", payTodayCents: 22500 });
  });

  test("quote_changed asks for the price again, and the new numbers replace the old", () => {
    const next = afterUpgradeRefusal(ready, "quote_changed");
    expect(next).toEqual({ preview: { status: "loading" }, refetch: true });
    expect(
      view({ kind: "upgrade" }, COACH, { preview: next.preview }).action,
    ).toBeNull();

    const moved: PreviewState = {
      status: "ready",
      preview: { ...ready.preview, payTodayCents: 25000 },
    };
    const v = view({ kind: "upgrade" }, COACH, { preview: moved });
    expect(v.primary).toBe("Continue to pay $250");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 25000 });
  });
});

test.describe("Extra hours", () => {
  test("one row, priced by the hour, with the plan's balance in the band", () => {
    const v = view({ kind: "hours" }, COACH);
    expect(v.scene).toBe("hours");
    expect(v.band).toMatchObject({
      lead: "Add",
      figure: "extra hours",
      offer: "Coach · 3h 12m left this month",
      offerDetail: "Hours reset May 14",
    });
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({
      id: "hours",
      name: "1 extra hour",
      price: "$35",
      then: "$35 an hour",
      adjustable: true,
    });
    expect(v.primary).toBe("Continue to pay $35");
    expect(v.aside).toBe("All sales final, except where required by law.");
  });

  test("the count is what is charged, inside what one purchase holds", () => {
    const pick = (hours: number) =>
      view({ kind: "hours" }, FREE, {
        selection: { choice: "hours", period: "monthly", hours },
      });
    expect(pick(5).rows[0].name).toBe("5 extra hours");
    expect(pick(5).action).toEqual({
      kind: "hours",
      hours: 5,
      amountCents: 17500,
    });
    expect(pick(0).action).toMatchObject({ hours: EXTRA_HOURS_MIN });
    expect(pick(400).action).toMatchObject({ hours: EXTRA_HOURS_MAX });
    expect(pick(Number.NaN).action).toMatchObject({ hours: EXTRA_HOURS_MIN });
    expect(pick(1).band.offer).toBe("Free · 0h left");
  });

  test("the bounds are the server's", () => {
    expect(EXTRA_HOURS_MIN).toBe(MIN_EXTRA_HOURS);
    expect(EXTRA_HOURS_MAX).toBe(MAX_EXTRA_HOURS);
    expect(extraHoursToCover(0)).toBe(1);
    expect(extraHoursToCover(1)).toBe(1);
    expect(extraHoursToCover(3600)).toBe(1);
    expect(extraHoursToCover(3601)).toBe(2);
    expect(extraHoursToCover(1000 * H)).toBe(EXTRA_HOURS_MAX);
  });
});

test.describe("small words", () => {
  test("a balance reads 0h at nothing", () => {
    expect(hoursLeftLabel(0)).toBe("0h");
    expect(hoursLeftLabel(-5)).toBe("0h");
    expect(hoursLeftLabel(23 * M)).toBe("23m");
    expect(hoursLeftLabel(4 * H + 12 * M)).toBe("4h 12m");
  });

  test("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "30th",
      "31st",
    ]);
  });

  test("the line a page shows after a purchase", () => {
    expect(
      purchaseNote({
        kind: "hours",
        hours: 2,
        seconds: 7200,
        expiresAt: "2028-01-05T10:00:00Z",
      }),
    ).toEqual({
      lead: "2 extra hours added.",
      rest: "They last until Jan 5, 2028. A receipt is on its way to your email.",
    });
    expect(
      purchaseNote({ kind: "plan", plan: "coach", period: "monthly" }),
    ).toEqual({
      lead: "Coach started.",
      rest: "Your 5 hours are ready. A receipt is on its way to your email.",
    });
    expect(
      purchaseNote({ kind: "upgrade", plan: "coach-pro", period: "monthly" }),
    ).toEqual({
      lead: "You're on Coach Pro.",
      rest: "Your 10 hours are ready. A receipt is on its way to your email.",
    });
  });
});

test.describe("the upload wizard's file step", () => {
  const base = { enabled: true, plan: "free" as const };

  test("a Free player with no hours is told before picking a video", () => {
    expect(fileStepHoursNote({ ...base, remainingSeconds: 0 })).toEqual({
      kind: "no-hours",
    });
    // With or without a video picked.
    expect(
      fileStepHoursNote({ ...base, remainingSeconds: 0, videoSeconds: 6720 }),
    ).toEqual({ kind: "no-hours" });
  });

  test("a Free player holding extra hours is told nothing", () => {
    expect(fileStepHoursNote({ ...base, remainingSeconds: 3600 })).toEqual({
      kind: "none",
    });
  });

  test("a subscriber is told only when the picked video is longer than what is left", () => {
    const coach = { enabled: true, plan: "coach" as const };
    expect(
      fileStepHoursNote({
        ...coach,
        remainingSeconds: 23 * M,
        videoSeconds: 6720,
      }),
    ).toEqual({ kind: "too-long", leftSeconds: 23 * M });
    // Exactly what is left fits.
    expect(
      fileStepHoursNote({
        ...coach,
        remainingSeconds: 6720,
        videoSeconds: 6720,
      }),
    ).toEqual({ kind: "none" });
    // No video yet, even at nothing left: the meter already says it.
    expect(fileStepHoursNote({ ...coach, remainingSeconds: 0 })).toEqual({
      kind: "none",
    });
    expect(
      fileStepHoursNote({ ...coach, remainingSeconds: 0, videoSeconds: null }),
    ).toEqual({ kind: "none" });
  });

  test("never before plans are on sale, on an import, or on an unread balance", () => {
    expect(
      fileStepHoursNote({ enabled: false, plan: "free", remainingSeconds: 0 }),
    ).toEqual({ kind: "none" });
    expect(fileStepHoursNote({ ...base, remainingSeconds: undefined })).toEqual(
      { kind: "none" },
    );
  });

  test("the footer meter's suffix is true of the allowance in force", () => {
    expect(meterSuffix({ allowanceKind: "plan", resetsOn: "Feb 14" })).toBe(
      "resets Feb 14",
    );
    expect(meterSuffix({ allowanceKind: "none", resetsOn: null })).toBe(
      "Free plan",
    );
    // The beta's hours, an admin's own allowance: the wording they had.
    for (const kind of ["beta", "override", "unlimited", "pilot", "season"]) {
      expect(
        meterSuffix({ allowanceKind: kind, resetsOn: "Jan 1" }),
      ).toBeNull();
    }
  });
});
