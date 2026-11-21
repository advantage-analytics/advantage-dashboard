"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { isPostHogConfigured } from "@/lib/posthog-client";

/**
 * Identify the browser as the signed-in account on a page outside the
 * dashboard.
 *
 * `DashboardShell` is where a session is normally identified, but a new
 * account does not reach it first: the dashboard layout redirects an
 * un-onboarded account to `/onboarding` before the shell mounts, and a coach
 * goes on from there into `/claim/*`, which has no shell either. A sign-up
 * that confirms its address on another device (the phone the mail was opened
 * on), and every first Google sign-in, therefore ran the whole first-run flow
 * under an anonymous id — `onboarding_completed` and its person properties
 * included — that nothing ever merged into the account.
 *
 * The id only, as in `DashboardShell`: the shell sets the person properties
 * once the account reaches it. posthog-js persists the distinct id, so the
 * pages that follow (`/claim/*`) stay identified without mounting this again.
 */
export function IdentifySignedIn({ userId }: { userId: string }) {
  useEffect(() => {
    if (!isPostHogConfigured) return;
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  }, [userId]);
  return null;
}
