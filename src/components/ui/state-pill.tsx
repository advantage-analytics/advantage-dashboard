import { cn } from "@/lib/utils";

/**
 * A row's state, named — `Draft`, `Shared`, `Private`. Grey always, never blue:
 * blue is reserved for actions, and a state is not one. Max one per row.
 *
 * "New" is not one of these. An unread match is marked by a small blue dot in
 * the row's own left padding (`match-card-list.tsx`), not a pill at all.
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
        "inline-flex h-[18px] items-center rounded-full px-[7px] text-[10px] font-medium whitespace-nowrap",
        outline ? "text-[var(--ink-500)]" : "text-[var(--ink-700)]",
        className,
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
