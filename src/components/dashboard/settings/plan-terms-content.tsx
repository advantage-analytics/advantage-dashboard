"use client";

import { cn } from "@/lib/utils";
import {
  SETTINGS_FACT_FIGURE,
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { planFacts } from "@/lib/user/plan";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * Settings › Plan inside a TEAM workspace — what the account is entitled to,
 * and the note that a program's plan is arranged with us directly.
 *
 * A personal workspace renders `PersonalPlan` instead (hours, credits and
 * packs — `/design/credits` A1–A5). Entitlement is read from `viewer.plan`,
 * never from `users.role`. See `lib/user/plan.ts`.
 */
export function TeamPlanContent() {
  const { active, viewer } = useWorkspace();
  const facts = planFacts(active, viewer);
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {/* The facts card: hairline-separated columns, one large light value
          each. Zero card padding so the dividers run the card's full height
          instead of stopping short; each cell pads itself. */}
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

      {/* A program is a workspace, not something bought from this screen, so
          inside a team workspace the personal hours and packs step aside. */}
      <SettingsCard className="gap-2">
        <div className="text-[12px] text-[var(--ink-900)]">
          Program plans are arranged with us directly.
        </div>
        <div className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
          Seats, shared analysis hours and billing for {active.name} are set up
          with support rather than bought here —{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Program%20plan`}
            className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            {SUPPORT_EMAIL}
          </a>
          . Your own hours and credits are separate; switch to your personal
          workspace to see them.
        </div>
      </SettingsCard>
    </div>
  );
}
