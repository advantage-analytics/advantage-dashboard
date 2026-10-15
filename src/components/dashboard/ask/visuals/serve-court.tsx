import type { CSSProperties } from "react";
import Link from "next/link";
import {
  BASELINE_Y,
  CENTER_X,
  COURT_H,
  COURT_W,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SERVICE_Y,
  SINGLES_LEFT,
  SINGLES_RIGHT,
} from "@/lib/data/serve-zones";
import type { AskServeVisual } from "@/lib/services/ask/events";
import {
  type ServeCourtSide,
  type ServeZoneKey,
  serveCourtCells,
} from "./visual-geometry";
import { VisualReadout } from "./visual-frame";

/** T, Body and Wide in the three blue steps — the same key the bars use. */
export const SERVE_ZONE_COLORS: Record<ServeZoneKey, string> = {
  t: "var(--viz-you)",
  body: "var(--viz-you-mid)",
  wide: "var(--viz-you-light)",
};

const ZONE_LABEL: Record<ServeZoneKey, string> = {
  t: "T",
  body: "Body",
  wide: "Wide",
};

const LINE = {
  stroke: "var(--viz-court-fill)",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
};

/** The drawing's viewBox: the court with a one-unit margin on every side. */
const VIEW = { x: -1, y: -1, width: COURT_W + 2, height: COURT_H + 2 };
const percentX = (x: number) => `${((x - VIEW.x) / VIEW.width) * 100}%`;
const percentY = (y: number) => `${((y - VIEW.y) / VIEW.height) * 100}%`;
const percentW = (w: number) => `${(w / VIEW.width) * 100}%`;
const percentH = (h: number) => `${(h / VIEW.height) * 100}%`;

/**
 * Serve placement by court: the serve-placement half court — the receiver's
 * end seen from the server's, net line at the bottom, the deuce box on the
 * left and the ad box on the right — with each zone's share of that court's
 * serves standing in its third of the box as a column from the net line.
 * The lines are `half-court-svg.tsx`'s, drawn from the same constants
 * (`serve-zones.ts`, the pure half of that widget); the surface and line
 * colours are the design system's serve-court pair.
 *
 * A picture only: `aria-hidden`, since the rows under it carry every count
 * in words. The columns are the three counts as shares; nothing here prints
 * a number. Over the drawing, one hit area per zone with serves: a dark
 * readout names the court, the zone and its count on hover, and when
 * `href` gives the zone a film to open it is a link to it.
 */
export function ServeCourt({
  courts,
  sides,
  href,
}: {
  courts: AskServeVisual["courts"];
  sides: Record<ServeCourtSide, number>;
  /** The Video tab on this court's serves into this zone, when there is one match to open. */
  href?: (side: ServeCourtSide, zone: ServeZoneKey) => string | null;
}) {
  const boxes = (["deuce", "ad"] as const).map((side) => {
    const court = courts[sides[side]];
    return {
      side,
      label: court.label,
      court,
      cells: serveCourtCells(side, {
        t: court.t.value,
        body: court.body.value,
        wide: court.wide.value,
      }),
    };
  });
  const boxMiddle: Record<ServeCourtSide, number> = {
    deuce: (SINGLES_LEFT + CENTER_X) / 2,
    ad: (CENTER_X + SINGLES_RIGHT) / 2,
  };

  return (
    <div className="relative w-full max-w-[320px]">
      <svg
        aria-hidden="true"
        data-ask-serve-court=""
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        className="block w-full"
      >
        {/* Court surface */}
        <rect
          x={0}
          y={0}
          width={COURT_W}
          height={COURT_H}
          fill="var(--player-1-soft)"
        />
        {/* Doubles outline — top and sides */}
        <line x1={DOUBLES_LEFT} y1={0} x2={DOUBLES_RIGHT} y2={0} {...LINE} />
        <line
          x1={DOUBLES_LEFT}
          y1={0}
          x2={DOUBLES_LEFT}
          y2={BASELINE_Y}
          {...LINE}
        />
        <line
          x1={DOUBLES_RIGHT}
          y1={0}
          x2={DOUBLES_RIGHT}
          y2={BASELINE_Y}
          {...LINE}
        />
        {/* Singles sidelines */}
        <line
          x1={SINGLES_LEFT}
          y1={0}
          x2={SINGLES_LEFT}
          y2={BASELINE_Y}
          {...LINE}
        />
        <line
          x1={SINGLES_RIGHT}
          y1={0}
          x2={SINGLES_RIGHT}
          y2={BASELINE_Y}
          {...LINE}
        />
        {/* The zones' shares, before the lines that cut the boxes so the lines read over them */}
        {boxes.map(({ side, cells }, boxIndex) =>
          cells.map(
            (cell, index) =>
              cell.height > 0 && (
                <rect
                  key={`${side}-${cell.zone}`}
                  data-ask-row=""
                  data-ask-zone={cell.zone}
                  data-ask-side={side}
                  x={cell.x}
                  y={cell.y}
                  width={cell.width}
                  height={cell.height}
                  fill={SERVE_ZONE_COLORS[cell.zone]}
                  style={{ "--ask-row": boxIndex * 3 + index } as CSSProperties}
                />
              ),
          ),
        )}
        {/* Service line, net line, centre service line */}
        <line
          x1={SINGLES_LEFT}
          y1={SERVICE_Y}
          x2={SINGLES_RIGHT}
          y2={SERVICE_Y}
          {...LINE}
        />
        <line
          x1={DOUBLES_LEFT}
          y1={BASELINE_Y}
          x2={DOUBLES_RIGHT}
          y2={BASELINE_Y}
          {...LINE}
        />
        <line
          x1={CENTER_X}
          y1={SERVICE_Y}
          x2={CENTER_X}
          y2={BASELINE_Y}
          {...LINE}
        />
        {/* Which box is which, in the model's own words */}
        {boxes.map(({ side, label }) => (
          <text
            key={side}
            x={boxMiddle[side]}
            y={SERVICE_Y - 14}
            textAnchor="middle"
            fontSize={15}
            fill="var(--ink-500)"
          >
            {label}
          </text>
        ))}
      </svg>
      {/* One hit area per zone with serves, over its third of the box: the
          readout on hover, and the film when the zone has one to open. */}
      {boxes.map(({ side, label, court, cells }) =>
        cells.map((cell) => {
          if (cell.height === 0) return null;
          const words = `${label}, ${ZONE_LABEL[cell.zone]}: ${court[cell.zone].text}`;
          const target = href?.(side, cell.zone) ?? null;
          const style: CSSProperties = {
            left: percentX(cell.x),
            top: percentY(SERVICE_Y),
            width: percentW(cell.width),
            height: percentH(BASELINE_Y - SERVICE_Y),
          };
          const readout = (
            <VisualReadout className="bottom-full left-1/2 mb-1 -translate-x-1/2">
              {words}
            </VisualReadout>
          );
          return target ? (
            <Link
              key={`${side}-${cell.zone}`}
              href={target}
              data-ask-zone-watch={`${side}-${cell.zone}`}
              className="group absolute rounded-[var(--radius-element)] outline-none hover:bg-[var(--ink-900)]/5 focus-visible:shadow-[var(--focus-ring)]"
              style={style}
            >
              <span className="sr-only">{words}, open the film</span>
              {readout}
            </Link>
          ) : (
            <span
              key={`${side}-${cell.zone}`}
              aria-hidden="true"
              data-ask-zone-hover={`${side}-${cell.zone}`}
              className="group absolute"
              style={style}
            >
              {readout}
            </span>
          );
        }),
      )}
    </div>
  );
}
