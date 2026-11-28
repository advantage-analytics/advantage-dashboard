import { expect, test } from "@playwright/test";

import { isUpgrade, quoteUpgrade, upgradeKind } from "@/lib/billing/upgrade";
import {
  UPGRADE_CREDIT_KIND,
  UPGRADE_REVERSAL_KIND,
  executeUpgrade,
  previewUpgrade,
  readUpgradeRequest,
  upgradeAttemptId,
  type UpgradeRequest,
} from "@/lib/services/billing/upgrade";
import {
  cardDeclined,
  connectionLost,
  fakeAdmin,
  fakeInvoice,
  fakeStripe,
  fakeSubscription,
  fakeUser,
  idempotencyInUse,
  setTestPrices,
  withEnv,
} from "./fixtures/fake-billing";

/**
 * Coach → Coach Pro (decision 7 of docs/plans/2027-pricing.md).
 *
 * First the money, as a pure function: the credit is the old price times the
 * SMALLER of the share of time left (in whole days, a part day as one) and
 * the share of plan hours left, in whole cents, half-up, never negative and never above the old price.
 *
 * Then the execution against in-memory Stripe and Supabase clients: the
 * order of the calls, and what each failure leaves behind — never a credit
 * without an upgrade, never an upgrade without its credit.
 */

setTestPrices();
const realError = console.error;
test.beforeEach(() => {
  // The failure paths log on purpose; keep the run readable.
  console.error = () => {};
});
test.afterEach(() => {
  console.error = realError;
});

const H = 3600;
const APRIL = {
  periodStart: new Date("2027-04-01T00:00:00Z"),
  periodEnd: new Date("2027-05-01T00:00:00Z"),
};
const monthly = (now: string, usedSeconds: number) =>
  quoteUpgrade({
    from: "coach",
    to: "coach-pro",
    period: "monthly",
    ...APRIL,
    now: new Date(now),
    usedSeconds,
  });

test.describe("the credit", () => {
  test("15 days left and 3h12m of 5h left: $75 credit, pays $225", () => {
    const quote = monthly("2027-04-16T00:00:00Z", 5 * H - (3 * H + 12 * 60));
    expect(quote).toMatchObject({
      creditCents: 7500,
      payTodayCents: 22500,
      creditBasis: "days",
      daysLeft: 15,
      hoursLeftSeconds: 3 * H + 12 * 60,
      newPeriodPriceCents: 30000,
      oldPeriodPriceCents: 15000,
      nextBillingDay: "2027-05-16",
    });
  });

  test("half the month left and 23m of 5h left: $11.50 credit, pays $288.50", () => {
    const quote = monthly("2027-04-16T00:00:00Z", 5 * H - 23 * 60);
    expect(quote).toMatchObject({
      creditCents: 1150,
      payTodayCents: 28850,
      creditBasis: "hours",
      daysLeft: 15,
      hoursLeftSeconds: 23 * 60,
    });
  });

  test("a half-off first month: paid $75, 15 days left → $37.50 credit, pays $262.50", () => {
    // More than half the hours left (3h12m of 5h), so the days set it.
    const quote = quoteUpgrade({
      from: "coach",
      to: "coach-pro",
      period: "monthly",
      ...APRIL,
      now: new Date("2027-04-16T00:00:00Z"),
      usedSeconds: 5 * H - (3 * H + 12 * 60),
      paidForPeriodCents: 7500,
    });
    expect(quote).toMatchObject({
      creditCents: 3750,
      payTodayCents: 26250,
      creditBasis: "days",
      // Both shares are of what was paid, so the dialog's two figures agree
      // with the credit: 15/30 and 3h12m/5h of $75.
      daysCreditCents: 3750,
      hoursCreditCents: 4800,
      creditBaseCents: 7500,
      // The list price is still the list price.
      oldPeriodPriceCents: 15000,
      newPeriodPriceCents: 30000,
    });
  });

  test("a half-off month with the hours nearly gone: the hours share of $75", () => {
    const quote = quoteUpgrade({
      from: "coach",
      to: "coach-pro",
      period: "monthly",
      ...APRIL,
      now: new Date("2027-04-16T00:00:00Z"),
      usedSeconds: 5 * H - 23 * 60,
      paidForPeriodCents: 7500,
    });
    expect(quote).toMatchObject({
      creditCents: 575,
      payTodayCents: 29425,
      creditBasis: "hours",
    });
  });

  test("what was paid is the basis only up to list price; unreadable is list price", () => {
    const at = (paidForPeriodCents: number | null | undefined) =>
      quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "monthly",
        ...APRIL,
        now: new Date("2027-04-16T00:00:00Z"),
        usedSeconds: 0,
        paidForPeriodCents,
      });
    // Paid full price: the plan's first worked example, unchanged.
    expect(at(15000)).toMatchObject({
      creditCents: 7500,
      payTodayCents: 22500,
    });
    // Never more than list, whatever an invoice says.
    expect(at(99999)).toMatchObject({
      creditCents: 7500,
      creditBaseCents: 15000,
    });
    for (const unreadable of [undefined, null, Number.NaN]) {
      expect(at(unreadable)).toMatchObject({
        creditCents: 7500,
        creditBaseCents: 15000,
      });
    }
    // Paid nothing (a free month): nothing to credit, never negative.
    for (const nothing of [0, -500]) {
      expect(at(nothing)).toMatchObject({
        creditCents: 0,
        payTodayCents: 30000,
        creditBaseCents: 0,
      });
    }
  });

  test("decision 7's own example: 24m of 5h left credits $12, not $75", () => {
    expect(monthly("2027-04-16T00:00:00Z", 5 * H - 24 * 60).creditCents).toBe(
      1200,
    );
  });

  test("the first second of a period, nothing used: the whole old price", () => {
    const quote = monthly("2027-04-01T00:00:00Z", 0);
    expect(quote).toMatchObject({
      creditCents: 15000,
      payTodayCents: 15000,
      creditBasis: "days",
      daysLeft: 30,
      periodDays: 30,
    });
  });

  test("subscribed five minutes ago, nothing used: all 30 days, pays exactly the difference", () => {
    // To the second this was 29.9965 of 30 days: a $74.99 credit and "pay
    // $225.01" on a $75 month, under a line reading "your 30 days left".
    const quote = monthly("2027-04-01T00:05:00Z", 0);
    expect(quote).toMatchObject({
      daysLeft: 30,
      periodDays: 30,
      creditBasis: "days",
      daysCreditCents: 15000,
      creditCents: 15000,
      payTodayCents: 30000 - 15000,
    });
    // A half-off first month: the full $75 paid comes back, never $74.99.
    const halfOff = quoteUpgrade({
      from: "coach",
      to: "coach-pro",
      period: "monthly",
      ...APRIL,
      now: new Date("2027-04-01T00:05:00Z"),
      usedSeconds: 0,
      paidForPeriodCents: 7500,
    });
    expect(halfOff).toMatchObject({
      daysLeft: 30,
      creditCents: 7500,
      payTodayCents: 22500,
    });
  });

  test("the last second of a period: 1 of 30 days, the day the dialog prints", () => {
    const quote = monthly("2027-04-30T23:59:59Z", 0);
    expect(quote).toMatchObject({
      daysLeft: 1,
      periodDays: 30,
      creditBasis: "days",
      // $150 × 1 / 30.
      creditCents: 500,
      payTodayCents: 29500,
    });
  });

  test("the day count printed is the day count credited, at any second", () => {
    for (const now of [
      "2027-04-01T00:00:00Z",
      "2027-04-01T00:05:00Z",
      "2027-04-09T13:27:41Z",
      "2027-04-16T00:00:00Z",
      "2027-04-16T00:00:01Z",
      "2027-04-30T23:59:59Z",
      "2027-05-01T00:00:00Z",
    ]) {
      const quote = monthly(now, 0);
      expect(quote.periodDays).toBe(30);
      expect(quote.daysCreditCents).toBe(
        Math.round((15000 * quote.daysLeft) / 30),
      );
    }
    // A part day counts as one: 15 days and a second left is 16.
    expect(monthly("2027-04-15T23:59:59Z", 0).daysLeft).toBe(16);
    expect(monthly("2027-04-16T00:00:00Z", 0).daysLeft).toBe(15);
    expect(monthly("2027-04-16T00:00:01Z", 0).daysLeft).toBe(15);
  });

  test("a 31-day and a 28-day period count their own days", () => {
    const over = (start: string, end: string, now: string) =>
      quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "monthly",
        periodStart: new Date(start),
        periodEnd: new Date(end),
        now: new Date(now),
        usedSeconds: 0,
      });

    // March: 31 days.
    const march = ["2027-03-01T00:00:00Z", "2027-04-01T00:00:00Z"] as const;
    expect(over(...march, "2027-03-01T00:05:00Z")).toMatchObject({
      daysLeft: 31,
      periodDays: 31,
      creditCents: 15000,
      payTodayCents: 15000,
    });
    // 15 of 31: $150 × 15 / 31 = $72.5806… → $72.58.
    expect(over(...march, "2027-03-17T00:00:00Z")).toMatchObject({
      daysLeft: 15,
      creditCents: 7258,
      payTodayCents: 22742,
    });
    expect(over(...march, "2027-03-31T23:59:59Z")).toMatchObject({
      daysLeft: 1,
      // $150 / 31 = $4.8387… → $4.84.
      creditCents: 484,
    });

    // February: 28 days.
    const feb = ["2027-02-01T00:00:00Z", "2027-03-01T00:00:00Z"] as const;
    expect(over(...feb, "2027-02-01T00:05:00Z")).toMatchObject({
      daysLeft: 28,
      periodDays: 28,
      creditCents: 15000,
      payTodayCents: 15000,
    });
    // 14 of 28 is half: $75 flat.
    expect(over(...feb, "2027-02-15T00:00:00Z")).toMatchObject({
      daysLeft: 14,
      creditCents: 7500,
      payTodayCents: 22500,
    });
    expect(over(...feb, "2027-02-28T23:59:59Z")).toMatchObject({
      daysLeft: 1,
      // $150 / 28 = $5.3571… → $5.36.
      creditCents: 536,
    });
  });

  test("a period a clock change stretched by an hour is still its whole days", () => {
    // Stripe anchors on a moment, so a period is not always a multiple of
    // 24 hours; the count is rounded, and days left never exceed it.
    const quote = quoteUpgrade({
      from: "coach",
      to: "coach-pro",
      period: "monthly",
      periodStart: new Date("2027-04-01T00:00:00Z"),
      periodEnd: new Date("2027-05-01T01:00:00Z"),
      now: new Date("2027-04-01T00:05:00Z"),
      usedSeconds: 0,
    });
    expect(quote).toMatchObject({
      daysLeft: 30,
      periodDays: 30,
      creditCents: 15000,
    });
  });

  test("at and after the period's end: nothing, never negative", () => {
    for (const now of ["2027-05-01T00:00:00Z", "2027-06-15T00:00:00Z"]) {
      expect(monthly(now, 0)).toMatchObject({
        creditCents: 0,
        payTodayCents: 30000,
        daysLeft: 0,
      });
    }
  });

  test("nothing used: the days set the credit", () => {
    const quote = monthly("2027-04-21T00:00:00Z", 0);
    // 10 of 30 days left.
    expect([quote.creditBasis, quote.creditCents]).toEqual(["days", 5000]);
  });

  test("everything used: no credit, whatever the days say", () => {
    for (const used of [5 * H, 5 * H + 1, 40 * H]) {
      expect(monthly("2027-04-02T00:00:00Z", used)).toMatchObject({
        creditCents: 0,
        payTodayCents: 30000,
        creditBasis: "hours",
        hoursLeftSeconds: 0,
      });
    }
  });

  test("the credit is never above the old price, whatever the inputs", () => {
    // Before the period started, and a negative or unreadable usage figure.
    for (const [now, used] of [
      ["2027-03-01T00:00:00Z", 0],
      ["2027-04-01T00:00:00Z", -9 * H],
      ["2027-04-01T00:00:00Z", Number.NaN],
    ] as const) {
      const quote = monthly(now, used);
      expect(quote.creditCents).toBe(15000);
      expect(quote.payTodayCents).toBe(15000);
      expect(quote.hoursLeftSeconds).toBe(5 * H);
    }
  });

  test("rounding is half-up to the cent, and exact", () => {
    // 3 s of 5 h left is 2.5 cents of $150 → 3; 2 s is 1.67 → 2; 1 s is 0.83 → 1.
    const start = "2027-04-01T00:00:00Z";
    expect(monthly(start, 5 * H - 3).creditCents).toBe(3);
    expect(monthly(start, 5 * H - 2).creditCents).toBe(2);
    expect(monthly(start, 5 * H - 1).creditCents).toBe(1);
    // 9 s is 7.5 cents → 8.
    expect(monthly(start, 5 * H - 9).creditCents).toBe(8);
    // Time is whole days: 1 of 30 is exactly $5.00, and so is a second less.
    expect(monthly("2027-04-30T00:00:00Z", 0).creditCents).toBe(500);
    expect(monthly("2027-04-30T00:00:01Z", 0).creditCents).toBe(500);
    // A float product would miss this one: 7 of 30 days of $150 is $35 flat.
    expect(monthly("2027-04-24T00:00:00Z", 0).creditCents).toBe(3500);
  });

  test.describe("a yearly plan: twelve monthly slices", () => {
    const YEAR = {
      periodStart: new Date("2027-01-10T00:00:00Z"),
      periodEnd: new Date("2028-01-10T00:00:00Z"),
    };
    const yearly = (now: string, usedSeconds: number) =>
      quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "yearly",
        ...YEAR,
        now: new Date(now),
        usedSeconds,
      });

    test("mid-year, the slice untouched: six of twelve slices left is half", () => {
      // July 10 opens the seventh slice: it and five more are unused.
      const quote = yearly("2027-07-10T00:00:00Z", 0);
      expect(quote).toMatchObject({
        oldPeriodPriceCents: 165000,
        newPeriodPriceCents: 330000,
        // 184 of 365 days left is 50.4%; the hours, 50%, are the smaller.
        creditBasis: "hours",
        creditCents: 82500,
        payTodayCents: 247500,
        daysLeft: 184,
        hoursLeftSeconds: 5 * H,
        periodHoursLeftSeconds: 6 * 5 * H,
        periodHoursSeconds: 12 * 5 * H,
        nextBillingDay: "2028-07-10",
      });
    });

    test("the current slice counts by what is left of it", () => {
      // 2 h used this month: five whole slices and 3 h, of sixty hours.
      const quote = yearly("2027-07-10T00:00:00Z", 2 * H);
      expect(quote.periodHoursLeftSeconds).toBe(5 * 5 * H + 3 * H);
      expect([quote.creditBasis, quote.creditCents]).toEqual(["hours", 77000]);
      expect(quote.hoursLeftSeconds).toBe(3 * H);
    });

    test("past slices are gone whether or not they were used", () => {
      // The day before: still the sixth slice, fully used. Six future ones.
      const quote = yearly("2027-07-09T00:00:00Z", 5 * H);
      expect(quote.periodHoursLeftSeconds).toBe(6 * 5 * H);
      expect(quote.creditCents).toBe(82500);
    });

    test("later in the slice the days become the smaller share", () => {
      // July 30: 164 of 365 days (44.9%) against six slices (50%).
      const quote = yearly("2027-07-30T00:00:00Z", 0);
      expect(quote.creditBasis).toBe("days");
      // $1,650 × 164 / 365 = $741.3698… → $741.37.
      expect(quote.creditCents).toBe(74137);
      expect(quote.payTodayCents).toBe(330000 - 74137);
    });

    test("the first second credits the whole year; the last, one day of 365", () => {
      expect(yearly("2027-01-10T00:00:00Z", 0)).toMatchObject({
        creditCents: 165000,
        payTodayCents: 165000,
        daysLeft: 365,
        periodDays: 365,
        periodHoursLeftSeconds: 12 * 5 * H,
      });
      // Five minutes in is still all 365 days.
      expect(yearly("2027-01-10T00:05:00Z", 0)).toMatchObject({
        creditCents: 165000,
        daysLeft: 365,
      });
      const last = yearly("2028-01-09T23:59:59Z", 0);
      // Days for time, slices for hours: 1 of 365 against 1 of 12.
      expect(last).toMatchObject({
        daysLeft: 1,
        periodDays: 365,
        creditBasis: "days",
        // $1,650 / 365 = $4.5205… → $4.52.
        creditCents: 452,
        periodHoursLeftSeconds: 5 * H,
      });
    });
  });

  test("only Coach → Coach Pro is an upgrade", () => {
    expect(isUpgrade("coach", "coach-pro")).toBe(true);
    for (const [from, to] of [
      ["coach-pro", "coach"],
      ["coach", "coach"],
      ["free", "coach"],
      ["free", "coach-pro"],
      ["coach-pro", "coach-pro"],
    ] as const) {
      expect(isUpgrade(from, to)).toBe(false);
    }
  });
});

/* ---------- Execution ---------- */

const USER = { id: "u1", email: "coach@example.com" };
const NOW = new Date("2027-04-16T00:00:00Z");
const subscriber = (over = {}) =>
  fakeUser({
    id: "u1",
    plan: "coach",
    plan_period: "monthly",
    plan_status: "active",
    plan_period_start: "2027-04-01T00:00:00.000Z",
    plan_period_end: "2027-05-01T00:00:00.000Z",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    ...over,
  });
/** 1h48m used inside April's window, and rows that must not be counted. */
const USAGE = [
  usage("u1", "2027-04-03T10:00:00Z", { actual_seconds: 3600 }),
  usage("u1", "2027-04-10T10:00:00Z", { reserved_seconds: 2880 }),
  usage("u1", "2027-03-28T10:00:00Z", { actual_seconds: 9000 }),
  usage("u1", "2027-04-05T10:00:00Z", { actual_seconds: 9000, released: true }),
  usage("u2", "2027-04-05T10:00:00Z", { actual_seconds: 9000 }),
  {
    ...usage("u1", "2027-04-05T10:00:00Z", { actual_seconds: 9000 }),
    account_type: "program",
  },
];
function usage(
  account: string,
  createdAt: string,
  over: Record<string, unknown>,
) {
  return {
    account_id: account,
    account_type: "individual",
    released: false,
    created_at: new Date(createdAt).toISOString(),
    reserved_seconds: null,
    actual_seconds: null,
    ...over,
  };
}

function setup(
  over: {
    now?: Date;
    sub?: Parameters<typeof fakeSubscription>[0];
    invoices?: ReturnType<typeof fakeInvoice>[];
  } = {},
) {
  let now = over.now ?? NOW;
  const db = fakeAdmin({ users: [subscriber()], usage: USAGE });
  const api = fakeStripe({
    subscriptions: [fakeSubscription(over.sub ?? {})],
    invoices: over.invoices,
    now: () => now,
  });
  const run = (
    extra: { expectedPayTodayCents?: number; target?: UpgradeRequest } = {},
  ) =>
    executeUpgrade({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      now,
      ...extra,
    });
  return {
    db,
    api,
    run,
    at: (next: string) => {
      now = new Date(next);
    },
  };
}

test.describe("making the upgrade", () => {
  test("the preview is the worked example, from the ledger's own rows", async () => {
    const { db, api } = setup();
    const preview = await previewUpgrade({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      now: NOW,
    });
    expect(preview.ok && preview.value).toMatchObject({
      from: "coach",
      to: "coach-pro",
      period: "monthly",
      payTodayCents: 22500,
      creditCents: 7500,
      creditBasis: "days",
      daysLeft: 15,
      hoursLeftSeconds: 3 * H + 12 * 60,
      newPeriodPriceCents: 30000,
      nextBillingDay: "2027-05-16",
    });
    // A preview reads; it writes nothing anywhere.
    expect(api.names()).toEqual(["subscriptions.retrieve"]);
    expect(db.writes).toEqual([]);
  });

  test("the order: read, sweep, credit, update, then record", async () => {
    const { db, api, run } = setup();
    const result = await run({ expectedPayTodayCents: 22500 });

    expect(result).toEqual({
      ok: true,
      value: {
        plan: "coach-pro",
        period: "monthly",
        payTodayCents: 22500,
        creditCents: 7500,
        nextBillingDay: "2027-05-16",
      },
    });
    expect(api.names()).toEqual([
      "subscriptions.retrieve",
      "customers.listBalanceTransactions",
      "customers.createBalanceTransaction",
      "subscriptions.update",
      "customers.updateBalanceTransaction",
      "subscriptions.retrieve",
    ]);

    const attempt = upgradeAttemptId(fakeSubscription({}), NOW);
    expect(api.argsOf("customers.createBalanceTransaction")).toEqual([
      "cus_1",
      expect.objectContaining({
        amount: -7500,
        currency: "usd",
        metadata: {
          kind: UPGRADE_CREDIT_KIND,
          attempt,
          subscription: "sub_1",
          basis: "days",
        },
      }),
      { idempotencyKey: `${attempt}:credit` },
    ]);
    expect(api.argsOf("subscriptions.update")).toEqual([
      "sub_1",
      {
        items: [{ id: "si_1", price: "price_pro_m" }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
        payment_behavior: "error_if_incomplete",
        // What Stripe's portal prints beside the price: the plan it is now.
        description: "Advantage Coach Pro, monthly",
        metadata: { upgrade_attempt: attempt },
      },
      { idempotencyKey: `${attempt}:update` },
    ]);

    // The new period starts now, which is what hands out the fresh hours.
    expect(db.user("u1")).toMatchObject({
      plan: "coach-pro",
      plan_period: "monthly",
      plan_status: "active",
      plan_period_start: "2027-04-16T00:00:00.000Z",
      plan_period_end: "2027-05-16T00:00:00.000Z",
    });
    expect(api.balance[0].metadata.applied).toBe("1");
  });

  test("a declined card: nothing changes and the credit is taken back", async () => {
    const { db, api, run } = setup();
    api.fail["subscriptions.update"] = () => cardDeclined();

    const result = await run();
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["payment_failed", 402],
    );
    expect(api.names()).toEqual([
      "subscriptions.retrieve",
      "customers.listBalanceTransactions",
      "customers.createBalanceTransaction",
      "subscriptions.update",
      "subscriptions.retrieve",
      "customers.createBalanceTransaction",
    ]);
    expect(api.balance.map((t) => [t.amount, t.metadata.kind])).toEqual([
      [-7500, UPGRADE_CREDIT_KIND],
      [7500, UPGRADE_REVERSAL_KIND],
    ]);
    expect(api.netBalance()).toBe(0);
    expect(db.user("u1")?.plan).toBe("coach");
    expect(db.writes).toEqual([]);
  });

  test("a retry in the minute it was declined is told to wait, and adds nothing", async () => {
    const { api, run, at } = setup();
    api.fail["subscriptions.update"] = () => cardDeclined();
    await run();
    api.fail["subscriptions.update"] = undefined;

    const again = await run();
    expect(again.ok ? null : again.error.detail).toBe("attempt_spent");
    expect(
      api.names().filter((n) => n === "subscriptions.update"),
    ).toHaveLength(1);
    expect(api.netBalance()).toBe(0);

    // The next minute is a new attempt, with its own credit.
    at("2027-04-16T00:01:00Z");
    expect((await run()).ok).toBe(true);
    expect(api.netBalance()).toBe(-7500);
  });

  test("a lost response: the subscription says it happened, so it did", async () => {
    const { db, api, run } = setup();
    api.fail["subscriptions.update"] = (id, params) => {
      api.applyUpdate(id as string, params as never);
      return connectionLost();
    };

    const result = await run();
    expect(result.ok).toBe(true);
    // No reversal: the credit was consumed by the upgrade that did happen.
    expect(api.balance.map((t) => t.amount)).toEqual([-7500]);
    expect(db.user("u1")?.plan).toBe("coach-pro");
  });

  test("an unknown outcome is left alone, and the next attempt settles it", async () => {
    const { db, api, run, at } = setup();
    api.fail["subscriptions.update"] = () => connectionLost();
    let reads = 0;
    api.fail["subscriptions.retrieve"] = () =>
      (reads += 1) === 2 ? connectionLost() : null;

    const result = await run();
    expect(result.ok ? null : result.error.detail).toBe("outcome_unknown");
    // Not reversed: nobody knows yet whether the upgrade went through.
    expect(api.balance.map((t) => t.amount)).toEqual([-7500]);

    api.fail["subscriptions.update"] = undefined;
    api.fail["subscriptions.retrieve"] = undefined;

    // Too soon, it could still be running: refused rather than raced.
    at("2027-04-16T00:05:00Z");
    const soon = await run();
    expect(soon.ok ? null : [soon.error.code, soon.error.detail]).toEqual([
      "upgrade_in_progress",
      "unsettled_credit",
    ]);
    expect(api.balance).toHaveLength(1);

    // Later: the subscription does not name that attempt, so its credit is
    // an orphan. It is reversed, and the upgrade then runs with a fresh one.
    at("2027-04-16T00:11:00Z");
    expect((await run()).ok).toBe(true);
    expect(api.balance.map((t) => [t.amount, t.metadata.kind])).toEqual([
      [-7500, UPGRADE_CREDIT_KIND],
      [7500, UPGRADE_REVERSAL_KIND],
      // Eleven minutes on it is still 15 of 30 days: the same $75.
      [-7500, UPGRADE_CREDIT_KIND],
    ]);
    expect(api.netBalance()).toBe(-7500);
    expect(db.user("u1")?.plan).toBe("coach-pro");
  });

  test("a credit the subscription names was used: it is never reversed", async () => {
    // Upgraded once, back on Coach since (a renewal-time downgrade), and the
    // "applied" label never got written. The subscription still names it.
    const { api, run } = setup({
      sub: { metadata: { upgrade_attempt: "upg_old" } },
    });
    api.balance.push({
      id: "cbtxn_old",
      amount: -4000,
      created: Math.floor(Date.parse("2027-01-05T00:00:00Z") / 1000),
      metadata: {
        kind: UPGRADE_CREDIT_KIND,
        attempt: "upg_old",
        subscription: "sub_1",
      },
    });

    expect((await run()).ok).toBe(true);
    expect(
      api.balance.find((t) => t.id === "cbtxn_old")?.metadata.applied,
    ).toBe("1");
    expect(
      api.balance.filter((t) => t.metadata.kind === UPGRADE_REVERSAL_KIND),
    ).toEqual([]);
  });

  test("another subscription's credit is not this one's to judge", async () => {
    const { api, run } = setup();
    api.balance.push({
      id: "cbtxn_other",
      amount: -4000,
      created: Math.floor(Date.parse("2026-12-05T00:00:00Z") / 1000),
      metadata: {
        kind: UPGRADE_CREDIT_KIND,
        attempt: "upg_other",
        subscription: "sub_0",
      },
    });
    expect((await run()).ok).toBe(true);
    expect(api.balance.map((t) => t.amount)).toEqual([-4000, -7500]);
  });

  test("the credit cannot be created: nothing else is attempted", async () => {
    const { db, api, run } = setup();
    api.fail["customers.createBalanceTransaction"] = () => connectionLost();

    const result = await run();
    expect(result.ok ? null : result.error.detail).toBe("credit_failed");
    expect(api.names()).not.toContain("subscriptions.update");
    expect(api.balance).toEqual([]);
    expect(db.user("u1")?.plan).toBe("coach");
  });

  test("a twin request in flight: left to the twin, nothing reversed", async () => {
    const { api, run } = setup();
    api.fail["subscriptions.update"] = () => idempotencyInUse();

    const result = await run();
    expect(result.ok ? null : result.error.code).toBe("upgrade_in_progress");
    expect(api.balance.map((t) => t.amount)).toEqual([-7500]);
    expect(api.names().at(-1)).toBe("subscriptions.update");
  });

  test("two clicks in the same minute share one credit", async () => {
    const { api, run } = setup();
    const [first, second] = await Promise.all([run(), run()]);
    // Both report the upgrade; Stripe saw one credit (the idempotency key).
    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(api.balance.map((t) => t.amount)).toEqual([-7500]);
    const keys = api.calls
      .filter((entry) => entry.name === "subscriptions.update")
      .map(
        (entry) => (entry.args[2] as { idempotencyKey: string }).idempotencyKey,
      );
    expect(new Set(keys).size).toBe(1);
  });

  test("everything used: no credit is created, the upgrade still happens", async () => {
    const { db, api } = setup();
    db.tables.processing_usage.push(
      usage("u1", "2027-04-12T00:00:00Z", { actual_seconds: 5 * H }),
    );
    const result = await executeUpgrade({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      now: NOW,
    });
    expect(result.ok && result.value).toMatchObject({
      creditCents: 0,
      payTodayCents: 30000,
    });
    expect(api.names()).not.toContain("customers.createBalanceTransaction");
    expect(api.names()).toContain("subscriptions.update");
  });

  test("a quote that moved since the dialog showed it is not charged", async () => {
    const { db, api, run } = setup();
    const result = await run({ expectedPayTodayCents: 28850 });
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["quote_changed", 409],
    );
    expect(api.names()).toEqual(["subscriptions.retrieve"]);
    expect(db.writes).toEqual([]);
  });

  test("a yearly Coach upgrades to yearly Coach Pro", async () => {
    const { db, api, run } = setup({
      now: new Date("2027-07-10T00:00:00Z"),
      sub: {
        price: "price_coach_y",
        start: "2027-01-10T00:00:00Z",
        end: "2028-01-10T00:00:00Z",
      },
    });
    const result = await run();
    expect(result.ok && result.value).toMatchObject({
      period: "yearly",
      creditCents: 82500,
      payTodayCents: 247500,
      nextBillingDay: "2028-07-10",
    });
    expect(api.argsOf("subscriptions.update")?.[1]).toMatchObject({
      items: [{ id: "si_1", price: "price_pro_y" }],
      description: "Advantage Coach Pro, yearly",
    });
    expect(db.user("u1")).toMatchObject({
      plan: "coach-pro",
      plan_period: "yearly",
      plan_period_end: "2028-07-10T00:00:00.000Z",
    });
  });
});

/**
 * Pay yearly: the same plan, monthly → yearly, charged today by the same rule
 * and the same machinery as the upgrade. Only the target price, the attempt
 * id and a few words differ.
 */
test.describe("pay yearly: the quote", () => {
  const toYearly = (
    now: string,
    usedSeconds: number,
    over: Partial<Parameters<typeof quoteUpgrade>[0]> = {},
  ) =>
    quoteUpgrade({
      from: "coach",
      to: "coach",
      period: "monthly",
      toPeriod: "yearly",
      ...APRIL,
      now: new Date(now),
      usedSeconds,
      ...over,
    });

  test("monthly Coach mid-month: $75 credit for 15 days, pays $1,575", () => {
    const quote = toYearly("2027-04-16T00:00:00Z", 5 * H - (3 * H + 12 * 60));
    expect(quote).toMatchObject({
      creditCents: 7500,
      payTodayCents: 157500,
      creditBasis: "days",
      daysLeft: 15,
      daysCreditCents: 7500,
      hoursCreditCents: 9600,
      hoursLeftSeconds: 3 * H + 12 * 60,
      // The month being left, and the year being bought.
      oldPeriodPriceCents: 15000,
      newPeriodPriceCents: 165000,
      // The year's first renewal, not next month.
      nextBillingDay: "2028-04-16",
      // The hours share is of ONE month's hours: the plan is still monthly.
      periodHoursSeconds: 5 * H,
      periodHoursLeftSeconds: 3 * H + 12 * 60,
    });
  });

  test("the hours set it when they are the smaller share", () => {
    expect(toYearly("2027-04-16T00:00:00Z", 5 * H - 23 * 60)).toMatchObject({
      creditCents: 1150,
      payTodayCents: 163850,
      creditBasis: "hours",
    });
  });

  test("a discounted first month: the credit is a share of the $75 paid", () => {
    expect(
      toYearly("2027-04-16T00:00:00Z", 0, { paidForPeriodCents: 7500 }),
    ).toMatchObject({
      creditCents: 3750,
      payTodayCents: 161250,
      creditBaseCents: 7500,
      oldPeriodPriceCents: 15000,
    });
  });

  test("nothing left: the full yearly price, and never a negative credit", () => {
    // The month's hours all used.
    expect(toYearly("2027-04-16T00:00:00Z", 5 * H)).toMatchObject({
      creditCents: 0,
      payTodayCents: 165000,
    });
    // The month's last instant, and after it.
    for (const now of ["2027-05-01T00:00:00Z", "2027-05-09T00:00:00Z"]) {
      expect(toYearly(now, 0)).toMatchObject({
        creditCents: 0,
        payTodayCents: 165000,
      });
    }
  });

  test("Coach Pro pays its own year, less its own month", () => {
    expect(
      toYearly("2027-04-16T00:00:00Z", 0, {
        from: "coach-pro",
        to: "coach-pro",
      }),
    ).toMatchObject({
      creditCents: 15000,
      payTodayCents: 315000,
      newPeriodPriceCents: 330000,
    });
  });

  test("exactly two changes are charged today", () => {
    const at = (
      plan: "coach" | "coach-pro" | "free",
      period: "monthly" | "yearly",
    ) => ({
      plan,
      period,
    });
    // A bigger plan on the same period.
    expect(
      upgradeKind(at("coach", "monthly"), at("coach-pro", "monthly")),
    ).toBe("plan");
    expect(upgradeKind(at("coach", "yearly"), at("coach-pro", "yearly"))).toBe(
      "plan",
    );
    // The same plan, monthly → yearly.
    expect(upgradeKind(at("coach", "monthly"), at("coach", "yearly"))).toBe(
      "period",
    );
    expect(
      upgradeKind(at("coach-pro", "monthly"), at("coach-pro", "yearly")),
    ).toBe("period");
    for (const [from, to] of [
      // Both at once.
      [at("coach", "monthly"), at("coach-pro", "yearly")],
      // Down, back to monthly, or nowhere.
      [at("coach-pro", "monthly"), at("coach", "monthly")],
      [at("coach", "yearly"), at("coach", "monthly")],
      [at("coach-pro", "yearly"), at("coach", "monthly")],
      [at("coach", "monthly"), at("coach", "monthly")],
      [at("coach", "yearly"), at("coach", "yearly")],
      // Free has no subscription to change.
      [at("free", "monthly"), at("free", "yearly")],
      [at("free", "monthly"), at("coach", "monthly")],
    ] as const) {
      expect(upgradeKind(from, to)).toBeNull();
    }
  });
});

test.describe("pay yearly: making the switch", () => {
  const YEARLY = { target: { period: "yearly" } } as const;

  test("the preview prices the year, and writes nothing", async () => {
    const { db, api } = setup();
    const preview = await previewUpgrade({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      now: NOW,
      ...YEARLY,
    });
    expect(preview.ok && preview.value).toMatchObject({
      kind: "period",
      from: "coach",
      to: "coach",
      fromPeriod: "monthly",
      period: "yearly",
      payTodayCents: 157500,
      creditCents: 7500,
      creditBasis: "days",
      daysLeft: 15,
      newPeriodPriceCents: 165000,
      nextBillingDay: "2028-04-16",
    });
    expect(api.names()).toEqual(["subscriptions.retrieve"]);
    expect(db.writes).toEqual([]);
  });

  test("the same order as the upgrade: read, sweep, credit, update, record", async () => {
    const { db, api, run } = setup();
    const result = await run({ expectedPayTodayCents: 157500, ...YEARLY });

    expect(result).toEqual({
      ok: true,
      value: {
        plan: "coach",
        period: "yearly",
        payTodayCents: 157500,
        creditCents: 7500,
        nextBillingDay: "2028-04-16",
      },
    });
    expect(api.names()).toEqual([
      "subscriptions.retrieve",
      "customers.listBalanceTransactions",
      "customers.createBalanceTransaction",
      "subscriptions.update",
      "customers.updateBalanceTransaction",
      "subscriptions.retrieve",
    ]);

    // The attempt names the change: never the plan upgrade's key.
    const attempt = upgradeAttemptId(fakeSubscription({}), NOW, "period");
    expect(attempt).toBe(
      `${upgradeAttemptId(fakeSubscription({}), NOW)}_yearly`,
    );
    expect(api.argsOf("customers.createBalanceTransaction")).toEqual([
      "cus_1",
      expect.objectContaining({
        amount: -7500,
        currency: "usd",
        description: "Unused Coach month, credited on the switch to yearly",
        metadata: {
          kind: UPGRADE_CREDIT_KIND,
          attempt,
          subscription: "sub_1",
          basis: "days",
        },
      }),
      { idempotencyKey: `${attempt}:credit` },
    ]);
    // The same plan's yearly price; everything else exactly the upgrade's.
    expect(api.argsOf("subscriptions.update")).toEqual([
      "sub_1",
      {
        items: [{ id: "si_1", price: "price_coach_y" }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
        payment_behavior: "error_if_incomplete",
        // Not "Advantage Coach, monthly", which checkout set and the portal
        // would go on printing beside the yearly price.
        description: "Advantage Coach, yearly",
        metadata: { upgrade_attempt: attempt },
      },
      { idempotencyKey: `${attempt}:update` },
    ]);

    // Still Coach; the year starts now, and so does a fresh month of hours.
    expect(db.user("u1")).toMatchObject({
      plan: "coach",
      plan_period: "yearly",
      plan_status: "active",
      plan_period_start: "2027-04-16T00:00:00.000Z",
      plan_period_end: "2028-04-16T00:00:00.000Z",
    });
    expect(api.balance[0].metadata.applied).toBe("1");
  });

  test("Coach Pro switches to its own yearly price", async () => {
    const { db, api, run } = setup({ sub: { price: "price_pro_m" } });
    const result = await run(YEARLY);
    expect(result.ok && result.value).toMatchObject({
      plan: "coach-pro",
      period: "yearly",
    });
    expect(api.argsOf("subscriptions.update")?.[1]).toMatchObject({
      items: [{ id: "si_1", price: "price_pro_y" }],
      description: "Advantage Coach Pro, yearly",
    });
    expect(db.user("u1")).toMatchObject({
      plan: "coach-pro",
      plan_period: "yearly",
    });
  });

  test("a declined card: nothing changes and the credit is taken back", async () => {
    const { db, api, run } = setup();
    api.fail["subscriptions.update"] = () => cardDeclined();

    const result = await run(YEARLY);
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["payment_failed", 402],
    );
    expect(api.balance.map((t) => [t.amount, t.metadata.kind])).toEqual([
      [-7500, UPGRADE_CREDIT_KIND],
      [7500, UPGRADE_REVERSAL_KIND],
    ]);
    expect(api.netBalance()).toBe(0);
    expect(db.user("u1")).toMatchObject({
      plan: "coach",
      plan_period: "monthly",
    });
    expect(db.writes).toEqual([]);
  });

  test("a retry in the minute it was declined is told to wait", async () => {
    const { api, run, at } = setup();
    api.fail["subscriptions.update"] = () => cardDeclined();
    await run(YEARLY);
    api.fail["subscriptions.update"] = undefined;

    const again = await run(YEARLY);
    expect(again.ok ? null : again.error.detail).toBe("attempt_spent");
    expect(
      api.names().filter((n) => n === "subscriptions.update"),
    ).toHaveLength(1);

    at("2027-04-16T00:01:00Z");
    expect((await run(YEARLY)).ok).toBe(true);
    expect(api.netBalance()).toBe(-7500);
  });

  test("a lost response: the subscription says it happened, so it did", async () => {
    const { db, api, run } = setup();
    api.fail["subscriptions.update"] = (id, params) => {
      api.applyUpdate(id as string, params as never);
      return connectionLost();
    };
    expect((await run(YEARLY)).ok).toBe(true);
    expect(api.balance.map((t) => t.amount)).toEqual([-7500]);
    expect(db.user("u1")?.plan_period).toBe("yearly");
  });

  test("an upgrade and a switch asked in one minute never share a key", async () => {
    const { api, run } = setup();
    // The upgrade's card fails and its credit is reversed…
    api.fail["subscriptions.update"] = () => cardDeclined();
    await run();
    api.fail["subscriptions.update"] = undefined;
    // …and the switch to yearly, in the same minute, is its own attempt.
    const switched = await run(YEARLY);
    expect(switched.ok && switched.value).toMatchObject({
      plan: "coach",
      period: "yearly",
    });
    const attempts = api.balance.map((t) => [t.amount, t.metadata.attempt]);
    const plan = upgradeAttemptId(fakeSubscription({}), NOW);
    expect(attempts).toEqual([
      [-7500, plan],
      [7500, plan],
      [-7500, `${plan}_yearly`],
    ]);
  });

  test("a quote that moved since the dialog showed it is not charged", async () => {
    const { db, api, run } = setup();
    const result = await run({ expectedPayTodayCents: 157499, ...YEARLY });
    expect(result.ok ? null : result.error.code).toBe("quote_changed");
    expect(api.names()).toEqual(["subscriptions.retrieve"]);
    expect(db.writes).toEqual([]);
  });
});

test.describe("what the routes accept as a target", () => {
  test("nothing asked is today's Upgrade button", () => {
    expect(readUpgradeRequest({})).toBeUndefined();
    expect(readUpgradeRequest({ payTodayCents: 22500 })).toBeUndefined();
  });

  test("a period, a plan, both, or the same inside `target`", () => {
    expect(readUpgradeRequest({ period: "yearly" })).toEqual({
      period: "yearly",
    });
    expect(readUpgradeRequest({ plan: "coach-pro" })).toEqual({
      plan: "coach-pro",
    });
    expect(
      readUpgradeRequest({ target: { plan: "coach", period: "yearly" } }),
    ).toEqual({ plan: "coach", period: "yearly" });
  });

  test("anything that is not a plan or a period is refused, not guessed", () => {
    for (const body of [
      { period: "weekly" },
      { period: 12 },
      { plan: "free" },
      { plan: "elite" },
      { target: "yearly" },
      { target: null },
      { target: { period: "lifetime" } },
    ]) {
      expect(readUpgradeRequest(body)).toBeNull();
    }
  });
});

/**
 * The credit is a share of what the customer PAID for the current period
 * (the period's invoice, after discounts, before tax), never of list price:
 * a half-off first month upgraded at once must not be credited $75 of the
 * $75 it cost.
 */
test.describe("the credit comes from what was paid", () => {
  const SUB = { latest_invoice: "in_1" };
  const preview = (world: ReturnType<typeof setup>) =>
    previewUpgrade({
      stripe: world.api.stripe,
      admin: world.db.admin,
      user: USER,
      now: NOW,
    });

  test("a half-off first month: the preview and the charge are both $37.50 / $262.50", async () => {
    // $75 after the coupon, plus tax that is no part of the basis.
    const world = setup({
      sub: SUB,
      invoices: [fakeInvoice({ paid: 7500, tax: 619 })],
    });

    const shown = await preview(world);
    expect(shown.ok && shown.value).toMatchObject({
      creditCents: 3750,
      payTodayCents: 26250,
      creditBasis: "days",
      daysCreditCents: 3750,
      hoursCreditCents: 4800,
      creditBaseCents: 7500,
      oldPeriodPriceCents: 15000,
    });
    expect(world.api.names()).toEqual([
      "subscriptions.retrieve",
      "invoices.retrieve",
    ]);
    expect(world.api.argsOf("invoices.retrieve")?.[0]).toBe("in_1");

    // The dialog sends back what it showed; the charge is that number.
    const done = await world.run({ expectedPayTodayCents: 26250 });
    expect(done).toMatchObject({
      ok: true,
      value: { payTodayCents: 26250, creditCents: 3750 },
    });
    expect(world.api.balance.map((t) => t.amount)).toEqual([-3750]);

    // What list price would have charged is refused as a moved quote.
    const other = setup({
      sub: SUB,
      invoices: [fakeInvoice({ paid: 7500 })],
    });
    const stale = await other.run({ expectedPayTodayCents: 22500 });
    expect(stale.ok ? null : stale.error.code).toBe("quote_changed");
    expect(other.api.balance).toEqual([]);
  });

  test("a full-price month is the plan's worked example, read from its invoice", async () => {
    const world = setup({
      sub: SUB,
      invoices: [fakeInvoice({ paid: 15000, tax: 1238 })],
    });
    const shown = await preview(world);
    expect(shown.ok && shown.value).toMatchObject({
      creditCents: 7500,
      payTodayCents: 22500,
      creditBaseCents: 15000,
    });
  });

  test("an invoice above list price never credits more than list", async () => {
    const world = setup({
      sub: SUB,
      invoices: [fakeInvoice({ paid: 40000 })],
    });
    const shown = await preview(world);
    expect(shown.ok && shown.value).toMatchObject({
      creditCents: 7500,
      creditBaseCents: 15000,
    });
  });

  test("without `total_excluding_tax`, it is the total less its tax", async () => {
    const world = setup({
      sub: SUB,
      invoices: [
        fakeInvoice({ paid: 7500, tax: 619, noTotalExcludingTax: true }),
      ],
    });
    const shown = await preview(world);
    expect(shown.ok && shown.value).toMatchObject({ creditCents: 3750 });
  });

  test("an invoice that cannot be read falls back to list price, and says so", async () => {
    const cases: Array<[string, Parameters<typeof setup>[0], boolean]> = [
      ["no_latest_invoice", {}, false],
      [
        "invoice_read_failed",
        { sub: SUB, invoices: [fakeInvoice({ paid: 7500 })] },
        true,
      ],
      [
        "invoice_open",
        { sub: SUB, invoices: [fakeInvoice({ paid: 7500, status: "open" })] },
        false,
      ],
      [
        "invoice_of_another_subscription",
        {
          sub: SUB,
          invoices: [fakeInvoice({ paid: 7500, subscription: "sub_9" })],
        },
        false,
      ],
      [
        "invoice_not_for_this_period",
        {
          sub: SUB,
          invoices: [
            fakeInvoice({
              paid: 7500,
              start: "2027-03-01T00:00:00Z",
              end: "2027-04-01T00:00:00Z",
            }),
          ],
        },
        false,
      ],
    ];
    for (const [reason, seed, failRead] of cases) {
      const lines: unknown[][] = [];
      console.error = (...args: unknown[]) => void lines.push(args);
      const world = setup(seed);
      if (failRead) {
        world.api.fail["invoices.retrieve"] = () => connectionLost();
      }

      const shown = await preview(world);
      expect(shown.ok && shown.value, reason).toMatchObject({
        creditCents: 7500,
        payTodayCents: 22500,
        creditBaseCents: 15000,
      });
      expect(lines, reason).toHaveLength(1);
      expect(String(lines[0][0]), reason).toContain("falls back to list price");
      expect(lines[0][1], reason).toMatchObject({
        userId: "u1",
        subscriptionId: "sub_1",
        reason,
      });
    }
  });
});

test.describe("who cannot upgrade", () => {
  const attempt = async (
    sub: Parameters<typeof fakeSubscription>[0] | null,
    user = subscriber(),
    target?: UpgradeRequest,
  ) => {
    const db = fakeAdmin({ users: [user] });
    const api = fakeStripe({
      subscriptions: sub ? [fakeSubscription(sub)] : [],
    });
    const args = {
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      now: NOW,
      target,
    };
    const [preview, execute] = [
      await previewUpgrade(args),
      await executeUpgrade(args),
    ];
    // Both doors refuse the same way, and neither writes anything.
    expect(preview.ok ? null : preview.error.code).toBe(
      execute.ok ? null : execute.error.code,
    );
    expect(api.names().every((name) => name === "subscriptions.retrieve")).toBe(
      true,
    );
    expect(db.writes).toEqual([]);
    return execute.ok ? null : [execute.error.code, execute.error.detail];
  };

  test("signed out", async () => {
    const db = fakeAdmin({ users: [subscriber()] });
    const api = fakeStripe({ subscriptions: [fakeSubscription({})] });
    for (const call of [previewUpgrade, executeUpgrade]) {
      const result = await call({
        stripe: api.stripe,
        admin: db.admin,
        user: null,
      });
      expect(
        result.ok ? null : [result.error.code, result.error.status],
      ).toEqual(["unauthenticated", 401]);
    }
    expect(api.calls).toEqual([]);
  });

  test("no subscription", async () => {
    expect(
      await attempt(null, fakeUser({ id: "u1", stripe_customer_id: "cus_1" })),
    ).toEqual(["no_subscription", "no_subscription_on_row"]);
  });

  test("someone else's subscription on the row", async () => {
    expect(await attempt({ customer: "cus_other" })).toEqual([
      "no_subscription",
      "customer_mismatch",
    ]);
  });

  test("already on Coach Pro, or on a price that is no plan", async () => {
    expect(await attempt({ price: "price_pro_m" })).toEqual([
      "not_an_upgrade",
      "from_coach-pro",
    ]);
    expect(await attempt({ price: "price_mystery" })).toEqual([
      "not_an_upgrade",
      "unknown_price",
    ]);
  });

  test("a failed payment is fixed first", async () => {
    expect(await attempt({ status: "past_due" })).toEqual([
      "past_due",
      "status_past_due",
    ]);
    // Whatever was asked, and whatever the plan: the card comes first.
    expect(await attempt({ status: "past_due", price: "price_pro_m" })).toEqual(
      ["past_due", "status_past_due"],
    );
    expect(
      await attempt({ status: "past_due" }, subscriber(), { period: "yearly" }),
    ).toEqual(["past_due", "status_past_due"]);
  });

  test("only the two changes: everything else asked for is refused", async () => {
    // Already yearly.
    expect(
      await attempt({ price: "price_coach_y" }, subscriber(), {
        period: "yearly",
      }),
    ).toEqual(["not_an_upgrade", "from_coach_yearly_to_coach_yearly"]);
    // Back to monthly waits for renewal; it is not made here.
    expect(
      await attempt({ price: "price_coach_y" }, subscriber(), {
        period: "monthly",
      }),
    ).toEqual(["not_an_upgrade", "from_coach_yearly_to_coach_monthly"]);
    // A smaller plan, the same.
    expect(
      await attempt({ price: "price_pro_m" }, subscriber(), { plan: "coach" }),
    ).toEqual(["not_an_upgrade", "from_coach-pro_monthly_to_coach_monthly"]);
    // A bigger plan AND a year at once is two changes.
    expect(
      await attempt({}, subscriber(), { plan: "coach-pro", period: "yearly" }),
    ).toEqual(["not_an_upgrade", "from_coach_monthly_to_coach-pro_yearly"]);
    // Asking for what is already held.
    expect(
      await attempt({}, subscriber(), { plan: "coach", period: "monthly" }),
    ).toEqual(["not_an_upgrade", "from_coach_monthly_to_coach_monthly"]);
  });

  test("the yearly price is not configured", async () => {
    await withEnv({ STRIPE_PRICE_COACH_YEARLY: undefined }, async () => {
      expect(await attempt({}, subscriber(), { period: "yearly" })).toEqual([
        "price_not_configured",
        "STRIPE_PRICE_COACH_YEARLY",
      ]);
    });
  });

  test("a change already scheduled for renewal", async () => {
    expect(await attempt({ schedule: "sub_sched_1" })).toEqual([
      "not_an_upgrade",
      "has_schedule",
    ]);
  });

  test("the Coach Pro price is not configured", async () => {
    await withEnv({ STRIPE_PRICE_COACH_PRO_MONTHLY: undefined }, async () => {
      expect(await attempt({})).toEqual([
        "price_not_configured",
        "STRIPE_PRICE_COACH_PRO_MONTHLY",
      ]);
    });
  });
});
