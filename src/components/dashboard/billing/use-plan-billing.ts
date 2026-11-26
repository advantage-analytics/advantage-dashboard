"use client";

import { useEffect, useState } from "react";
import { readPlanBilling, type PlanBilling } from "@/lib/billing/plan-fields";
import { createClient } from "@/lib/supabase/client";

/**
 * The signed-in user's own subscription facts, read in the browser under RLS
 * — for a client surface that opens the checkout dialog without a server
 * loader above it (the upload wizard).
 *
 * Null until the first read lands, and while `enabled` is false. `refreshKey`
 * re-reads: pass something that changes when the answer may have (a payment
 * that had not shown up, the dialog closing).
 */
export function usePlanBilling(
  userId: string,
  enabled: boolean,
  refreshKey: string,
): PlanBilling | null {
  const [billing, setBilling] = useState<PlanBilling | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    readPlanBilling(createClient(), userId).then((read) => {
      if (!cancelled) setBilling(read);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled, refreshKey]);

  return enabled ? billing : null;
}
