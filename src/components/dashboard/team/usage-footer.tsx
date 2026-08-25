import Link from "next/link";
import { Gauge } from "lucide-react";
import { formatResetDate } from "@/lib/data/usage-format";

/**
 * The program's budget, as the last line on the page.
 *
 * It used to be a card beside the greeting, sized and worded by whether the
 * page had matches in it yet. Round 45's rule is that the frame never moves,
 * and a block that is a headline on day zero and a sidebar a week later is the
 * frame moving. Usage is a standing fact about the program, not news about
 * this visit, so it reads as a footer: present every time, in the same place,
 * saying the same thing in different numbers.
 *
 * Hours **remaining**, not hours spent. The meter this replaces led with the
 * used number because a bar has to fill from somewhere; a sentence does not,
 * and the question a coach actually asks before sending a match is how much is
 * left. There is no bar — with the number stated in words, a 4%-full track was
 * decoration competing with it.
 *
 * The free-through clause moved here too, and no longer depends on the page
 * being empty. Two surfaces stating usage differently is how they start
 * disagreeing; this is now the only place on the page that states it at all,
 * and Settings › Usage — one click away through the link — is where the
 * per-person breakdown lives.
 */

/**
 * Hours with one decimal, rather than the `H:MM` Settings › Usage uses. This
 * sits inside a sentence that says "hours", and "3:12 of 75:00" makes a reader
 * do arithmetic to answer "roughly how much is left".
 */
function hours(seconds: number): string {
  // A tenth of an hour is six minutes — fine enough to show movement, coarse
  // enough that the number does not change while someone is reading it.
  const rounded = Math.round((Math.max(0, seconds) / 3600) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function UsageFooter({
  usedSeconds,
  capSeconds,
  billingMonth,
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
}) {
  // Clamped: an over-spend is a quota bug, and "-2 of 75 hours left" would
  // report it to the coach as if it were their problem.
  const leftSeconds = Math.max(0, capSeconds - usedSeconds);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-hairline)] pt-4">
      <Gauge
        className="size-[15px] shrink-0 text-[var(--ink-400)]"
        strokeWidth={1.5}
        aria-hidden
      />

      <p className="text-body-sm">
        <span className="tabular">{hours(leftSeconds)}</span> of{" "}
        <span className="tabular">{hours(capSeconds)}</span> hours left this
        month · free through Dec 31, 2026
      </p>

      <span className="text-micro tabular ml-auto">
        Resets {formatResetDate(billingMonth)}
      </span>

      <span
        className="h-3 w-px bg-[var(--border-hairline)]"
        aria-hidden="true"
      />

      <Link
        href="/dashboard/settings/usage"
        className="text-micro transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
      >
        Usage
      </Link>
    </div>
  );
}
