import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CirclePlay } from "lucide-react";
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

/**
 * Which colour is which series. The swatch is decoration; the label is text.
 *
 * The report's `LegendSwatch` geometry — an 8px square at 2px radius — for
 * every series but a dashed one, which keeps a 12px dash so the key draws
 * the rule it names. `swatch` takes a custom glyph in place of either (the
 * momentum key's three mark sizes).
 */
export function VisualKey({
  items,
}: {
  items: {
    label: string;
    color: string;
    dashed?: boolean;
    swatch?: ReactNode;
  }[];
}) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]"
        >
          {item.swatch ?? (
            <span
              aria-hidden="true"
              className={
                item.dashed
                  ? "h-px w-3 shrink-0"
                  : "size-2 shrink-0 rounded-[2px]"
              }
              style={
                item.dashed
                  ? {
                      background: `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 5px)`,
                    }
                  : { background: item.color }
              }
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The row of a block whose label opens the film: the head-to-head's row
 * (`head-to-head-card.tsx`). It washes `--surface-muted` while hovered or
 * focused, and its label darkens from ink-600 to ink-900. Bleeds 8px each
 * side so the wash has room around the content.
 */
export const WATCH_ROW =
  "-mx-2 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] has-[a:hover]:bg-[var(--surface-muted)] has-[a:focus-visible]:bg-[var(--surface-muted)]";

/** A block row's label at rest. */
export const ROW_LABEL = "text-[12px] text-[var(--ink-600)]";

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

/**
 * The mark after a label that opens the film: the head-to-head's
 * `CirclePlay`, 12px in ink-900, hidden at rest and slid in when its `group`
 * link is hovered or focused, so a block with five watchable rows carries no
 * blue until one is pointed at. The words stay for a screen reader: the link
 * still reads "First serves in · Watch".
 */
export function WatchMark() {
  return (
    <span data-ask-watch="" className="inline-flex items-center">
      <span className="sr-only"> · Watch</span>
      <CirclePlay
        aria-hidden="true"
        strokeWidth={1.5}
        className="ml-1.5 size-3 shrink-0 -translate-x-1 text-[var(--ink-900)] opacity-0 transition-[opacity,transform] duration-[var(--duration-hover)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-data-[ask-tapped]:translate-x-0 group-data-[ask-tapped]:opacity-100 motion-reduce:transform-none"
      />
    </span>
  );
}
