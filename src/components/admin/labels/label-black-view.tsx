"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  RAIL_DEFAULT_PX,
  RAIL_WIDTH_STORAGE_KEY,
  clampRailWidth,
  parseRailWidth,
} from "./label-layout";
import { LabelRailResize } from "./label-rail-resize";
import { RAIL_TONE_CLASS, type RailTone } from "./label-rail-tone";

/** How long after the last resize the rail's width is written to storage. */
const RAIL_WIDTH_PERSIST_MS = 150;

/**
 * The console's full-screen view: black to the edges, the film top-left with
 * its transport, the court on the black under it, the points rail down the
 * right.
 *
 * A `fixed inset-0 z-50` layer, but not a portal: it stays a child of the
 * console's root so the `--film-t` clock still reaches the rail's rows. Menus,
 * the confirm and the tooltips portal to `body` after it and paint above. This
 * file is the shell; the player, the court panel and the rail are the
 * console's, handed in.
 *
 * - The rail's width is `useRailWidth`; the clamp and the storage key are in
 *   label-layout.ts.
 * - The film's width is capped (`BLACK_VIDEO_WIDTH`) so the court keeps
 *   `BLACK_COURT_MIN` of the stage's height. The stage is a size container, so
 *   the cap is plain CSS.
 * - While mounted, everything beside the layer is `inert` (`inertOutside`):
 *   each sibling of the layer and of its ancestors, stopping below `body`'s
 *   children, because that is where Radix portals the menus, the confirm and
 *   the tooltips.
 */

/** What the court always keeps of the stage's height. */
const BLACK_COURT_MIN = "max(320px, 40cqh)";

/**
 * The film's width: the stage's, or — where that would crowd the court out —
 * 16:9 of the height the court leaves. Never under 16:9 of 120px, for a
 * window too short to honour both.
 */
export const BLACK_VIDEO_WIDTH = `min(100cqw, max(calc((100cqh - ${BLACK_COURT_MIN}) * 16 / 9), 213px))`;

/**
 * Makes everything beside `layer` unreachable while it is mounted: `inert` on
 * each sibling of the element and of each of its ancestors, below `body`'s
 * children. Only what was not already inert is touched, and exactly that is
 * restored. A ref callback with React 19's cleanup: there is no state for an
 * effect to read.
 */
export function inertOutside(
  layer: HTMLElement | null,
): (() => void) | undefined {
  if (!layer) return undefined;
  const covered: HTMLElement[] = [];
  for (
    let node: HTMLElement = layer;
    node.parentElement && node.parentElement !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert) continue;
      sibling.inert = true;
      covered.push(sibling);
    }
  }
  return () => {
    for (const element of covered) element.inert = false;
  };
}

/**
 * The rail's width: the default, then the stored width after mount (a first
 * client render that disagreed with the server's would not hydrate), then
 * whatever the handle asks for, clamped and written to storage once it settles.
 * Shared with the docked view.
 */
function useRailWidth(initialRailWidth?: number) {
  const [railWidth, setRailWidth] = useState(() =>
    initialRailWidth !== undefined
      ? clampRailWidth(initialRailWidth)
      : RAIL_DEFAULT_PX,
  );
  useEffect(() => {
    if (initialRailWidth !== undefined) return;
    try {
      // Storage is the external system here, readable only after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRailWidth(
        parseRailWidth(localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)),
      );
    } catch {
      /* storage blocked — the rail just starts at its default */
    }
  }, [initialRailWidth]);

  // Storage is written once the width settles, not on every pointermove of a
  // drag: the pending width and its timer, flushed on unmount so a width the
  // labeller left the view on is kept.
  const pending = useRef<{
    px: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const persistRail = useCallback((px: number) => {
    pending.current = null;
    try {
      localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(px));
    } catch {
      /* private window — the width just isn't kept */
    }
  }, []);
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      persistRail(pending.current.px);
    },
    [persistRail],
  );
  const resizeRail = useCallback(
    (px: number) => {
      const next = clampRailWidth(px);
      setRailWidth(next);
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = {
        px: next,
        timer: setTimeout(() => persistRail(next), RAIL_WIDTH_PERSIST_MS),
      };
    },
    [persistRail],
  );
  const resetRail = useCallback(
    () => resizeRail(RAIL_DEFAULT_PX),
    [resizeRail],
  );
  return { railWidth, resizeRail, resetRail };
}

export function LabelBlackView({
  initialRailWidth,
  video,
  court,
  placing = false,
  arrive = false,
  children,
}: {
  /** Fade the layer in (`label-layer-in-full`). Off on first render. */
  arrive?: boolean;
  /** The rail's width on first render, in px — for specs. */
  initialRailWidth?: number;
  /** The shared `LabelVideoPlayer`. */
  video: ReactNode;
  /** The shared `LabelCourtPanel`. */
  court: ReactNode;
  /** A stroke is selected and a court click would write: the court's outline. */
  placing?: boolean;
  /** The rail's contents — `LabelBlackRail`. */
  children: ReactNode;
}) {
  return (
    <div
      ref={inertOutside}
      data-label-black=""
      className={cn(
        "fixed inset-0 z-50 flex bg-black text-white",
        arrive && "label-layer-in-full",
      )}
    >
      {/* The stage: a size container, for the film's cap
          (`BLACK_VIDEO_WIDTH`). */}
      <div
        data-label-black-stage=""
        className="[container-type:size] flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          data-label-black-video=""
          className="mx-auto aspect-video max-w-full shrink-0 overflow-hidden"
          style={{ width: BLACK_VIDEO_WIDTH }}
        >
          {video}
        </div>
        <div
          data-label-black-court=""
          data-court-placing={placing ? "true" : "false"}
          className={cn(
            "flex min-h-0 flex-1 flex-col px-6 pt-3 pb-4 transition-[box-shadow] duration-150",
            // The same blue outline the court card wears while placing, on
            // the inside since there is no card edge to carry it.
            placing && "shadow-[inset_0_0_0_1.5px_var(--blue)]",
          )}
        >
          {court}
        </div>
      </div>

      <LabelRailAside
        tone="dark"
        initialRailWidth={initialRailWidth}
        className="bg-[var(--surface-dark)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]"
      >
        {children}
      </LabelRailAside>
    </div>
  );
}

/**
 * The rail's box, the same in both views: `relative` for the handle on its left
 * edge, which hangs 4px outside it, so the aside itself never clips and a view
 * that rounds its rail clips the box inside (`boxClassName`).
 */
export function LabelRailAside({
  tone,
  initialRailWidth,
  className,
  boxClassName,
  children,
}: {
  tone: RailTone;
  initialRailWidth?: number;
  className?: string;
  boxClassName?: string;
  /** The rail's contents — `LabelBlackRail`. */
  children: ReactNode;
}) {
  const { railWidth, resizeRail, resetRail } = useRailWidth(initialRailWidth);
  return (
    <aside
      data-label-rail=""
      data-rail-tone={tone}
      aria-label="Points"
      className={cn(
        "relative flex shrink-0 flex-col",
        RAIL_TONE_CLASS[tone],
        className,
      )}
      style={{ width: railWidth }}
    >
      <LabelRailResize
        width={railWidth}
        onResize={resizeRail}
        onReset={resetRail}
      />
      <div className={cn("flex min-h-0 flex-1 flex-col", boxClassName)}>
        {children}
      </div>
    </aside>
  );
}
