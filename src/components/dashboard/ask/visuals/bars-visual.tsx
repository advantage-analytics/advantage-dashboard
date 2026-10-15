import type { CSSProperties } from "react";
import Link from "next/link";
import type { AskBarsVisual, AskSourceMatch } from "@/lib/services/ask/events";
import { barRowVideoHref } from "@/lib/services/ask/figure-video";
import { cn } from "@/lib/utils";
import { barWidth } from "./visual-geometry";
import {
  VisualFrame,
  VisualKey,
  VisualReadout,
  WatchMark,
} from "./visual-frame";

const SUBJECT = "var(--viz-you)";
const BASELINE = "var(--viz-opp-light)";

/**
 * Comparison bars: one measure per row, the subject's bar over the
 * baseline's. Blue is the player's series and slate is what it is being read
 * against; the figures beside the bars stay ink.
 *
 * A hovered bar names its series and figure in a dark readout — the figure
 * is printed beside it, the series only by colour and the key. Over one
 * source match, a row whose label is a measure the Video tab can filter on
 * (`figure-video.ts`) is a link to that match's film on those points.
 */
export function BarsVisual({
  visual,
  sources,
}: {
  visual: AskBarsVisual;
  sources?: readonly AskSourceMatch[] | null;
}) {
  return (
    <VisualFrame kind="bars" caption={visual.caption}>
      <VisualKey
        items={[
          { label: visual.subjectLabel, color: SUBJECT },
          { label: visual.baselineLabel, color: BASELINE },
        ]}
      />
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {visual.rows.map((row, index) => {
          const watch = barRowVideoHref(row.label, sources);
          return (
            <li
              key={index}
              data-ask-bar-row=""
              style={{ "--ask-row": index } as CSSProperties}
              className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-center gap-x-4"
            >
              {watch ? (
                <Link
                  href={watch}
                  data-ask-bar-watch=""
                  className="group rounded-[var(--radius-element)] text-[12px] text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
                >
                  {row.label}
                  <WatchMark />
                </Link>
              ) : (
                <span className="text-[12px] text-[var(--ink-700)]">
                  {row.label}
                </span>
              )}
              <span className="flex flex-col gap-1">
                <Bar
                  series={visual.subjectLabel}
                  value={row.subject.value}
                  text={row.subject.text}
                  color={SUBJECT}
                  strong
                />
                <Bar
                  series={visual.baselineLabel}
                  value={row.baseline.value}
                  text={row.baseline.text}
                  color={BASELINE}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </VisualFrame>
  );
}

function Bar({
  series,
  value,
  text,
  color,
  strong = false,
}: {
  series: string;
  value: number;
  text: string;
  color: string;
  strong?: boolean;
}) {
  return (
    <span className="group/bar relative flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="h-1.5 min-w-0 flex-1 rounded-[1px] bg-[var(--ink-100)]"
      >
        <span
          data-ask-grow=""
          className="block h-full rounded-[1px]"
          style={{ width: `${barWidth(value)}%`, background: color }}
        />
      </span>
      <span
        data-ask-after=""
        className={cn(
          "w-12 shrink-0 text-right text-[12px] whitespace-nowrap tabular-nums",
          strong ? "text-[var(--ink-900)]" : "text-[var(--ink-500)]",
        )}
      >
        {/* The bar's colour says which series this is; a reader who cannot
            see it is told in words. */}
        <span className="sr-only">{series}: </span>
        {text}
      </span>
      <VisualReadout className="bottom-full left-0 mb-1 opacity-0 group-hover/bar:opacity-100">
        {series}: {text}
      </VisualReadout>
    </span>
  );
}
