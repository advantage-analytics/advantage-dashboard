import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two skeleton primitives every `*Pending` component is built from.
 *
 * `PendingBar` is one pulsing bar in the skeleton token; it carries its own
 * `aria-hidden`, so a bar dropped anywhere is already silent. `PendingRegion`
 * is the one `role="status"` per loading region (Carbon: one status message
 * per container, never one per bar) with everything visual under an
 * `aria-hidden` wrapper.
 *
 * Their own file so a route's loading chunk (the match report's, say) pulls
 * in two tiny components and not the team frames `team-home-skeleton.tsx`
 * composes around them.
 */
export function PendingBar({ className = "w-full" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-3 max-w-full rounded-[3px] bg-[var(--surface-skeleton)] motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

export function PendingRegion({
  label,
  className,
  innerClassName,
  children,
}: {
  label: string;
  /** On the status element — for a region that must be a flex child of its pane. */
  className?: string;
  /** On the hidden visual wrapper — the loaded region's own row/column classes. */
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className={className}>
      <div aria-hidden="true" className={innerClassName}>
        {children}
      </div>
    </div>
  );
}
