"use client";

import { memo, useMemo } from "react";
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
import type { PanZoom, Size } from "./pan-zoom";
import {
  VizBandsOverlay,
  type VizBandsOverlayProps,
} from "./viz-bands-overlay";
import { buildReadout } from "./viz-readout";
import { nextMarkIndex } from "./viz-mark-roving";
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
 * ── How the zoom is applied (fix round 1) ───────────────────────────────────
 *
 * Round 1 put `transform: translate() scale(z)` on the wrapping HTML div. That
 * rasterises the SVG once at 595x948 and then stretches the bitmap, so the art
 * goes soft at 320% and `vector-effect="non-scaling-stroke"` — which the
 * handoff calls out explicitly — is inert, because from the SVG's point of
 * view nothing ever scaled.
 *
 * So: the wrapper is TRANSLATED only, and the zoom is the `<svg>` element's
 * own width/height (`artPx * z`) with the `viewBox` held fixed. The browser
 * re-renders the vectors at the real device size — crisp at any zoom — and
 * `non-scaling-stroke` now has a CTM to opt out of, so lines and mark outlines
 * keep a constant device thickness instead of fattening.
 *
 * Two consequences the rest of this file honours:
 * - anything positioned in ART-pixel space alongside the svg (the readout)
 *   multiplies by `z` itself, and needs no counter-scale — it lives outside
 *   the scaled svg and renders at its natural CSS size;
 * - the marks' own coordinates are viewBox units and do NOT depend on `z` or
 *   on the pan, which is what lets `MarkLayer` be `memo`'d away from both.
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

// Fix round 1: derived from `VIEWER_COURT` rather than transcribed from the
// frame's absolute coordinates, so moving the court moves its labels with it.
// The gaps are the handoff's own spacing, measured off its numbers:
// 112 = farServiceY - 4.5, 5 = farBaselineY - 9, 249/257 = netY + 13/21.
const ZONE_LABEL_Y = VIEWER_COURT.farServiceY - 4.5;
const COURT_SIDE_LABEL_Y = VIEWER_COURT.farBaselineY - 9;
const ZONE_PCT_Y = VIEWER_COURT.netY + 13;
const ZONE_COUNT_Y = VIEWER_COURT.netY + 21;
// The two service boxes' own centres — the frame's hand-entered 213 / 307.
const DEUCE_LABEL_X = (VIEWER_COURT.singlesLeft + VIEWER_COURT.centreX) / 2;
const AD_LABEL_X = (VIEWER_COURT.centreX + VIEWER_COURT.singlesRight) / 2;

const HOVER_MARK_R = 2.4;
const HOVER_HALO_R = 5.6;
/** The keyboard-only ring, outside the hover halo. */
const FOCUS_RING_R = 7.6;

/** The handoff's own highlighted-box alpha (P2b's `fill-opacity="0.09"`). */
const ZONE_HIGHLIGHT_OPACITY = 0.09;

/**
 * The readout's offset from its mark, and the box it is assumed to occupy
 * when deciding which side of the mark to hang from. The card is content-sized
 * with a `maxWidth`, so rather than measure it (and pay a second layout pass
 * on every hover) the flip uses the WORST case: if the widest possible card
 * would overflow the stage on that axis, hang it the other way. It can flip a
 * little early for a short card; it can never leave one clipped.
 */
const READOUT_OFFSET = 12;
const READOUT_MAX_W = 260;
const READOUT_MAX_H = 84;

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
  bands,
  transform,
  stage,
  panning,
  activeId,
  focusedId,
  rovingId,
  onActivate,
  onDeactivate,
  onRove,
}: {
  cut: Cut;
  chart: Chart;
  dots: VizDot[];
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  filters: VizFilters;
  subjectName: string;
  /**
   * The depth/contact band overlay's data (Phase 2B), or `null` on a cut
   * with no bands (Serve) or with the shading turned off. Passed as ONE
   * already-memoised object from the shell rather than assembled here: the
   * overlay is `memo`'d away from the pan, and rebuilding its props on every
   * pan frame would defeat that.
   */
  bands: VizBandsOverlayProps | null;
  transform: PanZoom;
  /** The stage the art is panned within — the readout flips inside it. */
  stage: Size;
  /** Suppresses the readout mid-drag (P2c: "the readout waits"). */
  panning: boolean;
  /**
   * Which mark the readout belongs to. Owned by the SHELL, not here: the
   * pan/zoom hook lives up there and has to be able to drop the active mark
   * the moment a press becomes a drag (fix round 1 #4), and a callback
   * reaching back up into this component's own state would have to be
   * threaded through the hook anyway. `onActivate`/`onDeactivate` must be
   * referentially stable — `MarkLayer`'s `memo` keys on them.
   */
  activeId: string | null;
  focusedId: string | null;
  /** The marks' single tab stop — see `viz-mark-roving.ts`. */
  rovingId: string | null;
  onActivate: (id: string, keyboard: boolean) => void;
  onDeactivate: (id: string) => void;
  onRove: (id: string) => void;
}) {
  const heat = chart === "heat";
  const showMarks = chart === "scatter";
  const apron = heat ? HEAT_APRON_FILL : APRON_FILL;
  const court = heat ? HEAT_COURT_FILL : COURT_FILL;
  const vb = VIEWER_COURT.viewBox;
  const z = transform.z;

  const highlighted = cut === "serve" ? highlightedZoneKeys(filters) : null;

  const active = panning ? null : (dots.find((d) => d.id === activeId) ?? null);
  const activeMeta = active?.meta ?? null;
  const readout = activeMeta
    ? buildReadout(activeMeta, { subject: subjectName }, cut)
    : null;

  let readoutStyle: React.CSSProperties | null = null;
  if (active !== null && readout !== null) {
    const p = projectViewerDot(cut, active);
    const art = viewerArtPoint(p.x, p.y);
    // Art px -> layer px (the svg is `artPx * z`), then -> stage px (the
    // wrapper is translated by px/py).
    const layerX = art.x * z;
    const layerY = art.y * z;
    const flipX =
      transform.px + layerX + READOUT_OFFSET + READOUT_MAX_W > stage.w;
    const flipY =
      transform.py + layerY + READOUT_OFFSET + READOUT_MAX_H > stage.h;
    readoutStyle = {
      ...DARK_READOUT_STYLE,
      left: layerX,
      top: layerY,
      minWidth: 168,
      maxWidth: READOUT_MAX_W,
      transform: `translate(${
        flipX ? `calc(-100% - ${READOUT_OFFSET}px)` : `${READOUT_OFFSET}px`
      }, ${
        flipY ? `calc(-100% - ${READOUT_OFFSET}px)` : `${READOUT_OFFSET}px`
      })`,
    };
  }

  return (
    <div
      data-court=""
      className="absolute top-0 left-0"
      style={{
        width: VIEWER_COURT.artPx.w * z,
        height: VIEWER_COURT.artPx.h * z,
        transformOrigin: "0 0",
        // TRANSLATE ONLY — see the file docstring. `will-change: transform` is
        // deliberately absent: it promotes the layer to its own texture, which
        // is exactly what blurs the art here.
        transform: `translate(${transform.px}px, ${transform.py}px)`,
      }}
    >
      <svg
        width={VIEWER_COURT.artPx.w * z}
        height={VIEWER_COURT.artPx.h * z}
        viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${subjectName} — full court, ${dots.length} mark${dots.length === 1 ? "" : "s"}`}
        className="absolute top-0 left-0 block"
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

        {/* Under the court lines and the marks: the bands are the ground
            the landings sit on, and a wash drawn over a hairline would
            make the baseline itself look dimmed. Outside `MarkLayer` and
            memo'd on its own props, so a pan frame never re-renders it. */}
        {bands !== null && <VizBandsOverlay {...bands} />}

        <CourtLines />

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

        {showMarks && (
          <MarkLayer
            cut={cut}
            dots={dots}
            subjectName={subjectName}
            activeId={activeId}
            focusedId={focusedId}
            rovingId={rovingId}
            onActivate={onActivate}
            onDeactivate={onDeactivate}
            onRove={onRove}
          />
        )}
      </svg>

      {readout !== null && readoutStyle !== null && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute flex flex-col gap-1.5 px-3 pt-2.5 pb-[11px] ${DARK_READOUT_CLASS}`}
          style={readoutStyle}
        >
          <span className="text-[12px] font-medium text-white">
            {readout.title}
          </span>
          {readout.lines.map((line, index) => (
            <span
              key={index}
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

/* ── The court itself ───────────────────────────────────────────────────── */

/**
 * Static geometry, so it never re-renders with the zoom or the pan. Every
 * line carries `vector-effect="non-scaling-stroke"`, which is only meaningful
 * now that the `<svg>` itself is the thing being scaled (see the file
 * docstring) — the court keeps hairlines at 320% instead of fattening them.
 */
const CourtLines = memo(function CourtLines() {
  const left = VIEWER_COURT.doubles.x;
  const right = VIEWER_COURT.doubles.x + VIEWER_COURT.doubles.w;
  const top = VIEWER_COURT.farBaselineY;
  const bottom = VIEWER_COURT.nearBaselineY;
  const centreMark = 8;
  const segments: [number, number, number, number][] = [
    [left, top, right, top],
    [left, bottom, right, bottom],
    [left, top, left, bottom],
    [right, top, right, bottom],
    [VIEWER_COURT.singlesLeft, top, VIEWER_COURT.singlesLeft, bottom],
    [VIEWER_COURT.singlesRight, top, VIEWER_COURT.singlesRight, bottom],
    [
      VIEWER_COURT.singlesLeft,
      VIEWER_COURT.farServiceY,
      VIEWER_COURT.singlesRight,
      VIEWER_COURT.farServiceY,
    ],
    [
      VIEWER_COURT.singlesLeft,
      VIEWER_COURT.nearServiceY,
      VIEWER_COURT.singlesRight,
      VIEWER_COURT.nearServiceY,
    ],
    [
      VIEWER_COURT.centreX,
      VIEWER_COURT.farServiceY,
      VIEWER_COURT.centreX,
      VIEWER_COURT.nearServiceY,
    ],
    [VIEWER_COURT.centreX, top, VIEWER_COURT.centreX, top + centreMark],
    [VIEWER_COURT.centreX, bottom - centreMark, VIEWER_COURT.centreX, bottom],
  ];
  return (
    <>
      <g
        stroke={LINE_COLOR}
        strokeWidth={VIEWER_COURT.lineWidth}
        fill="none"
        vectorEffect="non-scaling-stroke"
      >
        {segments.map(([x1, y1, x2, y2], index) => (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
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
    </>
  );
});

/* ── Marks ──────────────────────────────────────────────────────────────── */

/**
 * Every mark, memoised away from the transform (fix round 1). A mark's
 * coordinates are viewBox units, so neither the pan (which lives on the
 * wrapper's `translate`) nor the zoom (which lives on the `<svg>`'s width and
 * height) changes a single one of them — this subtree can and must sit still
 * through a drag. Only `activeId`/`focusedId` move it.
 *
 * `buildReadout` runs here ONCE per dot per dot-array change, not per mark per
 * render, and produces both the hover title and the full announced label
 * (title + every line, fix round 1 #9 — a sighted user gets the card, a
 * screen-reader user must get the same facts).
 */
const MarkLayer = memo(function MarkLayer({
  cut,
  dots,
  subjectName,
  activeId,
  focusedId,
  rovingId,
  onActivate,
  onDeactivate,
  onRove,
}: {
  cut: Cut;
  dots: VizDot[];
  subjectName: string;
  activeId: string | null;
  focusedId: string | null;
  /** Final review #3: the ONE mark that is a tab stop. `null` means "the
   *  first one" — nobody has moved within the group yet. */
  rovingId: string | null;
  onActivate: (id: string, keyboard: boolean) => void;
  onDeactivate: (id: string) => void;
  onRove: (id: string) => void;
}) {
  const placed = useMemo(
    () =>
      dots.map((dot) => {
        const { x, y } = projectViewerDot(cut, dot);
        const label = dot.meta
          ? (() => {
              const r = buildReadout(dot.meta, { subject: subjectName }, cut);
              return [r.title, ...r.lines].join(" — ");
            })()
          : `${subjectName} — mark`;
        return { dot, x, y, fill: fillFor(dot), label };
      }),
    [dots, cut, subjectName],
  );

  // The tab stop: whichever mark was last focused, else the first. A
  // `rovingId` left over from a previous dot set (a filter edit) no longer
  // matches anything, so it falls back rather than leaving the group with no
  // entry point at all.
  const rovingIndex = Math.max(
    0,
    placed.findIndex(({ dot }) => dot.id === rovingId),
  );

  function handleKeyDown(
    e: React.KeyboardEvent<SVGGElement>,
    index: number,
  ): void {
    const next = nextMarkIndex(index, placed.length, e.key);
    if (next === null) {
      // Still swallow an arrow the group owns but cannot act on (the first
      // or last mark), so it doesn't fall through to the viewer's window
      // handler and pan the court out from under the focused mark.
      if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = placed[next].dot.id;
    onRove(target);
    // The tab stop moves with focus, so the DOM node for `target` is the one
    // to focus — found by its own data attribute inside THIS svg, rather than
    // a ref array that would have to be rebuilt for every dot on every
    // filter change.
    const node = e.currentTarget
      .closest("svg")
      ?.querySelector(`[data-viz-mark="${CSS.escape(target)}"]`);
    if (node instanceof SVGElement || node instanceof HTMLElement) {
      node.focus();
    }
  }

  return (
    <>
      {placed.map(({ dot, x, y, fill, label }, index) => {
        const isActive = dot.id === activeId;
        const isFocused = dot.id === focusedId;
        return (
          <g
            key={dot.id}
            data-viz-mark={dot.id}
            // Final review #3: a roving tabindex — ONE tab stop for the whole
            // court, not one per mark. On `rallyPosition` that was 150-250
            // Tab presses before a keyboard user reached the View menu.
            tabIndex={index === rovingIndex ? 0 : -1}
            role="img"
            aria-label={label}
            className="cursor-pointer outline-none"
            onMouseEnter={() => onActivate(dot.id, false)}
            onMouseLeave={() => onDeactivate(dot.id)}
            onFocus={(e) =>
              onActivate(dot.id, e.currentTarget.matches(":focus-visible"))
            }
            onBlur={() => onDeactivate(dot.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {isFocused && (
              // Fix round 1 #10: a keyboard-only ring OUTSIDE the hover halo.
              // `outline-none` alone left a focused mark indistinguishable
              // from a hovered one; this is the affordance the outline was.
              <circle
                cx={x}
                cy={y}
                r={FOCUS_RING_R}
                fill="none"
                stroke="var(--ink-900)"
                strokeWidth={1.4}
                strokeOpacity={0.85}
                vectorEffect="non-scaling-stroke"
              />
            )}
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
            <Mark dot={dot} x={x} y={y} fill={fill} active={isActive} />
          </g>
        );
      })}
    </>
  );
});

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
  x,
  y,
  fill,
  active,
}: {
  dot: VizDot;
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
        // RULING (fix round 1): triangles are apex-UP on screen. This frame is
        // drawn upright with no group rotation — unlike the in-shell return
        // frames, whose own `rotate(90)`/`rotate(180deg)` is exactly what the
        // "contact"/"placement" kinds pre-compensate for. Here the unrotated
        // "serve" kind IS apex-up; pinned by `tests/court-geometry.spec.ts`.
        points={trianglePointsFor("serve", x, y, r)}
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
        <text x={DEUCE_LABEL_X} y={COURT_SIDE_LABEL_Y}>
          DEUCE COURT
        </text>
        <text x={AD_LABEL_X} y={COURT_SIDE_LABEL_Y}>
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
            const cell = zoneCellX(index);
            const cx = (cell.x1 + cell.x2) / 2;
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
