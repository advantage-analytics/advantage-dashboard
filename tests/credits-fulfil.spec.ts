import { expect, test } from "@playwright/test";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fulfilCreditCheckout,
  revokeCreditsForCharge,
} from "@/lib/services/credits/checkout";

/**
 * Credit-pack fulfilment and revocation without Stripe or a database: the
 * webhook and `/api/credits/confirm` race to record one purchase, so every
 * unique conflict is the idempotent outcome; a deleted buyer is handled, not
 * retried forever; and a refund or dispute caps the lot at the share still
 * paid for, never below what was spent.
 */

type InsertResult = { error: { code: string; message: string } | null };

function fakeAdmin(opts: {
  existing?: boolean;
  insert?: InsertResult;
  lotSeconds?: number | null;
  capped?: number;
}) {
  const inserts: unknown[] = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            opts.lotSeconds !== undefined
              ? {
                  data:
                    opts.lotSeconds === null
                      ? null
                      : { seconds: opts.lotSeconds },
                  error: null,
                }
              : { data: opts.existing ? { id: "c1" } : null, error: null },
        }),
      }),
      insert: async (row: unknown) => {
        inserts.push(row);
        return opts.insert ?? { error: null };
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: opts.capped ?? 0, error: null };
    },
  } as unknown as SupabaseClient;
  return { admin, inserts, rpcs };
}

function session(
  over: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_abc",
    mode: "payment",
    payment_status: "paid",
    created: Date.UTC(2026, 9, 16) / 1000,
    payment_intent: "pi_123",
    amount_total: 1400,
    currency: "usd",
    metadata: { kind: "credits", pack: "1h", user_id: "u1" },
    ...over,
  } as Stripe.Checkout.Session;
}

test("a paid credits session records one 1h lot expiring 12 months on", async () => {
  const f = fakeAdmin({});
  const result = await fulfilCreditCheckout({
    admin: f.admin,
    session: session(),
    eventId: "evt_1",
  });
  expect(result).toEqual({
    ok: true,
    created: true,
    pack: "1h",
    seconds: 3600,
    expiresAt: "2027-10-16T00:00:00.000Z",
  });
  expect(f.inserts).toHaveLength(1);
});

test("an already-recorded session inserts nothing", async () => {
  const f = fakeAdmin({ existing: true });
  const result = await fulfilCreditCheckout({
    admin: f.admin,
    session: session(),
  });
  expect(result.ok && result.created).toBe(false);
  expect(f.inserts).toHaveLength(0);
});

test("any unique conflict on insert is the race the other caller won", async () => {
  const f = fakeAdmin({
    insert: { error: { code: "23505", message: "dup payment intent" } },
  });
  const result = await fulfilCreditCheckout({
    admin: f.admin,
    session: session(),
  });
  expect(result).toMatchObject({ ok: true, created: false });
});

test("a buyer deleted before the hours landed is handled, not retried", async () => {
  const f = fakeAdmin({ insert: { error: { code: "23503", message: "fk" } } });
  const result = await fulfilCreditCheckout({
    admin: f.admin,
    session: session(),
  });
  expect(result).toEqual({ ok: false, reason: "user_gone" });
});

test("not a credits session, unpaid, or someone else's: nothing recorded", async () => {
  const f = fakeAdmin({});
  expect(
    await fulfilCreditCheckout({
      admin: f.admin,
      session: session({ metadata: {} }),
    }),
  ).toEqual({ ok: false, reason: "not_credits" });
  expect(
    await fulfilCreditCheckout({
      admin: f.admin,
      session: session({ payment_status: "unpaid" }),
    }),
  ).toEqual({ ok: false, reason: "unpaid" });
  expect(
    await fulfilCreditCheckout({
      admin: f.admin,
      session: session(),
      expectedUserId: "u2",
    }),
  ).toEqual({ ok: false, reason: "wrong_user" });
  expect(f.inserts).toHaveLength(0);
});

test("a dispute or full refund caps the lot at zero; a partial refund at the share still paid", async () => {
  const dispute = fakeAdmin({ lotSeconds: 18000 });
  await revokeCreditsForCharge({
    admin: dispute.admin,
    paymentIntent: "pi_1",
    amountCents: 6000,
    refundedCents: 0,
    disputed: true,
  });
  expect(dispute.rpcs[0]).toEqual({
    fn: "cap_video_credit",
    args: { p_payment_intent: "pi_1", p_max_remaining: 0 },
  });

  const full = fakeAdmin({ lotSeconds: 18000 });
  await revokeCreditsForCharge({
    admin: full.admin,
    paymentIntent: "pi_1",
    amountCents: 6000,
    refundedCents: 6000,
    disputed: false,
  });
  expect(
    (full.rpcs[0].args as { p_max_remaining: number }).p_max_remaining,
  ).toBe(0);

  const partial = fakeAdmin({ lotSeconds: 18000 });
  await revokeCreditsForCharge({
    admin: partial.admin,
    paymentIntent: "pi_1",
    amountCents: 6000,
    refundedCents: 1200,
    disputed: false,
  });
  // $12 of $60 back: 4 of the 5 hours are still paid for.
  expect(
    (partial.rpcs[0].args as { p_max_remaining: number }).p_max_remaining,
  ).toBe(14400);
});

test("a charge for something that is not a credit pack changes nothing", async () => {
  const f = fakeAdmin({ lotSeconds: null });
  const result = await revokeCreditsForCharge({
    admin: f.admin,
    paymentIntent: "pi_x",
    amountCents: 499,
    refundedCents: 499,
    disputed: false,
  });
  expect(result).toEqual({ found: false, remainingSeconds: null });
  expect(f.rpcs).toHaveLength(0);
});
