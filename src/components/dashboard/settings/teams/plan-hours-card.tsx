"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { TwoBucketMeter } from "@/components/dashboard/credits/two-bucket-meter";
import { HoursBreakdown } from "@/components/dashboard/settings/teams/program-hours-summary";
import type { PlanHoursView } from "@/lib/billing/plan-copy";
import type { MemberRole } from "@/lib/data/team-settings-server";
import type { ProgramUsage } from "@/lib/data/usage-server";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Plan & hours — the first card on a team's own page from January 1, 2027,
 * where `ProgramHoursSummary`'s monthly view sat.
 *
 * Three states, decided by `planHoursView()` from the allowance resolver: a
 * season plan shows the season and its dates, never a month; a pilot its end
 * date and this month's hours; a team with neither says so and offers the
 * one way to get a plan, which is a call. It does not repeat what the page
 * already says — seats are on Members, and every college plan is Verified.
 *
 * The breakdown is the summary's own (`HoursBreakdown`), collapsed, fed the
 * same usage the meter reads — the season's window for a season.
 */
export function PlanHoursCard({
  view,
  usage,
  pendingSeconds,
  roles,
  viewerId,
}: {
  view: PlanHoursView;
  usage: ProgramUsage;
  pendingSeconds: number;
  /** userId → role, so a breakdown row can say who spent it. */
  roles: ReadonlyMap<string, MemberRole>;
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);

  if (view.kind === "none") {
    return (
      <SettingsCard className="gap-3 bg-[var(--surface-card)]">
        <SettingsCardTitle
          trailing={
            <span className="text-[11px] text-[var(--ink-500)]">
              {view.trailing}
            </span>
          }
        >
          Plan &amp; hours
        </SettingsCardTitle>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-title-lg text-[var(--ink-900)]">
            {view.figure}
          </span>
          <span className="text-[12px] text-[var(--ink-500)]">{view.sub}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=College%20plan`}
            className={advButton("primary", "sm")}
          >
            {view.action}
          </a>
          <span className="text-[11px] text-[var(--ink-500)]">
            {view.offer}
          </span>
        </div>
        <SettingsCardFootnote>{view.footnote}</SettingsCardFootnote>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard className="gap-3 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="mono text-[11px] text-[var(--ink-700)]">
            {view.trailing}
          </span>
        }
      >
        Plan &amp; hours
      </SettingsCardTitle>
      <div className="flex flex-wrap items-baseline gap-2">
        {/* Proportional figures on purpose — `tabular-nums` loosens a
            standalone number at this size; it is for columns. */}
        <span className="text-title-lg text-[var(--ink-900)]">
          {view.figure}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">{view.sub}</span>
      </div>
      <TwoBucketMeter balance={view.balance} />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center gap-1 self-start text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
      >
        {open ? "Hide breakdown" : "Breakdown by person"}
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-200",
            open && "rotate-90",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {open && (
        <HoursBreakdown
          usage={usage}
          pendingSeconds={pendingSeconds}
          roles={roles}
          viewerId={viewerId}
          period={view.period}
          closing="Hours reserve at submit and reconcile on completion — a failed job gives them back. Players see their own line plus the team total."
        />
      )}
      <SettingsCardFootnote>
        {view.footnoteLead}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </SettingsCardFootnote>
    </SettingsCard>
  );
}
