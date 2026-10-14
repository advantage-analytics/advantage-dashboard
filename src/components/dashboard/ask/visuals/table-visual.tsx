import type { CSSProperties } from "react";
import type { AskTableVisual } from "@/lib/services/ask/events";
import { cn } from "@/lib/utils";
import { VisualFrame } from "./visual-frame";

/**
 * Stat table: measures down the side, one to three columns across. Every
 * cell is the server's display string — the table only prints. The first
 * value column is the subject of the question and reads in full ink.
 */
export function TableVisual({ visual }: { visual: AskTableVisual }) {
  return (
    <VisualFrame kind="table" caption={visual.caption}>
      <table className="w-full max-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-hairline)]">
            <th scope="col" className="pb-2 font-normal">
              <span className="sr-only">Measure</span>
            </th>
            {visual.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="eyebrow-sm w-[104px] pb-2 pl-3 text-right font-normal"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visual.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              data-ask-row=""
              style={{ "--ask-row": rowIndex } as CSSProperties}
            >
              <th
                scope="row"
                className="h-8 text-[12px] font-normal text-[var(--ink-700)]"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "h-8 pl-3 text-right text-[13px] whitespace-nowrap tabular-nums",
                    index === 0
                      ? "text-[var(--ink-900)]"
                      : "text-[var(--ink-500)]",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </VisualFrame>
  );
}
