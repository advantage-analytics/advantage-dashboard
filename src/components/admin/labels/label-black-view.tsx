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
 * The console's full-screen view (board 08l) — the layout the Layout
 * menu calls "Full screen": black to the edges, with no admin header and no
 * nav; the film top-left with its transport, the court drawn straight onto
 * the black under it, and the points rail down the right.
 *
 * It is the film room's own mechanism — `fixed inset-0 z-50 bg-black`
 * (`film-fullscreen.tsx`) — which is what puts it over the page's chrome. But
 * it is NOT a portal: it stays a child of the console's root
 * (`data-label-console`), so the `--film-t` clock the player writes onto that
 * root still reaches the rail's rows, and every row handler is the one the
 * light table already has. The confirm dialog, the `FloatMenu`s and the
 * tooltips portal to `body` at the same `z-50`; appended after this layer in
 * the DOM, they paint above it, which is what a menu over a row needs.
 *
 * This file is the SHELL: the stage, the rail's box and its one size. What
 * fills them — the shared `LabelVideoPlayer` and `LabelCourtPanel`
 * (`video`, `court`), and the rail's header and rows (`children`,
 * `LabelBlackRail`) — is the console's, handed in so the player keeps its
 * ref, its transport and its clock across a switch of layout.
 *
 * ── The rail's width ────────────────────────────────────────────────────────
 *
 * The one thing this view owns: `railWidth`, in px, `RAIL_DEFAULT_PX` until
 * the stored width is read after mount (the page is server-rendered, and a
 * first client render that disagreed with the server's would not hydrate),
 * then whatever the handle (`LabelRailResize`, on the rail's left edge) asks
 * for, clamped through `clampRailWidth` and kept under
 * `RAIL_WIDTH_STORAGE_KEY`. The stage takes what is left. A spec pins the
 * width with `initialRailWidth`, and storage is not consulted.
 *
 * ── The film's box ──────────────────────────────────────────────────────────
 *
 * 16:9 of the stage's width, as the frame draws it at 1440×900 (800×450) —
 * until that would leave the court too little. On a wide window the stage is
 * wider than it is tall, and a full-width film took all of it: the court
 * drew 114px across at 1920×1080 and 52px at 2560×1300. So the film's WIDTH
 * is capped (`BLACK_VIDEO_WIDTH`) at what keeps `BLACK_COURT_MIN` of the
 * stage's height — two fifths of it, and never under 320px — for the court;
 * the film stays 16:9 at that width, centred on the black, top edge flush,
 * its transport still its own foot. The stage is a size container, so the
 * cap is plain CSS and follows the rail's handle and the window with no
 * measuring.
 *
 * ── What is under it ────────────────────────────────────────────────────────
 *
 * The layer covers the admin header and nav, and whatever else the page
 * draws beside the console — and covered is not unreachable: Tab still
 * walked every link under the black before it got to Play. While this view
 * is mounted, everything beside it is `inert` (`inertOutside`): each
 * sibling of the layer and of its ancestors, up to but not including
 * `body`'s own children. Stopping there is what keeps the menus, the confirm
 * and the tooltips alive — Radix portals them to `body`, as siblings of the
 * page's root, not of anything inside it. (An ancestor cannot be made inert:
 * this layer is inside it.) Unmounting — Exit full screen, or leaving the
 * page — hands each one back exactly as it was.
 */

/** What the court always keeps of the stage's height. */
export const BLACK_COURT_MIN = "max(320px, 40cqh)";

/**
 * The film's width: the stage's, or — where that would crowd the court out —
 * 16:9 of the height the court leaves. Never under 16:9 of 120px, for a
 * window too short to honour both.
 */
export const BLACK_VIDEO_WIDTH = `min(100cqw, max(calc((100cqh - ${BLACK_COURT_MIN}) * 16 / 9), 213px))`;

/**
 * Makes everything beside `layer` unreachable while it is mounted: `inert`
 * on each sibling of the element and of each of its ancestors, below
 * `body`'s children. Only what was not already inert is touched, and exactly
 * that is restored.
 *
 * A REF CALLBACK, with React 19's cleanup: it runs when the layer is in the
 * document and its return runs when the layer leaves it, which is the whole
 * lifetime wanted — there is no state for an effect to read.
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
 * The rail's width, as the file comment has it: the default, then the stored
 * width after mount, then whatever the handle asks for — clamped, and written
 * to storage once it settles. Shared with the docked view
 * (`label-side-view.tsx`), whose rail is the same rail at the same width
 * under the same key.
 */
export interface RailWidth {
  railWidth: number;
  /** The width asked for, in px; clamped here. */
  resizeRail: (px: number) => void;
  /** Back to `RAIL_DEFAULT_PX`. */
  resetRail: () => void;
}

export function useRailWidth(initialRailWidth?: number): RailWidth {
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
  children,
}: {
  /** The rail's width on first render, in px — for specs. */
  initialRailWidth?: number;
  /** The shared `LabelVideoPlayer`. */
  video: ReactNode;
  /** The shared `LabelCourtPanel`, with `fill`. */
  court: ReactNode;
  /** A stroke is selected and a court click would write: the court's outline. */
  placing?: boolean;
  /** The rail's contents — `LabelBlackRail`. */
  children: ReactNode;
}) {
  const rail = useRailWidth(initialRailWidth);

  return (
    <div
      ref={inertOutside}
      data-label-black=""
      className="fixed inset-0 z-50 flex bg-black text-white"
    >
      {/* The stage: the film at 16:9 of the stage's width, flush to the top,
          and the court on the black under it taking the rest — no card
          ground, radius or shadow, as the frame draws it. A size container,
          for the film's cap (`BLACK_VIDEO_WIDTH`). */}
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
        rail={rail}
        className="bg-[var(--surface-dark)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]"
      >
        {children}
      </LabelRailAside>
    </div>
  );
}

/**
 * The rail's box, the same in both views: `relative` for the handle on its
 * left edge, which hangs 4px outside it — so the aside itself never clips,
 * and a view that rounds its rail clips the box inside (`boxClassName`). It
 * wears its tone's palette (`label-rail-tone.ts`); the ground and the edge
 * are the view's (`className`).
 */
export function LabelRailAside({
  tone,
  rail,
  className,
  boxClassName,
  children,
}: {
  tone: RailTone;
  rail: RailWidth;
  className?: string;
  boxClassName?: string;
  /** The rail's contents — `LabelBlackRail`. */
  children: ReactNode;
}) {
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
      style={{ width: rail.railWidth }}
    >
      <LabelRailResize
        width={rail.railWidth}
        onResize={rail.resizeRail}
        onReset={rail.resetRail}
      />
      <div className={cn("flex min-h-0 flex-1 flex-col", boxClassName)}>
        {children}
      </div>
    </aside>
  );
}
