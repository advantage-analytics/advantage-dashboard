import type { CSSProperties } from "react";
import Link from "next/link";
import type { AskSourceMatch, AskTableVisual } from "@/lib/services/ask/events";
import { tableRowVideoHref } from "@/lib/services/ask/figure-video";
import { cn } from "@/lib/utils";
import { ROW_LABEL, VisualFrame, WATCH_LINK, WatchMark } from "./visual-frame";

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
 * The one number a display cell holds — "37.5%", "37,5 %", "−20.7", "4",
 * "1,204" — or null when it holds none or more than one ("256/305", "4 of
 * 9"). Read only to check a difference's direction, never printed.
 *
 * A comma followed by exactly three digits is a thousands separator, any
 * other comma a decimal mark: "1,204" is 1204 and "37,5" is 37.5. Read the
 * other way, a count over 999 would compare as a fraction against its
 * baseline and the direction check could agree with a wrong sign.
 */
export function cellNumber(cell: string): number | null {
  const numbers = cell
    .replace(/−/g, "-")
    .match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length !== 1 || /\//.test(cell)) return null;
  const [number] = numbers;
  const value = Number(
    /,\d{3}(?!\d)/.test(number)
      ? number.replace(/,/g, "")
      : number.replace(",", "."),
  );
  return Number.isFinite(value) ? value : null;
}

/**
 * A difference cell as the design system's `Delta`: the arrow says which way
 * the number moved, the colour whether that is good for this measure — the
 * KPI tiles' pairing, so double faults rising is a red ↑.
 *
 * Coloured only when the direction is known. The planner names a difference
 * column `_diff` but nothing fixes which side it subtracts from which, so
 * the sign alone could be baseline − subject and paint a better figure red.
 * The row's first two cells (the subject, then what it is read against)
 * settle it: the sign must agree with subject − baseline, or the cell
 * prints exactly as sent. So it does too when the column is not a
 * difference, the cell carries no sign, either side is not one plain
 * number, or the measure's better direction is not known. A zero needs no
 * check: it is the grey →, which claims nothing.
 *
 * Reads the sign the server wrote, the row's canonical label and the two
 * compared cells; formats no number of its own.
 */
export function tableDelta(
  heading: string,
  label: string,
  cell: string,
  subject: string | undefined,
  baseline: string | undefined,
): TableDelta | null {
  if (!DIFFERENCE_HEADING.test(heading.trim())) return null;
  const name = label.trim().toLowerCase();
  const lower = LOWER_IS_BETTER.has(name);
  if (!lower && !HIGHER_IS_BETTER.test(name)) return null;
  const match = /^\s*([+\-−±])?\s*(.*\S)\s*$/.exec(cell);
  if (!match) return null;
  const [, sign, rest] = match;
  if (!/\d/.test(rest)) return null;
  if (!/[1-9]/.test(rest)) return { arrow: "→", text: rest, tone: "flat" };
  if (sign !== "+" && sign !== "-" && sign !== "−") return null;
  const up = sign === "+";
  const from = subject === undefined ? null : cellNumber(subject);
  const to = baseline === undefined ? null : cellNumber(baseline);
  if (from === null || to === null || from === to) return null;
  if (from > to !== up) return null;
  return {
    arrow: up ? "↑" : "↓",
    text: rest,
    tone: up !== lower ? "good" : "bad",
  };
}

/** What the arrow says to a screen reader, which skips the glyph. */
const DELTA_SPOKEN: Record<TableDelta["arrow"], string> = {
  "↑": "up ",
  "↓": "down ",
  "→": "no change, ",
};

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
                      className={cn(WATCH_LINK, "inline-flex")}
                    >
                      {row.label}
                      <WatchMark />
                    </Link>
                  ) : (
                    row.label
                  )}
                </th>
                {row.cells.map((cell, index) => {
                  // The two cells it compares are the subject and the
                  // first baseline, so a difference needs both before it.
                  const delta =
                    index >= 2
                      ? tableDelta(
                          visual.columns[index] ?? "",
                          row.label,
                          cell,
                          row.cells[0],
                          row.cells[1],
                        )
                      : null;
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
                            {DELTA_SPOKEN[delta.arrow]}
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
