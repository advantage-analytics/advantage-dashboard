"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  BOARD_KEY_STEP,
  BOARD_KEY_STEP_LARGE,
  BOARD_POSITION_STORAGE_KEY,
  DEFAULT_BOARD_POSITION,
  clampBoardPosition,
  parseBoardPosition,
  type BoardPosition,
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
 * ── Movable ─────────────────────────────────────────────────────────────────
 * It opens a little lower than the handoff's 24/18 and can be dragged
 * anywhere on the film, because wherever it sits it covers some of the court.
 * Keyboard: focus it, arrows move it (Shift for bigger steps), 0 puts it back.
 * Double-click also puts it back. The position is remembered per viewer
 * (localStorage) and clamped inside the room on every resize. The room's own
 * arrow keys stand down while the board has focus (`data-film-own-keys`).
 */
export function FilmScoreboard({
  board,
  pointName,
  collapsed,
}: {
  board: Board | null;
  /** The analysis's own string for the current point, or null between points. */
  pointName: string | null;
  collapsed: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<BoardPosition>(() => {
    try {
      return (
        parseBoardPosition(localStorage.getItem(BOARD_POSITION_STORAGE_KEY)) ??
        DEFAULT_BOARD_POSITION
      );
    } catch {
      return DEFAULT_BOARD_POSITION;
    }
  });
  const [dragging, setDragging] = useState(false);
  // The last position written, read on pointer-up: the render holding the
  // final move may not have happened yet when the button is released.
  const latest = useRef(position);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    start: BoardPosition;
  } | null>(null);

  const clamp = useCallback((next: BoardPosition): BoardPosition => {
    const el = ref.current;
    const room = el?.offsetParent as HTMLElement | null;
    if (!el || !room) return next;
    return clampBoardPosition(
      next,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: room.clientWidth, height: room.clientHeight },
    );
  }, []);

  const save = useCallback((next: BoardPosition) => {
    try {
      localStorage.setItem(BOARD_POSITION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private window or storage blocked — the position just isn't kept */
    }
  }, []);

  const moveTo = useCallback(
    (next: BoardPosition, persist: boolean) => {
      const clamped = clamp(next);
      latest.current = clamped;
      setPosition(clamped);
      if (persist) save(clamped);
    },
    [clamp, save],
  );

  const reset = useCallback(() => {
    const clamped = clamp(DEFAULT_BOARD_POSITION);
    latest.current = clamped;
    setPosition(clamped);
    try {
      localStorage.removeItem(BOARD_POSITION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [clamp]);

  // A remembered position from a bigger screen, or a window made smaller
  // while the room is open, must never leave the board off the film.
  useEffect(() => {
    const onResize = () => {
      const clamped = clamp(latest.current);
      latest.current = clamped;
      setPosition(clamped);
    };
    const frame = requestAnimationFrame(onResize);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [clamp]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Scoreboard"
      aria-describedby="film-board-hint"
      tabIndex={0}
      data-film-own-keys=""
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
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        moveTo(
          {
            left: d.start.left + (e.clientX - d.pointerX),
            top: d.start.top + (e.clientY - d.pointerY),
          },
          false,
        );
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        setDragging(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* was never captured */
        }
        save(latest.current);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={reset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? BOARD_KEY_STEP_LARGE : BOARD_KEY_STEP;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        if (e.key === "0") {
          e.preventDefault();
          reset();
          return;
        }
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        moveTo(
          { left: position.left + move[0], top: position.top + move[1] },
          true,
        );
      }}
      className={cn(
        "absolute flex touch-none flex-col items-start gap-2 rounded-[var(--radius-element)] select-none focus-visible:outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ left: position.left, top: position.top }}
    >
      <span id="film-board-hint" className="sr-only">
        Drag, or use the arrow keys, to move it. Press 0 or double-click to put
        it back.
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
  );
}
