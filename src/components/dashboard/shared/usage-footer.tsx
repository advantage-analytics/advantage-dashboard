import Link from "next/link";
import { HoursRing } from "@/components/dashboard/shared/hours-ring";
import {
  dualWeekendsLeft,
  formatHoursLong,
  formatHoursShort,
  formatResetDate,
  hoursSeverity,
  monthName,
  secondsLeft,
  usageFraction,
} from "@/lib/data/usage-format";
import { freeHoursReturnOn } from "@/lib/services/splitstep/config";

/** Where "Add hours" goes — the page that sells credits. */
const PLAN_HREF = "/dashboard/settings/plan";

/**
 * The workspace's budget, as the last line on a Home page.
 *
 * It used to be a card beside the greeting, sized and worded by whether the
 * page had matches in it yet. Round 45's rule is that the frame never moves,
 * and a block that is a headline on day zero and a sidebar a week later is the
 * frame moving. Usage is a standing fact, not news about this visit, so it
 * reads as a footer: present every time, in the same place, saying the same
 * thing in different numbers.
 *
 * Hours **remaining**, not hours spent. The meter this replaces led with the
 * used number because a bar has to fill from somewhere; a sentence does not,
 * and the question a person actually asks before sending a match is how much
 * is left. There is no bar — with the number stated in words, a 4%-full track
 * was decoration competing with it.
 *
 * Measured to the round-45 / Platform Audit footer, which Team Home and the
 * personal Home (Pa2) draw identically: 12px above the hairline, 8px between
 * items, the beta pill's 14px hours-left ring (`HoursRing`), an 11px --ink-600 sentence, an 11px
 * --border-medium divider — the header's divider token, not a card hairline.
 */

export function UsageFooter({
  usedSeconds,
  capSeconds,
  billingMonth,
  note,
  dualWeekends = false,
  creditSeconds,
}: {
  usedSeconds: number;
  capSeconds: number;
  /**
   * The month the numbers above were read for. Passed rather than re-derived
   * from the clock, so the reset date can never name a month the usage figures
   * do not belong to — a request that straddles midnight on the 1st would
   * otherwise report last month's hours against next month's reset.
   */
  billingMonth: string;
  /** A trailing clause, e.g. "free through Dec 31, 2026". Omitted when absent. */
  note?: string;
  /**
   * Say what the hours buy, after a dash: "— about 3 dual weekends" (Platform
   * Audit Ta3, Team Home). A flag rather than a formatted string, because the
   * refusal that goes with it belongs here too: at fewer than one weekend's
   * worth the clause is dropped entirely, since "about 0 dual weekends" reads
   * as a verdict on the program rather than a figure. Off on the personal
   * Home, where a dual is not the unit anybody plans in.
   */
  dualWeekends?: boolean;
  /**
   * A personal player's credits. Passed only on the personal Home: once free
   * hours are spent the line says what carries on (D1) or that nothing does
   * (D2). Omitted for a team, whose hours are the team's budget.
   */
  creditSeconds?: number;
}) {
  // Clamped: an over-spend is a quota bug, and "-2 of 75 hours left" would
  // report it to the viewer as if it were their problem. `secondsLeft` is that
  // clamp, shared with every other surface that prints what is left.
  const left = secondsLeft(usedSeconds, capSeconds);
  const weekends = dualWeekends ? dualWeekendsLeft(left) : 0;

  // D1 / D2 in the Credit Packs Mockups (docs/plans/2027-player-pricing.md): nothing new on the page until free hours
  // are spent, then one line that says what is left and the one next step.
  if (creditSeconds !== undefined && left <= 0) {
    const back = freeHoursReturnOn();
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-600)]">
        <span
          className="size-3.5 rounded-full border-2"
          style={{
            borderColor:
              creditSeconds > 0 ? "var(--viz-you-mid)" : "var(--ink-200)",
          }}
          aria-hidden
        />
        {creditSeconds > 0 ? (
          <span>
            Free hours used for {monthName(billingMonth)} ·{" "}
            <span className="tabular">{formatHoursLong(creditSeconds)}</span> in
            credits
          </span>
        ) : (
          <>
            <span>
              Out of video hours
              {back ? ` · Free hours come back ${back}` : ""}
            </span>
            <span className="text-[var(--border-medium)]" aria-hidden>
              |
            </span>
            <Link
              href={PLAN_HREF}
              className="text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              Add hours
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-[var(--border-hairline)] pt-3">
      <HoursRing
        share={1 - usageFraction(usedSeconds, capSeconds)}
        low={hoursSeverity(usageFraction(usedSeconds, capSeconds)) !== "ok"}
      />

      <p className="text-[11px] text-[var(--ink-600)]">
        <span className="tabular">{formatHoursShort(left)}</span> of{" "}
        <span className="tabular">{formatHoursShort(capSeconds)}</span> hours
        left this month
        {weekends > 0
          ? ` — about ${weekends} dual ${weekends === 1 ? "weekend" : "weekends"}`
          : ""}
        {note ? ` · ${note}` : ""}
      </p>

      <span className="text-micro tabular ml-auto">
        Resets {formatResetDate(billingMonth)}
      </span>

      <span
        className="h-[11px] w-px bg-[var(--border-medium)]"
        aria-hidden="true"
      />

      <Link
        href="/dashboard/settings/usage"
        className="text-[11px] font-medium whitespace-nowrap transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        style={{ color: "var(--blue)" }}
      >
        Usage
      </Link>
    </div>
  );
}
