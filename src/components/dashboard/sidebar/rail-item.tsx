"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { RailTooltip } from "./rail-tooltip";

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
 *
 * Collapsed, the label moves to a tooltip on the row's own 40px target. (An
 * earlier pass dropped tooltips because the 120ms hover peek always beat the
 * 400ms tooltip to the punch. The panel is toggle-driven now — hovering the
 * rail does nothing — so the tooltip is the only way a collapsed row can say
 * its name to a pointer.)
 */
export function RailItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  /** Rendered inline once expanded, and inside the tooltip when collapsed —
   *  only the toggle uses it. */
  shortcut,
  /** Set by the toggle row, which is the control for the panel's own state. */
  ariaExpanded,
  onClick,
  as = "link",
}: {
  href?: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  active?: boolean;
  expanded: boolean;
  shortcut?: string;
  ariaExpanded?: boolean;
  onClick?: () => void;
  as?: "link" | "button";
}) {
  /** Labels arrive behind the advancing edge, and leave before it moves. */
  const fade = expanded
    ? "opacity-100 delay-[80ms] duration-[120ms]"
    : "opacity-0 delay-0 duration-[80ms]";

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
          "min-w-0 flex-1 truncate text-left text-[13px] transition-opacity ease-[var(--ease-primary)]",
          fade
        )}
      >
        {label}
      </span>
      {shortcut && (
        <span
          aria-hidden="true"
          className={cn(
            "mr-2.5 shrink-0 font-mono text-[10px] text-[var(--ink-400)] transition-opacity ease-[var(--ease-primary)]",
            "group-hover/row:text-[var(--ink-600)]",
            fade
          )}
        >
          {shortcut}
        </span>
      )}
    </>
  );

  const className = cn(
    "group/row flex h-10 w-full items-center overflow-hidden rounded-[8px] text-left transition-colors duration-200 ease-[var(--ease-primary)] focus-visible:outline-none cursor-pointer",
    // The press is the only transform in this component, and it sits out
    // under reduced motion.
    "active:scale-[0.998] motion-reduce:active:scale-100",
    active
      ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
      : "text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
  );

  const row =
    as === "button" ? (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={ariaExpanded}
        className={className}
      >
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

  return (
    <RailTooltip label={label} shortcut={shortcut} hidden={expanded}>
      {row}
    </RailTooltip>
  );
}
