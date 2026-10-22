import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { isFingerPointer, useTouchReadout } from "@/hooks/use-touch-readout";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { cn } from "@/lib/utils";

/**
 * The shell every Ask visual block shares: a `<figure>` whose caption says
 * what is drawn and from how much. The caption sits under the drawing, in
 * micro type; a block with no caption draws none rather than an empty line.
 *
 * It also gives the CSS-revealed readouts (`VisualReadout` with no `open`, in
 * a `group` or `group/bar`) a finger's way in. A finger has no hover, so a
 * tap on such a group marks it `data-ask-tapped`, which shows its readout
 * until a tap lands outside the figure or on the same group again. When the
 * group is (or holds) a link, the first tap only reads and the second follows
 * it. Delegated here, once, so no visual needs touch state of its own.
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
  // The group a finger last tapped, and whether the current press landed on
  // it again. A DOM mark rather than state: the groups are the visuals'
  // own markup, and the attribute is the one thing their CSS reads.
  const tappedRef = useRef<HTMLElement | null>(null);
  const reselectRef = useRef<boolean | null>(null);
  const [armed, setArmed] = useState(false);
  const clear = () => {
    tappedRef.current?.removeAttribute("data-ask-tapped");
    tappedRef.current = null;
    setArmed(false);
  };
  const figureRef = useTouchReadout<HTMLElement>(armed, clear);

  // The nearest `group` / `group/bar` around the press that holds a
  // CSS-revealed readout — a `group` with none (a bar row's Watch link) is
  // passed over, so its tap behaves as it always did.
  const readoutGroupOf = (target: EventTarget): HTMLElement | null => {
    let el = target instanceof Element ? target.closest(GROUP) : null;
    while (el && figureRef.current?.contains(el)) {
      if (el instanceof HTMLElement && el.querySelector(CSS_READOUT)) {
        return el;
      }
      el = el.parentElement?.closest(GROUP) ?? null;
    }
    return null;
  };

  return (
    <figure
      ref={figureRef}
      data-ask-visual={kind}
      className="m-0 flex flex-col gap-3"
      onPointerDown={(e) => {
        reselectRef.current = null;
        if (!isFingerPointer(e)) return;
        const group = readoutGroupOf(e.target);
        if (!group) return;
        reselectRef.current = group === tappedRef.current;
        if (reselectRef.current) return;
        tappedRef.current?.removeAttribute("data-ask-tapped");
        group.setAttribute("data-ask-tapped", "");
        tappedRef.current = group;
        setArmed(true);
      }}
      // The browser took the gesture as a scroll.
      onPointerCancel={(e) => {
        if (isFingerPointer(e) && reselectRef.current !== null) clear();
        reselectRef.current = null;
      }}
      onClickCapture={(e) => {
        const reselect = reselectRef.current;
        reselectRef.current = null;
        if (reselect === null) return;
        const inLink =
          e.target instanceof Element && e.target.closest("a[href]") !== null;
        if (!reselect) {
          if (inLink) e.preventDefault();
        } else if (!inLink) {
          clear();
        }
      }}
    >
      {children}
      {caption.trim() !== "" && (
        <figcaption className="text-micro max-w-[66ch]">{caption}</figcaption>
      )}
    </figure>
  );
}

/** A group whose readout CSS reveals, and that readout. */
const GROUP = ".group, .group\\/bar";
const CSS_READOUT = "[data-ask-readout][data-ask-css]";

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
 * parent is hovered, holds focus or was tapped (`VisualFrame` marks it), so
 * a row needs no state of its own. It fades rather than mounts, so nothing shifts under the pointer.
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
      data-ask-css={open === undefined ? "" : undefined}
      className={cn(
        "pointer-events-none absolute z-[3] flex flex-col px-2.5 py-1.5 text-[11px] leading-[1.35] whitespace-nowrap text-white tabular-nums transition-opacity duration-[var(--duration-hover)]",
        DARK_READOUT_CLASS,
        open === undefined
          ? "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-[ask-tapped]:opacity-100"
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
