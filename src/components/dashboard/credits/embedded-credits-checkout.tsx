"use client";

import { useMemo } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";

/**
 * Stripe Embedded Checkout for one credit-pack session. Split out of
 * `add-hours-dialog.tsx` and loaded with `next/dynamic`, so Stripe's React
 * bindings and its script reach the browser only when someone presses Pay —
 * not with every wizard and Plan page.
 */

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  stripePromise ??= loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  );
  return stripePromise;
}

export default function EmbeddedCreditsCheckout({
  fetchClientSecret,
  onComplete,
}: {
  fetchClientSecret: () => Promise<string>;
  onComplete: () => void;
}) {
  // One options object per session: the provider must not see it change.
  const options = useMemo(
    () => ({ fetchClientSecret, onComplete }),
    [fetchClientSecret, onComplete],
  );
  return (
    <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
      <EmbeddedCheckout className="min-h-[360px]" />
    </EmbeddedCheckoutProvider>
  );
}
