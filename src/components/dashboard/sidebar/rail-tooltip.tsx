"use client";

import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";

/**
 * The chrome tooltip, placed for the rail.
 *
 * Surface, timing and content live in `ChromeTooltip`, shared with the header
 * cluster. All the rail adds is where it lands: to the right of the row, clear
 * of the collapsed rail's edge.
 */

/** The row ends at x=52 (12px padding + a 40px column). 22 more puts the
 *  tooltip 10px clear of the 64px rail. */
const OFFSET = 22;

export function RailTooltip({
  label,
  detail,
  shortcut,
  hidden,
  children,
}: {
  label: string;
  /** Second line, for rows whose name alone is not the whole story. */
  detail?: string;
  shortcut?: string;
  /** Expanded panel, or an open menu — the row is already saying its name. */
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <ChromeTooltip
      label={label}
      detail={detail}
      shortcut={shortcut}
      side="right"
      align={detail ? "start" : "center"}
      sideOffset={OFFSET}
      hidden={hidden}
    >
      {children}
    </ChromeTooltip>
  );
}
