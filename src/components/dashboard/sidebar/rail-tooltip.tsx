"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The dark label that answers a collapsed row.
 *
 * Float role, so it carries the same shadow as menus and modals. It is a
 * deliberate reveal rather than an instant one — 400ms, the system's reveal
 * duration — because at 64px the icons are the interface, not a puzzle waiting
 * to be solved by hovering each one.
 */

/** The row ends at x=52 (12px padding + a 40px column). 22 more puts the
 *  tooltip 10px clear of the 64px rail. */
const OFFSET = 22;
const DELAY_MS = 400;

const SURFACE =
  "flex items-center gap-2 rounded-[12px] border-0 bg-[var(--ink-900)] px-2.5 py-[7px] " +
  "text-[12px] font-medium text-white shadow-[var(--shadow-dropdown)]";

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
    <Tooltip delayDuration={DELAY_MS}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        align={detail ? "start" : "center"}
        sideOffset={OFFSET}
        showArrow={false}
        hidden={hidden}
        className={detail ? `${SURFACE} flex-col items-start gap-0.5` : SURFACE}
      >
        <span className="whitespace-nowrap">{label}</span>
        {detail && (
          <span className="whitespace-nowrap text-[11px] font-normal text-white/[0.64]">
            {detail}
          </span>
        )}
        {shortcut && (
          <span className="font-mono text-[10px] font-normal text-white/[0.64]">
            {shortcut}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
