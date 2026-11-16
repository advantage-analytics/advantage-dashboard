"use client";

import Link from "next/link";

import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import {
  HOURS_FILL,
  HoursMeter,
} from "@/components/dashboard/settings/teams/program-hours-summary";
import {
  formatHoursShort,
  hoursSeverity,
  isUnlimitedCap,
  usageFraction,
} from "@/lib/data/usage-format";
import type { ProgramUsage } from "@/lib/data/usage-server";

/**
 * The team header's video hours: "18.4 of 20 h this month", an `Add hours`
 * link, and the bar beneath — `HoursMeter`, the same bar the Teams list and
 * the program's own staff see.
 *
 * There is no team-level hours write. `Add hours` goes to `?view=usage`, where
 * the existing Pilot and Usage cards hold the controls that exist today; this
 * component adds none. Severity rides the fill (blue, amber from 80%, red at
 * the cap) with a word beside the figure once it is not `ok`, never colour
 * alone. An unlimited program says so and draws no bar.
 *
 * A client component because `HoursMeter` and `HOURS_FILL` are exports of a
 * client module, which a Server Component cannot read as values.
 */
export function TeamHours({
  usage,
  addHoursHref,
}: {
  usage: ProgramUsage;
  /** The usage view of this team's page. */
  addHoursHref: string;
}) {
  const unlimited = isUnlimitedCap(usage.capSeconds);
  const fraction = usageFraction(usage.usedSeconds, usage.capSeconds);
  const severity = hoursSeverity(fraction);

  return (
    <section
      aria-label="Video hours"
      className="flex min-w-[220px] flex-[0_1_320px] flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium text-[var(--ink-900)] tabular-nums">
          {formatHoursShort(usage.usedSeconds)}{" "}
          <span className="font-normal text-[var(--ink-600)]">
            {unlimited
              ? "h this month · unlimited"
              : `of ${formatHoursShort(usage.capSeconds)} h this month`}
            {!unlimited && severity === "spent"
              ? " · at the cap"
              : !unlimited && severity === "low"
                ? " · running low"
                : ""}
          </span>
        </p>
        <Link href={addHoursHref} className={TEXT_ACTION}>
          Add hours
        </Link>
      </div>
      {!unlimited && (
        <HoursMeter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          fraction={fraction}
          fill={HOURS_FILL[severity]}
          label="Video hours used this month"
        />
      )}
    </section>
  );
}

/**
 * The hours block while the team page loads: the same column, bars for the
 * figure and the meter. "Add hours" is not drawn — its link needs the
 * program's id, and a dead word would read as a working one.
 */
export function TeamHoursSkeleton() {
  return (
    <PendingRegion
      label="video hours"
      className="flex min-w-[220px] flex-[0_1_320px] flex-col"
      innerClassName="flex flex-col gap-2"
    >
      <span className="flex h-[21px] items-center">
        <PendingBar className="h-3.5 w-48" />
      </span>
      <PendingBar className="h-1.5 w-full" />
    </PendingRegion>
  );
}
