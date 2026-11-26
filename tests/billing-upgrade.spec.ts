import { expect, test } from "@playwright/test";

import { isUpgrade, quoteUpgrade } from "@/lib/billing/upgrade";
import {
  UPGRADE_CREDIT_KIND,
  UPGRADE_REVERSAL_KIND,
  executeUpgrade,
  previewUpgrade,
  upgradeAttemptId,
} from "@/lib/services/billing/upgrade";
import {
  cardDeclined,
  connectionLost,
  fakeAdmin,
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
 * SMALLER of the share of time left and the share of plan hours left, in
 * whole cents, half-up, never negative and never above the old price.
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
    });
  });

  test("the last second of a period: nothing, and a part day still reads as one", () => {
    const quote = monthly("2027-04-30T23:59:59Z", 0);
    expect(quote).toMatchObject({
      creditCents: 0,
      payTodayCents: 30000,
      creditBasis: "days",
      daysLeft: 1,
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
    // Time: 1 of 30 days is exactly $5.00; one second less is 499.998 → 500.
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

    test("the first second credits the whole year; the last, nothing", () => {
      expect(yearly("2027-01-10T00:00:00Z", 0)).toMatchObject({
        creditCents: 165000,
        payTodayCents: 165000,
        periodHoursLeftSeconds: 12 * 5 * H,
      });
      const last = yearly("2028-01-09T23:59:59Z", 0);
      expect(last.creditCents).toBe(0);
      expect(last.periodHoursLeftSeconds).toBe(5 * H);
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
  over: { now?: Date; sub?: Parameters<typeof fakeSubscription>[0] } = {},
) {
  let now = over.now ?? NOW;
  const db = fakeAdmin({ users: [subscriber()], usage: USAGE });
  const api = fakeStripe({
    subscriptions: [fakeSubscription(over.sub ?? {})],
    now: () => now,
  });
  const run = (extra: { expectedPayTodayCents?: number } = {}) =>
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
      // Eleven minutes on, the same share of the month is worth 4 cents less.
      [-7496, UPGRADE_CREDIT_KIND],
    ]);
    expect(api.netBalance()).toBe(-7496);
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
    expect(
      (api.argsOf("subscriptions.update")?.[1] as { items: unknown }).items,
    ).toEqual([{ id: "si_1", price: "price_pro_y" }]);
    expect(db.user("u1")).toMatchObject({
      plan: "coach-pro",
      plan_period: "yearly",
      plan_period_end: "2028-07-10T00:00:00.000Z",
    });
  });
});

test.describe("who cannot upgrade", () => {
  const attempt = async (
    sub: Parameters<typeof fakeSubscription>[0] | null,
    user = subscriber(),
  ) => {
    const db = fakeAdmin({ users: [user] });
    const api = fakeStripe({
      subscriptions: sub ? [fakeSubscription(sub)] : [],
    });
    const args = { stripe: api.stripe, admin: db.admin, user: USER, now: NOW };
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
      "not_an_upgrade",
      "status_past_due",
    ]);
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
