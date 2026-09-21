"use client";

import { useState } from "react";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import {
  ACE_STAR_FILL,
  APRON_FILL,
  COURT_FILL,
  HEAT_APRON_FILL,
  HEAT_COURT_FILL,
  HeatLayer,
  LINE_COLOR,
  VIEWER_MISS_FILL,
} from "./court-art";
import {
  VIEWER_COURT,
  VIEWER_HEAT_DOT_RADIUS,
  projectViewerDot,
  starPoints,
  trianglePointsFor,
  viewerArtPoint,
  viewerHeatFilterRegion,
  zoneCellX,
} from "./court-geometry";
import type { PanZoom } from "./pan-zoom";
import { buildReadout } from "./viz-readout";
import type { Chart, Cut, VizDot, VizFilters } from "./viz-model";

/**
 * The fullscreen viewer's court (Phase 2A, Task 4; f4b-report P2b/P2c) — one
 * upright, full-length court drawn from `VIEWER_COURT`, inside a pan/zoom
 * layer the shell (`viz-fullscreen.tsx`) drives through `use-pan-zoom.ts`.
 *
 * It is NOT `court-art.tsx`: that component draws the two in-shell frames
 * (the cropped serve half, the rotated landscape return frame), each with its
 * own group transforms, sized to fit a card. The viewer needs a single stable
 * frame that survives a cut change so pan/zoom has something continuous to
 * operate on. What the two DO share is the heat pipeline — `HeatLayer`,
 * extracted out of `court-art.tsx` for exactly this, so the blobs, the ramp
 * and the `atNet` exclusion can never diverge between them.
 *
 * Every line and mark carries `vector-effect: non-scaling-stroke`, so 320%
 * zoom does not fatten a hairline or a dot's outline (P2c's stated rule).
 */

/* ── Type scale inside the art ───────────────────────────────────────────── */
// These are SVG `font-size` ATTRIBUTES in viewBox units, not CSS `text-[Npx]`
// — the art scales with the zoom, so they are part of the drawing's geometry
// (they come straight from the handoff's own markup), not of the type scale
// `scripts/check-design-drift.mjs` polices.
const ZONE_LABEL_SIZE = 6;
const COURT_SIDE_LABEL_SIZE = 6;
const ZONE_PCT_SIZE = 6.4;
const ZONE_COUNT_SIZE = 5.6;
const ZONE_LABEL_Y = 112;
const COURT_SIDE_LABEL_Y = 5;
const ZONE_PCT_Y = 249;
const ZONE_COUNT_Y = 257;

const HOVER_MARK_R = 2.4;
const HOVER_HALO_R = 5.6;

/** The handoff's own highlighted-box alpha (P2b's `fill-opacity="0.09"`). */
const ZONE_HIGHLIGHT_OPACITY = 0.09;

function fillFor(dot: VizDot): string {
  if (dot.shape === "star") return ACE_STAR_FILL;
  if (dot.outcome === "won") return "var(--viz-good)";
  if (dot.outcome === "lost") return "var(--viz-bad)";
  // P2b: the viewer's miss grey is the literal, not `--ink-300` — its stage is
  // not a white card.
  return VIEWER_MISS_FILL;
}

/**
 * The service-box cells the active Zone filter (narrowed by the Court filter,
 * when one is set) picks out — the handoff's single highlighted box
 * generalised to "whatever the filters actually select", so the highlight can
 * never claim a zone the dots aren't filtered to. No zone filter ⇒ no
 * highlight at all.
 */
function highlightedZoneKeys(filters: VizFilters): Set<ZoneKey> {
  const keys = new Set<ZoneKey>();
  if (filters.zone.length === 0) return keys;
  for (const zone of ZONES) {
    const family = zone.label.toLowerCase(); // "wide" | "body" | "t"
    const side = zone.key.startsWith("ad-") ? "ad" : "deuce";
    if (!filters.zone.some((v) => v === family)) continue;
    if (filters.court.length > 0 && !filters.court.some((v) => v === side)) {
      continue;
    }
    keys.add(zone.key);
  }
  return keys;
}

export function VizFullscreenCourt({
  cut,
  chart,
  dots,
  zoneStats,
  filters,
  subjectName,
  transform,
  panning,
}: {
  cut: Cut;
  chart: Chart;
  dots: VizDot[];
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  filters: VizFilters;
  subjectName: string;
  transform: PanZoom;
  /** Suppresses the readout mid-drag (P2c: "the readout waits"). */
  panning: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const heat = chart === "heat";
  const showMarks = chart === "scatter";
  const apron = heat ? HEAT_APRON_FILL : APRON_FILL;
  const court = heat ? HEAT_COURT_FILL : COURT_FILL;
  const vb = VIEWER_COURT.viewBox;

  const highlighted = cut === "serve" ? highlightedZoneKeys(filters) : null;
  const active = panning ? null : (dots.find((d) => d.id === activeId) ?? null);
  const activeMeta = active?.meta ?? null;
  const readout = activeMeta
    ? buildReadout(activeMeta, { subject: subjectName }, cut)
    : null;
  const readoutAt =
    active !== null
      ? (() => {
          const p = projectViewerDot(cut, active);
          return viewerArtPoint(p.x, p.y);
        })()
      : null;

  return (
    <div
      data-court=""
      className="absolute top-0 left-0"
      style={{
        width: VIEWER_COURT.artPx.w,
        height: VIEWER_COURT.artPx.h,
        transformOrigin: "0 0",
        transform: `translate(${transform.px}px, ${transform.py}px) scale(${transform.z})`,
        willChange: "transform",
      }}
    >
      <svg
        viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${subjectName} — full court, ${dots.length} mark${dots.length === 1 ? "" : "s"}`}
        className="absolute inset-0 block h-full w-full"
      >
        <rect x={vb.minX} y={vb.minY} width={vb.w} height={vb.h} fill={apron} />
        <rect
          x={VIEWER_COURT.doubles.x}
          y={VIEWER_COURT.doubles.y}
          width={VIEWER_COURT.doubles.w}
          height={VIEWER_COURT.doubles.h}
          fill={court}
        />
        <rect
          x={VIEWER_COURT.singlesLeft}
          y={VIEWER_COURT.doubles.y}
          width={VIEWER_COURT.singlesRight - VIEWER_COURT.singlesLeft}
          height={VIEWER_COURT.doubles.h}
          fill={court}
        />

        {highlighted !== null &&
          ZONES.map((zone, index) => {
            if (!highlighted.has(zone.key)) return null;
            const cell = zoneCellX(index);
            return (
              <rect
                key={zone.key}
                x={cell.x1}
                y={VIEWER_COURT.farServiceY}
                width={cell.x2 - cell.x1}
                height={VIEWER_COURT.netY - VIEWER_COURT.farServiceY}
                fill={LINE_COLOR}
                fillOpacity={ZONE_HIGHLIGHT_OPACITY}
              />
            );
          })}

        <g
          stroke={LINE_COLOR}
          strokeWidth={VIEWER_COURT.lineWidth}
          fill="none"
          vectorEffect="non-scaling-stroke"
        >
          {/* Baselines */}
          <line
            x1={VIEWER_COURT.doubles.x}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w}
            y2={VIEWER_COURT.farBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.doubles.x}
            y1={VIEWER_COURT.nearBaselineY}
            x2={VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          {/* Doubles sidelines */}
          <line
            x1={VIEWER_COURT.doubles.x}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.doubles.x}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          {/* Singles sidelines */}
          <line
            x1={VIEWER_COURT.singlesLeft}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.singlesLeft}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.singlesRight}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.singlesRight}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
          {/* Service lines */}
          <line
            x1={VIEWER_COURT.singlesLeft}
            y1={VIEWER_COURT.farServiceY}
            x2={VIEWER_COURT.singlesRight}
            y2={VIEWER_COURT.farServiceY}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.singlesLeft}
            y1={VIEWER_COURT.nearServiceY}
            x2={VIEWER_COURT.singlesRight}
            y2={VIEWER_COURT.nearServiceY}
            vectorEffect="non-scaling-stroke"
          />
          {/* Centre service line, and the two centre marks on the baselines */}
          <line
            x1={VIEWER_COURT.centreX}
            y1={VIEWER_COURT.farServiceY}
            x2={VIEWER_COURT.centreX}
            y2={VIEWER_COURT.nearServiceY}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.centreX}
            y1={VIEWER_COURT.farBaselineY}
            x2={VIEWER_COURT.centreX}
            y2={VIEWER_COURT.farBaselineY + 8}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VIEWER_COURT.centreX}
            y1={VIEWER_COURT.nearBaselineY - 8}
            x2={VIEWER_COURT.centreX}
            y2={VIEWER_COURT.nearBaselineY}
            vectorEffect="non-scaling-stroke"
          />
        </g>

        <line
          x1={VIEWER_COURT.netX1}
          y1={VIEWER_COURT.netY}
          x2={VIEWER_COURT.netX2}
          y2={VIEWER_COURT.netY}
          stroke={LINE_COLOR}
          strokeWidth={VIEWER_COURT.netWidth}
          vectorEffect="non-scaling-stroke"
        />

        {cut === "serve" && (
          <ServeBoxLabels zoneStats={zoneStats} subjectName={subjectName} />
        )}

        {heat && (
          <HeatLayer
            cut={cut}
            dots={dots}
            project={heatProjectorFor(cut)}
            radius={VIEWER_HEAT_DOT_RADIUS}
            region={viewerHeatFilterRegion()}
          />
        )}

        {showMarks &&
          dots.map((dot) => {
            const { x, y } = projectViewerDot(cut, dot);
            const fill = fillFor(dot);
            const isActive = dot.id === activeId;
            const label = dot.meta
              ? buildReadout(dot.meta, { subject: subjectName }, cut).title
              : `${subjectName} — mark`;
            return (
              <g
                key={dot.id}
                tabIndex={0}
                role="img"
                aria-label={label}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveId(dot.id)}
                onMouseLeave={() =>
                  setActiveId((prev) => (prev === dot.id ? null : prev))
                }
                onFocus={() => setActiveId(dot.id)}
                onBlur={() =>
                  setActiveId((prev) => (prev === dot.id ? null : prev))
                }
              >
                {isActive && (
                  <circle
                    cx={x}
                    cy={y}
                    r={HOVER_HALO_R}
                    fill="none"
                    stroke={LINE_COLOR}
                    strokeWidth={0.7}
                    strokeOpacity={0.55}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <Mark
                  dot={dot}
                  cut={cut}
                  x={x}
                  y={y}
                  fill={fill}
                  active={isActive}
                />
              </g>
            );
          })}
      </svg>

      {readout !== null && readoutAt !== null && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute flex flex-col gap-1.5 px-3 pt-2.5 pb-[11px] ${DARK_READOUT_CLASS}`}
          style={{
            ...DARK_READOUT_STYLE,
            left: readoutAt.x,
            top: readoutAt.y,
            minWidth: 168,
            // Counter-scale: the card keeps its real type size at any zoom.
            // `scale` first, then `translate`, so the 12px offset is 12 SCREEN
            // pixels rather than 12 art units.
            transformOrigin: "0 0",
            transform: `scale(${1 / transform.z}) translate(12px, 12px)`,
          }}
        >
          <span className="text-[12px] font-medium text-white">
            {readout.title}
          </span>
          {readout.lines.map((line, index) => (
            <span
              key={line}
              className={
                index === readout.monoLine
                  ? "mono tabular text-[11px]"
                  : "text-[11px]"
              }
              style={{
                color:
                  index === readout.monoLine
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(255,255,255,0.64)",
              }}
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The heat layer's per-dot projection for this frame — module-level per cut,
 * so `HeatLayer`'s own `useMemo` has a stable identity to key on (the same
 * contract `court-art.tsx` honours).
 */
const VIEWER_HEAT_PROJECTORS: Record<
  Cut,
  (dot: VizDot) => {
    cx: number;
    cy: number;
  }
> = {
  serve: (d) => toCxCy("serve", d),
  returnPlacement: (d) => toCxCy("returnPlacement", d),
  returnContact: (d) => toCxCy("returnContact", d),
  rallyPosition: (d) => toCxCy("rallyPosition", d),
};

function toCxCy(cut: Cut, dot: VizDot): { cx: number; cy: number } {
  const { x, y } = projectViewerDot(cut, dot);
  return { cx: x, cy: y };
}

function heatProjectorFor(cut: Cut) {
  return VIEWER_HEAT_PROJECTORS[cut];
}

function Mark({
  dot,
  cut,
  x,
  y,
  fill,
  active,
}: {
  dot: VizDot;
  cut: Cut;
  x: number;
  y: number;
  fill: string;
  active: boolean;
}) {
  const stroke = active ? LINE_COLOR : "#000";
  const strokeWidth = active ? 0.8 : VIEWER_COURT.markStroke;
  const r = active ? HOVER_MARK_R : VIEWER_COURT.markRadius;

  if (dot.shape === "star") {
    return (
      <polygon
        points={starPoints(x, y, r * 1.68)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (dot.shape === "triangle") {
    return (
      <polygon
        points={trianglePointsFor(
          cut === "serve" ? "serve" : "contact",
          x,
          y,
          r,
        )}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/**
 * The serve cut's service-box vocabulary (P2b): WIDE·BODY·T twice across the
 * far service boxes, DEUCE COURT / AD COURT above the far baseline, and each
 * zone's own `% / n` under the net — the SAME "points won" rate the stats
 * card prints (`ZoneStats.winPct`), never a second, differently-derived
 * figure. A zone with no serves in it prints nothing rather than "0% / 0".
 */
function ServeBoxLabels({
  zoneStats,
  subjectName,
}: {
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  subjectName: string;
}) {
  return (
    <>
      <g
        fill={LINE_COLOR}
        fillOpacity={0.5}
        fontFamily="var(--font-mono)"
        fontSize={COURT_SIDE_LABEL_SIZE}
        letterSpacing={0.6}
        textAnchor="middle"
        aria-hidden="true"
      >
        <text x={213} y={COURT_SIDE_LABEL_Y}>
          DEUCE COURT
        </text>
        <text x={307} y={COURT_SIDE_LABEL_Y}>
          AD COURT
        </text>
      </g>
      <g
        fill={LINE_COLOR}
        fillOpacity={0.66}
        fontFamily="var(--font-mono)"
        fontSize={ZONE_LABEL_SIZE}
        letterSpacing={0.6}
        textAnchor="middle"
        aria-hidden="true"
      >
        {ZONES.map((zone, index) => {
          const cell = zoneCellX(index);
          return (
            <text key={zone.key} x={(cell.x1 + cell.x2) / 2} y={ZONE_LABEL_Y}>
              {zone.label.toUpperCase()}
            </text>
          );
        })}
      </g>
      {zoneStats !== null && (
        <g textAnchor="middle" fill={LINE_COLOR}>
          {ZONES.map((zone, index) => {
            const stats = zoneStats[zone.key];
            if (stats.count === 0) return null;
            const cx = (zoneCellX(index).x1 + zoneCellX(index).x2) / 2;
            return (
              <g key={zone.key}>
                <title>{`${subjectName} — ${zone.label}: ${stats.winPct}% of ${stats.count} points won`}</title>
                <text
                  x={cx}
                  y={ZONE_PCT_Y}
                  fontFamily="var(--font-sans)"
                  fontSize={ZONE_PCT_SIZE}
                >
                  {stats.winPct}%
                </text>
                <text
                  x={cx}
                  y={ZONE_COUNT_Y}
                  fontFamily="var(--font-mono)"
                  fontSize={ZONE_COUNT_SIZE}
                  fillOpacity={0.6}
                >
                  {stats.count}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </>
  );
}
