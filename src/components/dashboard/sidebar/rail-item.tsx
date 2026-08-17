"use client";

import Link from "next/link";
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
 *
 * ── No tooltips ─────────────────────────────────────────────────────────────
 * The spec describes a 400ms tooltip on each collapsed row AND a 120ms hover
 * peek over the rail. Shipping both means the peek always wins: measured on the
 * built page, hovering a collapsed icon for 600ms gives a 232px panel and no
 * tooltip, because the peek opened 280ms earlier. Focusing a row opens the peek
 * too, so the keyboard path is covered as well.
 *
 * So the peek IS the label affordance, and a Tooltip per row would be a Radix
 * wrapper on a path a pointer cannot reach. `aria-label` still carries the name
 * for assistive tech at both widths.
 */
export function RailItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  /** Rendered inline once expanded — only the toggle uses it. */
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
            "mr-2 shrink-0 font-mono text-[11px] text-[var(--ink-400)] transition-opacity ease-[var(--ease-primary)]",
            fade
          )}
        >
          {shortcut}
        </span>
      )}
    </>
  );

  const className = cn(
    "flex h-10 w-full items-center overflow-hidden rounded-[8px] text-left transition-colors duration-200 ease-[var(--ease-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer",
    active
      ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
      : "text-[var(--nav-fg)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        {body}
      </button>
    );
  }

  return (
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
}
