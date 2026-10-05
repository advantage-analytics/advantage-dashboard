"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Maximize2, Minimize2 } from "lucide-react";
import type {
  BoardAnchor,
  BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";
import {
  ANCHOR_LABEL,
  SETTLE_CLASS,
  useCornerDrag,
} from "@/components/dashboard/matches/match-detail/film/use-corner-drag";
import type { LabelPoint } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { CourtPoint } from "./court-geometry";
import type { PlacementState, PlacementTarget } from "./court-placement";
import { LabelCourtPanel, isPlacing } from "./label-court-panel";
import {
  COURT_ANCHOR_STORAGE_KEY,
  COURT_DOCK_SIZE,
  COURT_MINIMISED_STORAGE_KEY,
  DEFAULT_COURT_ANCHOR,
  courtOrigin,
  courtRest,
  type VideoDockLayout,
} from "./label-court-position";
import { DOCK_INSETS, parseDockMinimised } from "./label-dock-position";
import type { SideNames } from "./label-format";
import type { VideoClock } from "./video-clock";

/**
 * The console's court, floating (board 08i): a 300 × 318 dark card beside the
 * floating video, with the same movement — `useCornerDrag`, the film room's
 * one mechanic — under its own storage keys. It rests bottom-left unless the
 * labeller moves it, and it yields to the video (`courtRest`): dropped into
 * the video's corner it lands beside it, never on it.
 *
 * This file is the SHELL — the fixed layer, the corner drag, the minimise
 * pill, the dark card and its blue outline while placing. What is on the card
 * (the readout header, the court, the Contact / Landing switch, Flip side and
 * the legend) is `LabelCourtPanel` (`label-court-panel.tsx`), which the
 * console also renders bare in its docked layouts (T24); the two states the
 * card can be in, and what the court shows, are documented there.
 *
 * ── A box that never changes size ───────────────────────────────────────────
 * As the video dock: the layer is `fixed inset-0`, the dock keeps the card's
 * 300 × 318 box whether or not it is minimised, and the pill sits inside that
 * box pinned to the anchored corner — so minimising never moves the corner
 * the hook measured. The empty box is `pointer-events-none`.
 *
 * Motion is the video dock's, value for value: the 360ms corner glide
 * (`SETTLE_CLASS`, off while free), the 1.015 lift while dragged, and the
 * 220ms-in / 160ms-out collapse toward the anchored corner, with no scale and
 * no glide under reduced motion.
 */

const HEADER_BUTTON =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

export { courtReadout, type CourtReadout } from "./label-court-panel";

export function LabelCourtDock({
  point,
  names,
  placement,
  editable,
  playingShotId = null,
  clock,
  video,
  onPlace,
  onTarget,
  onFlip,
  initialMinimised = false,
}: {
  /** The open point; its live strokes are the marks. Null: an empty court. */
  point: LabelPoint | null;
  names: SideNames;
  /** The selected stroke and the end and half its next click places. */
  placement: PlacementState;
  /** Whether a click may write. Read-only: always the whole court. */
  editable: boolean;
  /** The stroke on screen in the video — named in the header while nothing is selected. */
  playingShotId?: string | null;
  /** The console's video clock (analysis seconds): what the marks follow. */
  clock: VideoClock;
  /** Where the video dock is, to keep clear of it. Null until it is known. */
  video: VideoDockLayout | null;
  /** A click on the zoomed half, in metres. */
  onPlace: (point: CourtPoint) => void;
  /** The Contact / Landing switch. */
  onTarget: (target: PlacementTarget) => void;
  /** "Flip side". */
  onFlip: () => void;
  /** Minimised on first render — for specs. Otherwise read from storage. */
  initialMinimised?: boolean;
}) {
  const [minimised, setMinimised] = useState(initialMinimised);
  const minimiseButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  // Set by the two buttons only, so focus follows a press across the swap and
  // never moves on load.
  const handOffFocus = useRef(false);
  useEffect(() => {
    if (!handOffFocus.current) return;
    handOffFocus.current = false;
    (minimised ? expandButton : minimiseButton).current?.focus();
  }, [minimised]);

  // Read after mount, never during render: the server has no storage. The
  // dock is invisible until its first measurement, so nobody sees it fold.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COURT_MINIMISED_STORAGE_KEY);
      // Storage is the external system here, readable only after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setMinimised(parseDockMinimised(stored));
    } catch {
      /* storage blocked — the card just starts expanded */
    }
  }, []);

  const setMinimisedAndRemember = useCallback((next: boolean) => {
    handOffFocus.current = true;
    setMinimised(next);
    try {
      localStorage.setItem(COURT_MINIMISED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private window — the state just isn't kept */
    }
  }, []);

  // A new `rest` whenever the video moves, folds or resizes: the hook reads
  // it every render, so the court steps aside as soon as the video lands.
  const rest = useCallback(
    (at: BoardAnchor | null, size: BoardSize, room: BoardSize) =>
      courtRest(at, size, room, video),
    [video],
  );
  const announce = useCallback(
    (at: BoardAnchor) => `Court in the ${ANCHOR_LABEL[at]} corner.`,
    [],
  );
  const move = useCornerDrag({
    storageKey: COURT_ANCHOR_STORAGE_KEY,
    defaultAnchor: DEFAULT_COURT_ANCHOR,
    rest,
    fallback: { left: DOCK_INSETS.left, top: DOCK_INSETS.top },
    announce,
    insets: DOCK_INSETS,
  });
  const { ghost, position, sizes } = move;
  // The stored corner only once measured: the server and the first client
  // render must agree, and only the client can read storage.
  const anchor = sizes
    ? (move.anchor ?? DEFAULT_COURT_ANCHOR)
    : DEFAULT_COURT_ANCHOR;
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  const origin = courtOrigin(anchor);

  const placing = isPlacing(point, placement, editable);

  return (
    <div
      data-label-court-layer=""
      className="pointer-events-none fixed inset-0 z-40"
    >
      {ghost && !minimised && (
        <div
          aria-hidden="true"
          data-court-dock-ghost=""
          className={cn(
            "absolute rounded-[var(--radius-card)] border border-dashed border-[var(--ink-400)] bg-[rgba(13,13,13,0.04)]",
            SETTLE_CLASS,
          )}
          style={{ left: ghost.left, top: ghost.top, ...COURT_DOCK_SIZE }}
        />
      )}

      <div
        {...move.containerProps}
        // Minimised, the box is empty space: the pill's button is the stop.
        tabIndex={minimised ? -1 : 0}
        role="group"
        aria-label="Court"
        aria-describedby="label-court-hint"
        data-label-court-dock=""
        data-dock-anchor={anchor}
        data-dock-minimised={minimised ? "true" : "false"}
        data-court-placing={placing ? "true" : "false"}
        className={cn(
          "absolute rounded-[var(--radius-card)] outline-none focus-visible:shadow-[var(--focus-ring)]",
          // Hidden until both cards are measured, so the court never shows
          // for a frame in a corner the video turns out to hold.
          (!sizes || !video) && "invisible",
          !move.free && move.placed && SETTLE_CLASS,
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: position.left, top: position.top, ...COURT_DOCK_SIZE }}
      >
        <span id="label-court-hint" className="sr-only">
          Drag the top of the card to move the court, or press the arrow keys to
          nudge it 8 pixels at a time — 40 with Shift. Space picks it up and
          drops it into the nearest corner; Escape cancels the move.
        </span>
        <span aria-live="polite" className="sr-only">
          {move.announcement && (
            <span key={move.announcement.seq}>{move.announcement.text}</span>
          )}
        </span>

        {/* Expanded: collapses toward the anchored corner. */}
        <div
          data-court-card=""
          aria-hidden={minimised || undefined}
          className={cn(
            "h-full ease-[var(--ease-out-expo)] motion-reduce:scale-100",
            minimised
              ? "pointer-events-none invisible scale-[0.94] opacity-0 transition-[opacity,scale,visibility] duration-[160ms]"
              : "pointer-events-auto visible scale-100 opacity-100 transition-[opacity,scale] duration-[220ms]",
          )}
          style={{ transformOrigin: origin }}
        >
          {/* The lift: its own layer, so it keeps its own timing. */}
          <div
            data-dock-lifted={move.free ? "true" : undefined}
            className={cn(
              "flex h-full flex-col rounded-[var(--radius-card)] bg-[#1A1A1C] px-3 pt-3 pb-2.5 transition-[scale,box-shadow] ease-[var(--ease-out-expo)] motion-reduce:scale-100",
              move.free
                ? "scale-[1.015] shadow-[0px_20px_48px_rgba(0,0,0,0.28),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset] duration-[120ms]"
                : placing
                  ? "scale-100 shadow-[0_0_0_1.5px_var(--blue),var(--shadow-floating)] duration-150"
                  : "scale-100 shadow-[var(--shadow-floating)] duration-150",
            )}
          >
            <LabelCourtPanel
              point={point}
              names={names}
              placement={placement}
              editable={editable}
              playingShotId={playingShotId}
              clock={clock}
              onPlace={onPlace}
              onTarget={onTarget}
              onFlip={onFlip}
              // The header is the drag handle. A press on the minimise button
              // is that button's: capturing the pointer here would move the
              // click off it.
              headerProps={{
                ...move.handleProps,
                "data-court-handle": "",
                onPointerDown: (e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  move.handleProps.onPointerDown(e);
                },
              }}
              headerClassName={cn(
                "touch-none select-none",
                move.free ? "cursor-grabbing" : "cursor-grab",
              )}
              headerTrailing={
                <span className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
                  <GripVertical
                    className="size-3.5 text-white/45"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    ref={minimiseButton}
                    aria-label="Minimise the court"
                    onClick={() => setMinimisedAndRemember(true)}
                    className={HEADER_BUTTON}
                  >
                    <Minimize2
                      className="size-3.5"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </button>
                </span>
              }
            />
          </div>
        </div>

        {/* Minimised: the pill, pinned to the same corner. */}
        <div
          data-court-pill=""
          aria-hidden={!minimised || undefined}
          className={cn(
            "absolute flex h-9 items-center gap-1 rounded-[var(--radius-pill)] bg-[#1A1A1C] pr-1 pl-3 shadow-[var(--shadow-floating)] ease-[var(--ease-out-expo)] motion-reduce:scale-100",
            row === "top" ? "top-0" : "bottom-0",
            column === "left" ? "left-0" : "right-0",
            minimised
              ? "pointer-events-auto visible scale-100 opacity-100 transition-[opacity,scale] duration-[220ms]"
              : "pointer-events-none invisible scale-[0.9] opacity-0 transition-[opacity,scale,visibility] duration-[160ms]",
          )}
          style={{ transformOrigin: origin }}
        >
          <span className="pr-1 text-[12px] whitespace-nowrap text-white/80">
            Court
          </span>
          <button
            type="button"
            ref={expandButton}
            aria-label="Expand the court"
            onClick={() => setMinimisedAndRemember(false)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-pill)] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <Maximize2
              className="size-3.5"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
