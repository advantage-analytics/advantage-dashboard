import { cn } from "@/lib/utils";

/**
 * A row's state, named — `New`, `Shared`, `Private`. Grey always, never blue:
 * blue is reserved for actions, and a state is not one. Max one per row.
 *
 * Transcription of v3's `StatePill` — 18px pill, `surface-subtle` fill,
 * `ink-700` text at 500 weight, no icon.
 */
export function StatePill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-[7px] text-[10px] font-medium text-[var(--ink-700)]",
        className
      )}
      style={{ background: "var(--surface-subtle)" }}
    >
      {children}
    </span>
  );
}
