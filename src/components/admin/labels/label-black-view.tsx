"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  RAIL_DEFAULT_PX,
  RAIL_WIDTH_STORAGE_KEY,
  clampRailWidth,
  parseRailWidth,
} from "./label-layout";
import { LabelRailResize } from "./label-rail-resize";

/**
 * The console's full-screen view (T33, board 08l) — the layout the Layout
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
 */
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

  const resizeRail = useCallback((px: number) => {
    const next = clampRailWidth(px);
    setRailWidth(next);
    try {
      localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(next));
    } catch {
      /* private window — the width just isn't kept */
    }
  }, []);
  const resetRail = useCallback(
    () => resizeRail(RAIL_DEFAULT_PX),
    [resizeRail],
  );

  return (
    <div
      data-label-black=""
      className="fixed inset-0 z-50 flex bg-black text-white"
    >
      {/* The stage: the film at 16:9 of the stage's width, flush top-left,
          and the court on the black under it taking the rest — no card
          ground, radius or shadow, as the frame draws it. */}
      <div
        data-label-black-stage=""
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          data-label-black-video=""
          className="aspect-video w-full shrink-0 overflow-hidden"
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

      {/* The rail: `relative` for the handle on its left edge, which hangs
          4px outside it; nothing here clips it. */}
      <aside
        data-label-rail=""
        aria-label="Points"
        className="relative flex shrink-0 flex-col bg-[var(--surface-dark)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]"
        style={{ width: railWidth }}
      >
        <LabelRailResize
          width={railWidth}
          onResize={resizeRail}
          onReset={resetRail}
        />
        {children}
      </aside>
    </div>
  );
}
