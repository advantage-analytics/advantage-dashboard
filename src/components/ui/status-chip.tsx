import { cn } from "@/lib/utils";

export type StatusTone = "blue" | "neutral" | "win" | "loss";

const TONE: Record<StatusTone, string> = {
  blue: "var(--blue)",
  neutral: "var(--ink-500)",
  win: "var(--success)",
  loss: "var(--danger)",
};

/**
 * A dot and a word — `.adv-status` from Advantage Design System v2.
 *
 * No container by design: this lands in a table cell beside a score, and a
 * filled pill there competes with the number for the eye.
 *
 * `live` is for states where something is happening *right now*, which is the
 * same distinction `isWorking` draws in `lib/data/match-analysis.ts` — a state
 * that pulses here has to be one that animates on the match page, or the two
 * screens are telling one job two different stories. `uploaded` is the case
 * that catches people out: in flight, but nothing to animate.
 */
export function StatusChip({
  tone = "neutral",
  live = false,
  children,
  className,
}: {
  tone?: StatusTone;
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-none",
        className
      )}
      style={{ color: TONE[tone] }}
    >
      <span
        className={cn(
          "size-[5px] shrink-0 rounded-full bg-current",
          live &&
            "animate-[adv-status-pulse_1.6s_var(--ease-primary)_infinite] motion-reduce:animate-none"
        )}
      />
      {children}
    </span>
  );
}
