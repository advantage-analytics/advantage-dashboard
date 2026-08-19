"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { SettingsIconButton } from "@/components/dashboard/settings/settings-button";
import { loadProgramUsage } from "@/components/dashboard/settings/usage-actions";
import type { ProgramUsage } from "@/lib/data/usage-server";
import {
  formatAnalysisTime,
  formatBillingMonth,
  shiftBillingMonth,
  usageFraction,
} from "@/lib/data/usage-format";
import { cn } from "@/lib/utils";

/**
 * The program's shared hours, one month at a time.
 *
 * Client only because of the month stepper. The first month is rendered on the
 * server and handed in, so the card is complete on first paint and the
 * transition only ever covers a month the person asked for.
 */
export function ProgramUsageCard({
  programId,
  programName,
  initial,
  currentMonth,
}: {
  programId: string;
  programName: string;
  initial: ProgramUsage;
  /** The live month — the stepper will not walk past it. */
  currentMonth: string;
}) {
  const [usage, setUsage] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const step = (months: number) => {
    const next = shiftBillingMonth(usage.billingMonth, months);
    if (next > currentMonth) return;
    startTransition(async () => {
      setUsage(await loadProgramUsage(programId, next));
    });
  };

  const atCurrentMonth = usage.billingMonth >= currentMonth;
  const fraction = usageFraction(usage.usedSeconds, usage.capSeconds);

  return (
    <SettingsCard className="gap-3">
      <SettingsCardTitle
        trailing={
          <div className="flex items-center gap-2.5">
            <SettingsIconButton
              label="Previous month"
              onClick={() => step(-1)}
              disabled={isPending}
            >
              <ChevronLeft className="size-3" strokeWidth={1.5} />
            </SettingsIconButton>
            <span
              className={cn(
                "mono min-w-[64px] text-center text-[11px] text-[var(--ink-700)] transition-opacity",
                isPending && "opacity-40"
              )}
            >
              {formatBillingMonth(usage.billingMonth)}
            </span>
            <SettingsIconButton
              label="Next month"
              onClick={() => step(1)}
              disabled={isPending || atCurrentMonth}
            >
              <ChevronRight className="size-3" strokeWidth={1.5} />
            </SettingsIconButton>
          </div>
        }
      >
        Program hours — {programName}
      </SettingsCardTitle>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[var(--ink-100)]">
          <div
            className="h-1.5 rounded-[3px] bg-[var(--blue)] transition-[width] duration-300"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <span className="mono text-[11px] text-[var(--ink-700)]">
          {formatAnalysisTime(usage.usedSeconds)} /{" "}
          {formatAnalysisTime(usage.capSeconds)}
        </span>
      </div>

      <div className="mt-0.5 flex flex-col">
        {usage.lines.length === 0 ? (
          <p className="py-2 text-[12px] text-[var(--ink-500)]">
            No analysis hours used this month.
          </p>
        ) : (
          usage.lines.map((line) => (
            <div
              key={line.userId}
              className="flex items-center border-b border-[var(--border-hairline)] py-2 last:border-b-0"
            >
              <span className="text-[12px] text-[var(--ink-900)]">
                {line.name}
              </span>
              <span className="ml-2 text-[11px] text-[var(--ink-500)]">
                {line.matchCount} {line.matchCount === 1 ? "match" : "matches"}
              </span>
              <span className="mono ml-auto text-[11px] text-[var(--ink-700)]">
                {formatAnalysisTime(line.usedSeconds)}
              </span>
            </div>
          ))
        )}
      </div>

      <SettingsCardFootnote>
        Hours reserve at submit and reconcile on completion; failed jobs give
        hours back. Players see their own line plus the team total.
      </SettingsCardFootnote>
    </SettingsCard>
  );
}
