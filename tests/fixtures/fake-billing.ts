import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-memory stand-ins for the two clients the billing services are handed:
 * the service-role Supabase client and the Stripe SDK. No network, no
 * database — the billing specs drive `services/billing/*` through these.
 *
 * Only what those services call is modelled:
 *  - `users`, `video_credits` and `processing_usage`, with `select` / `update`
 *    / `insert` and the `eq` / `is` / `gte` / `lt` / `maybeSingle` chain.
 *    `video_credits` enforces the live table's three UNIQUE Stripe columns
 *    (23505) and its user foreign key (23503), because idempotent fulfilment
 *    is built on exactly those;
 *  - Stripe's customers (and their balance transactions), subscriptions,
 *    invoices (with their charge), refunds, checkout sessions, portal
 *    sessions and payment intents. Balance transactions, cancels and refunds
 *    honour idempotency keys, as Stripe does; cancelling a subscription that
 *    is already canceled and refunding a charge that is already refunded
 *    fail the way Stripe fails them.
 *
 * Every Stripe call is appended to `calls`, so a spec can assert the ORDER of
 * calls, which is what the upgrade's failure handling depends on.
 */

/* ---------- Environment: the price ids the specs use ---------- */

export const TEST_PRICES = {
  STRIPE_PRICE_COACH_MONTHLY: "price_coach_m",
  STRIPE_PRICE_COACH_YEARLY: "price_coach_y",
  STRIPE_PRICE_COACH_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_COACH_PRO_YEARLY: "price_pro_y",
  STRIPE_PRICE_EXTRA_HOUR: "price_hour",
  STRIPE_COUPON_FIRST_MONTH: "coupon_first_month",
} as const;

/** Put the test price ids in `process.env`. Call at the top of a spec file. */
export function setTestPrices(): void {
  Object.assign(process.env, TEST_PRICES);
}

/** Run `fn` with some variables changed (`undefined` unsets), then restore. */
export async function withEnv<T>(
  changes: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const before = Object.fromEntries(
    Object.keys(changes).map((name) => [name, process.env[name]]),
  );
  const apply = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(changes);
  try {
    return await fn();
  } finally {
    apply(before);
  }
}

/* ---------- Supabase ---------- */

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

export interface FakeUser extends Row {
  id: string;
  plan: string | null;
  plan_period: string | null;
  plan_status: string | null;
  plan_period_start: string | null;
  plan_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export function fakeUser(over: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    plan: "free",
    plan_period: null,
    plan_status: null,
    plan_period_start: null,
    plan_period_end: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...over,
  };
}

const UNIQUE: Record<string, string[]> = {
  video_credits: [
    "stripe_checkout_session",
    "stripe_payment_intent",
    "stripe_event_id",
  ],
};

export function fakeAdmin(seed: {
  users?: FakeUser[];
  credits?: Row[];
  usage?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    users: [...(seed.users ?? [])],
    video_credits: [...(seed.credits ?? [])],
    processing_usage: [...(seed.usage ?? [])],
  };
  /** Set to make the next reads / writes of a table fail with this error. */
  const fail: {
    read: Record<string, DbError>;
    write: Record<string, DbError>;
  } = { read: {}, write: {} };
  const writes: Array<{ table: string; values: Row }> = [];

  // Every call resolves on a later microtask, as a real client does, so two
  // callers started together interleave between their read and their write.
  const later = <T>(value: T) => Promise.resolve().then(() => value);

  const builder = (table: string, op: "select" | "update", values?: Row) => {
    const filters: Array<(row: Row) => boolean> = [];
    /** `update(...).select()`: answer with the rows that were written. */
    let returning = false;
    const matching = () =>
      tables[table].filter((row) => filters.every((keep) => keep(row)));
    const run = () => {
      const error = op === "select" ? fail.read[table] : fail.write[table];
      if (error) return { data: null, error };
      if (op === "update") {
        writes.push({ table, values: values! });
        // Matched BEFORE the write: a filter on a column being changed must
        // not lose the row it just changed.
        const written = matching();
        for (const row of written) Object.assign(row, values);
        return {
          data: returning ? written.map((row) => ({ ...row })) : null,
          error: null,
        };
      }
      return { data: matching().map((row) => ({ ...row })), error: null };
    };
    const chain = {
      select() {
        returning = true;
        return chain;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return chain;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      gte(column: string, value: string) {
        filters.push((row) => String(row[column]) >= value);
        return chain;
      },
      lt(column: string, value: string) {
        filters.push((row) => String(row[column]) < value);
        return chain;
      },
      maybeSingle() {
        return later(null).then(() => {
          const result = run();
          return result.error
            ? result
            : { data: (result.data as Row[])[0] ?? null, error: null };
        });
      },
      then<A, B>(
        resolve: (value: ReturnType<typeof run>) => A,
        reject?: (reason: unknown) => B,
      ) {
        return later(null).then(run).then(resolve, reject);
      },
    };
    return chain;
  };

  const admin = {
    from(table: string) {
      if (!tables[table]) throw new Error(`fakeAdmin: no table ${table}`);
      return {
        select: () => builder(table, "select"),
        update: (values: Row) => builder(table, "update", values),
        insert: (row: Row) =>
          later(null).then(() => {
            if (fail.write[table]) return { error: fail.write[table] };
            for (const column of UNIQUE[table] ?? []) {
              if (
                row[column] != null &&
                tables[table].some((other) => other[column] === row[column])
              ) {
                return { error: { code: "23505", message: `dup ${column}` } };
              }
            }
            if (
              table === "video_credits" &&
              !tables.users.some((user) => user.id === row.user_id)
            ) {
              return { error: { code: "23503", message: "no such user" } };
            }
            tables[table].push({ ...row });
            return { error: null };
          }),
      };
    },
  } as unknown as SupabaseClient;

  return {
    admin,
    tables,
    fail,
    writes,
    user: (id: string) =>
      tables.users.find((row) => row.id === id) as FakeUser | undefined,
  };
}

/* ---------- Stripe ---------- */

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export function fakeSubscription(over: {
  id?: string;
  customer?: string;
  status?: Stripe.Subscription.Status;
  price?: string;
  start?: string;
  end?: string;
  metadata?: Record<string, string>;
  cancel_at_period_end?: boolean;
  schedule?: string | null;
  latest_invoice?: string | null;
}): Stripe.Subscription {
  return {
    id: over.id ?? "sub_1",
    object: "subscription",
    customer: over.customer ?? "cus_1",
    status: over.status ?? "active",
    current_period_start: seconds(over.start ?? "2027-04-01T00:00:00Z"),
    current_period_end: seconds(over.end ?? "2027-05-01T00:00:00Z"),
    cancel_at_period_end: over.cancel_at_period_end ?? false,
    schedule: over.schedule ?? null,
    latest_invoice: over.latest_invoice ?? null,
    cancellation_details: null,
    metadata: over.metadata ?? {},
    items: {
      data: [{ id: "si_1", price: { id: over.price ?? "price_coach_m" } }],
    },
  } as unknown as Stripe.Subscription;
}

export class FakeStripeError extends Error {
  constructor(
    message: string,
    readonly type: string,
    readonly statusCode?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const cardDeclined = () =>
  new FakeStripeError("Your card was declined.", "StripeCardError", 402);
export const connectionLost = () =>
  new FakeStripeError("socket hang up", "StripeConnectionError");
export const idempotencyInUse = () =>
  new FakeStripeError(
    "in use",
    "StripeIdempotencyError",
    409,
    "idempotency_key_in_use",
  );
const missing = (what: string) =>
  new FakeStripeError(
    `No such ${what}`,
    "StripeInvalidRequestError",
    404,
    "resource_missing",
  );

export interface FakeInvoice {
  id: string;
  status: string;
  subscription: string | null;
  customer: string;
  /** What the card paid: after discounts, tax included. */
  amount_paid: number;
  total: number;
  tax: number;
  total_excluding_tax: number | null;
  charge: string | null;
  payment_intent: string | null;
  lines: { data: Array<{ period: { start: number; end: number } }> };
}

/**
 * A subscription's invoice for one period. `paid` is the price after
 * discounts and BEFORE tax, `tax` what Stripe Tax added on top.
 */
export function fakeInvoice(over: {
  id?: string;
  subscription?: string;
  customer?: string;
  status?: string;
  paid?: number;
  tax?: number;
  start?: string;
  end?: string;
  charge?: string | null;
  payment_intent?: string | null;
  /** Leave `total_excluding_tax` off, as a newer API version might. */
  noTotalExcludingTax?: boolean;
}): FakeInvoice {
  const paid = over.paid ?? 15000;
  const tax = over.tax ?? 0;
  const id = over.id ?? "in_1";
  return {
    id,
    status: over.status ?? "paid",
    subscription: over.subscription ?? "sub_1",
    customer: over.customer ?? "cus_1",
    amount_paid: (over.status ?? "paid") === "paid" ? paid + tax : 0,
    total: paid + tax,
    tax,
    total_excluding_tax: over.noTotalExcludingTax ? null : paid,
    charge: over.charge === undefined ? `ch_${id}` : over.charge,
    payment_intent:
      over.payment_intent === undefined ? `pi_${id}` : over.payment_intent,
    lines: {
      data: [
        {
          period: {
            start: seconds(over.start ?? "2027-04-01T00:00:00Z"),
            end: seconds(over.end ?? "2027-05-01T00:00:00Z"),
          },
        },
      ],
    },
  };
}

type BalanceTransaction = {
  id: string;
  amount: number;
  created: number;
  metadata: Record<string, string>;
};

export function fakeStripe(seed: {
  subscriptions?: Stripe.Subscription[];
  sessions?: Stripe.Checkout.Session[];
  paidInvoices?: Array<{ customer: string; amount_paid: number }>;
  /** Invoices `invoices.retrieve` answers; each one's charge starts unrefunded. */
  invoices?: FakeInvoice[];
  paymentIntents?: Record<string, Record<string, string>>;
  balance?: BalanceTransaction[];
  /** What "now" is for objects Stripe stamps (`created`). */
  now?: () => Date;
}) {
  const subscriptions = new Map(
    (seed.subscriptions ?? []).map((sub) => [sub.id, sub]),
  );
  const sessions = new Map(
    (seed.sessions ?? []).map((session) => [session.id, session]),
  );
  const invoices = new Map(
    (seed.invoices ?? []).map((invoice) => [invoice.id, invoice]),
  );
  /** Charges by id: `refunded` flips when a refund is made. */
  const charges = new Map(
    (seed.invoices ?? [])
      .filter((invoice) => invoice.charge)
      .map((invoice) => [
        invoice.charge!,
        {
          id: invoice.charge!,
          amount: invoice.amount_paid,
          refunded: false,
          payment_intent: invoice.payment_intent,
        },
      ]),
  );
  const refunds: Array<{
    id: string;
    charge: string;
    amount: number;
    reason?: string;
    metadata?: Record<string, string>;
  }> = [];
  const replays = new Map<string, unknown>();
  const balance: BalanceTransaction[] = [...(seed.balance ?? [])];
  const idempotent = new Map<string, BalanceTransaction>();
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const now = seed.now ?? (() => new Date());

  /**
   * Script a failure: `fail["subscriptions.update"] = () => cardDeclined()`.
   * The function may also mutate state first (a "lost response").
   */
  const fail: Record<
    string,
    ((...args: unknown[]) => Error | null) | undefined
  > = {};

  const call = async <T>(name: string, args: unknown[], run: () => T) => {
    calls.push({ name, args });
    await Promise.resolve();
    const error = fail[name]?.(...args);
    if (error) throw error;
    return run();
  };

  let created = 0;

  const stripe = {
    customers: {
      create: (params: unknown, options?: unknown) =>
        call("customers.create", [params, options], () => ({ id: "cus_new" })),
      createBalanceTransaction: (
        customer: string,
        params: { amount: number; metadata?: Record<string, string> },
        options?: { idempotencyKey?: string },
      ) =>
        call(
          "customers.createBalanceTransaction",
          [customer, params, options],
          () => {
            const key = options?.idempotencyKey;
            const replay = key ? idempotent.get(key) : undefined;
            if (replay) return replay;
            const transaction = {
              id: `cbtxn_${(created += 1)}`,
              amount: params.amount,
              created: Math.floor(now().getTime() / 1000),
              metadata: params.metadata ?? {},
            };
            balance.push(transaction);
            if (key) idempotent.set(key, transaction);
            return transaction;
          },
        ),
      listBalanceTransactions: (customer: string, params?: unknown) =>
        call("customers.listBalanceTransactions", [customer, params], () => ({
          data: [...balance].reverse(),
        })),
      updateBalanceTransaction: (
        customer: string,
        id: string,
        params: { metadata: Record<string, string> },
      ) =>
        call(
          "customers.updateBalanceTransaction",
          [customer, id, params],
          () => {
            const transaction = balance.find((t) => t.id === id);
            if (transaction) transaction.metadata = params.metadata;
            return transaction;
          },
        ),
    },
    subscriptions: {
      retrieve: (id: string) =>
        call("subscriptions.retrieve", [id], () => {
          const subscription = subscriptions.get(id);
          if (!subscription) throw missing("subscription");
          return subscription;
        }),
      list: (params: { customer: string }) =>
        call("subscriptions.list", [params], () => ({
          data: [...subscriptions.values()].filter(
            (sub) => sub.customer === params.customer,
          ),
        })),
      update: (
        id: string,
        params: {
          items?: Array<{ id: string; price: string }>;
          metadata?: Record<string, string>;
        },
        options?: unknown,
      ) =>
        call("subscriptions.update", [id, params, options], () =>
          applyUpdate(id, params),
        ),
      cancel: (
        id: string,
        params?: { cancellation_details?: { comment?: string } },
        options?: { idempotencyKey?: string },
      ) =>
        call("subscriptions.cancel", [id, params, options], () => {
          const key = options?.idempotencyKey;
          if (key && replays.has(key)) return replays.get(key);
          const before = subscriptions.get(id);
          // Stripe answers 404 for a subscription that is already canceled.
          if (!before || before.status === "canceled") {
            throw missing("subscription");
          }
          const after = {
            ...before,
            status: "canceled",
            cancellation_details: {
              comment: params?.cancellation_details?.comment ?? null,
              feedback: null,
              reason: "cancellation_requested",
            },
          } as unknown as Stripe.Subscription;
          subscriptions.set(id, after);
          if (key) replays.set(key, after);
          return after;
        }),
    },
    refunds: {
      create: (
        params: {
          charge?: string;
          payment_intent?: string;
          reason?: string;
          metadata?: Record<string, string>;
        },
        options?: { idempotencyKey?: string },
      ) =>
        call("refunds.create", [params, options], () => {
          const key = options?.idempotencyKey;
          if (key && replays.has(key)) return replays.get(key);
          const charge = params.charge
            ? charges.get(params.charge)
            : [...charges.values()].find(
                (c) => c.payment_intent === params.payment_intent,
              );
          if (!charge) throw missing("charge");
          if (charge.refunded) {
            throw new FakeStripeError(
              "Charge has already been refunded.",
              "StripeInvalidRequestError",
              400,
              "charge_already_refunded",
            );
          }
          charge.refunded = true;
          const refund = {
            id: `re_${refunds.length + 1}`,
            charge: charge.id,
            amount: charge.amount,
            reason: params.reason,
            metadata: params.metadata,
          };
          refunds.push(refund);
          if (key) replays.set(key, refund);
          return refund;
        }),
    },
    invoices: {
      retrieve: (id: string, params?: { expand?: string[] }) =>
        call("invoices.retrieve", [id, params], () => {
          const invoice = invoices.get(id);
          if (!invoice) throw missing("invoice");
          return params?.expand?.includes("charge") && invoice.charge
            ? { ...invoice, charge: { ...charges.get(invoice.charge)! } }
            : { ...invoice };
        }),
      list: (params: { customer: string }) =>
        call("invoices.list", [params], () => ({
          data: (seed.paidInvoices ?? []).filter(
            (invoice) => invoice.customer === params.customer,
          ),
        })),
    },
    checkout: {
      sessions: {
        create: (params: unknown) =>
          call("checkout.sessions.create", [params], () => ({
            id: "cs_test_created00000",
            client_secret: "cs_secret",
          })),
        retrieve: (id: string) =>
          call("checkout.sessions.retrieve", [id], () => {
            const session = sessions.get(id);
            if (!session) throw missing("session");
            return session;
          }),
      },
    },
    billingPortal: {
      sessions: {
        create: (params: unknown) =>
          call("billingPortal.sessions.create", [params], () => ({
            url: "https://billing.stripe.test/session",
          })),
      },
    },
    paymentIntents: {
      retrieve: (id: string) =>
        call("paymentIntents.retrieve", [id], () => ({
          id,
          metadata: seed.paymentIntents?.[id] ?? {},
        })),
    },
  } as unknown as Stripe;

  /** What a successful `subscriptions.update` to a new price, anchored now, does. */
  function applyUpdate(
    id: string,
    params: {
      items?: Array<{ id: string; price: string }>;
      metadata?: Record<string, string>;
    },
  ): Stripe.Subscription {
    const before = subscriptions.get(id);
    if (!before) throw missing("subscription");
    if (!params.items) {
      // A metadata-only update: merged, and nothing is billed.
      const merged = {
        ...before,
        metadata: { ...before.metadata, ...params.metadata },
      } as unknown as Stripe.Subscription;
      subscriptions.set(id, merged);
      return merged;
    }
    const price = params.items?.[0]?.price ?? before.items.data[0].price.id;
    const start = now();
    const end = new Date(start.getTime());
    if (price.endsWith("_y")) end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    const after = {
      ...before,
      // The update bills the new period at once, on a new invoice.
      latest_invoice: before.latest_invoice
        ? `${before.latest_invoice}_upgrade`
        : null,
      current_period_start: Math.floor(start.getTime() / 1000),
      current_period_end: Math.floor(end.getTime() / 1000),
      metadata: params.metadata ?? before.metadata,
      items: { data: [{ id: "si_1", price: { id: price } }] },
    } as unknown as Stripe.Subscription;
    subscriptions.set(id, after);
    return after;
  }

  return {
    stripe,
    calls,
    fail,
    balance,
    subscriptions,
    sessions,
    invoices,
    charges,
    refunds,
    applyUpdate,
    /** The names of the calls made, in order. */
    names: () => calls.map((entry) => entry.name),
    /** The arguments of the first call with this name. */
    argsOf: (name: string) => calls.find((entry) => entry.name === name)?.args,
    /** Net of every balance transaction: 0 means no credit is outstanding. */
    netBalance: () => balance.reduce((total, t) => total + t.amount, 0),
  };
}

/** A Stripe event envelope around `object`. */
export function stripeEvent(
  type: string,
  object: unknown,
  id = `evt_${type.replace(/\W/g, "_")}`,
): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}
