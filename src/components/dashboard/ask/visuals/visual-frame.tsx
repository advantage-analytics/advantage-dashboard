import type { CSSProperties, ReactNode } from "react";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { cn } from "@/lib/utils";

/**
 * The shell every Ask visual block shares: a `<figure>` whose caption says
 * what is drawn and from how much. The caption sits under the drawing, in
 * micro type; a block with no caption draws none rather than an empty line.
 */
export function VisualFrame({
  kind,
  caption,
  children,
}: {
  kind: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure data-ask-visual={kind} className="m-0 flex flex-col gap-3">
      {children}
      {caption.trim() !== "" && (
        <figcaption className="text-micro max-w-[66ch]">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Which colour is which series. The swatch is decoration; the label is text. */
export function VisualKey({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]"
        >
          <span
            aria-hidden="true"
            className="h-[3px] w-3 shrink-0 rounded-[1px]"
            style={
              item.dashed
                ? {
                    background: `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 5px)`,
                  }
                : { background: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The dark readout over a hovered mark — the chart cards' own skin
 * (`chart-tooltip.tsx`), hung above whatever it sits in. A label, never a
 * control: `aria-hidden` and `pointer-events-none`, since the words it
 * shows are already in the block for a reader without a pointer.
 *
 * Shown by `open`, or — with it omitted — by CSS whenever its `group`
 * parent is hovered or holds focus, so a row needs no state of its own.
 * It fades rather than mounts, so nothing shifts under the pointer.
 */
export function VisualReadout({
  open,
  className,
  style,
  children,
}: {
  open?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      data-ask-readout=""
      className={cn(
        "pointer-events-none absolute z-[3] flex flex-col px-2.5 py-1.5 text-[11px] leading-[1.35] whitespace-nowrap text-white tabular-nums transition-opacity duration-[var(--duration-hover)]",
        DARK_READOUT_CLASS,
        open === undefined
          ? "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          : open
            ? "opacity-100"
            : "opacity-0",
        className,
      )}
      style={{ ...DARK_READOUT_STYLE, ...style }}
    >
      {children}
    </span>
  );
}

/** The quiet "· Watch" after a label that opens the film, as the figure tiles write it. */
export function WatchMark() {
  return (
    <span
      data-ask-watch=""
      className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--blue-hover)]"
    >
      {" "}
      · Watch
    </span>
  );
}
