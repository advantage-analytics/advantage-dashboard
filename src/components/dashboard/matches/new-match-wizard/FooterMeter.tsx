import { usageFraction } from "@/lib/data/usage-format";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { formatHoursCap, formatHoursTenths } from "./utils";

/**
 * The monthly allowance, in the footer beside the primary action.
 *
 * Cancel · divider · 3px bar in `--viz-you-mid` with the mono readout. It
 * appears only where hours are spent and states the cost of the file in hand:
 * before a file it is the allowance you have, after one it is what this video
 * spends out of it — the pending hours drawn as a lighter `--viz-you-light`
 * segment after the used ones. Advisory — `reserve_processing_quota()` is the
 * authority and refuses at submit time.
 *
 * A window that costs more than is left turns the pending segment and the
 * readout `--error` and says how far over it is, because "0.2 of 8.0 h left
 * after" is arithmetic the reader has to do to discover the number is
 * negative — and it never is, since the remainder is clamped at zero. The
 * tone is an inline `style` on both: the DS type classes are unlayered and
 * outrank a Tailwind colour utility.
 */
export function FooterMeter({
  remainingSeconds,
  capSeconds,
  selectedSeconds,
  suffix,
}: {
  remainingSeconds: number;
  capSeconds: number;
  selectedSeconds?: number;
  /** "resets on the 1st" for a personal allowance, "team hours" for a program's. */
  suffix: string;
}) {
  const priced = selectedSeconds !== undefined && selectedSeconds > 0;
  const usedSeconds = Math.max(0, capSeconds - remainingSeconds);
  const usedFraction = usageFraction(usedSeconds, capSeconds);
  // The bar draws what will have been spent once the match is saved, so a
  // priced video moves it before the job does — as its own segment, so the
  // cost can be told from the balance.
  const pendingFraction = priced
    ? Math.max(
        0,
        usageFraction(usedSeconds + selectedSeconds, capSeconds) - usedFraction,
      )
    : 0;
  const cap = formatHoursCap(capSeconds);
  // Strictly over, matching `quotaRefusal()` — a window that exactly consumes
  // what is left is allowed, so it is not drawn as a refusal.
  const over = priced && selectedSeconds > remainingSeconds;
  const overBy = over
    ? formatHoursTenths(selectedSeconds - remainingSeconds)
    : "";

  return (
    <span className="ml-3 inline-flex items-center gap-2.5 border-l border-[var(--border-medium)] pl-4">
      <span
        role="img"
        aria-label={
          over
            ? `${formatHoursTenths(usedSeconds)} of ${cap} hours used, ${formatHoursTenths(selectedSeconds)} pending — over the allowance by ${overBy} hours`
            : priced
              ? `${formatHoursTenths(usedSeconds)} of ${cap} hours used, ${formatHoursTenths(selectedSeconds)} pending`
              : `${formatHoursTenths(usedSeconds)} of ${cap} hours used`
        }
        className="inline-flex h-[3px] w-14 shrink-0 overflow-hidden rounded-[2px] bg-[var(--ink-100)]"
      >
        <span
          className="h-full shrink-0 bg-[var(--viz-you-mid)] transition-[width] duration-300 ease-[var(--ease-chart)]"
          style={{ width: `${usedFraction * 100}%` }}
        />
        <span
          className="h-full shrink-0 bg-[var(--viz-you-light)] transition-[width] duration-300 ease-[var(--ease-chart)]"
          style={
            over
              ? {
                  width: `${pendingFraction * 100}%`,
                  backgroundColor: "var(--error)",
                }
              : { width: `${pendingFraction * 100}%` }
          }
        />
      </span>
      <span
        className="mono tabular text-[11px] whitespace-nowrap text-[var(--ink-500)]"
        style={over ? { color: "var(--error)" } : undefined}
      >
        {over
          ? `Spends ${formatHoursTenths(selectedSeconds)} h · Over by ${overBy} h`
          : priced
            ? `Spends ${formatHoursTenths(selectedSeconds)} h · ${formatHoursTenths(
                Math.max(0, remainingSeconds - selectedSeconds),
              )} of ${cap} h left after`
            : `${formatHoursTenths(remainingSeconds)} of ${cap} h left · ${suffix} · Pilot ends ${formatPilotEnd()}`}
      </span>
    </span>
  );
}
