"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Cut, Chart } from "./viz-model";
import { cn } from "@/lib/utils";
import { CutMenu, type SavedViewLite } from "./cut-menu";
import { ChartMenu } from "./chart-menu";

/**
 * The Visualizations tab's toolbar row (P1d/P1e): the cut menu, the chart
 * menu, an optional strip (a per-cut control, e.g. depth bands later) behind
 * a hairline, then a spacer and the filters slot.
 *
 * Not mounted anywhere yet — the focused-view task (next) mounts this. Its
 * two menus (`cut-menu.tsx`, `chart-menu.tsx`) both read/write `useVizState`
 * directly rather than through props, so this component stays a pure layout
 * shell.
 */

export const CUT_LABEL: Record<Cut, string> = {
  serve: "Serve placement",
  returnPlacement: "Return placement",
  returnContact: "Return contact",
};

export const CHART_LABEL: Record<Chart, string> = {
  scatter: "Scatter",
  zones: "Zones",
};

/**
 * Shared trigger for both menus (P1d step 1): 28px tall, `surface-subtle` at
 * rest, `surface-muted` on hover **and while open**, a 13px leading glyph,
 * 12/500 label and a 12px chevron that flips to `chevron-up` while open.
 */
export function VizMenuTrigger({
  icon: Icon,
  label,
  open,
  className,
  ...buttonProps
}: {
  icon: LucideIcon;
  label: string;
  open: boolean;
  className?: string;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-expanded" | "aria-haspopup"
>) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      {...buttonProps}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200",
        open ? "bg-[var(--surface-muted)]" : "bg-[var(--surface-subtle)]",
        !open && "hover:bg-[var(--surface-muted)]",
        className,
      )}
      style={{ borderRadius: "var(--radius-element)" }}
    >
      <Icon
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      <Chevron
        className="size-3 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}

export function VizToolbar({
  savedViews,
  onSaveRequest,
  filtersSlot,
  stripSlot,
}: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  filtersSlot?: React.ReactNode;
  stripSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <CutMenu savedViews={savedViews} onSaveRequest={onSaveRequest} />
      <ChartMenu />
      {stripSlot != null && (
        <>
          <div
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-[var(--border-hairline)]"
          />
          {stripSlot}
        </>
      )}
      <div className="flex-1" />
      {filtersSlot}
    </div>
  );
}
