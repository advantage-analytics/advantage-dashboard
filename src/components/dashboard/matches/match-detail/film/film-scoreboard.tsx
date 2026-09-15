"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  BASE_BOARD_INSETS,
  BOARD_POSITION_STORAGE_KEY,
  DEFAULT_BOARD_ANCHOR,
  anchorPosition,
  clampBoardPosition,
  nearestAnchor,
  neighbourAnchor,
  parseBoardAnchor,
  type BoardAnchor,
  type BoardInsets,
  type BoardPosition,
  type BoardSize,
} from "./board-position";
import type { Board } from "./film-score";

/**
 * The board and the point line (handoff F1/F2).
 *
 * Two 32px rows on rgba(13,13,13,.8): a 152px name panel on a 5% wash with
 * a 5px serve dot, the set columns in 12px mono on 24px centred cells (45%
 * white when settled, 85% in play), and the live game score in a 40px cell
 * behind a 1px inset rule. The point line sits under it, indented 12px so
 * its mono score lands under the names. Both survive the chrome collapse —
 * they are what the screen IS, not a control.
 *
 * ── Movable, with resting spots ─────────────────────────────────────────────
 * Wherever it sits it covers some of the court, so it can be moved. It drags
 * freely under the pointer while a ghost outline shows the resting spot it
 * will land in; on release it glides there (`board-position.ts` has the six
 * spots and the clearances around the room's chrome). Keyboard: focus it and
 * the arrows walk the spots; 0 or a double-click puts it back top-left. The
 * spot is remembered per viewer, and the right-hand spots step aside while the
 * points drawer is open. The room's own arrow keys stand down while the board
 * has focus (`data-film-own-keys`).
 */

/** The glide into a resting spot, and the ghost's hop between spots. */
const SETTLE_CLASS =
  "transition-[left,top] duration-[360ms] ease-[var(--ease-out-expo)] motion-reduce:transition-none";

export function FilmScoreboard({
  board,
  pointName,
  collapsed,
  rightInset = 0,
}: {
  board: Board | null;
  /** The analysis's own string for the current point, or null between points. */
  pointName: string | null;
  collapsed: boolean;
  /** Extra room kept on the right — the open points drawer's width. */
  rightInset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<BoardAnchor>(() => {
    try {
      return (
        parseBoardAnchor(localStorage.getItem(BOARD_POSITION_STORAGE_KEY)) ??
        DEFAULT_BOARD_ANCHOR
      );
    } catch {
      return DEFAULT_BOARD_ANCHOR;
    }
  });
  // Board and room sizes, measured before paint and kept current, so a spot
  // on the right or bottom edge follows a board that grows (a longer point
  // name) or a room that resizes.
  const [sizes, setSizes] = useState<{
    board: BoardSize;
    room: BoardSize;
  } | null>(null);
  // The free position under the pointer, only while dragging.
  const [dragAt, setDragAt] = useState<BoardPosition | null>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    start: BoardPosition;
  } | null>(null);

  const insets: BoardInsets = {
    ...BASE_BOARD_INSETS,
    right: BASE_BOARD_INSETS.right + rightInset,
  };

  useLayoutEffect(() => {
    const el = ref.current;
    const room = el?.offsetParent as HTMLElement | null;
    if (!el || !room) return;
    const measure = () =>
      setSizes({
        board: { width: el.offsetWidth, height: el.offsetHeight },
        room: { width: room.clientWidth, height: room.clientHeight },
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(room);
    return () => observer.disconnect();
  }, []);

  const resting = sizes
    ? anchorPosition(anchor, sizes.board, sizes.room, insets)
    : { left: BASE_BOARD_INSETS.left, top: BASE_BOARD_INSETS.top };
  const position = dragAt ?? resting;
  const target =
    dragAt && sizes
      ? nearestAnchor(dragAt, sizes.board, sizes.room, insets)
      : null;
  const ghost =
    target && sizes
      ? anchorPosition(target, sizes.board, sizes.room, insets)
      : null;

  const settle = useCallback((next: BoardAnchor, persist: boolean) => {
    setAnchor(next);
    try {
      if (persist) localStorage.setItem(BOARD_POSITION_STORAGE_KEY, next);
      else localStorage.removeItem(BOARD_POSITION_STORAGE_KEY);
    } catch {
      /* private window or storage blocked — the spot just isn't kept */
    }
  }, []);

  const endDrag = (commit: boolean) => {
    const at = dragAt;
    drag.current = null;
    setDragAt(null);
    if (commit && at && sizes) {
      settle(nearestAnchor(at, sizes.board, sizes.room, insets), true);
    }
  };

  return (
    <>
      {ghost && (
        <div
          aria-hidden="true"
          data-film-board-ghost=""
          className={cn(
            "pointer-events-none absolute rounded-[var(--radius-element)] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]",
            SETTLE_CLASS,
          )}
          style={{
            left: ghost.left,
            top: ghost.top,
            width: sizes?.board.width,
            height: sizes?.board.height,
          }}
        />
      )}
      <div
        ref={ref}
        role="group"
        aria-label="Scoreboard"
        aria-describedby="film-board-hint"
        tabIndex={0}
        data-film-own-keys=""
        data-film-chrome=""
        data-board-anchor={anchor}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // Capture keeps the drag alive when the pointer outruns the board.
          // Best-effort: it throws for a pointer the browser no longer tracks,
          // and a drag without capture still works while over the board.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable */
          }
          drag.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            start: position,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !sizes) return;
          const dx = e.clientX - d.pointerX;
          const dy = e.clientY - d.pointerY;
          // A click is not a drag: nothing lifts until the pointer travels.
          if (!dragAt && Math.hypot(dx, dy) < 3) return;
          setDragAt(
            clampBoardPosition(
              { left: d.start.left + dx, top: d.start.top + dy },
              sizes.board,
              sizes.room,
            ),
          );
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* was never captured */
          }
          endDrag(true);
        }}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={() => {
          if (drag.current) endDrag(true);
        }}
        onDoubleClick={() => settle(DEFAULT_BOARD_ANCHOR, false)}
        onKeyDown={(e) => {
          if (e.key === "0") {
            e.preventDefault();
            settle(DEFAULT_BOARD_ANCHOR, false);
            return;
          }
          if (
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "ArrowUp" ||
            e.key === "ArrowDown"
          ) {
            e.preventDefault();
            settle(neighbourAnchor(anchor, e.key), true);
          }
        }}
        className={cn(
          "absolute flex touch-none flex-col items-start gap-2 rounded-[var(--radius-element)] select-none focus-visible:outline-none",
          dragAt ? "cursor-grabbing" : cn("cursor-grab", sizes && SETTLE_CLASS),
        )}
        style={{ left: position.left, top: position.top }}
      >
        <span id="film-board-hint" className="sr-only">
          Drag it, or use the arrow keys, to move it between the corners and the
          middle of the top and bottom edges. Press 0 or double-click to put it
          back.
        </span>
        {board && (
          <div
            role="table"
            aria-label="Score"
            className="inline-flex flex-col overflow-hidden rounded-[var(--radius-element)] bg-[rgba(13,13,13,0.8)] shadow-[var(--shadow-dropdown)]"
          >
            {board.rows.map((row, r) => (
              <div key={row.name} role="row" className="contents">
                {r === 1 && (
                  <div aria-hidden="true" className="h-px bg-white/10" />
                )}
                <div className="flex h-8 items-stretch">
                  <div
                    role="rowheader"
                    className="flex w-[152px] items-center gap-2 bg-white/5 px-3"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-[5px] w-[5px] shrink-0 rounded-[var(--radius-pill)]",
                        row.serving ? "bg-white" : "bg-transparent",
                      )}
                    />
                    <span className="truncate text-[12px] font-medium text-white">
                      {row.name}
                    </span>
                    {row.serving && <span className="sr-only">, serving</span>}
                  </div>
                  <div className="flex items-center px-1">
                    {row.sets.map((games, i) => (
                      <span
                        key={i}
                        role="cell"
                        className="mono tabular w-6 text-center text-[12px]"
                        style={{
                          color:
                            i === board.liveSet
                              ? "rgba(255,255,255,0.85)"
                              : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {games ?? ""}
                      </span>
                    ))}
                  </div>
                  <div
                    role="cell"
                    className="flex w-10 items-center justify-center shadow-[inset_1px_0_0_rgba(255,255,255,0.14)]"
                  >
                    <span className="mono tabular text-[12px] text-white">
                      {row.game ?? ""}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(board?.pointLine || pointName) && (
          <div
            className="flex items-baseline gap-[9px] pl-3"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            {board?.pointLine && (
              <span className="mono tabular text-[10px] text-white/55">
                {board.pointLine}
              </span>
            )}
            {pointName && (
              <span
                className="text-[11px] font-medium whitespace-nowrap"
                style={{
                  color: collapsed ? "rgba(255,255,255,0.9)" : "#FFFFFF",
                }}
              >
                {pointName}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
