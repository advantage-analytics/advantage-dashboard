import { cn } from "@/lib/utils";

const EASE_PRIMARY = [0.25, 0.46, 0.45, 0.94] as const;

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
        "pointer-events-none absolute z-[3] flex flex-col whitespace-nowrap rounded-[12px]",
        className,
      )}
      style={{
        bottom: `calc(100% + ${bottomOffset}px)`,
        left: align === "end" ? undefined : align === "center" ? "50%" : 0,
        right: align === "end" ? 0 : undefined,
        transform: align === "center" ? "translateX(-50%)" : undefined,
        background: "var(--ink-900)",
        boxShadow: "var(--shadow-dropdown)",
        opacity: open ? 1 : 0,
        transition: `opacity 200ms cubic-bezier(${EASE_PRIMARY.join(",")})`,
      }}
    >
      {children}
    </span>
  );
}
