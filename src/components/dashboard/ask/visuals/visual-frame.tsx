import type { ReactNode } from "react";

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
