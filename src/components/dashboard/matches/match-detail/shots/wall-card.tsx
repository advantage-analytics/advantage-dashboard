"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { APRON_FILL, CourtArt } from "./court-art";
import { SERVE_COURT } from "./court-geometry";
import type { Cut, VizDot } from "./viz-model";
import type { VizState } from "./viz-url";
import { viewIdentityKey } from "./viz-url";
import { useVizState } from "./use-viz-state";
import { courtTileDomId } from "./viz-court-transition";
import { armCourtMorph } from "./viz-court-morph";
import {
  wallSegmentReadout,
  type WallSegment,
  type WallSummary,
} from "./wall-summary";

/**
 * One of the wall's four default cards (canvas W5, card D3 "Court first ·
 * split bar"): the court runs to the card's edges, and the footer under it
 * carries a 16px title, the count with its unit, a 6px split bar of the
 * card's statistics rows and its key. The whole card is one link (Enter
 * opens it); hovering a segment of the bar shows the dark readout
 * (`ChartTooltip`) with that segment's win rate against the card's average.
 *
 * Every figure comes from `summary` (`wall-summary.ts`), built from the same
 * `computeViz` result the court draws — nothing is counted here.
 *
 * Attribution (guardrails §4): won/lost is relative to the card's subject,
 * whose side was resolved once by `useMatchSides()` in `viz-wall.tsx`.
 */

/** The bar's shades, darkest first — the player's own blue steps
 *  (`--viz-you*`, the codebase's data-viz palette; charts only). A fourth
 *  row (errors whose landing read in) takes the miss grey. */
const SEGMENT_FILLS = [
  "var(--viz-you)",
  "var(--viz-you-mid)",
  "var(--viz-you-light)",
  "var(--ink-300)",
];

/**
 * The art box: every card, Serve included, is the half-court frame's 334:216
 * box capped at 300px, so the wall's cards are one size. Serve fills that box
 * with a window zoomed in on the service boxes and the net
 * (`SERVE_COURT_THROUGH_NET`, the same aspect), the others with their half
 * court. Cards keep their natural height (the wall's grid is `items-start`).
 */
const ART_MAX_H = 300;
const ART_ASPECT = SERVE_COURT.viewBox.w / SERVE_COURT.viewBox.h;

const CARD_CLASS =
  "flex flex-col rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-primary)] hover:border-[var(--border-medium)] hover:shadow-[var(--shadow-card-emphasis)] focus-visible:shadow-[0_0_0_2px_var(--blue-ring-40)] focus-visible:outline-none motion-reduce:transition-none";

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function WallCard({
  name,
  playerName,
  possessive,
  cut,
  dots,
  summary,
  href,
  navigateState,
}: {
  name: string;
  playerName: string;
  /** "your" / "their" — the errors readout's "43% of your unforced errors". */
  possessive: string;
  cut: Cut;
  dots: VizDot[];
  summary: WallSummary;
  href: string;
  navigateState: VizState;
}) {
  const { setState } = useVizState();
  const ownKey = viewIdentityKey(navigateState);
  const domId = ownKey !== null ? courtTileDomId(ownKey) : undefined;
  const serve = cut === "serve";

  // A plain click opens the lightbox over the wall through the store (no
  // navigation, so the wall keeps its scroll); a modified click is left to
  // the link, so a card still opens in a new tab.
  function handleClick(e: MouseEvent<HTMLAnchorElement>): void {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    // Its court starts for the lightbox's now (`viz-court-morph.ts`).
    armCourtMorph(e.currentTarget, cut);
    setState(navigateState);
  }

  return (
    <Link
      href={href}
      id={domId}
      onClick={handleClick}
      aria-label={`${name}, ${playerName}: ${summary.countLabel}`}
      className={CARD_CLASS}
    >
      <div
        className="flex w-full flex-1 flex-col justify-center overflow-hidden rounded-t-[var(--radius-card)]"
        style={{ backgroundColor: APRON_FILL }}
      >
        <div
          data-viz-court-art="true"
          className="relative w-full"
          style={{
            aspectRatio: ART_ASPECT,
            maxHeight: ART_MAX_H,
          }}
        >
          <CourtArt
            cut={cut}
            dots={dots}
            chart="scatter"
            fill
            serveFrame={serve ? "throughNet" : "half"}
            className="block h-full w-full"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-[var(--border-hairline)] px-5 pt-[14px] pb-[18px]">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3
            className="m-0 min-w-0 flex-1 truncate text-[16px] leading-[1.25] font-normal"
            style={{ letterSpacing: "-0.4px", color: "var(--ink-900)" }}
          >
            {name}
          </h3>
          <span
            className="shrink-0 text-[11px] whitespace-nowrap tabular-nums"
            style={{ color: "var(--ink-600)" }}
          >
            {summary.countLabel}
          </span>
        </div>
        <SplitBar
          summary={summary}
          possessive={possessive}
          errorNoun={name.toLowerCase()}
        />
        <div className="mt-[6px] flex flex-wrap gap-x-[14px] gap-y-1">
          <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
            {summary.keyLead}
          </span>
          {summary.segments.map((segment, i) => (
            <span
              key={segment.key}
              className="inline-flex items-center gap-[6px] text-[11px]"
              style={{ color: "var(--ink-600)" }}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: SEGMENT_FILLS[i] }}
              />
              {segment.label}{" "}
              <span
                className="tabular-nums"
                style={{ color: "var(--ink-900)" }}
              >
                {segment.count}
              </span>
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/**
 * The 6px split bar: one segment per row with anything in it, widths in
 * proportion to the counts, 2px apart. Hover a segment → the others fade to
 * 40% and the dark readout names it. Purely visual (`aria-hidden`): the key
 * under it carries the same counts as text.
 */
function SplitBar({
  summary,
  possessive,
  errorNoun,
}: {
  summary: WallSummary;
  possessive: string;
  errorNoun: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const filled = summary.segments
    .map((segment, i) => ({ segment, i }))
    .filter(({ segment }) => segment.count > 0);
  const whole = summary.count;

  const placed = filled.map(({ segment, i }, n) => {
    const before = filled
      .slice(0, n)
      .reduce((sum, f) => sum + f.segment.count, 0);
    const start = whole === 0 ? 0 : (100 * before) / whole;
    const end = whole === 0 ? 0 : (100 * (before + segment.count)) / whole;
    return { segment, i, start, end };
  });
  const active = placed.find((p) => p.i === hovered) ?? null;

  return (
    <span className="relative mt-[10px] block" aria-hidden="true">
      <span className="flex h-[6px] gap-[2px] overflow-hidden rounded-[3px]">
        {placed.length === 0 ? (
          <i
            className="block h-full flex-1"
            style={{ backgroundColor: "var(--surface-subtle)" }}
          />
        ) : (
          placed.map(({ segment, i }) => (
            <i
              key={segment.key}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() =>
                setHovered((current) => (current === i ? null : current))
              }
              className="block h-full transition-opacity duration-200 motion-reduce:transition-none"
              style={{
                flex: `${segment.count} 1 0`,
                backgroundColor: SEGMENT_FILLS[i],
                opacity: hovered === null || hovered === i ? 1 : 0.4,
              }}
            />
          ))
        )}
      </span>
      {active && (
        <SegmentReadout
          summary={summary}
          segment={active.segment}
          start={active.start}
          end={active.end}
          possessive={possessive}
          errorNoun={errorNoun}
        />
      )}
    </span>
  );
}

function SegmentReadout({
  summary,
  segment,
  start,
  end,
  possessive,
  errorNoun,
}: {
  summary: WallSummary;
  segment: WallSegment;
  start: number;
  end: number;
  possessive: string;
  errorNoun: string;
}) {
  const { title, line1, line2 } = wallSegmentReadout(
    summary,
    segment,
    possessive,
    errorNoun,
  );
  const centre = (start + end) / 2;
  // Centred on its segment, except near the card's edges, where it hangs
  // from the segment's outer end so it never runs off the card.
  const align = centre < 20 ? "start" : centre > 80 ? "end" : "center";
  const anchor =
    align === "start"
      ? { left: `${start}%` }
      : align === "end"
        ? { right: `${100 - end}%` }
        : { left: `${centre}%` };
  return (
    <span className="absolute top-0 h-[6px] w-0" style={anchor}>
      <ChartTooltip
        open
        align={align}
        offset={10}
        className="gap-[2px] px-3 pt-[10px] pb-[11px]"
      >
        <span className="text-[12px] font-medium text-white">{title}</span>
        <span className="text-[11px] leading-[1.45] text-white/[0.64]">
          {line1}
        </span>
        {line2 && (
          <span className="text-[11px] leading-[1.45] text-white/[0.64]">
            {line2}
          </span>
        )}
      </ChartTooltip>
    </span>
  );
}
