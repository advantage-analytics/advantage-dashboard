import { AlertTriangle } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  HOURS_FILL,
  HoursMeter,
} from "@/components/dashboard/settings/teams/program-hours-summary";
import {
  daysUntilReset,
  formatHoursLong,
  formatResetDate,
  hoursSeverity,
  usageFraction,
} from "@/lib/data/usage-format";
import {
  formatPilotEnd,
  getMonthlyCapHours,
} from "@/lib/services/splitstep/config";
import type { ProgramUsage } from "@/lib/data/usage-server";

/**
 * This program's month of analysis hours, as the console reads it.
 *
 * The same question `ProgramHoursSummary` answers for a program's own staff —
 * how much is left, and when does it come back — drawn with that card's own
 * `HoursMeter` rather than a second bar. What it does not carry is the
 * breakdown-by-person disclosure: an admin looking at somebody else's program
 * has the Usage tab for that, with its month stepper, and a card that opened
 * a per-athlete ledger in passing would be the console reading further into a
 * team than the job needs.
 *
 * Severity rides the fill exactly as it does there — blue, amber from 80%,
 * red at the cap — with a word beside the figure, never colour alone.
 *
 * The footnote states the pilot's terms rather than implying them. The end
 * date comes from `formatPilotEnd()`, the one place that date is written, so
 * a moved pilot moves this sentence too.
 */
export function PilotUsageCard({ usage }: { usage: ProgramUsage }) {
  const fraction = usageFraction(usage.usedSeconds, usage.capSeconds);
  const severity = hoursSeverity(fraction);
  const left = Math.max(0, usage.capSeconds - usage.usedSeconds);
  const resetDate = formatResetDate(usage.billingMonth);
  const days = daysUntilReset(usage.billingMonth);
  const matches = usage.lines.reduce(
    (total, line) => total + line.matchCount,
    0,
  );
  const people = usage.lines.length;
  const fill = HOURS_FILL[severity];
  const figureColor = severity === "ok" ? "var(--ink-900)" : fill;

  return (
    <SettingsCard className="gap-3.5 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            Resets {resetDate} · in {days} {days === 1 ? "day" : "days"}
          </span>
        }
      >
        Analysis hours
      </SettingsCardTitle>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-title-lg" style={{ color: figureColor }}>
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
            <AlertTriangle
              className="size-3"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {severity === "spent"
              ? `Spent — uploads pause until ${resetDate}`
              : "Running low"}
          </span>
        )}
      </div>

      <HoursMeter
        usedSeconds={usage.usedSeconds}
        capSeconds={usage.capSeconds}
        fraction={fraction}
        fill={fill}
        label="Analysis hours used this month"
      />

      {/* A month nobody has spent anything in says so, rather than printing
          "0 h used · 0 matches · 0 people" and making a reader work out that
          the three zeroes are one fact. */}
      <span className="text-[11px] text-[var(--ink-500)]">
        {usage.lines.length === 0
          ? "Nothing processed this month yet."
          : `${formatHoursLong(usage.usedSeconds)} used · ${matches} ${
              matches === 1 ? "match" : "matches"
            } · ${people} ${people === 1 ? "person" : "people"}`}
      </span>

      <SettingsCardFootnote>
        {`Team pool ${usage.capSeconds / 3600} h every month · Each member ${getMonthlyCapHours(
          "individual",
        )} h · Pilot ends ${formatPilotEnd()}`}
      </SettingsCardFootnote>
    </SettingsCard>
  );
}
