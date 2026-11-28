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
  upgradeRequestFor,
  type CheckoutAccount,
  type CheckoutMode,
  type PreviewState,
  type ScheduledChange,
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

const PLAYER: CheckoutAccount = {
  plan: "player",
  period: "monthly",
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  resetsOn: "May 14",
  firstMonthEligible: false,
};

const PLAYER_SPENT: CheckoutAccount = {
  ...PLAYER,
  planLeftSeconds: 23 * M,
  extraSeconds: 0,
};

/** A Player month Apr 14 – May 14, read on Apr 29: 15 of 30 days left. */
function preview(planLeftSeconds: number): PreviewState {
  return {
    status: "ready",
    preview: {
      ...quoteUpgrade({
        from: "player",
        to: "player-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("player") - planLeftSeconds,
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

  test("the first month is 30% off monthly only, for a first-time customer", () => {
    expect(planPricing("player", "monthly", true)).toEqual({
      dueCents: 10500,
      wasCents: 15000,
      then: "then $150 a month",
    });
    expect(planPricing("player-pro", "monthly", true)).toEqual({
      dueCents: 21000,
      wasCents: 30000,
      then: "then $300 a month",
    });
    expect(planPricing("player", "monthly", false)).toEqual({
      dueCents: 15000,
      wasCents: null,
      then: "a month",
    });
    // Yearly is eleven months' price whoever buys it.
    for (const eligible of [true, false]) {
      expect(planPricing("player-pro", "yearly", eligible)).toEqual({
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
    expect(checkoutScene(PAYWALL, PLAYER)).toBe("paywall-subscriber");
    expect(checkoutScene(PAYWALL, { plan: "player-pro" })).toBe(
      "paywall-subscriber",
    );
  });

  test("choosing a plan while on one is the upgrade, and Player Pro has nothing above it", () => {
    expect(checkoutScene({ kind: "choose" }, FREE)).toBe("choose");
    expect(checkoutScene({ kind: "choose" }, PLAYER)).toBe("upgrade");
    expect(checkoutScene({ kind: "upgrade" }, FREE)).toBe("choose");
    expect(checkoutScene({ kind: "upgrade" }, { plan: "player-pro" })).toBe(
      "hours",
    );
    expect(checkoutScene({ kind: "hours" }, PLAYER)).toBe("hours");
  });

  test("only Player asks the server what an upgrade costs", () => {
    expect(needsUpgradePreview({ kind: "upgrade" }, PLAYER)).toBe(true);
    expect(needsUpgradePreview(PAYWALL, PLAYER)).toBe(true);
    expect(needsUpgradePreview(PAYWALL, { plan: "player-pro" })).toBe(false);
    expect(needsUpgradePreview(PAYWALL, FREE)).toBe(false);
    expect(needsUpgradePreview({ kind: "choose" }, FREE)).toBe(false);
    expect(needsUpgradePreview({ kind: "hours" }, PLAYER)).toBe(false);
  });
});

test.describe("Choose a plan", () => {
  test("opens on Player, monthly, with 30% off the first month", () => {
    const v = view({ kind: "choose" }, FREE);
    expect(v.scene).toBe("choose");
    expect(v.band).toMatchObject({
      lead: "Start",
      figure: "Player",
      trail: ".",
      offer: "30% off your first month",
      offerDetail: "$105 today, then $150 a month",
    });
    expect(v.band.body).toBe(
      "For players and parents. About 3 verified matches a month, from 5 hours of match video.",
    );
    expect(v.periodPills).toBe(true);
    expect(
      v.rows.map((r) => [r.id, r.name, r.line, r.was, r.price, r.then]),
    ).toEqual([
      [
        "player",
        "Player",
        "About 3 verified matches a month · 5 hours of match video · every match verified",
        "$150",
        "$105",
        "then $150 a month",
      ],
      [
        "player-pro",
        "Player Pro",
        "About 6 verified matches a month · 10 hours of match video · every match verified",
        "$300",
        "$210",
        "then $300 a month",
      ],
    ]);
    expect(v.rows.map((r) => r.selected)).toEqual([true, false]);
    expect(v.secondary).toBe("Not now");
    expect(v.primary).toBe("Continue to pay $105");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "player",
      period: "monthly",
      amountCents: 10500,
    });
    expect(v.sampleLink).toBe(true);
  });

  test("arriving with ?plan=player-pro&period=yearly opens on that plan", () => {
    const v = view(
      { kind: "choose", plan: "player-pro", period: "yearly" },
      FREE,
    );
    expect(v.band.figure).toBe("Player Pro");
    expect(v.band.offer).toBe("One month free");
    expect(v.band.offerDetail).toBe("$3,300 a year");
    expect(v.rows.map((r) => [r.was, r.price, r.then, r.selected])).toEqual([
      ["$1,800", "$1,650", "a year", false],
      ["$3,600", "$3,300", "a year", true],
    ]);
    expect(v.primary).toBe("Continue to pay $3,300");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "player-pro",
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
      offer: "30% off your first month",
      offerDetail: "Player $105 today, then $150 a month",
    });
    expect(v.periodPills).toBe(false);
    expect(v.rows.map((r) => [r.id, r.name, r.price, r.caption])).toEqual([
      ["player", "Player", "$105", undefined],
      ["player-pro", "Player Pro", "$210", undefined],
      ["hours", "2 extra hours", "$70", "Or pay for just this match"],
    ]);
    expect(v.rows[0].line).toBe(
      "About 3 verified matches a month · 5 hours of match video · every match verified",
    );
    expect(v.rows[2].line).toBe(
      "$35 an hour (about $60 per extra match) · No plan · Last 12 months",
    );
    expect(v.aside).toBe(
      "Player covers this match with 3h 08m to spare. Prefer yearly? $1,650, one month free.",
    );
    expect(v.secondary).toBe("Shorten the trim instead");
    expect(v.primary).toBe("Pay $105 and send");
    expect(v.action).toEqual({
      kind: "plan",
      plan: "player",
      period: "monthly",
      amountCents: 10500,
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
      "Player covers 5h of this match; shorten the trim to fit.",
    );
  });
});

test.describe("Upload paywall, a subscriber out of hours", () => {
  test("offers extra hours first, then the upgrade at the server's price", () => {
    const v = view(PAYWALL, PLAYER_SPENT, {
      preview: preview(23 * M),
      sendsAfterPay: true,
      canShortenTrim: true,
    });
    expect(v.scene).toBe("paywall-subscriber");
    expect(v.band.offer).toBe("Player · 23m left this month");
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
        "Move up to Player Pro",
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
      ...initialSelection(PAYWALL, PLAYER_SPENT),
      choice: "upgrade" as const,
    };
    const v = view(PAYWALL, PLAYER_SPENT, {
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
      ...initialSelection(PAYWALL, PLAYER_SPENT),
      choice: "upgrade" as const,
    };
    const loading = view(PAYWALL, PLAYER_SPENT, {
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

    const failed = view(PAYWALL, PLAYER_SPENT, {
      preview: {
        status: "failed",
        message: "Update your card before upgrading.",
      },
    });
    expect(failed.rows.map((r) => r.id)).toEqual(["hours"]);
  });

  test("Player Pro has no plan to move up to", () => {
    const v = view(PAYWALL, { ...PLAYER_SPENT, plan: "player-pro" });
    expect(v.rows.map((r) => r.id)).toEqual(["hours"]);
    expect(v.band.offer).toBe("Player Pro · 23m left this month");
    expect(v.band.body).not.toContain("move up");
  });
});

test.describe("Upgrade", () => {
  test("shows the credit, its basis and both numbers behind it", () => {
    const v = view({ kind: "upgrade" }, PLAYER, {
      preview: preview(3 * H + 12 * M),
    });
    expect(v.scene).toBe("upgrade");
    expect(v.band).toMatchObject({
      lead: "Move up to",
      figure: "Player Pro",
      trail: ".",
      offer: "Player · 3h 12m left this month",
      offerDetail: "Hours reset May 14",
    });
    expect(v.periodPills).toBe(false);
    expect(
      v.rows.map((r) => [r.id, r.name, r.pill, r.line, r.price, r.then]),
    ).toEqual([
      [
        "upgrade",
        "Player Pro",
        undefined,
        "10 fresh hours today · $75 credit for your 15 days left",
        "$225",
        "then $300 a month",
      ],
      [
        "current",
        "Player",
        "Your plan",
        "About 3 verified matches a month · 5 hours of match video · every match verified",
        "$150",
        "a month",
      ],
    ]);
    expect(v.rows.map((r) => [r.selectable, r.selected])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(v.aside).toBe(
      "Your credit is the smaller of what's left of your Player month: 15 days ($75) or 3h 12m of hours ($96). From today you're billed $300 on the 29th of each month, and your 1h of extra hours stays.",
    );
    expect(v.secondary).toBe("Not now");
    expect(v.primary).toBe("Continue to pay $225");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 22500 });
  });

  test("when the hours are the smaller share, the credit is for the hours", () => {
    const v = view({ kind: "upgrade" }, PLAYER_SPENT, {
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
    const list = view({ kind: "upgrade" }, PLAYER_SPENT, { preview: ready });
    expect(list.aside).not.toContain("you paid");

    const discounted = view({ kind: "upgrade" }, PLAYER_SPENT, {
      preview: {
        status: "ready",
        preview: { ...quote, creditBaseCents: 10500 },
      },
    });
    expect(discounted.aside).toContain(
      "15 days ($75) or 23m of hours ($11.50), of the $105 you paid this month. From today",
    );

    const atList = view({ kind: "upgrade" }, PLAYER_SPENT, {
      preview: {
        status: "ready",
        preview: { ...quote, creditBaseCents: quote.oldPeriodPriceCents },
      },
    });
    expect(atList.aside).toBe(list.aside);
  });

  test("there is nothing to press until the price is known", () => {
    const loading = view({ kind: "upgrade" }, PLAYER, {
      preview: { status: "loading" },
    });
    expect(loading.action).toBeNull();
    expect(loading.primary).toBe("Continue to pay");
    expect(loading.rows[0]).toMatchObject({ id: "upgrade", pending: true });

    const refused = view({ kind: "upgrade" }, PLAYER, {
      preview: {
        status: "failed",
        message: "Update your card before upgrading.",
      },
    });
    expect(refused.action).toBeNull();
    expect(refused.problem).toBe("Update your card before upgrading.");
    expect(refused.rows.map((r) => r.id)).toEqual(["current"]);
  });
  test("five minutes after subscribing: the 30 days printed are the 30 days credited", () => {
    // A discounted $105 first month, upgraded at once. Counted to the second
    // the credit came out a cent short of what was paid, under a line reading
    // "your 30 days left".
    const fresh: PreviewState = {
      status: "ready",
      preview: {
        ...quoteUpgrade({
          from: "player",
          to: "player-pro",
          period: "monthly",
          periodStart: new Date("2027-04-14T00:00:00Z"),
          periodEnd: new Date("2027-05-14T00:00:00Z"),
          now: new Date("2027-04-14T00:05:00Z"),
          usedSeconds: 0,
          paidForPeriodCents: 10500,
        }),
        period: "monthly",
      },
    };
    const v = view(
      { kind: "upgrade" },
      { ...PLAYER, planLeftSeconds: 5 * H },
      { preview: fresh },
    );
    const row = v.rows.find((r) => r.id === "upgrade");
    expect(row?.line).toBe(
      "10 fresh hours today · $105 credit for your 30 days left",
    );
    expect(row?.price).toBe("$195");
    expect(v.primary).toBe("Continue to pay $195");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 19500 });
  });
});

test.describe("A refused upgrade", () => {
  const ready = {
    status: "ready" as const,
    preview: {
      ...quoteUpgrade({
        from: "player",
        to: "player-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("player") - (3 * H + 12 * M),
      }),
      period: "monthly" as const,
    },
  };

  test("payment_failed keeps the quote: same row, same amount, same action", () => {
    const next = afterUpgradeRefusal(ready, "payment_failed");
    expect(next).toEqual({ preview: ready, refetch: false });
    const before = view({ kind: "upgrade" }, PLAYER, { preview: ready });
    const after = view({ kind: "upgrade" }, PLAYER, { preview: next.preview });
    expect(after).toEqual(before);
    expect(after.rows.map((r) => r.id)).toEqual(["upgrade", "current"]);
    expect(after.primary).toBe("Continue to pay $225");
    expect(after.action).toEqual({ kind: "upgrade", payTodayCents: 22500 });
  });

  test("quote_changed asks for the price again, and the new numbers replace the old", () => {
    const next = afterUpgradeRefusal(ready, "quote_changed");
    expect(next).toEqual({ preview: { status: "loading" }, refetch: true });
    expect(
      view({ kind: "upgrade" }, PLAYER, { preview: next.preview }).action,
    ).toBeNull();

    const moved: PreviewState = {
      status: "ready",
      preview: { ...ready.preview, payTodayCents: 25000 },
    };
    const v = view({ kind: "upgrade" }, PLAYER, { preview: moved });
    expect(v.primary).toBe("Continue to pay $250");
    expect(v.action).toEqual({ kind: "upgrade", payTodayCents: 25000 });
  });
});

test.describe("Extra hours", () => {
  test("one row, priced by the hour, with the plan's balance in the band", () => {
    const v = view({ kind: "hours" }, PLAYER);
    expect(v.scene).toBe("hours");
    expect(v.band).toMatchObject({
      lead: "Add",
      figure: "extra hours",
      offer: "Player · 3h 12m left this month",
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
    // One hour is "it": "1 extra hour added. They last…" did not agree.
    expect(
      purchaseNote({
        kind: "hours",
        hours: 1,
        seconds: 3600,
        expiresAt: "2027-11-28T10:00:00Z",
      }),
    ).toEqual({
      lead: "1 extra hour added.",
      rest: "It lasts until Nov 28, 2027. A receipt is on its way to your email.",
    });
    expect(
      purchaseNote({ kind: "plan", plan: "player", period: "monthly" }),
    ).toEqual({
      lead: "Player started.",
      rest: "Your 5 hours are ready. A receipt is on its way to your email.",
    });
    expect(
      purchaseNote({ kind: "upgrade", plan: "player-pro", period: "monthly" }),
    ).toEqual({
      lead: "You're on Player Pro.",
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
    const player = { enabled: true, plan: "player" as const };
    expect(
      fileStepHoursNote({
        ...player,
        remainingSeconds: 23 * M,
        videoSeconds: 6720,
      }),
    ).toEqual({ kind: "too-long", leftSeconds: 23 * M });
    // Exactly what is left fits.
    expect(
      fileStepHoursNote({
        ...player,
        remainingSeconds: 6720,
        videoSeconds: 6720,
      }),
    ).toEqual({ kind: "none" });
    // No video yet, even at nothing left: the meter already says it.
    expect(fileStepHoursNote({ ...player, remainingSeconds: 0 })).toEqual({
      kind: "none",
    });
    expect(
      fileStepHoursNote({ ...player, remainingSeconds: 0, videoSeconds: null }),
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

/* ---------- Pay yearly ---------- */

/** Player monthly → yearly on Apr 29: the same 15 of 30 days left. */
function yearlyPreview(
  planLeftSeconds: number,
  over: Partial<Parameters<typeof quoteUpgrade>[0]> = {},
): PreviewState {
  return {
    status: "ready",
    preview: {
      ...quoteUpgrade({
        from: "player",
        to: "player",
        period: "monthly",
        toPeriod: "yearly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("player") - planLeftSeconds,
        ...over,
      }),
      period: "yearly",
      fromPeriod: "monthly",
    },
  };
}

test.describe("Pay yearly", () => {
  const YEARLY: CheckoutMode = { kind: "yearly" };

  test("only a monthly subscriber has a year to switch to", () => {
    expect(checkoutScene(YEARLY, PLAYER)).toBe("pay-yearly");
    expect(checkoutScene(YEARLY, { ...PLAYER, plan: "player-pro" })).toBe(
      "pay-yearly",
    );
    expect(checkoutScene(YEARLY, { ...PLAYER, period: "yearly" })).toBe(
      "hours",
    );
    expect(checkoutScene(YEARLY, FREE)).toBe("choose");
    // It is priced by the same preview, asked for the year.
    expect(needsUpgradePreview(YEARLY, PLAYER)).toBe(true);
    expect(upgradeRequestFor(YEARLY, PLAYER)).toEqual({ period: "yearly" });
    // The plan upgrade still sends nothing.
    expect(upgradeRequestFor({ kind: "upgrade" }, PLAYER)).toBeUndefined();
    expect(upgradeRequestFor(PAYWALL, PLAYER)).toBeUndefined();
  });

  test("the year selected with today's price and the credit, the month beneath it", () => {
    const v = view(YEARLY, PLAYER, { preview: yearlyPreview(3 * H + 12 * M) });
    expect(v.scene).toBe("pay-yearly");
    expect(v.band).toMatchObject({ lead: "Pay", figure: "yearly", trail: "." });
    expect(v.band.body).toBe(
      "Player for $1,650 a year: one month free. Your year starts today with a fresh 5 hours, and 5 more each month.",
    );
    expect(v.periodPills).toBe(false);
    expect(v.rows).toEqual([
      {
        id: "yearly",
        name: "Player, yearly",
        line: "$75 credit for your 15 days left",
        price: "$1,575",
        then: "then $1,650 a year",
        selectable: true,
        selected: true,
      },
      {
        id: "current",
        name: "Player, monthly",
        pill: "Your plan",
        line: "About 3 verified matches a month · 5 hours of match video · every match verified",
        price: "$150",
        then: "a month",
        selectable: false,
        selected: false,
      },
    ]);
    // The rule, both numbers, and when the year next bills.
    expect(v.aside).toBe(
      "Your credit is the smaller of what's left of your Player month: 15 days ($75) or 3h 12m of hours ($96). Then $1,650 a year, next on Apr 29, 2028, and your 1h of extra hours stays.",
    );
    expect(v.primary).toBe("Continue to pay $1,575");
    expect(v.secondary).toBe("Not now");
    // Charged to the card on file, like the upgrade: never Embedded Checkout.
    expect(v.action).toEqual({
      kind: "upgrade",
      payTodayCents: 157500,
      period: "yearly",
    });
    expect(v.working).toBe("Switching you to yearly…");
    expect(v.sampleLink).toBe(false);
  });

  test("the hours set the credit when they are the smaller share", () => {
    const v = view(YEARLY, PLAYER_SPENT, { preview: yearlyPreview(23 * M) });
    expect(v.rows[0]).toMatchObject({
      line: "$11.50 credit for your 23m",
      price: "$1,638.50",
    });
    expect(v.aside).toBe(
      "Your credit is the smaller of what's left of your Player month: 15 days ($75) or 23m of hours ($11.50). Then $1,650 a year, next on Apr 29, 2028.",
    );
    expect(v.primary).toBe("Continue to pay $1,638.50");
  });

  test("a discounted first month says what the shares are of", () => {
    const v = view(YEARLY, PLAYER, {
      preview: yearlyPreview(3 * H + 12 * M, { paidForPeriodCents: 10500 }),
    });
    expect(v.rows[0]).toMatchObject({
      line: "$52.50 credit for your 15 days left",
      price: "$1,597.50",
    });
    expect(v.aside).toContain(
      "15 days ($52.50) or 3h 12m of hours ($67.20), of the $105 you paid this month.",
    );
  });

  test("nothing left to credit: the full year, and no credit line", () => {
    const v = view(
      YEARLY,
      { ...PLAYER_SPENT, planLeftSeconds: 0 },
      {
        preview: yearlyPreview(0),
      },
    );
    expect(v.rows[0]).toMatchObject({
      line: "5 fresh hours today, then 5 each month",
      price: "$1,650",
    });
    expect(v.primary).toBe("Continue to pay $1,650");
    expect(v.action).toMatchObject({ payTodayCents: 165000 });
  });

  test("Player Pro switches to its own year", () => {
    const pro: CheckoutAccount = { ...PLAYER, plan: "player-pro" };
    const v = view(YEARLY, pro, {
      preview: yearlyPreview(0, {
        from: "player-pro",
        to: "player-pro",
        usedSeconds: 0,
      }),
    });
    expect(v.rows.map((row) => [row.name, row.price, row.then])).toEqual([
      ["Player Pro, yearly", "$3,150", "then $3,300 a year"],
      ["Player Pro, monthly", "$300", "a month"],
    ]);
    expect(v.aside).toContain("Then $3,300 a year, next on Apr 29, 2028");
  });

  test("while the price loads there is nothing to pay; when it cannot be priced, why", () => {
    const loading = view(YEARLY, PLAYER, { preview: { status: "loading" } });
    expect(loading.rows[0]).toMatchObject({
      id: "yearly",
      name: "Player, yearly",
      pending: true,
      selectable: false,
    });
    expect(loading.rows[1].id).toBe("current");
    expect(loading.action).toBeNull();
    expect(loading.primary).toBe("Continue to pay");

    const failed = view(YEARLY, PLAYER, {
      preview: {
        status: "failed",
        message: "Paying yearly isn't available yet. Try again later.",
      },
    });
    expect(failed.rows.map((row) => row.id)).toEqual(["current"]);
    expect(failed.problem).toBe(
      "Paying yearly isn't available yet. Try again later.",
    );
    expect(failed.action).toBeNull();
  });

  test("what the page says once it is done", () => {
    expect(
      purchaseNote({ kind: "yearly", plan: "player", period: "yearly" }),
    ).toEqual({
      lead: "Player is now paid yearly.",
      rest: "Your 5 hours are ready. A receipt is on its way to your email.",
    });
  });
});

/* ---------- MOCK ONLY: a change at renewal ---------- */

test.describe("MOCK: a change at renewal", () => {
  const PRO: CheckoutAccount = {
    plan: "player-pro",
    period: "monthly",
    planLeftSeconds: 7 * H + 40 * M,
    extraSeconds: 0,
    resetsOn: "Feb 14",
    firstMonthEligible: false,
  };
  const DOWN: ScheduledChange = {
    to: { plan: "player", period: "monthly" },
    effectiveOn: "2027-02-14",
  };
  const YEAR: CheckoutAccount = {
    ...PLAYER,
    period: "yearly",
    resetsOn: "Feb 14",
  };
  const MONTHLY: ScheduledChange = {
    to: { plan: "player", period: "monthly" },
    effectiveOn: "2028-01-14",
  };

  test("move down to Player: nothing today, Player Pro until the renewal", () => {
    const mode: CheckoutMode = { kind: "change", change: DOWN };
    const v = view(mode, PRO);
    expect(v.scene).toBe("change");
    expect(v.band).toMatchObject({
      lead: "Move down to",
      figure: "Player",
      trail: ".",
    });
    expect(v.rows).toEqual([
      {
        id: "change",
        name: "Player",
        line: "$150 a month from Feb 14 · 5 hours a month",
        price: "$0",
        then: "today",
        selectable: true,
        selected: true,
      },
      {
        id: "current",
        name: "Player Pro",
        pill: "Your plan",
        line: "About 6 verified matches a month · 10 hours of match video · every match verified",
        price: "$300",
        then: "a month",
        selectable: false,
        selected: false,
      },
    ]);
    expect(v.aside).toBe(
      "You keep Player Pro and its 10 hours until Feb 14. Nothing is charged today.",
    );
    expect([v.secondary, v.primary]).toEqual([
      "Not now",
      "Move to Player on Feb 14",
    ]);
    // Data only: the dialog closes on it and calls nothing.
    expect(v.action).toEqual({ kind: "schedule", change: DOWN });
    // Nothing is priced, so nothing is fetched.
    expect(needsUpgradePreview(mode, PRO)).toBe(false);
    expect(upgradeRequestFor(mode, PRO)).toBeUndefined();
  });

  test("yearly → monthly: at the year's renewal, with its year", () => {
    const v = view({ kind: "change", change: MONTHLY }, YEAR);
    expect(v.band).toMatchObject({
      lead: "Pay",
      figure: "monthly",
      trail: ".",
    });
    expect(v.rows.map((row) => [row.name, row.line, row.price])).toEqual([
      ["Player, monthly", "$150 a month from Jan 14, 2028", "$0"],
      [
        "Player, yearly",
        "About 3 verified matches a month · 5 hours of match video · every match verified",
        "$1,650",
      ],
    ]);
    expect(v.rows[1].pill).toBe("Your plan");
    expect(v.aside).toBe(
      "Your year is paid through Jan 14, 2028. Nothing is charged today.",
    );
    expect(v.primary).toBe("Switch on Jan 14, 2028");
  });

  test("no real mode reaches it: every other way in is one of the six scenes", () => {
    const modes: CheckoutMode[] = [
      { kind: "choose" },
      { kind: "hours" },
      PAYWALL,
      { kind: "upgrade" },
      { kind: "yearly" },
    ];
    for (const mode of modes) {
      for (const account of [FREE, PLAYER, PRO, YEAR]) {
        expect(checkoutScene(mode, account)).not.toBe("change");
        expect(view(mode, account).action?.kind).not.toBe("schedule");
      }
    }
    // A Free account has no plan to change.
    expect(checkoutScene({ kind: "change", change: DOWN }, FREE)).toBe(
      "choose",
    );
  });
});
