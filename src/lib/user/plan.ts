/**
 * Paid entitlement lives in `users.plan`, not `users.role`.
 *
 * Migration 20260806144035 split the two and said why: `role` carried both a
 * profile persona (player/coach/parent/academy) AND the marker `'founder'` for
 * a paid account, so saving the profile form silently cleared Pro. It added
 * `users.plan`, backfilled it, and documented `plan` as the column billing
 * writes — but the app was never moved across, so billing kept writing
 * `role = 'founder'` and the Plan page kept reading it. Round 4 finishes the
 * migration: billing writes `plan`, every reader reads `plan`, and `role` is
 * persona-only in code as well as in the comment.
 *
 * Legacy `role = 'founder'` values are left alone. The migration already set
 * `plan = 'pro'` for every one of them, so nothing needs them. Settings no
 * longer edits `role` at all; only onboarding writes it.
 *
 * Client-safe: the Plan settings page is a client component and imports from
 * here. Keep this file free of server imports — the write that needs the
 * service role lives in `roles.ts`, which a client file must never import.
 */

import { teamLabel, type Viewer, type Workspace } from "@/lib/workspace/types";

/** `users.plan` value for a paid account. Constrained to 'free' | 'pro' in SQL. */
export const PRO_PLAN = "pro";

/** Whether a `users.plan` value entitles the account to Pro features. */
export function isProPlan(plan: string | null | undefined): boolean {
  return plan === PRO_PLAN;
}

/**
 * The Plan strip's facts — Plan / Squad (team only) / Member since — built
 * once so Settings › Plan and its loading skeleton (`SettingsPlanPending`)
 * cannot say two different things while a request is still in flight. The
 * strip names the tier as a person would say it: Beta, Lifetime (an early
 * one-time Pro purchase) or Pilot (a program).
 */
export function planFacts(
  active: Pick<Workspace, "kind" | "team">,
  viewer: Pick<Viewer, "plan" | "memberSince">,
): { label: string; value: string }[] {
  const isTeam = active.kind === "team";
  const facts = [
    {
      label: "Plan",
      value: isTeam ? "Pilot" : isProPlan(viewer.plan) ? "Lifetime" : "Beta",
    },
    isTeam ? { label: "Squad", value: teamLabel(active.team) ?? "—" } : null,
    { label: "Member since", value: viewer.memberSince ?? "—" },
  ];
  return facts.filter(
    (fact): fact is NonNullable<typeof fact> => fact !== null,
  );
}

/**
 * What a personal account gets during the beta — the rows of Settings › Plan
 * and of its loading skeleton, so the two cannot drift. The video figure is
 * the one `reserveQuota()` enforces for the individual tier; kept as a
 * literal rather than imported so this file stays free of the quota module.
 */
export const BETA_PLAN_ROWS: readonly {
  label: string;
  value: string;
  note?: string;
}[] = [
  {
    label: "Video analysis",
    value: "2 hours a month",
    note: "About one full match. Resets on the 1st.",
  },
  { label: "SwingVision imports", value: "Unlimited" },
  { label: "Match reports and stats", value: "Included" },
];

/** When the beta's free terms end, as the landing page and /claim say it. */
export const PAID_PLANS_BEGIN = "January 2027";
