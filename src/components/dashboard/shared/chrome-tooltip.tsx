"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The dark label the shell's chrome answers hover with.
 *
 * One primitive for both edges — the collapsed rail's rows and the header
 * cluster's icon buttons — because a control that names itself one way on the
 * left and another way on the right reads as two systems. Float role, so it
 * carries the same shadow as menus and modals.
 *
 * The reveal is deliberate rather than instant: these label controls you can
 * already see, so the tooltip is the second half of the answer — the shortcut,
 * what the control covers, what is moving — not a puzzle to be solved by
 * hovering each one. Wrap a cluster in `TooltipProvider` to let neighbours
 * share the skip-delay timer, so only the first hover pays the delay.
 */

/** The system's reveal duration. */
export const CHROME_TOOLTIP_DELAY_MS = 400;

const SURFACE =
  "flex flex-col items-start gap-0.5 rounded-[12px] border-0 bg-[var(--ink-900)] px-2.5 py-[7px] " +
  "text-[12px] font-medium text-white shadow-[var(--shadow-dropdown)]";

export function ChromeTooltip({
  label,
  detail,
  shortcut,
  side = "bottom",
  align = "center",
  sideOffset = 6,
  hidden = false,
  children,
}: {
  label: string;
  /** Second line, for controls whose name alone is not the whole story. */
  detail?: string;
  /** Sits beside the label, in mono. */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** An open menu, or an expanded panel — the control already says its name. */
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip delayDuration={CHROME_TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        showArrow={false}
        hidden={hidden}
        className={SURFACE}
      >
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          {label}
          {shortcut && (
            <span className="font-mono text-[11px] font-normal text-white/[0.64]">
              {shortcut}
            </span>
          )}
        </span>
        {detail && (
          <span className="whitespace-nowrap text-[11px] font-normal text-white/[0.64]">
            {detail}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
