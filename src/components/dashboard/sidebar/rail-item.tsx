"use client";

import Link from "next/link";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One row of the sidebar, at either width.
 *
 * The glyph sits in a fixed 40px column pinned to the panel's left padding, in
 * BOTH widths. That is what makes the transition read as the edge travelling
 * rather than the contents rearranging — nothing moves horizontally, the labels
 * simply fade in behind the advancing edge.
 *
 * Active is a `surface-subtle` wash with an `ink-900` glyph. No blue and no
 * left stripe: blue is reserved for actions, and where you already are is not
 * an action.
 */
export function RailItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  /** Shown after the label in the tooltip — only the toggle uses it. */
  shortcut,
  onClick,
  as = "link",
}: {
  href?: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  active?: boolean;
  expanded: boolean;
  shortcut?: string;
  onClick?: () => void;
  as?: "link" | "button";
}) {
  const body = (
    <>
      {/* The fixed 40px column. Its width never changes, at either sidebar
          width, which is the entire reason icons do not shift. */}
      <span className="flex size-10 shrink-0 items-center justify-center">
        <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span
        aria-hidden={!expanded}
        className={cn(
          "min-w-0 truncate text-[13px] transition-opacity ease-[var(--ease-primary)]",
          // Expanding: labels arrive behind the edge (80ms in, 120ms long).
          // Collapsing: they leave first, in 80ms, so text never clips mid-word.
          expanded
            ? "opacity-100 delay-[80ms] duration-[120ms]"
            : "opacity-0 delay-0 duration-[80ms]"
        )}
      >
        {label}
      </span>
    </>
  );

  const className = cn(
    "flex h-10 w-full items-center gap-0 overflow-hidden rounded-[8px] text-left transition-colors duration-200 ease-[var(--ease-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer",
    active
      ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
      : "text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
  );

  const trigger =
    as === "button" ? (
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        {body}
      </button>
    ) : (
      <Link
        href={href ?? "#"}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={className}
      >
        {body}
      </Link>
    );

  // Collapsed, the tooltip IS the accessible name made visible — keyboard and
  // pointer users both need it, and `aria-label` mirrors it either way.
  if (expanded) return trigger;

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="rounded-[12px]">
        {label}
        {shortcut && <span className="ml-2 text-white/50">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
