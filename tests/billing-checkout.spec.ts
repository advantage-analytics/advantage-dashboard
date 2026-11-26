import { expect, test } from "@playwright/test";
import type Stripe from "stripe";

import { plansOnSale } from "@/lib/billing/plans";
import {
  fulfilHoursCheckout,
  parseCheckoutBody,
  startCheckout,
} from "@/lib/services/billing/checkout";
import { openPortal } from "@/lib/services/billing/portal";
import {
  extraHourPriceId,
  firstMonthCouponId,
  planForPriceId,
  portalConfigurationId,
  priceIdFor,
} from "@/lib/stripe/prices";
import {
  TEST_PRICES,
  fakeAdmin,
  fakeStripe,
  fakeSubscription,
  fakeUser,
  setTestPrices,
  withEnv,
} from "./fixtures/fake-billing";

/**
 * `POST /api/billing/checkout` behind its route: which session is opened for
 * whom, against in-memory Stripe and Supabase clients.
 *
 * The first-month discount is the server's alone — monthly, and a customer
 * who has never had a subscription or a paid invoice, decided from Stripe and
 * our own row and never from the request. Yearly never gets it. Someone
 * already subscribed is sent to upgrade. Hours are 1–50 whole hours and need
 * no plan. An unset price refuses that one checkout with its own code.
 */

setTestPrices();
const realError = console.error;
test.beforeEach(() => {
  console.error = () => {};
});
test.afterEach(() => {
  console.error = realError;
});

const USER = { id: "u1", email: "player@example.com" };
const JANUARY = new Date("2027-01-15T12:00:00Z");

type Seed = Parameters<typeof fakeStripe>[0];

async function checkout(
  body: unknown,
  over: {
    user?: ReturnType<typeof fakeUser>;
    stripe?: Seed;
    now?: Date;
    signedOut?: boolean;
  } = {},
) {
  const db = fakeAdmin({ users: [over.user ?? fakeUser({ id: "u1" })] });
  const api = fakeStripe(over.stripe ?? {});
  const result = await startCheckout({
    stripe: api.stripe,
    admin: db.admin,
    user: over.signedOut ? null : USER,
    body,
    now: over.now ?? JANUARY,
  });
  const session = api.argsOf("checkout.sessions.create")?.[0] as
    (Stripe.Checkout.SessionCreateParams & Record<string, unknown>) | undefined;
  return {
    result,
    db,
    api,
    session,
    refusal: result.ok
      ? null
      : [result.error.code, result.error.status, result.error.detail],
  };
}

const returning = (over = {}) =>
  fakeUser({ id: "u1", stripe_customer_id: "cus_1", ...over });
const MONTHLY = { kind: "plan", plan: "coach", period: "monthly" };
const YEARLY = { kind: "plan", plan: "coach-pro", period: "yearly" };

test.describe("a plan checkout", () => {
  test("a first-time customer, monthly: embedded, taxed, and half off the first month", async () => {
    const { result, session, db, api } = await checkout(MONTHLY);

    expect(result).toEqual({
      ok: true,
      value: {
        clientSecret: "cs_secret",
        sessionId: "cs_test_created00000",
        firstMonthDiscount: true,
      },
    });
    expect(session).toEqual({
      mode: "subscription",
      // Embedded, never a redirect: the wizard's picked file is in memory.
      ui_mode: "embedded",
      redirect_on_completion: "never",
      // Exactly as the pack checkout: cards only, no Link, Stripe Tax on,
      // and no per-payment statement descriptor (the account's own is used).
      payment_method_types: ["card"],
      wallet_options: { link: { display: "never" } },
      branding_settings: expect.objectContaining({ display_name: "Advantage" }),
      automatic_tax: { enabled: true },
      customer: "cus_new",
      customer_update: { address: "auto", name: "auto" },
      client_reference_id: "u1",
      line_items: [{ price: "price_coach_m", quantity: 1 }],
      metadata: {
        kind: "plan",
        plan: "coach",
        period: "monthly",
        user_id: "u1",
      },
      subscription_data: {
        metadata: { user_id: "u1" },
        description: "Advantage Coach, monthly",
      },
      discounts: [{ coupon: "coupon_first_month" }],
    });

    // The customer was made for this user and stored with the service role.
    expect(api.argsOf("customers.create")).toEqual([
      { email: "player@example.com", metadata: { user_id: "u1" } },
      { idempotencyKey: "customer:u1" },
    ]);
    expect(db.user("u1")?.stripe_customer_id).toBe("cus_new");
  });

  test("yearly never gets the discount, first-time or not", async () => {
    for (const user of [fakeUser({ id: "u1" }), returning()]) {
      const { result, session } = await checkout(YEARLY, { user });
      expect(result.ok && result.value.firstMonthDiscount).toBe(false);
      expect(session?.line_items).toEqual([
        { price: "price_pro_y", quantity: 1 },
      ]);
      expect(session).not.toHaveProperty("discounts");
    }
  });

  test("an existing customer with no history is still first-time", async () => {
    const { result, session, api } = await checkout(MONTHLY, {
      user: returning(),
    });
    expect(result.ok && result.value.firstMonthDiscount).toBe(true);
    expect(session?.customer).toBe("cus_1");
    // Reused, not created again; and Stripe was asked for the history.
    expect(api.names()).toEqual([
      "subscriptions.list",
      "invoices.list",
      "checkout.sessions.create",
    ]);
    expect(api.argsOf("subscriptions.list")).toEqual([
      { customer: "cus_1", status: "all", limit: 100 },
    ]);
  });

  test("no discount for anyone who has subscribed or paid before", async () => {
    const cases: [string, ReturnType<typeof fakeUser>, Seed][] = [
      [
        "a canceled subscription in Stripe",
        returning(),
        {
          subscriptions: [
            fakeSubscription({ id: "sub_old", status: "canceled" }),
          ],
        },
      ],
      [
        "a subscription that never completed, in Stripe",
        returning(),
        {
          subscriptions: [
            fakeSubscription({ id: "sub_old", status: "incomplete_expired" }),
          ],
        },
      ],
      [
        "a paid invoice in Stripe",
        returning(),
        { paidInvoices: [{ customer: "cus_1", amount_paid: 15000 }] },
      ],
      [
        "our own row remembers a plan that ended",
        returning({ plan_status: "canceled" }),
        {},
      ],
      [
        "our own row still holds a subscription id",
        returning({ stripe_subscription_id: "sub_gone" }),
        {},
      ],
      [
        "our row remembers a plan, though the customer is new to Stripe",
        fakeUser({ id: "u1", plan_status: "canceled" }),
        {},
      ],
    ];
    for (const [name, user, stripe] of cases) {
      const { result, session } = await checkout(MONTHLY, { user, stripe });
      expect(result.ok && result.value.firstMonthDiscount, name).toBe(false);
      expect(session, name).not.toHaveProperty("discounts");
      expect(session?.line_items, name).toEqual([
        { price: "price_coach_m", quantity: 1 },
      ]);
    }
  });

  test("a $0 invoice is not a payment", async () => {
    const { result } = await checkout(MONTHLY, {
      user: returning(),
      stripe: { paidInvoices: [{ customer: "cus_1", amount_paid: 0 }] },
    });
    expect(result.ok && result.value.firstMonthDiscount).toBe(true);
  });

  test("the request cannot ask for the discount, a price or an account", async () => {
    const { result, session } = await checkout(
      {
        ...MONTHLY,
        firstMonthDiscount: true,
        discounts: [{ coupon: "coupon_first_month" }],
        coupon: "coupon_first_month",
        price: "price_cheap",
        user_id: "u2",
        customer: "cus_other",
      },
      {
        user: returning(),
        stripe: {
          subscriptions: [
            fakeSubscription({ id: "sub_old", status: "canceled" }),
          ],
        },
      },
    );
    expect(result.ok && result.value.firstMonthDiscount).toBe(false);
    expect(session).not.toHaveProperty("discounts");
    expect(session).toMatchObject({
      customer: "cus_1",
      client_reference_id: "u1",
      line_items: [{ price: "price_coach_m", quantity: 1 }],
      metadata: { user_id: "u1" },
    });
  });

  test("already subscribed is refused: a change goes through upgrade", async () => {
    const cases: [string, ReturnType<typeof fakeUser>, Seed][] = [
      [
        "active in Stripe",
        returning(),
        { subscriptions: [fakeSubscription({})] },
      ],
      [
        "past due in Stripe",
        returning(),
        { subscriptions: [fakeSubscription({ status: "past_due" })] },
      ],
      [
        "first payment pending in Stripe",
        returning(),
        { subscriptions: [fakeSubscription({ status: "incomplete" })] },
      ],
      [
        "our row says so, though Stripe lists nothing",
        returning({ plan: "coach", plan_status: "active" }),
        {},
      ],
      [
        "our row says so, and the customer id was lost",
        fakeUser({ id: "u1", plan: "coach-pro", plan_status: "past_due" }),
        {},
      ],
    ];
    for (const [name, user, stripe] of cases) {
      for (const body of [MONTHLY, YEARLY]) {
        const { refusal, api } = await checkout(body, { user, stripe });
        expect(refusal, name).toEqual([
          "already_subscribed",
          409,
          "has_subscription",
        ]);
        expect(api.names(), name).not.toContain("checkout.sessions.create");
      }
    }
  });

  test("a plan that ended can be bought again, at full price", async () => {
    const { result, session } = await checkout(MONTHLY, {
      user: returning({ plan_status: "canceled" }),
      stripe: {
        subscriptions: [
          fakeSubscription({ id: "sub_old", status: "canceled" }),
        ],
      },
    });
    expect(result.ok).toBe(true);
    expect(session).not.toHaveProperty("discounts");
  });

  test("a body that is not a plan request", async () => {
    for (const body of [
      null,
      {},
      "plan",
      { kind: "plan" },
      { kind: "plan", plan: "free", period: "monthly" },
      { kind: "plan", plan: "pro", period: "monthly" },
      { kind: "plan", plan: "elite", period: "monthly" },
      { kind: "plan", plan: "coach", period: "weekly" },
      { kind: "credits", pack: "5h" },
    ]) {
      const { refusal, api } = await checkout(body);
      expect(refusal).toEqual(["invalid_request", 400, "bad_body"]);
      expect(api.calls).toEqual([]);
    }
  });
});

test.describe("an hours checkout", () => {
  test("whole hours from 1 to 50, as a quantity of the one price", async () => {
    for (const hours of [1, 3, 50]) {
      const { result, session } = await checkout({ kind: "hours", hours });
      expect(result.ok && result.value.firstMonthDiscount).toBe(false);
      expect(session).toMatchObject({
        mode: "payment",
        ui_mode: "embedded",
        redirect_on_completion: "never",
        automatic_tax: { enabled: true },
        payment_method_types: ["card"],
        customer: "cus_new",
        client_reference_id: "u1",
        line_items: [{ price: "price_hour", quantity: hours }],
        metadata: { kind: "hours", hours: String(hours), user_id: "u1" },
        payment_intent_data: {
          metadata: { kind: "hours", hours: String(hours), user_id: "u1" },
          receipt_email: "player@example.com",
        },
      });
      expect(session).not.toHaveProperty("discounts");
      expect(session).not.toHaveProperty("subscription_data");
    }
  });

  test("out of bounds, fractional or not a number", async () => {
    for (const hours of [0, -1, 51, 500, 2.5, "3", null, Number.NaN, [3]]) {
      const { refusal, api } = await checkout({ kind: "hours", hours });
      expect(refusal).toEqual(["invalid_request", 400, "bad_hours"]);
      expect(api.calls).toEqual([]);
    }
    expect(parseCheckoutBody({ kind: "hours" })).toBeNull();
  });

  test("anyone can buy: Free, or already on a plan", async () => {
    for (const user of [
      fakeUser({ id: "u1" }),
      returning({
        plan: "coach",
        plan_status: "active",
        stripe_subscription_id: "sub_1",
      }),
    ]) {
      const { result, api } = await checkout(
        { kind: "hours", hours: 2 },
        { user, stripe: { subscriptions: [fakeSubscription({})] } },
      );
      expect(result.ok).toBe(true);
      // No history is read: hours have no discount and no "one at a time".
      expect(api.names()).not.toContain("subscriptions.list");
    }
  });

  test("webhook and confirm at the same instant: the loser's conflict is the recorded purchase", async () => {
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const session = {
      id: "cs_test_hours000000",
      mode: "payment",
      payment_status: "paid",
      created: Date.UTC(2027, 1, 10) / 1000,
      payment_intent: "pi_hours",
      amount_total: 3500,
      currency: "usd",
      metadata: { kind: "hours", hours: "1", user_id: "u1" },
    } as unknown as Stripe.Checkout.Session;

    const both = await Promise.all([
      fulfilHoursCheckout({ admin: db.admin, session, eventId: "evt_1" }),
      fulfilHoursCheckout({ admin: db.admin, session, expectedUserId: "u1" }),
    ]);
    expect(both.map((r) => r.ok && r.created).sort()).toEqual([false, true]);
    expect(both.every((r) => r.ok && r.seconds === 3600)).toBe(true);
    expect(db.tables.video_credits).toHaveLength(1);
  });
});

test.describe("refused before anything is created", () => {
  test("a signed-out caller", async () => {
    for (const body of [MONTHLY, { kind: "hours", hours: 1 }, null]) {
      const { refusal, api, db } = await checkout(body, { signedOut: true });
      expect(refusal).toEqual(["unauthenticated", 401, "no_session"]);
      expect(api.calls).toEqual([]);
      expect(db.writes).toEqual([]);
    }
    const db = fakeAdmin({ users: [returning()] });
    const api = fakeStripe({});
    const portal = await openPortal({
      stripe: api.stripe,
      admin: db.admin,
      user: null,
      origin: "https://app.example",
    });
    expect(portal.ok ? null : portal.error.code).toBe("unauthenticated");
    expect(api.calls).toEqual([]);
  });

  test("an unset price refuses that item only, with its own code", async () => {
    const unset: [unknown, string][] = [
      [MONTHLY, "STRIPE_PRICE_COACH_MONTHLY"],
      [{ ...MONTHLY, period: "yearly" }, "STRIPE_PRICE_COACH_YEARLY"],
      [{ ...YEARLY, period: "monthly" }, "STRIPE_PRICE_COACH_PRO_MONTHLY"],
      [YEARLY, "STRIPE_PRICE_COACH_PRO_YEARLY"],
      [{ kind: "hours", hours: 1 }, "STRIPE_PRICE_EXTRA_HOUR"],
    ];
    for (const [body, name] of unset) {
      for (const value of [undefined, "", "  ", "prod_not_a_price"]) {
        await withEnv({ [name]: value }, async () => {
          const { refusal, api, db } = await checkout(body);
          expect(refusal, name).toEqual(["price_not_configured", 503, name]);
          // Not even a customer is created for a checkout that cannot open.
          expect(api.calls).toEqual([]);
          expect(db.writes).toEqual([]);
        });
      }
    }
    // The others still open while one is unset.
    await withEnv({ STRIPE_PRICE_COACH_MONTHLY: undefined }, async () => {
      expect((await checkout(YEARLY)).result.ok).toBe(true);
      expect((await checkout({ kind: "hours", hours: 1 })).result.ok).toBe(
        true,
      );
    });
  });

  test("an unset coupon refuses the discounted checkout rather than charge full price", async () => {
    await withEnv({ STRIPE_COUPON_FIRST_MONTH: undefined }, async () => {
      const first = await checkout(MONTHLY);
      expect(first.refusal).toEqual([
        "price_not_configured",
        503,
        "STRIPE_COUPON_FIRST_MONTH",
      ]);
      expect(first.api.names()).not.toContain("checkout.sessions.create");

      // Nobody else needs it: yearly, and a customer who has paid before.
      expect((await checkout(YEARLY)).result.ok).toBe(true);
      const again = await checkout(MONTHLY, {
        user: returning({ plan_status: "canceled" }),
      });
      expect(again.result.ok).toBe(true);
    });
  });

  test("before January 1 nothing is sold, unless the owner opens the sale", async () => {
    const december = new Date("2026-12-20T12:00:00Z");
    await withEnv({ NEXT_PUBLIC_PLANS_ON_SALE: undefined }, async () => {
      for (const body of [MONTHLY, YEARLY, { kind: "hours", hours: 1 }]) {
        const { refusal, api } = await checkout(body, { now: december });
        expect(refusal).toEqual([
          "plans_not_on_sale",
          409,
          "before_plans_on_sale",
        ]);
        expect(api.calls).toEqual([]);
      }
      expect(plansOnSale(december)).toBe(false);
      expect(plansOnSale(new Date("2026-12-31T23:59:59.999Z"))).toBe(false);
      expect(plansOnSale(new Date("2027-01-01T00:00:00Z"))).toBe(true);
    });

    await withEnv({ NEXT_PUBLIC_PLANS_ON_SALE: "1" }, async () => {
      expect(plansOnSale(december)).toBe(true);
      for (const body of [MONTHLY, { kind: "hours", hours: 1 }]) {
        expect((await checkout(body, { now: december })).result.ok).toBe(true);
      }
    });

    // Only "1" opens it.
    for (const value of ["0", "true", "yes", ""]) {
      await withEnv({ NEXT_PUBLIC_PLANS_ON_SALE: value }, () => {
        expect(plansOnSale(december)).toBe(false);
      });
    }
  });

  test("the plan-model migration is not on the database yet", async () => {
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    db.fail.read.users = { code: "42703", message: "column does not exist" };
    const api = fakeStripe({});
    const result = await startCheckout({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      body: MONTHLY,
      now: JANUARY,
    });
    expect(result.ok ? null : [result.error.code, result.error.detail]).toEqual(
      ["checkout_unavailable", "plan_model_missing"],
    );
    expect(api.calls).toEqual([]);
  });

  test("Stripe is down: unavailable, and nothing half-written", async () => {
    const { refusal } = await checkout(MONTHLY, {
      user: returning(),
      stripe: {},
    });
    expect(refusal).toBeNull();

    const db = fakeAdmin({ users: [returning()] });
    const api = fakeStripe({});
    api.fail["checkout.sessions.create"] = () => new Error("stripe is down");
    const result = await startCheckout({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      body: MONTHLY,
      now: JANUARY,
    });
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["checkout_unavailable", 502],
    );
  });
});

test.describe("the customer", () => {
  test("two tabs at once end on one stored customer", async () => {
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const api = fakeStripe({});
    const open = () =>
      startCheckout({
        stripe: api.stripe,
        admin: db.admin,
        user: USER,
        body: { kind: "hours", hours: 1 },
        now: JANUARY,
      });
    const [a, b] = await Promise.all([open(), open()]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect(db.user("u1")?.stripe_customer_id).toBe("cus_new");
    // Both asked Stripe with the same idempotency key, so Stripe made one.
    const keys = api.calls
      .filter((entry) => entry.name === "customers.create")
      .map(
        (entry) => (entry.args[1] as { idempotencyKey: string }).idempotencyKey,
      );
    expect(new Set(keys)).toEqual(new Set(["customer:u1"]));
  });
});

test.describe("the portal", () => {
  const portal = async (user: ReturnType<typeof fakeUser>) => {
    const db = fakeAdmin({ users: [user] });
    const api = fakeStripe({});
    const result = await openPortal({
      stripe: api.stripe,
      admin: db.admin,
      user: USER,
      origin: "https://app.example",
    });
    return { result, api };
  };

  test("opens for the user's own customer, on our configuration, and returns to Settings › Plan", async () => {
    await withEnv({ STRIPE_PORTAL_CONFIGURATION: "bpc_123" }, async () => {
      const { result, api } = await portal(returning());
      expect(result).toEqual({
        ok: true,
        value: { url: "https://billing.stripe.test/session" },
      });
      expect(api.argsOf("billingPortal.sessions.create")).toEqual([
        {
          customer: "cus_1",
          return_url: "https://app.example/dashboard/settings/plan",
          configuration: "bpc_123",
        },
      ]);
    });
  });

  test("no configuration: refused, never the account's default portal", async () => {
    // The default configuration may have plan switching on, which would
    // change a plan without `/api/billing/upgrade`.
    const realError = console.error;
    console.error = () => {};
    try {
      for (const value of [undefined, "", "not_a_configuration"]) {
        await withEnv({ STRIPE_PORTAL_CONFIGURATION: value }, async () => {
          const { result, api } = await portal(returning());
          expect(
            result.ok
              ? null
              : [result.error.code, result.error.status, result.error.detail],
          ).toEqual([
            "price_not_configured",
            503,
            "STRIPE_PORTAL_CONFIGURATION",
          ]);
          expect(api.names()).not.toContain("billingPortal.sessions.create");
        });
      }
    } finally {
      console.error = realError;
    }
  });

  test("nothing to manage for someone who never bought anything", async () => {
    const { result, api } = await portal(fakeUser({ id: "u1" }));
    expect(result.ok ? null : [result.error.code, result.error.detail]).toEqual(
      ["no_subscription", "no_customer"],
    );
    expect(api.calls).toEqual([]);
  });
});

test.describe("price ids come from the environment, both ways", () => {
  test("plan and period to price, and a price back to its plan", () => {
    const pairs = [
      ["coach", "monthly", "price_coach_m"],
      ["coach", "yearly", "price_coach_y"],
      ["coach-pro", "monthly", "price_pro_m"],
      ["coach-pro", "yearly", "price_pro_y"],
    ] as const;
    for (const [plan, period, price] of pairs) {
      expect(priceIdFor(plan, period)).toBe(price);
      expect(planForPriceId(price)).toEqual({ plan, period });
    }
    expect(extraHourPriceId()).toBe("price_hour");
    expect(firstMonthCouponId()).toBe("coupon_first_month");
  });

  test("a price that is not a plan maps to nothing", () => {
    for (const price of [
      "price_mystery",
      "price_hour",
      "",
      null,
      undefined,
      "coupon_first_month",
    ]) {
      expect(planForPriceId(price)).toBeNull();
    }
  });

  test("an unset or malformed variable is absent, never a guess", () => {
    const env = {
      ...TEST_PRICES,
      STRIPE_PRICE_COACH_MONTHLY: "",
      STRIPE_PRICE_COACH_YEARLY: "prod_123",
      STRIPE_PRICE_EXTRA_HOUR: undefined,
      STRIPE_PORTAL_CONFIGURATION: "price_wrong_kind",
    };
    expect(priceIdFor("coach", "monthly", env)).toBeNull();
    expect(priceIdFor("coach", "yearly", env)).toBeNull();
    expect(priceIdFor("coach-pro", "yearly", env)).toBe("price_pro_y");
    expect(extraHourPriceId(env)).toBeNull();
    expect(portalConfigurationId(env)).toBeNull();
    // An unset variable must never match an empty price id.
    expect(planForPriceId("", env)).toBeNull();
    expect(planForPriceId("prod_123", env)).toBeNull();
    expect(
      priceIdFor("coach", "monthly", {
        STRIPE_PRICE_COACH_MONTHLY: " price_x ",
      }),
    ).toBe("price_x");
  });
});
