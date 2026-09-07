import { cn } from "@/lib/utils";

/**
 * A row's state, named — `Draft`, `Shared`, `Private`. Grey always, never blue:
 * blue is reserved for actions, and a state is not one. Max one per row.
 *
 * "New" is not one of these any more. An unread report is emphasis rather than
 * a neutral status, so it carries `NewPill`'s blue tint instead (Updated
 * Design System 19f) — the one exception to the grey rule, kept in its own
 * component so this one stays grey without a variant prop.
 *
 * Transcription of v3's `StatePill` — 18px pill, `surface-subtle` fill,
 * `ink-700` text at 500 weight, no icon.
 */
export function StatePill({
  children,
  className,
  outline = false,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * A state that is promised rather than held — `Invited` beside members who
   * are here. Same geometry, no fill, a hairline ring, and it pairs with the
   * outlined seat box that stands for the same invitation.
   */
  outline?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-[7px] text-[10px] font-medium",
        outline ? "text-[var(--ink-500)]" : "text-[var(--ink-700)]",
        className
      )}
      style={
        outline
          ? { boxShadow: "inset 0 0 0 1px var(--ink-200)" }
          : { background: "var(--surface-subtle)" }
      }
    >
      {children}
    </span>
  );
}
