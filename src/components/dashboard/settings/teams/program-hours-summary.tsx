"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { YouPill } from "@/components/ui/new-pill";
import type { ProgramUsage } from "@/lib/data/usage-server";
import type { MemberRole } from "@/lib/data/team-settings-server";
import {
  daysUntilReset,
  formatHoursLong,
  formatResetDate,
  hoursSeverity,
  usageFraction,
} from "@/lib/data/usage-format";
import { capitalize, cn } from "@/lib/utils";

/**
 * The program's shared hours, as a summary — not the ledger.
 *
 * Settings › Usage keeps `ProgramUsageCard`: the month stepper and the full
 * per-person table, for the workspace you are switched into. This card is for
 * a program's own page, which may not be that workspace, and it answers one
 * question first: can we still send Saturday's match? So it leads with what is
 * LEFT and when it comes back, not `used / cap`, which makes the reader
 * subtract. The breakdown unfolds in place rather than linking to Usage —
 * that page is scoped to the active workspace, and a link from a program you
 * have not switched into would show a different program's numbers.
 *
 * Severity rides the fill: blue, amber from 80%, red at the cap, each with a
 * word beside the figure — never colour alone. The track is a light step of
 * the fill's own blue rather than neutral grey, so the state reads across the
 * whole bar. `pendingSeconds` is a SUBSET of the total (the ledger counts a
 * running job at its reservation), so the line says "includes", never adds.
 */
const FILL: Record<ReturnType<typeof hoursSeverity>, string> = {
  ok: "var(--blue)",
  low: "var(--viz-key)",
  spent: "var(--danger)",
};

export function ProgramHoursSummary({
  usage,
  pendingSeconds,
  roles,
  viewerId,
}: {
  usage: ProgramUsage;
  pendingSeconds: number;
  /** userId → role, so a breakdown row can say who spent it. */
  roles: ReadonlyMap<string, MemberRole>;
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);

  const fraction = usageFraction(usage.usedSeconds, usage.capSeconds);
  const severity = hoursSeverity(fraction);
  const left = Math.max(0, usage.capSeconds - usage.usedSeconds);
  const resetDate = formatResetDate(usage.billingMonth);
  const days = daysUntilReset(usage.billingMonth);
  const matches = usage.lines.reduce((total, line) => total + line.matchCount, 0);
  const people = usage.lines.length;
  const fill = FILL[severity];
  const figureColor = severity === "ok" ? "var(--ink-900)" : fill;

  return (
    <SettingsCard className="gap-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          Program hours
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--ink-500)]">
          Resets {resetDate} · in {days} {days === 1 ? "day" : "days"}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        {/* Proportional figures on purpose — `tabular-nums` loosens a
            standalone number at this size; it is for columns. */}
        <span
          className="text-[24px] font-light leading-[1.2] tracking-[-0.4px]"
          style={{ color: figureColor }}
        >
          {formatHoursLong(left)}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">
          left of {formatHoursLong(usage.capSeconds)}
        </span>
        {severity !== "ok" && (
          <span
            className="ml-1 flex items-center gap-1.5 text-[11px]"
            style={{ color: fill }}
          >
            <AlertTriangle className="size-3" strokeWidth={1.75} aria-hidden="true" />
            {severity === "spent"
              ? `Spent — uploads pause until ${resetDate}`
              : "Running low"}
          </span>
        )}
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-[3px]"
        style={{ background: "#E4EEFD" }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={usage.capSeconds}
        aria-valuenow={usage.usedSeconds}
        aria-label="Program hours used this month"
      >
        <div
          className="h-1.5 rounded-[3px] transition-[width] duration-300"
          style={{ width: `${fraction * 100}%`, background: fill }}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-[var(--ink-500)]">
          {formatHoursLong(usage.usedSeconds)} used · {matches}{" "}
          {matches === 1 ? "match" : "matches"} · {people}{" "}
          {people === 1 ? "person" : "people"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
        >
          {open ? "Hide breakdown" : "Breakdown by person"}
          <ChevronRight
            className={cn("size-[11px] transition-transform duration-200", open && "rotate-90")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col border-t border-[var(--border-hairline)] pt-1">
          {usage.lines.length === 0 ? (
            <p className="py-2 text-[12px] text-[var(--ink-500)]">
              No analysis hours used this month.
            </p>
          ) : (
            usage.lines.map((line) => {
              const share =
                usage.usedSeconds > 0 ? line.usedSeconds / usage.usedSeconds : 0;
              const role = roles.get(line.userId);
              return (
                <div
                  key={line.userId}
                  className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-2"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-[12px] text-[var(--ink-900)]">
                      {line.name}
                    </span>
                    {role && (
                      <span className="text-[11px] text-[var(--ink-500)]">
                        {capitalize(role)}
                      </span>
                    )}
                    {line.userId === viewerId && <YouPill />}
                  </span>
                  <span className="text-[11px] text-[var(--ink-500)]">
                    {line.matchCount} {line.matchCount === 1 ? "match" : "matches"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-1 w-[88px] shrink-0 overflow-hidden rounded-[2px]"
                    style={{ background: "#E4EEFD" }}
                  >
                    <span
                      className="block h-1 rounded-[2px]"
                      style={{ width: `${share * 100}%`, background: "var(--blue)" }}
                    />
                  </span>
                  <span className="mono w-[56px] text-right text-[11px] text-[var(--ink-700)]">
                    {formatHoursLong(line.usedSeconds)}
                  </span>
                </div>
              );
            })
          )}

          {pendingSeconds > 0 && (
            <div className="flex items-center gap-3 py-[9px]">
              <span className="min-w-0 flex-1 text-[11px] text-[var(--ink-500)]">
                Includes {formatHoursLong(pendingSeconds)} reserved by jobs still
                running
              </span>
            </div>
          )}

          <span className="border-t border-[var(--border-hairline)] pt-3 text-[11px] leading-[1.5] text-[var(--ink-500)]">
            Hours reserve at submit and reconcile on completion — a failed job
            gives them back. Players see their own line plus the team total.
          </span>
        </div>
      )}
    </SettingsCard>
  );
}
