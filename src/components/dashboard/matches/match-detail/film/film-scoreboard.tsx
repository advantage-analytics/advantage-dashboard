"use client";

import { cn } from "@/lib/utils";

import type { Board } from "./film-score";

/**
 * The board and the point line (handoff F1/F2), top-left at 24/18.
 *
 * Two 32px rows on rgba(13,13,13,.8): a 152px name panel on a 5% wash with
 * a 5px serve dot, the set columns in 12px mono on 24px centred cells (45%
 * white when settled, 85% in play), and the live game score in a 40px cell
 * behind a 1px inset rule. The point line sits under it, indented 12px so
 * its mono score lands under the names. Both survive the chrome collapse —
 * they are what the screen IS, not a control.
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
  return (
    <div className="absolute top-[18px] left-6 flex flex-col items-start gap-2">
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
              className="text-[11px] font-medium"
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
