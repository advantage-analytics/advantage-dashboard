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
 * The dark floating readout for a hovered chart mark, shared by the
 * Statistics tab's chart cards. It never moves while the mark stays hovered:
 * the readout is a label, not a control (`pointer-events-none`), so a box
 * that chased the cursor only ran away from anyone reading it.
 *
 * - `side="top"` (default) hangs it above the mark; `align` decides which
 *   edge so it never runs off the card, `offset` is the gap in px (negative
 *   overlaps the mark's own padding).
 * - `side="left"` parks it beside the mark, vertically centred, `offset` px
 *   to its left — for a row whose clickable part sits at its right edge, so
 *   the readout lands next to the pointer without covering what it points at.
 *
 * `open` fades it in/out rather than mounting/unmounting it, so layout never
 * shifts on hover.
 */
export function ChartTooltip({
  open,
  side = "top",
  align = "center",
  offset,
  className,
  children,
}: {
  open: boolean;
  side?: "top" | "left";
  align?: "start" | "center" | "end";
  offset: number;
  className?: string;
  children: React.ReactNode;
}) {
  const anchor: React.CSSProperties =
    side === "left"
      ? {
          right: `calc(100% + ${offset}px)`,
          top: "50%",
          transform: "translateY(-50%)",
        }
      : {
          bottom: `calc(100% + ${offset}px)`,
          left: align === "end" ? undefined : align === "center" ? "50%" : 0,
          right: align === "end" ? 0 : undefined,
          transform: align === "center" ? "translateX(-50%)" : undefined,
        };

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-[3] flex flex-col whitespace-nowrap",
        DARK_READOUT_CLASS,
        className,
      )}
      style={{
        ...anchor,
        ...DARK_READOUT_STYLE,
        opacity: open ? 1 : 0,
        transition: `opacity 200ms cubic-bezier(${EASE_PRIMARY.join(",")})`,
      }}
    >
      {children}
    </span>
  );
}
