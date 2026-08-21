import { cn } from "@/lib/utils";

export type BadgeVariant = "win" | "loss" | "blue" | "neutral";

const TONE: Record<BadgeVariant, string> = {
  win: "var(--success)",
  loss: "var(--danger)",
  blue: "var(--blue)",
  neutral: "var(--ink-500)",
};

/**
 * The outcome label — bare tracked uppercase text, no container.
 *
 * A transcription of `.adv-badge` from Advantage Design System v2. It is
 * deliberately not a pill: it sits on a table row between a court number and a
 * score, and a filled chip there reads as a button you could press. Green is
 * winning, red is losing.
 *
 * Those two colours are `--success` / `--danger`, never the `--viz-*` ramp —
 * `colors.css` fences that ramp to charts, and the design frames reach for
 * `--viz-good` here out of habit.
 *
 * Colour goes in `style`, not a Tailwind utility. Callers pair this with DS
 * type classes, which are loaded unlayered and beat `text-[var(--…)]` outright.
 */
export function Badge({
  variant = "neutral",
  children,
  className,
  style,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium uppercase leading-none tracking-[2.5px]",
        className
      )}
      style={{ color: TONE[variant], ...style }}
    >
      {children}
    </span>
  );
}
