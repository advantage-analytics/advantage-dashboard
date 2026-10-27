import type { CSSProperties } from "react";
import Link from "next/link";
import type { AskSourceMatch, AskTableVisual } from "@/lib/services/ask/events";
import { tableRowVideoHref } from "@/lib/services/ask/figure-video";
import { cn } from "@/lib/utils";
import { ROW_LABEL, VisualFrame, WatchMark } from "./visual-frame";

/** A column heading that names a difference rather than a side. */
const DIFFERENCE_HEADING = /^(difference|diff|change|gap)$/i;

/**
 * The canonical labels (`measures.ts`) where fewer is better. A difference
 * on any other label is coloured only when the label says plainly that more
 * is better (`HIGHER_IS_BETTER`); everything else prints as sent.
 */
const LOWER_IS_BETTER = new Set([
  "double faults",
  "unforced errors",
  "forehand unforced errors",
  "backhand unforced errors",
  "break points faced",
  "set points faced",
]);
const HIGHER_IS_BETTER =
  /( won| in| saved| converted)$|^(aces|winners|service winners|forehand winners|backhand winners|volley winners)$/i;

export type TableDelta = {
  arrow: "↑" | "↓" | "→";
  /** The cell without its sign: the arrow carries the direction. */
  text: string;
  tone: "good" | "bad" | "flat";
};

/**
 * A difference cell as the design system's `Delta`: the arrow says which way
 * the number moved, the colour whether that is good for this measure — the
 * KPI tiles' pairing, so double faults rising is a red ↑. Null when the
 * column is not a difference, the cell carries no sign, or the measure's
 * better direction is not known; the cell then prints exactly as sent.
 *
 * Reads the sign the server wrote and the row's canonical label; formats no
 * number of its own.
 */
export function tableDelta(
  heading: string,
  label: string,
  cell: string,
): TableDelta | null {
  if (!DIFFERENCE_HEADING.test(heading.trim())) return null;
  const name = label.trim().toLowerCase();
  const lower = LOWER_IS_BETTER.has(name);
  if (!lower && !HIGHER_IS_BETTER.test(name)) return null;
  const match = /^\s*([+\-−±])?\s*(.*\S)\s*$/.exec(cell);
  if (!match) return null;
  const [, sign, rest] = match;
  if (!/\d/.test(rest)) return null;
  const zero = !/[1-9]/.test(rest);
  if (zero) return { arrow: "→", text: rest, tone: "flat" };
  if (sign === "+" || sign === "-" || sign === "−") {
    const up = sign === "+";
    return {
      arrow: up ? "↑" : "↓",
      text: rest,
      tone: up !== lower ? "good" : "bad",
    };
  }
  return null;
}

const TONE: Record<TableDelta["tone"], string> = {
  good: "var(--viz-good)",
  bad: "var(--viz-bad)",
  flat: "var(--ink-500)",
};

/**
 * Stat table: measures down the side, one to three columns across. Every
 * cell is the server's display string — the table only prints. The first
 * value column is the subject of the question and reads in full ink at 500,
 * the head-to-head's emphasis; the column heads are its 12px sentence-case
 * names, the subject's in ink-900. A difference column draws as `Delta`
 * (`tableDelta`).
 *
 * A row that is one match (`matchId`) opens that match's film — on the
 * answer's own points when its source carries them; over one source match,
 * a row whose label is a measure the Video tab can filter on opens the
 * film on those points (`figure-video.ts`). The row header is the link; the
 * row washes and shows the play mark while it is hovered or focused.
 */
export function TableVisual({
  visual,
  sources,
}: {
  visual: AskTableVisual;
  sources?: readonly AskSourceMatch[] | null;
}) {
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
                className={cn(
                  "w-[104px] pb-2 pl-3 text-right text-[12px] font-medium",
                  index === 0
                    ? "text-[var(--ink-900)]"
                    : "text-[var(--ink-600)]",
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visual.rows.map((row, rowIndex) => {
            const watch = tableRowVideoHref(row, sources);
            return (
              <tr
                key={rowIndex}
                data-ask-row=""
                style={{ "--ask-row": rowIndex } as CSSProperties}
                className="transition-colors duration-[var(--duration-hover)] has-[a:focus-visible]:bg-[var(--surface-muted)] has-[a:hover]:bg-[var(--surface-muted)]"
              >
                <th
                  scope="row"
                  className={cn("h-[30px] pl-0 font-normal", ROW_LABEL)}
                >
                  {watch ? (
                    <Link
                      href={watch}
                      data-ask-table-watch=""
                      className="group inline-flex items-center rounded-[var(--radius-element)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--ink-900)] focus-visible:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
                    >
                      {row.label}
                      <WatchMark />
                    </Link>
                  ) : (
                    row.label
                  )}
                </th>
                {row.cells.map((cell, index) => {
                  const delta = tableDelta(
                    visual.columns[index] ?? "",
                    row.label,
                    cell,
                  );
                  return (
                    <td
                      key={index}
                      className={cn(
                        "h-[30px] pl-3 text-right text-[13px] whitespace-nowrap tabular-nums",
                        index === 0
                          ? "font-medium text-[var(--ink-900)]"
                          : delta
                            ? "text-[var(--ink-900)]"
                            : "text-[var(--ink-500)]",
                      )}
                    >
                      {delta ? (
                        <span data-ask-delta={delta.tone}>
                          <span
                            aria-hidden="true"
                            style={{ color: TONE[delta.tone] }}
                          >
                            {delta.arrow}
                          </span>{" "}
                          <span className="sr-only">
                            {delta.arrow === "↑"
                              ? "up "
                              : delta.arrow === "↓"
                                ? "down "
                                : "no change, "}
                          </span>
                          {delta.text}
                        </span>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </VisualFrame>
  );
}
