import type { CSSProperties } from "react";
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

/** T, Body and Wide in the three blue steps — the same key the bars use. */
export const SERVE_ZONE_COLORS: Record<ServeZoneKey, string> = {
  t: "var(--viz-you)",
  body: "var(--viz-you-mid)",
  wide: "var(--viz-you-light)",
};

const LINE = {
  stroke: "var(--viz-court-fill)",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
};

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
 * a number.
 */
export function ServeCourt({
  courts,
  sides,
}: {
  courts: AskServeVisual["courts"];
  sides: Record<ServeCourtSide, number>;
}) {
  const boxes = (["deuce", "ad"] as const).map((side) => {
    const court = courts[sides[side]];
    return {
      side,
      label: court.label,
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
    <svg
      aria-hidden="true"
      data-ask-serve-court=""
      viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
      className="block w-full max-w-[320px]"
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
  );
}
