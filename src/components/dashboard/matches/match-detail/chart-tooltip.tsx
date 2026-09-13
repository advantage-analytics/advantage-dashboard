import { cn } from "@/lib/utils";

const EASE_PRIMARY = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * The dark readout's skin, apart from its anchoring — so the court-record
 * mosaic and the KPI detail chart, which position their own boxes, draw the
 * same surface this component does rather than a copy of its numbers. The
 * type inside follows the same rule: a 12px white medium title over 11px
 * lines at 64% white (`text-white/[0.64]`).
 */
export const DARK_READOUT_CLASS = "rounded-[12px]";
export const DARK_READOUT_STYLE: React.CSSProperties = {
  background: "var(--ink-900)",
  boxShadow: "var(--shadow-dropdown)",
};

/**
 * The dark floating readout anchored above a hovered chart segment/band,
 * shared by the Statistics tab's chart cards. `align` decides which edge it
 * hangs from so it never runs off the card; `open` fades it in/out rather
 * than mounting/unmounting it, so layout never shifts on hover.
 */
export function ChartTooltip({
  open,
  align,
  bottomOffset,
  className,
  children,
}: {
  open: boolean;
  align: "start" | "center" | "end";
  bottomOffset: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-[3] flex flex-col whitespace-nowrap",
        DARK_READOUT_CLASS,
        className,
      )}
      style={{
        bottom: `calc(100% + ${bottomOffset}px)`,
        left: align === "end" ? undefined : align === "center" ? "50%" : 0,
        right: align === "end" ? 0 : undefined,
        transform: align === "center" ? "translateX(-50%)" : undefined,
        ...DARK_READOUT_STYLE,
        opacity: open ? 1 : 0,
        transition: `opacity 200ms cubic-bezier(${EASE_PRIMARY.join(",")})`,
      }}
    >
      {children}
    </span>
  );
}
