import { expect, test } from "@playwright/test";
import type Stripe from "stripe";

import { confirmCheckout } from "@/lib/services/billing/checkout";
import { handleStripeEvent } from "@/lib/services/billing/webhook";
import { DUPLICATE_MARK } from "@/lib/services/billing/subscription";
import {
  connectionLost,
  fakeAdmin,
  fakeInvoice,
  fakeStripe,
  fakeSubscription,
  fakeUser,
  setTestPrices,
  stripeEvent,
} from "./fixtures/fake-billing";

/**
 * `/api/webhooks/stripe` after its signature check, driven with fixture
 * events against in-memory Stripe and Supabase clients (no network).
 *
 * The rule under test: an event only NAMES a subscription. What gets written
 * is what Stripe holds for it now, so duplicates and out-of-order delivery
 * cannot leave a stale plan. A failed payment keeps the plan while Stripe
 * retries; only the subscription ending drops it to Free. A price that is no
 * plan changes nothing. And extra hours are recorded once, whoever gets
 * there first — the webhook or `/api/billing/confirm`.
 */

setTestPrices();
let logged: unknown[][] = [];
const real = { error: console.error, log: console.log };
test.beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  console.log = () => {};
});
test.afterEach(() => {
  Object.assign(console, real);
});

const FREE_ROW = {
  plan: "free",
  plan_period: null,
  plan_status: "canceled",
  plan_period_start: null,
  plan_period_end: null,
};

/** A user who has just paid: the row still knows nothing about Stripe. */
function world(
  sub: Parameters<typeof fakeSubscription>[0] = {},
  user = fakeUser({ id: "u1" }),
) {
  const db = fakeAdmin({ users: [user, fakeUser({ id: "u2" })] });
  const api = fakeStripe({ subscriptions: [fakeSubscription(sub)] });
  const send = (type: string, object: unknown, id?: string) =>
    handleStripeEvent({
      event: stripeEvent(type, object, id),
      stripe: api.stripe,
      admin: db.admin,
    });
  /** Change what Stripe holds for the subscription. */
  const stripeNow = (next: Parameters<typeof fakeSubscription>[0]) =>
    api.subscriptions.set(next.id ?? "sub_1", fakeSubscription(next));
  return { db, api, send, stripeNow, row: () => db.user("u1")! };
}

/** A user already on Coach monthly, as the first events leave them. */
const onCoach = (over = {}) =>
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

const planSession = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_plan0000000",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: "cus_1",
    subscription: "sub_1",
    client_reference_id: "u1",
    metadata: { kind: "plan", plan: "coach", period: "monthly", user_id: "u1" },
    ...over,
  }) as Stripe.Checkout.Session;

const invoice = (subscription: string | null = "sub_1") => ({
  id: "in_1",
  customer: "cus_1",
  subscription,
});

test.describe("a subscription's life", () => {
  test("create: the session, then the subscription event, write one plan", async () => {
    const { send, row, db } = world();

    const first = await send("checkout.session.completed", planSession());
    expect(first).toEqual({
      status: 200,
      body: { received: true, outcome: "synced" },
    });
    const written = {
      plan: "coach",
      plan_period: "monthly",
      plan_status: "active",
      plan_period_start: "2027-04-01T00:00:00.000Z",
      plan_period_end: "2027-05-01T00:00:00.000Z",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    };
    expect(row()).toMatchObject(written);

    // The same purchase, heard a second way: nothing different is written.
    await send("customer.subscription.created", fakeSubscription({}));
    await send("invoice.paid", invoice());
    expect(row()).toMatchObject(written);
    // Nobody else's row was touched.
    expect(db.user("u2")).toEqual(fakeUser({ id: "u2" }));
  });

  test("the subscription event can arrive before the session does", async () => {
    // No row holds the customer yet; the subscription's own metadata (set by
    // our checkout) names the user.
    const { send, row } = world({ metadata: { user_id: "u1" } });
    await send(
      "customer.subscription.created",
      fakeSubscription({ metadata: { user_id: "u1" } }),
    );
    expect(row()).toMatchObject({
      plan: "coach",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
  });

  test("renew: the paid invoice moves the period on", async () => {
    const { send, stripeNow, row } = world({}, onCoach());
    stripeNow({ start: "2027-05-01T00:00:00Z", end: "2027-06-01T00:00:00Z" });

    await send("invoice.paid", invoice());
    expect(row()).toMatchObject({
      plan: "coach",
      plan_status: "active",
      plan_period_start: "2027-05-01T00:00:00.000Z",
      plan_period_end: "2027-06-01T00:00:00.000Z",
    });
  });

  test("upgrade: the new price and the new period", async () => {
    const { send, stripeNow, row } = world({}, onCoach());
    const pro = {
      price: "price_pro_m",
      start: "2027-04-16T00:00:00Z",
      end: "2027-05-16T00:00:00Z",
    };
    stripeNow(pro);

    await send("customer.subscription.updated", fakeSubscription(pro));
    expect(row()).toMatchObject({
      plan: "coach-pro",
      plan_period: "monthly",
      plan_period_start: "2027-04-16T00:00:00.000Z",
      plan_period_end: "2027-05-16T00:00:00.000Z",
    });
  });

  test("a yearly price writes the yearly period", async () => {
    const { send, row } = world({
      price: "price_pro_y",
      end: "2028-04-01T00:00:00Z",
    });
    await send("checkout.session.completed", planSession());
    expect(row()).toMatchObject({
      plan: "coach-pro",
      plan_period: "yearly",
      plan_period_end: "2028-04-01T00:00:00.000Z",
    });
  });

  test("a scheduled downgrade changes nothing until the renewal it is for", async () => {
    const pro = { price: "price_pro_m" };
    const { send, stripeNow, row } = world(pro, onCoach({ plan: "coach-pro" }));

    // Scheduled: the subscription gains a schedule, the price is unchanged.
    stripeNow({ ...pro, schedule: "sub_sched_1" });
    await send(
      "customer.subscription.updated",
      fakeSubscription({ ...pro, schedule: "sub_sched_1" }),
    );
    expect(row()).toMatchObject({ plan: "coach-pro", plan_status: "active" });

    // Renewal: the schedule's next phase puts the Coach price on it.
    const renewed = {
      price: "price_coach_m",
      start: "2027-05-01T00:00:00Z",
      end: "2027-06-01T00:00:00Z",
    };
    stripeNow(renewed);
    await send("customer.subscription.updated", fakeSubscription(renewed));
    expect(row()).toMatchObject({
      plan: "coach",
      plan_period_start: "2027-05-01T00:00:00.000Z",
    });
  });

  test("cancel at period end: the plan stays until the period ends", async () => {
    const { send, stripeNow, row } = world({}, onCoach());

    stripeNow({ cancel_at_period_end: true });
    await send(
      "customer.subscription.updated",
      fakeSubscription({ cancel_at_period_end: true }),
    );
    expect(row()).toMatchObject({
      plan: "coach",
      plan_status: "active",
      plan_period_end: "2027-05-01T00:00:00.000Z",
    });

    stripeNow({ status: "canceled" });
    await send(
      "customer.subscription.deleted",
      fakeSubscription({ status: "canceled" }),
    );
    expect(row()).toMatchObject({
      ...FREE_ROW,
      stripe_subscription_id: null,
      // The customer is kept: their next checkout reuses it.
      stripe_customer_id: "cus_1",
    });
  });

  test("payment failed, then recovered: the plan never left", async () => {
    const { send, stripeNow, row } = world({}, onCoach());
    const may = { start: "2027-05-01T00:00:00Z", end: "2027-06-01T00:00:00Z" };

    stripeNow({ ...may, status: "past_due" });
    await send("invoice.payment_failed", invoice());
    expect(row()).toMatchObject({ plan: "coach", plan_status: "past_due" });

    // Stripe's retries each say the same thing.
    await send("invoice.payment_failed", invoice(), "evt_retry_2");
    expect(row()).toMatchObject({ plan: "coach", plan_status: "past_due" });

    stripeNow(may);
    await send("invoice.paid", invoice());
    expect(row()).toMatchObject({
      plan: "coach",
      plan_status: "active",
      plan_period_start: "2027-05-01T00:00:00.000Z",
    });
  });

  test("payment failed, then the retries ran out: Free", async () => {
    const { send, stripeNow, row } = world({}, onCoach());

    stripeNow({ status: "past_due" });
    await send("invoice.payment_failed", invoice());
    expect(row().plan).toBe("coach");

    stripeNow({ status: "canceled" });
    await send(
      "customer.subscription.deleted",
      fakeSubscription({ status: "canceled" }),
    );
    expect(row()).toMatchObject({ ...FREE_ROW, stripe_subscription_id: null });
  });

  test("retries set to mark the subscription unpaid: Free too, and it can come back", async () => {
    const { send, stripeNow, row } = world({}, onCoach());
    stripeNow({ status: "unpaid" });
    await send(
      "customer.subscription.updated",
      fakeSubscription({ status: "unpaid" }),
    );
    // Not final, so the id stays to be found again.
    expect(row()).toMatchObject({
      ...FREE_ROW,
      stripe_subscription_id: "sub_1",
    });

    stripeNow({});
    await send("invoice.paid", invoice());
    expect(row()).toMatchObject({ plan: "coach", plan_status: "active" });
  });
});

test.describe("delivery is not orderly", () => {
  test("a duplicate event writes the same row again", async () => {
    const { send, row } = world({ price: "price_pro_m" }, onCoach());
    const event = fakeSubscription({ price: "price_pro_m" });
    await send("customer.subscription.updated", event, "evt_same");
    const once = { ...row() };
    await send("customer.subscription.updated", event, "evt_same");
    expect(row()).toEqual(once);
    expect(once.plan).toBe("coach-pro");
  });

  test("a stale event cannot undo a newer state", async () => {
    // Stripe now holds Coach Pro; an older `updated` still says Coach.
    const { send, row } = world({ price: "price_pro_m" }, onCoach());
    await send("customer.subscription.updated", fakeSubscription({}));
    expect(row().plan).toBe("coach-pro");

    // And an older "payment failed" for a subscription that has since paid.
    await send("invoice.payment_failed", invoice());
    expect(row()).toMatchObject({ plan: "coach-pro", plan_status: "active" });
  });

  test("`deleted` before `created`: the end state is still the end", async () => {
    const { send, row } = world({ status: "canceled" }, onCoach());
    await send(
      "customer.subscription.deleted",
      fakeSubscription({ status: "canceled" }),
    );
    // The late `created` carries an active snapshot; Stripe says canceled.
    await send("customer.subscription.created", fakeSubscription({}));
    expect(row()).toMatchObject(FREE_ROW);
  });

  test("a late `deleted` for a replaced subscription does not end the new one", async () => {
    const { send, row, api } = world(
      { id: "sub_2", price: "price_pro_m" },
      onCoach({ plan: "coach-pro", stripe_subscription_id: "sub_2" }),
    );
    const old = fakeSubscription({ id: "sub_1", status: "canceled" });
    api.subscriptions.set("sub_1", old);

    const answer = await send("customer.subscription.deleted", old);
    expect(answer.body).toEqual({ received: true, outcome: "superseded" });
    expect(row()).toMatchObject({
      plan: "coach-pro",
      plan_status: "active",
      stripe_subscription_id: "sub_2",
    });
  });

  test("a deleted subscription Stripe no longer returns: the event's copy is used", async () => {
    const { send, row, api } = world({}, onCoach());
    api.subscriptions.delete("sub_1");
    await send(
      "customer.subscription.deleted",
      fakeSubscription({ status: "canceled" }),
    );
    expect(row()).toMatchObject({ ...FREE_ROW, stripe_subscription_id: null });
  });
});

test.describe("what changes nothing", () => {
  test("a price that maps to no plan: nothing written, and it is logged", async () => {
    const { send, row, db } = world({ price: "price_mystery" }, onCoach());
    const before = { ...row() };

    for (const [type, object] of [
      [
        "customer.subscription.updated",
        fakeSubscription({ price: "price_mystery" }),
      ],
      ["invoice.paid", invoice()],
    ] as const) {
      const answer = await send(type, object);
      expect(answer).toEqual({
        status: 200,
        body: { received: true, outcome: "unknown_price" },
      });
    }
    expect(row()).toEqual(before);
    expect(db.writes).toEqual([]);
    expect(logged.some(([line]) => String(line).includes("no plan"))).toBe(
      true,
    );
  });

  test("an unknown price on a brand-new subscription leaves the user Free", async () => {
    const { send, row } = world({ price: "price_mystery" });
    await send("checkout.session.completed", planSession());
    expect(row()).toEqual(fakeUser({ id: "u1" }));
  });

  test("a subscription nobody here owns: acknowledged, nothing written", async () => {
    const { send, db } = world({ customer: "cus_stranger" });
    const answer = await send(
      "customer.subscription.updated",
      fakeSubscription({ customer: "cus_stranger" }),
    );
    expect(answer).toEqual({
      status: 200,
      body: { received: true, outcome: "no_user" },
    });
    expect(db.writes).toEqual([]);
  });

  test("the user is never found by email, and never repointed", async () => {
    // u2 already has a customer of their own. A subscription on ANOTHER
    // customer that names u2 in its metadata is not written onto u2.
    const db = fakeAdmin({
      users: [
        fakeUser({ id: "u2", stripe_customer_id: "cus_2", email: "a@b.c" }),
      ],
    });
    const sub = fakeSubscription({
      customer: "cus_9",
      metadata: { user_id: "u2" },
    });
    const api = fakeStripe({ subscriptions: [sub] });
    const answer = await handleStripeEvent({
      event: stripeEvent("customer.subscription.created", {
        ...sub,
        customer_email: "a@b.c",
      }),
      stripe: api.stripe,
      admin: db.admin,
    });
    expect(answer.body).toEqual({ received: true, outcome: "no_user" });
    expect(db.user("u2")?.plan).toBe("free");
  });

  test("`incomplete`: the first payment has not gone through", async () => {
    const incomplete = {
      status: "incomplete",
      metadata: { user_id: "u1" },
    } as const;
    const { send, row } = world(incomplete);
    const answer = await send(
      "customer.subscription.created",
      fakeSubscription(incomplete),
    );
    expect(answer.body).toEqual({ received: true, outcome: "pending" });
    expect(row()).toEqual(fakeUser({ id: "u1" }));
  });

  test("an invoice with no subscription (a college's) is not ours", async () => {
    const { send, api, db } = world({}, onCoach());
    const answer = await send("invoice.paid", invoice(null));
    expect(answer.body).toEqual({ received: true, skipped: "no_subscription" });
    expect(api.calls).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  test("an event type nobody handles", async () => {
    const { send, api } = world();
    expect(await send("customer.updated", { id: "cus_1" })).toEqual({
      status: 200,
      body: { received: true },
    });
    expect(api.calls).toEqual([]);
  });
});

test.describe("when a retry can help, Stripe is asked to retry", () => {
  test("the row cannot be written", async () => {
    const { send, db } = world({}, onCoach());
    db.fail.write.users = { code: "42703", message: "no such column" };
    const answer = await send("invoice.paid", invoice());
    expect(answer.status).toBe(500);
  });

  test("Stripe cannot be read", async () => {
    const { send, api, row } = world({}, onCoach());
    api.fail["subscriptions.retrieve"] = () => new Error("stripe is down");
    for (const [type, object] of [
      ["customer.subscription.updated", fakeSubscription({})],
      ["checkout.session.completed", planSession()],
    ] as const) {
      expect((await send(type, object)).status).toBe(500);
    }
    expect(row().plan).toBe("coach");
  });
});

/* ---------- Extra hours ---------- */

const hoursSession = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_hours000000",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    created: Date.UTC(2027, 1, 10) / 1000,
    payment_intent: "pi_hours",
    amount_total: 10500,
    currency: "usd",
    customer: "cus_1",
    client_reference_id: "u1",
    metadata: { kind: "hours", hours: "3", user_id: "u1" },
    ...over,
  }) as Stripe.Checkout.Session;

test.describe("extra hours", () => {
  test("a paid session is one lot: hours × 3600, 12 months, no pack", async () => {
    const { send, db } = world();
    const answer = await send("checkout.session.completed", hoursSession());
    expect(answer.body).toEqual({ received: true, created: true });
    expect(db.tables.video_credits).toEqual([
      {
        user_id: "u1",
        seconds: 10800,
        remaining_seconds: 10800,
        expires_at: "2028-02-10T00:00:00.000Z",
        source: "purchase",
        pack: null,
        stripe_checkout_session: "cs_test_hours000000",
        stripe_payment_intent: "pi_hours",
        stripe_event_id: "evt_checkout_session_completed",
        amount_cents: 10500,
        currency: "usd",
      },
    ]);
  });

  test("the webhook and confirm race: recorded once", async () => {
    const session = hoursSession();
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const api = fakeStripe({ sessions: [session] });

    // Started together: both read "not recorded yet", both insert, and the
    // unique session column lets exactly one through.
    const [hook, confirm] = await Promise.all([
      handleStripeEvent({
        event: stripeEvent("checkout.session.completed", session),
        stripe: api.stripe,
        admin: db.admin,
      }),
      confirmCheckout({
        stripe: api.stripe,
        admin: db.admin,
        user: { id: "u1", email: null },
        sessionId: session.id,
      }),
    ]);

    expect(db.tables.video_credits).toHaveLength(1);
    expect(hook.status).toBe(200);
    // Whoever lost still answers with the purchase, not an error.
    expect(confirm).toEqual({
      ok: true,
      value: {
        kind: "hours",
        hours: 3,
        seconds: 10800,
        expiresAt: "2028-02-10T00:00:00.000Z",
      },
    });
  });

  test("either order, any number of times: still one lot", async () => {
    const session = hoursSession();
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const api = fakeStripe({ sessions: [session] });
    const hook = (id: string) =>
      handleStripeEvent({
        event: stripeEvent("checkout.session.completed", session, id),
        stripe: api.stripe,
        admin: db.admin,
      });
    const confirm = () =>
      confirmCheckout({
        stripe: api.stripe,
        admin: db.admin,
        user: { id: "u1", email: null },
        sessionId: session.id,
      });

    expect((await confirm()).ok).toBe(true);
    expect((await hook("evt_1")).body).toEqual({
      received: true,
      created: false,
    });
    expect((await hook("evt_1")).body.created).toBe(false);
    expect((await hook("evt_2")).body.created).toBe(false);
    expect((await confirm()).ok).toBe(true);
    expect(db.tables.video_credits).toHaveLength(1);
  });

  test("unpaid, tampered or unattributable sessions record nothing", async () => {
    const { send, db } = world();
    for (const [session, skipped] of [
      [hoursSession({ payment_status: "unpaid" }), "unpaid"],
      [
        hoursSession({
          metadata: { kind: "hours", hours: "0", user_id: "u1" },
        }),
        "bad_metadata",
      ],
      [
        hoursSession({
          metadata: { kind: "hours", hours: "51", user_id: "u1" },
        }),
        "bad_metadata",
      ],
      [
        hoursSession({
          metadata: { kind: "hours", hours: "2.5", user_id: "u1" },
        }),
        "bad_metadata",
      ],
      [
        hoursSession({ metadata: { kind: "hours", hours: "3" } }),
        "bad_metadata",
      ],
      [hoursSession({ mode: "subscription" }), "bad_metadata"],
      [hoursSession({ metadata: {} }), "not_credits"],
    ] as const) {
      const answer = await send("checkout.session.completed", session);
      expect(answer).toEqual({
        status: 200,
        body: { received: true, skipped },
      });
    }
    expect(db.tables.video_credits).toEqual([]);
  });

  test("a buyer who deleted their account is acknowledged, not retried", async () => {
    const { send } = world();
    const answer = await send(
      "checkout.session.completed",
      hoursSession({
        metadata: { kind: "hours", hours: "1", user_id: "gone" },
      }),
    );
    expect(answer).toEqual({
      status: 200,
      body: { received: true, skipped: "user_gone" },
    });
  });

  test("the lot cannot be written: 500, so Stripe retries", async () => {
    const { send, db } = world();
    db.fail.write.video_credits = { code: "08006", message: "connection" };
    expect(
      (await send("checkout.session.completed", hoursSession())).status,
    ).toBe(500);
  });

  test("a pack session paid before the packs were retired still records", async () => {
    const { send, db } = world();
    const answer = await send("checkout.session.completed", {
      id: "cs_test_pack0000000",
      mode: "payment",
      payment_status: "paid",
      created: Date.UTC(2026, 11, 20) / 1000,
      payment_intent: "pi_pack",
      amount_total: 6000,
      currency: "usd",
      metadata: { kind: "credits", pack: "5h", user_id: "u1" },
    });
    expect(answer.body).toEqual({ received: true, created: true });
    expect(db.tables.video_credits[0]).toMatchObject({
      pack: "5h",
      seconds: 18000,
    });
  });

  test("a refund that outruns its purchase is retried, for hours as for packs", async () => {
    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const api = fakeStripe({
      paymentIntents: {
        pi_hours: { kind: "hours" },
        pi_pack: { kind: "credits" },
        pi_subscription: {},
      },
    });
    const refund = (paymentIntent: string) =>
      handleStripeEvent({
        event: stripeEvent("charge.refunded", {
          payment_intent: paymentIntent,
          amount: 10500,
          amount_refunded: 10500,
        }),
        stripe: api.stripe,
        admin: db.admin,
      });
    expect((await refund("pi_hours")).status).toBe(500);
    expect((await refund("pi_pack")).status).toBe(500);
    // A subscription invoice's charge has no hours to take back.
    expect((await refund("pi_subscription")).status).toBe(200);
  });
});

test.describe("confirming a plan", () => {
  const confirm = (
    session: Stripe.Checkout.Session,
    userId: string | null,
    sub: Parameters<typeof fakeSubscription>[0] = {},
  ) => {
    const db = fakeAdmin({
      users: [fakeUser({ id: "u1" }), fakeUser({ id: "u2" })],
    });
    const api = fakeStripe({
      sessions: [session],
      subscriptions: [fakeSubscription(sub)],
    });
    return confirmCheckout({
      stripe: api.stripe,
      admin: db.admin,
      user: userId ? { id: userId, email: null } : null,
      sessionId: session.id,
    }).then((result) => ({ result, db, api }));
  };

  test("the buyer's own completed session writes the plan now", async () => {
    const { result, db } = await confirm(planSession(), "u1");
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "plan",
        plan: "coach",
        period: "monthly",
        status: "active",
      },
    });
    expect(db.user("u1")?.plan).toBe("coach");
  });

  test("someone else's session reads as not found, and writes nothing", async () => {
    const { result, db } = await confirm(planSession(), "u2");
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["not_found", 404],
    );
    expect(db.writes).toEqual([]);
    const hours = await confirm(hoursSession(), "u2");
    expect(hours.result.ok ? null : hours.result.error.code).toBe("not_found");
    expect(hours.db.tables.video_credits).toEqual([]);
  });

  test("a session still open is not paid yet", async () => {
    const { result } = await confirm(
      planSession({ status: "open", payment_status: "unpaid" }),
      "u1",
    );
    expect(result.ok ? null : [result.error.code, result.error.status]).toEqual(
      ["not_paid", 409],
    );
  });

  test("signed out, a malformed id, an unknown session, a session that is not ours", async () => {
    const signedOut = await confirm(planSession(), null);
    expect(signedOut.result.ok ? null : signedOut.result.error.code).toBe(
      "unauthenticated",
    );
    expect(signedOut.api.calls).toEqual([]);

    const db = fakeAdmin({ users: [fakeUser({ id: "u1" })] });
    const api = fakeStripe({
      sessions: [planSession({ id: "cs_test_other000000", metadata: {} })],
    });
    for (const sessionId of [
      "nope",
      42,
      "cs_test_missing00000",
      "cs_test_other000000",
    ]) {
      const result = await confirmCheckout({
        stripe: api.stripe,
        admin: db.admin,
        user: { id: "u1", email: null },
        sessionId,
      });
      expect(result.ok ? null : result.error.code).toBe("not_found");
    }
    expect(db.writes).toEqual([]);
  });
});

/**
 * `already_subscribed` is checked when a checkout session is created, so two
 * checkouts opened side by side can both be paid. The second subscription
 * must never rewrite the row: it is cancelled and refunded instead.
 */
test.describe("one subscription per user", () => {
  /** On Coach (`sub_1`, live), and a second, paid, Coach Pro `sub_2`. */
  function twice(
    over: {
      first?: Parameters<typeof fakeSubscription>[0];
      user?: ReturnType<typeof fakeUser>;
    } = {},
  ) {
    const second = fakeSubscription({
      id: "sub_2",
      price: "price_pro_m",
      latest_invoice: "in_2",
      metadata: { user_id: "u1" },
    });
    const db = fakeAdmin({ users: [over.user ?? onCoach()] });
    const api = fakeStripe({
      subscriptions: [
        fakeSubscription({ latest_invoice: "in_1", ...over.first }),
        second,
      ],
      invoices: [
        fakeInvoice({ id: "in_1" }),
        fakeInvoice({ id: "in_2", subscription: "sub_2", paid: 30000 }),
      ],
    });
    const send = (type: string, object: unknown) =>
      handleStripeEvent({
        event: stripeEvent(type, object),
        stripe: api.stripe,
        admin: db.admin,
      });
    const count = (name: string) =>
      api.names().filter((called) => called === name).length;
    return { db, api, send, second, count, row: () => db.user("u1")! };
  }
  const secondSession = () =>
    planSession({ id: "cs_test_second00000", subscription: "sub_2" });

  test("a second paid subscription is cancelled and refunded, and the row is not touched", async () => {
    const { db, api, send, row } = twice();

    const answer = await send("checkout.session.completed", secondSession());
    expect(answer).toEqual({
      status: 200,
      body: { received: true, outcome: "duplicate" },
    });

    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);

    expect(api.argsOf("subscriptions.cancel")).toEqual([
      "sub_2",
      {
        invoice_now: false,
        prorate: false,
        cancellation_details: { comment: `${DUPLICATE_MARK}sub_1` },
      },
      { idempotencyKey: "duplicate-subscription-cancel:sub_2" },
    ]);
    expect(api.subscriptions.get("sub_2")?.status).toBe("canceled");
    // The first subscription is neither cancelled nor refunded.
    expect(api.subscriptions.get("sub_1")?.status).toBe("active");
    expect(api.argsOf("refunds.create")).toEqual([
      {
        charge: "ch_in_2",
        reason: "duplicate",
        metadata: {
          kind: "duplicate_subscription",
          subscription: "sub_2",
          kept: "sub_1",
        },
      },
      { idempotencyKey: "duplicate-subscription-refund:in_2" },
    ]);
    expect(api.refunds).toEqual([
      expect.objectContaining({ charge: "ch_in_2", amount: 30000 }),
    ]);

    // One clear line: the user and both subscriptions.
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toContain("duplicate subscription");
    expect(logged[0][1]).toMatchObject({
      userId: "u1",
      keptSubscriptionId: "sub_1",
      duplicateSubscriptionId: "sub_2",
    });
  });

  test("the first one being behind on payment or on a trial still counts as live", async () => {
    for (const status of ["past_due", "trialing"] as const) {
      const { send, row, api } = twice({ first: { status } });
      const before = { ...row() };
      const answer = await send("customer.subscription.created", {
        id: "sub_2",
      });
      expect(answer.body).toEqual({ received: true, outcome: "duplicate" });
      expect(row()).toEqual(before);
      expect(api.refunds).toHaveLength(1);
    }
  });

  test("every later event for the duplicate changes nothing: one cancel, one refund", async () => {
    const { db, send, row, second, count, api } = twice();

    await send("customer.subscription.created", second);
    await send("checkout.session.completed", secondSession());
    await send("invoice.paid", invoice("sub_2"));
    await send("customer.subscription.updated", second);
    // The `deleted` our own cancel causes, carrying Stripe's canceled copy.
    const deleted = await send(
      "customer.subscription.deleted",
      api.subscriptions.get("sub_2"),
    );
    expect(deleted).toEqual({
      status: 200,
      body: { received: true, outcome: "superseded" },
    });
    await send("customer.subscription.deleted", api.subscriptions.get("sub_2"));

    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);
    expect(count("subscriptions.cancel")).toBe(1);
    expect(count("refunds.create")).toBe(1);
    expect(api.refunds).toHaveLength(1);
    expect(logged).toHaveLength(1);

    // And the plan they kept still syncs as before.
    await send("invoice.paid", invoice("sub_1"));
    expect(row()).toMatchObject({
      plan: "coach",
      plan_status: "active",
      stripe_subscription_id: "sub_1",
    });
  });

  test("a row pointing at an ended subscription is replaced, as before", async () => {
    for (const first of [
      { status: "canceled" },
      { status: "unpaid" },
    ] as const) {
      const { send, row, api } = twice({ first });
      const answer = await send("checkout.session.completed", secondSession());
      expect(answer.body).toEqual({ received: true, outcome: "synced" });
      expect(row()).toMatchObject({
        plan: "coach-pro",
        stripe_subscription_id: "sub_2",
      });
      expect(api.names()).not.toContain("subscriptions.cancel");
      expect(api.refunds).toEqual([]);
    }

    // And one Stripe no longer has at all.
    const { send, row, api } = twice();
    api.subscriptions.delete("sub_1");
    await send("checkout.session.completed", secondSession());
    expect(row().stripe_subscription_id).toBe("sub_2");
    expect(api.refunds).toEqual([]);
  });

  test("the held subscription cannot be read: nothing is overwritten, cancelled or refunded, and Stripe retries", async () => {
    const { db, api, send, row } = twice();
    api.fail["subscriptions.retrieve"] = (id) =>
      id === "sub_1" ? connectionLost() : null;

    const answer = await send("checkout.session.completed", secondSession());
    expect(answer.status).toBe(500);
    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);
    expect(api.names()).not.toContain("subscriptions.cancel");
    expect(api.refunds).toEqual([]);
  });

  test("the cancel fails: loud, no overwrite, no refund yet, and the retry finishes it", async () => {
    const { db, api, send, row, count } = twice();
    api.fail["subscriptions.cancel"] = () => connectionLost();

    const failed = await send("checkout.session.completed", secondSession());
    expect(failed).toEqual({
      status: 500,
      body: { error: "Duplicate subscription not settled" },
    });
    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);
    expect(api.refunds).toEqual([]);
    expect(logged.map((line) => line[0])).toEqual([
      "[billing] DUPLICATE SUBSCRIPTION NOT CANCELLED",
    ]);
    expect(logged[0][1]).toMatchObject({
      userId: "u1",
      keptSubscriptionId: "sub_1",
      duplicateSubscriptionId: "sub_2",
    });

    api.fail["subscriptions.cancel"] = undefined;
    const retried = await send("checkout.session.completed", secondSession());
    expect(retried.body).toEqual({ received: true, outcome: "duplicate" });
    expect(api.subscriptions.get("sub_2")?.status).toBe("canceled");
    expect(count("refunds.create")).toBe(1);
    expect(row()).toEqual(onCoach());
  });

  test("the refund fails: loud, no overwrite, and any later event makes it — once", async () => {
    const { db, api, send, row, count } = twice();
    api.fail["refunds.create"] = () => connectionLost();

    const failed = await send("checkout.session.completed", secondSession());
    expect(failed.status).toBe(500);
    expect(api.subscriptions.get("sub_2")?.status).toBe("canceled");
    expect(api.refunds).toEqual([]);
    expect(logged.map((line) => line[0])).toEqual([
      "[billing] DUPLICATE SUBSCRIPTION NOT REFUNDED",
    ]);

    // Still failing when the cancel's own `deleted` arrives: asked again.
    const deleted = () =>
      send("customer.subscription.deleted", api.subscriptions.get("sub_2"));
    expect((await deleted()).status).toBe(500);

    api.fail["refunds.create"] = undefined;
    expect(await deleted()).toEqual({
      status: 200,
      body: { received: true, outcome: "superseded" },
    });
    expect(api.refunds).toHaveLength(1);

    // Redelivered, and the original session event retried: nothing more.
    await deleted();
    await send("checkout.session.completed", secondSession());
    expect(api.refunds).toHaveLength(1);
    expect(count("subscriptions.cancel")).toBe(1);
    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);
  });

  test("a refund Stripe already made (the key expired, or made by hand) reads as done", async () => {
    const { api, send, count } = twice();
    api.charges.get("ch_in_2")!.refunded = true;
    const answer = await send("checkout.session.completed", secondSession());
    expect(answer.body).toEqual({ received: true, outcome: "duplicate" });
    expect(count("refunds.create")).toBe(0);
    expect(api.subscriptions.get("sub_2")?.status).toBe("canceled");
  });

  test("two first payments landing together: one plan on the row, the other undone", async () => {
    // Nothing on the row yet, so neither event can see the other's
    // subscription when it reads: the write itself has to pick one.
    const { db, api, send, row } = twice({
      user: fakeUser({ id: "u1", stripe_customer_id: "cus_1" }),
    });
    const answers = await Promise.all([
      send("customer.subscription.created", { id: "sub_1" }),
      send("customer.subscription.created", { id: "sub_2" }),
    ]);
    expect(answers.map((answer) => answer.body.outcome).sort()).toEqual([
      "duplicate",
      "synced",
    ]);

    const kept = row().stripe_subscription_id as string;
    const undone = kept === "sub_1" ? "sub_2" : "sub_1";
    expect(row().plan).toBe(kept === "sub_1" ? "coach" : "coach-pro");
    expect(api.subscriptions.get(kept)?.status).toBe("active");
    expect(api.subscriptions.get(undone)?.status).toBe("canceled");
    expect(api.refunds.map((refund) => refund.charge)).toEqual([
      `ch_in_${undone.slice(-1)}`,
    ]);
    // Only the winner ever changed the row.
    expect(db.tables.users[0]).toMatchObject({ stripe_subscription_id: kept });
  });

  test("an event's stale copy of a vanished subscription is not grounds to cancel or refund", async () => {
    const { db, api, send, row, second } = twice();
    api.subscriptions.delete("sub_2");
    const answer = await send("customer.subscription.updated", second);
    expect(answer.body).toEqual({ received: true, outcome: "superseded" });
    expect(row()).toEqual(onCoach());
    expect(db.writes).toEqual([]);
    expect(api.names()).not.toContain("subscriptions.cancel");
    expect(api.refunds).toEqual([]);
  });

  test("confirm says so, rather than promising a plan", async () => {
    const { db, api, row } = twice();
    api.sessions.set("cs_test_second00000", secondSession());
    const result = await confirmCheckout({
      stripe: api.stripe,
      admin: db.admin,
      user: { id: "u1", email: null },
      sessionId: "cs_test_second00000",
    });
    expect(
      result.ok
        ? null
        : [result.error.code, result.error.status, result.error.detail],
    ).toEqual(["already_subscribed", 409, "duplicate_subscription"]);
    expect(result.ok ? "" : result.error.message).toContain("refunded");
    expect(row()).toEqual(onCoach());
    expect(api.refunds).toHaveLength(1);
  });
});

test("a first payment that never completed leaves a Free user untouched", async () => {
  const expired = {
    status: "incomplete_expired",
    metadata: { user_id: "u1" },
  } as const;
  const { send, row, db } = world(expired);
  const answer = await send(
    "customer.subscription.updated",
    fakeSubscription(expired),
  );
  expect(answer.body).toEqual({ received: true, outcome: "superseded" });
  // No `plan_status = 'canceled'`: they are still a first-time customer.
  expect(row()).toEqual(fakeUser({ id: "u1" }));
  expect(db.writes).toEqual([]);
});
