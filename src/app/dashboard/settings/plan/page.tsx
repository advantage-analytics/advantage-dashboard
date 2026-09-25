"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  SETTINGS_FACT_FIGURE,
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { BETA_PLAN_ROWS, PAID_PLANS_BEGIN, isProPlan } from "@/lib/user/plan";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { teamLabel } from "@/lib/workspace/types";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * Settings › Plan — what the account is entitled to.
 *
 * Renamed from Subscription, and narrowed with it: analysis hours moved to
 * Usage and are only pointed at from here. The two were one page while "plan"
 * and "how much of this month you have spent" were the same question; they
 * stopped being the same question when a program's 75 shared hours arrived
 * alongside a personal 2, on the same account.
 *
 * Entitlement is read from `viewer.plan`, never from `users.role`. See
 * `lib/user/plan.ts`.
 *
 * Nothing is sold here during the beta. The $4.99 one-time Pro promised
 * "unlimited uploads", which no video allowance can honour, so its checkout
 * was retired (2026-09-25) and this page states the free beta terms instead.
 * An account that already bought Pro keeps it and is told so.
 */
function PlanContent() {
  const { active, viewer } = useWorkspace();

  const isPro = isProPlan(viewer.plan);
  const isTeam = active.kind === "team";

  // The strip names the tier as a person would say it: Beta, Lifetime (an
  // early one-time Pro purchase) or Pilot (a program).
  const facts = [
    { label: "Plan", value: isTeam ? "Pilot" : isPro ? "Lifetime" : "Beta" },
    isTeam ? { label: "Squad", value: teamLabel(active.team) ?? "—" } : null,
    { label: "Member since", value: viewer.memberSince ?? "—" },
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {/* The facts card: hairline-separated columns, one large light value
          each. Analysis hours are pointedly not here — they are on Usage, which
          the page subtitle links to. Zero card padding so the dividers run the
          card's full height instead of stopping short; each cell pads itself. */}
      <SettingsCard className="overflow-hidden p-0">
        <dl
          className={cn(
            "grid divide-y divide-[var(--border-hairline)] sm:divide-x sm:divide-y-0",
            facts.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-w-0 flex-col gap-1.5 px-6 py-5"
            >
              <dt className="eyebrow whitespace-nowrap">{fact.label}</dt>
              <dd
                className={cn(
                  SETTINGS_FACT_FIGURE,
                  "tabular whitespace-nowrap text-[var(--ink-900)]",
                )}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </SettingsCard>

      {/* A program is a workspace, not something bought from this screen.
          Showing the personal Free/Pro rows here put two answers to "what plan
          am I on?" side by side — the strip saying Pilot, a card below saying
          Free — so inside a team workspace the card steps aside and the strip
          is the only answer. The personal plan is still reachable, from the
          workspace it belongs to. */}
      {isTeam ? (
        <SettingsCard className="gap-2">
          <div className="text-[12px] text-[var(--ink-900)]">
            Program plans are arranged with us directly.
          </div>
          <div className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
            Seats, shared analysis hours and billing for {active.name} are set
            up with support rather than bought here —{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Program%20plan`}
              className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              {SUPPORT_EMAIL}
            </a>
            . Your own plan is separate and unaffected; switch to your personal
            workspace to see it.
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard>
          <SettingsCardTitle className="pb-2">
            Free during the beta
          </SettingsCardTitle>

          {BETA_PLAN_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-start gap-6 border-t border-[var(--border-hairline)] py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[var(--ink-900)]">
                  {row.label}
                </span>
                {row.note && (
                  <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    {row.note}
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
                {row.value}
              </span>
            </div>
          ))}

          <span className="mt-3.5 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
            {isPro ? "Your early Pro purchase stays with your account. " : ""}
            Free through {formatPilotEnd()}. Paid plans begin in{" "}
            {PAID_PLANS_BEGIN}, and we&apos;ll tell you before anything changes.
            This month&apos;s hours are on{" "}
            <Link
              href="/dashboard/settings/usage"
              className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Usage
            </Link>
            .
          </span>
        </SettingsCard>
      )}
    </div>
  );
}

export default function PlanPage() {
  return <PlanContent />;
}
