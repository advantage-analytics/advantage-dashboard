"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { useDismissOnNextPress } from "@/hooks/use-long-press";
import { ZONES, type ZoneKey, type ZoneStats } from "@/lib/data/serve-zones";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import {
  ACE_STAR_FILL,
  ACE_STAR_RADIUS_RATIO,
  APPROACH_LABEL_INK,
  APPROACH_LABEL_TRACKING,
  APPROACH_LANE_LABEL_OPACITY,
  APPROACH_SIDE_LABEL_OPACITY,
  APRON_FILL,
  approachLaneText,
  approachLeftLaneSide,
  COURT_FILL,
  HEAT_APRON_FILL,
  HEAT_COURT_FILL,
  HeatLayer,
  LINE_COLOR,
  outcomeColor,
  VIEWER_MISS_FILL,
} from "./court-art";
import {
  VIEWER_COURT,
  VIEWER_HEAT_DOT_RADIUS,
  projectViewerDot,
  starPoints,
  trianglePointsFor,
  viewerApproachLabelScale,
  viewerArtPoint,
  viewerHeatFilterRegion,
  viewerBandEdges,
  zoneCellX,
  zoneOpacity,
} from "./court-geometry";
import type { PanZoom, Size } from "./pan-zoom";
import {
  BAND_BLEED,
  VizBandsOverlay,
  type VizBandsOverlayProps,
} from "./viz-bands-overlay";
import {
  buildMarkReadout,
  buildReadout,
  buildZoneReadout,
  markClickHint,
  placeApronReadout,
  placeReadout,
  type PairPart,
} from "./viz-readout";
import { nextMarkIndex } from "./viz-mark-roving";
import { isPlacementCut } from "./cut-kinds";
import type { Hand } from "../match-filters/shot-geometry";
import {
  type Chart,
  type Cut,
  type VizDot,
  type VizFilters,
} from "./viz-model";

/**
 * The lightbox's court (once the fullscreen viewer's, Phase 2A) — one
 * upright, full-length court drawn from `VIEWER_COURT`, inside a pan/zoom
 * layer the lightbox (`viz-lightbox.tsx`) drives through `use-pan-zoom.ts`.
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
 * - anything positioned in ART-pixel space alongside the svg multiplies by
 *   `z` itself, and needs no counter-scale — it lives outside the scaled svg
 *   and renders at its natural CSS size;
 * - the readout is a sibling of the translated layer, in STAGE pixels, so it
 *   paints above the viewer's chrome slabs and is clamped to the stage itself;
 * - the marks' own coordinates are viewBox units and do NOT depend on `z` or
 *   on the pan, which is what lets `MarkLayer` be `memo`'d away from both.
 */

/** A Statistics row's place on the court: a serve zone, or a band. */
export type CourtOutline =
  | { kind: "zone"; key: ZoneKey }
  | {
      kind: "band";
      band: "depth" | "contact";
      dividersFt: number[];
      index: number;
    };

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

// The Approaches apron (`VIEWER_APPROACH_FRAME`'s apron past each
// baseline): "Placement" and the wing names above the far baseline, "Contact"
// below the near one — on the apron only, never on the court.
//
// T23: the opened court multiplies these by `viewerApproachLabelScale`, so
// they open no smaller than a landing cut's band labels (5.6 units at that
// cut's zoom) — the wing names at a hair over that, the side words a step
// up. They are the lightbox's own: the wall card's `ApproachCourtArt` keeps
// `court-art.tsx`'s `APPROACH_*_LABEL_SIZE`.
const APPROACH_LIGHTBOX_SIDE_SIZE = 6.4;
const APPROACH_LIGHTBOX_LANE_SIZE = 5.8;
// The lines are stacked by the face's own extent rather than at fixed Ys,
// so they clear each other at every scale: a line's box runs about an
// ascent above its baseline and a descent below it (`--font-mono`'s metrics,
// rounded up), and `APPROACH_APRON_GAP` units (× the scale) separate a line
// from the next and the wing line from the baseline.
const APRON_FONT_ASCENT = 1.05;
const APRON_FONT_DESCENT = 0.3;
const APPROACH_APRON_GAP = 1.2;

/** The apron words' sizes and baselines at `scale`. */
function approachApronLayout(scale: number) {
  const side = APPROACH_LIGHTBOX_SIDE_SIZE * scale;
  const lane = APPROACH_LIGHTBOX_LANE_SIZE * scale;
  const gap = APPROACH_APRON_GAP * scale;
  const laneY = VIEWER_COURT.farBaselineY - gap - APRON_FONT_DESCENT * lane;
  return {
    side,
    lane,
    laneY,
    placementY:
      laneY - APRON_FONT_ASCENT * lane - gap - APRON_FONT_DESCENT * side,
    contactY: VIEWER_COURT.nearBaselineY + gap + APRON_FONT_ASCENT * side,
  };
}
/** Centre of each hitter's-view third of the singles court (`laneOf`). */
const APPROACH_LANE_X = (() => {
  const third = (VIEWER_COURT.singlesRight - VIEWER_COURT.singlesLeft) / 3;
  return {
    left: VIEWER_COURT.singlesLeft + third / 2,
    middle: VIEWER_COURT.centreX,
    right: VIEWER_COURT.singlesRight - third / 2,
  } as const;
})();

/** P2m: while the band editor is open the marks (and heat) sit back at 35%
 *  so the dividers and their labels read first. */
const EDITING_ART_OPACITY = 0.35;

/** The lightbox draws its court lines 1.3× the viewer's, in viewBox units,
 *  so they scale with the drawn court rather than staying a fixed px. */
const LINE_SCALE = 1.3;
/** The selection ring: the shipped active treatment — the mark at its own
 *  size, a 1.5px white ring at its radius + 3. */
const SELECTED_RING_R = VIEWER_COURT.markRadius + 3;
const SELECTED_RING_W = 1.5;
/** An active (hovered, focused or selected) mark's glyph scale — the same
 *  `scale(1.4)` as globals.css `[data-viz-mark][data-active]
 *  [data-viz-mark-glyph]`; change both together. */
const ACTIVE_GLYPH_SCALE = 1.4;
/** The siblings of a selected mark sit back at 40%. */
const UNSELECTED_OPACITY = 0.4;
/** The mark readout's narrowest width (canvas S04). */
const MIN_READOUT_W = 168;
/** The keyboard-only ring, outside the hover halo. */
const FOCUS_RING_R = 7.6;
/** A mark's hit area: its own radius and a little more for the hand, so the
 *  readout only answers on the point itself. */
const MARK_HIT_R = VIEWER_COURT.markRadius + 1.6;
/** The hit area's screen-space margin (a non-scaling stroke, half of it
 *  outside the radius): a few pixels however far the court is zoomed out. */
const MARK_HIT_FLOOR_PX = 6;

/** A pair's readout, hung off its mark on the side `placeApronReadout`
 *  chose: the near edge at the anchor, centred on its height — or, above or
 *  below, centred under/over it as every other readout. */
const APRON_READOUT_TRANSFORM: Record<
  "left" | "right" | "above" | "below",
  string
> = {
  left: "translate(-100%, -50%)",
  right: "translate(0, -50%)",
  above: "translate(-50%, -100%)",
  below: "translate(-50%, 0)",
};

/** The handoff's own highlighted-box alpha (P2b's `fill-opacity="0.09"`). */
const ZONE_HIGHLIGHT_OPACITY = 0.09;

/**
 * The contact mark of an Approaches pair (`VizDot.pair`) on this frame, or
 * `null` for every other dot. `VIEWER_COURT` is already the upright full
 * court with the subject at the bottom, so the contact goes where every
 * contact cut draws its marks — the near half, `nearBaselineY + depthM` —
 * and the placement (the dot's own position) where every landing cut does:
 * the same two halves, and the same lateral sense, `projectApproachPair`
 * gives `FULL_COURT_VERTICAL`.
 */
export function pairContactPoint(
  cut: Cut,
  dot: VizDot,
): { x: number; y: number } | null {
  if (cut !== "approaches" || !dot.pair) return null;
  return projectViewerDot("returnContact", {
    lateralM: dot.pair.lateralM,
    depthM: dot.pair.depthM,
    atNet: false,
  });
}

function fillFor(dot: VizDot): string {
  if (dot.shape === "star") return ACE_STAR_FILL;
  // P2b: the viewer's miss grey is the literal, not `--ink-300` — its stage is
  // not a white card.
  return outcomeColor(dot.outcome, VIEWER_MISS_FILL);
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
  // The Zone and Court pills only: they filter by the MEASURED landing these
  // cells stand for. The advanced Serve › Zone and Court read the tracker's
  // label and the score's court, so a cell they named could hold none of
  // the dots they let through.
  const zones: readonly string[] = filters.zone;
  const courts: readonly string[] = filters.court;
  if (zones.length === 0) return keys;
  for (const zone of ZONES) {
    const family = zone.label.toLowerCase(); // "wide" | "body" | "t"
    const side = zone.key.startsWith("ad-") ? "ad" : "deuce";
    if (!zones.includes(family)) continue;
    if (courts.length > 0 && !courts.includes(side)) continue;
    keys.add(zone.key);
  }
  return keys;
}

export function LightboxCourt({
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
  selectedId,
  rovingId,
  onActivate,
  onDeactivate,
  onRove,
  onSelect,
  whereFor,
  matchFor,
  canWatchMark,
  focusIds = null,
  opponentHand,
  outline = null,
  onReadoutEnter,
  onReadoutLeave,
  editing = false,
  editorLayer = null,
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
  selectedId: string | null;
  /** The marks' single tab stop — see `viz-mark-roving.ts`. */
  rovingId: string | null;
  onActivate: (id: string, keyboard: boolean) => void;
  onDeactivate: (id: string) => void;
  onRove: (id: string) => void;
  onSelect: (id: string) => void;
  /** "Set 2 · Game 5 · You serving" for a point id — the readout's last
   *  line, read off the point by the lightbox. */
  whereFor?: (pointId: string) => string | null;
  /** "vs Lee · Nov 3" — which match a mark is from, on a court drawn over
   *  several (the season's); omitted on one match's court. */
  matchFor?: (dot: VizDot) => string | null;
  /** Whether a second click on this mark can watch it — the readout's hint
   *  says "Click to focus" alone when it cannot. Omitted: never. */
  canWatchMark?: (dot: VizDot) => boolean;
  /** A hovered Statistics row's marks: the rest sit back at 40%. */
  focusIds?: ReadonlySet<string> | null;
  /**
   * Approaches: the hand of whoever is NOT the court's subject, which sides
   * the apron's "Their FH" / "Their BH". `null` is a known-unknown hand, read
   * as right-handed like the rest of the cut. Omitted (a court over several
   * opponents, the season's), it is read off the dots
   * (`approachLeftLaneSide`): one known hand names their wings, anything
   * else the hitter's "Left · Middle · Right".
   */
  opponentHand?: Hand | null;
  /** The hovered or chosen Statistics row's zone or band, outlined dashed white. */
  outline?: CourtOutline | null;
  onReadoutEnter?: () => void;
  onReadoutLeave?: () => void;
  /**
   * Phase 2B, Task 4: the band editor is open. The marks and heat dim to 35%
   * and stop being interactive (no hover, no focus, no readout) — a hover
   * card popping up under a divider being dragged would sit on the very line
   * the coach is placing.
   */
  editing?: boolean;
  /**
   * The editor's handle layer (`VizBandsEditorHandles`), drawn in THIS
   * wrapper's px space so it rides the same translate as the art. `null`
   * outside edit mode.
   */
  editorLayer?: ReactNode;
}) {
  const heat = chart === "heat";
  const showMarks = chart === "scatter";
  const apron = heat ? HEAT_APRON_FILL : APRON_FILL;
  const court = heat ? HEAT_COURT_FILL : COURT_FILL;
  const vb = VIEWER_COURT.viewBox;
  const z = transform.z;
  // T23: the whole length opens at about half a landing cut's zoom, and the
  // art's type is in viewBox units — so the Approaches court's words are
  // drawn larger by the ratio of the two frames' fits on this stage. They
  // still scale with the zoom after that, as on every cut.
  const labelScale = cut === "approaches" ? viewerApproachLabelScale(stage) : 1;

  const highlighted = cut === "serve" ? highlightedZoneKeys(filters) : null;
  // The Zones chart IS its six cells — the same white wash, scaled to the
  // busiest zone, that `court-art.tsx` draws in-shell (`zoneOpacity`). The
  // viewer had only ever hidden the marks for this chart, which left a bare
  // court: the chart existed in the menu and drew nothing.
  const zoneCells =
    chart === "zones" && cut === "serve" && zoneStats !== null
      ? zoneStats
      : null;
  const maxZonePct = zoneCells
    ? Math.max(...ZONES.map((z) => zoneCells[z.key].pct))
    : 0;

  // Marks are drawn only on Scatter: one pinned there is not active on Zones,
  // where it would hold the readout for a mark nobody can see.
  const active =
    panning || editing || !showMarks
      ? null
      : (dots.find((d) => d.id === activeId) ?? null);
  const activeMeta = active?.meta ?? null;

  // An Approaches pair is ONE mark with two places on court: the readout
  // names the one last pointed at ("Contact" / "Placement") and hangs from
  // it. Placement is the default — a keyboard focus, or a selection never
  // pointed at.
  const [pairPart, setPairPart] = useState<{
    id: string;
    part: PairPart;
  } | null>(null);
  const pointPart = useCallback(
    (id: string, part: PairPart) => setPairPart({ id, part }),
    [],
  );
  const activeContact = active !== null ? pairContactPoint(cut, active) : null;
  const activePart: PairPart | null =
    activeContact === null
      ? null
      : pairPart !== null && active !== null && pairPart.id === active.id
        ? pairPart.part
        : "placement";

  const markReadout =
    active !== null && activeMeta
      ? buildMarkReadout(
          activeMeta,
          active.outcome,
          cut,
          activeMeta.pointId ? (whereFor?.(activeMeta.pointId) ?? null) : null,
          {
            match: matchFor?.(active) ?? null,
            hint: markClickHint(
              active.id === selectedId,
              canWatchMark?.(active) ?? false,
            ),
            part: activePart,
          },
        )
      : null;

  // A serve zone answers hover and a tap the way a mark does: the tap pins it
  // until the next press anywhere.
  const [hoveredZone, setHoveredZone] = useState<ZoneKey | null>(null);
  const [pinnedZone, setPinnedZone] = useState<ZoneKey | null>(null);
  const unpinZone = useCallback(() => setPinnedZone(null), []);
  useDismissOnNextPress(pinnedZone !== null, unpinZone);
  const activeZone =
    panning || editing || active !== null || zoneStats === null
      ? null
      : (hoveredZone ?? pinnedZone);
  const activeZoneStats = activeZone !== null ? zoneStats?.[activeZone] : null;
  const shownZone = activeZoneStats?.count ? activeZone : null;
  const zoneReadout =
    shownZone !== null && activeZoneStats
      ? buildZoneReadout(shownZone, activeZoneStats, { subject: subjectName })
      : null;

  const shownReadout = markReadout ?? zoneReadout;
  let readoutStyle: React.CSSProperties | null = null;
  let readoutSide: string | undefined;
  if (shownReadout !== null) {
    // Viewbox -> art px -> layer px (the svg is `artPx * z`) -> stage px (the
    // wrapper is translated by px/py). A zone hangs from the net, so the card
    // sits over its cell and leaves the percentage below the net readable.
    let art: { x: number; y: number } | null = null;
    if (active !== null && markReadout !== null) {
      const p =
        activePart === "contact" && activeContact !== null
          ? activeContact
          : projectViewerDot(cut, active);
      art = viewerArtPoint(p.x, p.y);
    } else if (shownZone !== null) {
      const cell = zoneCellX(ZONES.findIndex((z) => z.key === shownZone));
      art = viewerArtPoint((cell.x1 + cell.x2) / 2, VIEWER_COURT.netY);
    }
    if (art !== null) {
      // A mark's card clears its selection ring by 8px; the ring's radius is
      // in viewBox units, scaled to stage px through the art.
      const ringPx =
        (SELECTED_RING_R * VIEWER_COURT.artPx.w * z) / VIEWER_COURT.viewBox.w;
      const anchor = {
        x: transform.px + art.x * z,
        y: transform.py + art.y * z,
      };
      if (activeContact !== null) {
        // A pair's card opens outward into the apron beside the court, so it
        // never lies over the other half's marks (`placeApronReadout`).
        const centre =
          transform.px + viewerArtPoint(VIEWER_COURT.centreX, 0).x * z;
        const place = placeApronReadout(anchor, stage, centre, ringPx + 8);
        readoutSide = place.side;
        readoutStyle = {
          ...DARK_READOUT_STYLE,
          left: place.left,
          top: place.top,
          minWidth: Math.min(MIN_READOUT_W, place.width),
          maxWidth: place.width,
          transform: APRON_READOUT_TRANSFORM[place.side],
        };
      } else {
        const place = placeReadout(
          anchor,
          stage,
          markReadout !== null ? ringPx + 8 : undefined,
        );
        readoutStyle = {
          ...DARK_READOUT_STYLE,
          left: place.left,
          top: place.top,
          minWidth: Math.min(MIN_READOUT_W, place.width),
          maxWidth: place.width,
          transform: `translate(-50%, ${place.below ? "0" : "-100%"})`,
        };
      }
    }
  }

  return (
    <>
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
          // The depth and contact bands run past the art to the stage's own
          // edges (`viz-bands-overlay.tsx`, `BAND_BLEED`); the stage's
          // `overflow-hidden` is what clips.
          overflow="visible"
          role="group"
          aria-label={`${subjectName} — full court, ${dots.length} mark${dots.length === 1 ? "" : "s"}`}
          className="absolute top-0 left-0 block"
        >
          <rect
            x={vb.minX}
            y={vb.minY}
            width={vb.w}
            height={vb.h}
            fill={apron}
          />
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

          {zoneCells !== null &&
            ZONES.map((zone, index) => {
              const cell = zoneCellX(index);
              return (
                <rect
                  key={`cell-${zone.key}`}
                  data-serve-zone-cell={zone.key}
                  x={cell.x1}
                  y={VIEWER_COURT.farServiceY}
                  width={cell.x2 - cell.x1}
                  height={VIEWER_COURT.netY - VIEWER_COURT.farServiceY}
                  fill={LINE_COLOR}
                  fillOpacity={zoneOpacity(zoneCells[zone.key].pct, maxZonePct)}
                  stroke={LINE_COLOR}
                  strokeOpacity={zone.key === shownZone ? 1 : 0.5}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={() => setHoveredZone(zone.key)}
                  onMouseLeave={() => setHoveredZone(null)}
                  onClick={() => setPinnedZone(zone.key)}
                />
              );
            })}

          {highlighted !== null &&
            zoneCells === null &&
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
          {bands !== null && (
            <VizBandsOverlay
              {...bands}
              zones={chart === "zones"}
              labelScale={labelScale}
            />
          )}

          <CourtLines />
          {outline !== null && <OutlineRect outline={outline} />}
          {chart === "zones" && cut !== "serve" && bands === null && (
            <text
              x={VIEWER_COURT.centreX}
              y={VIEWER_COURT.farServiceY}
              textAnchor="middle"
              fill={LINE_COLOR}
              fontFamily="var(--font-sans)"
              fontSize={8 * labelScale}
            >
              {isPlacementCut(cut)
                ? "No depth bands selected"
                : "No contact bands selected"}
            </text>
          )}

          {cut === "approaches" && (
            <ApproachApronLabels
              scale={labelScale}
              leftIsForehand={
                opponentHand !== undefined
                  ? opponentHand !== "left"
                  : approachLeftLaneSide(dots)
              }
            />
          )}

          {cut === "serve" && (
            <ServeBoxLabels
              zoneStats={zoneStats}
              subjectName={subjectName}
              onZoneHover={setHoveredZone}
              onZonePin={setPinnedZone}
            />
          )}

          <g
            opacity={editing ? EDITING_ART_OPACITY : undefined}
            style={editing ? { pointerEvents: "none" } : undefined}
            aria-hidden={editing || undefined}
          >
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
                selectedId={selectedId}
                rovingId={rovingId}
                focusIds={focusIds}
                interactive={!editing}
                onActivate={onActivate}
                onDeactivate={onDeactivate}
                onRove={onRove}
                onSelect={onSelect}
                onPointPart={pointPart}
              />
            )}
          </g>
        </svg>

        {editorLayer}
      </div>

      {markReadout !== null && readoutStyle !== null && active !== null && (
        <div
          data-viz-readout=""
          data-viz-readout-side={readoutSide}
          aria-hidden="true"
          className={`pointer-events-none absolute z-[2] flex flex-col gap-0.5 px-3 pt-2.5 pb-[11px] ${DARK_READOUT_CLASS}`}
          style={readoutStyle}
        >
          {markReadout.part !== undefined && (
            // Which of the pair's two marks the card is about, first.
            <span
              data-viz-readout-part=""
              className="text-[11px] leading-[1.45] text-white/[0.64]"
            >
              {markReadout.part}
            </span>
          )}
          <span className="mb-0.5 flex items-center gap-[7px]">
            <ReadoutGlyph dot={active} />
            <span className="text-[12px] leading-[1.35] font-medium text-white">
              {markReadout.title}
            </span>
            {markReadout.score !== null && (
              <span className="ml-auto pl-3.5 text-[11px] leading-[1.35] text-white/[0.64] tabular-nums">
                {markReadout.score}
              </span>
            )}
          </span>
          {markReadout.shot !== null && (
            <span className="text-[11px] leading-[1.45] text-white/[0.64]">
              {markReadout.shot}
            </span>
          )}
          {markReadout.where !== null && (
            <span className="text-[11px] leading-[1.45] text-white/[0.64]">
              {markReadout.where}
            </span>
          )}
          {markReadout.match !== null && (
            <span
              data-viz-readout-match=""
              className="text-[11px] leading-[1.45] text-white/[0.64]"
            >
              {markReadout.match}
            </span>
          )}
          {markReadout.hint !== null && (
            // The hint under a 1px hairline, 6px either side (the column's
            // 2px gap plus 4px above it).
            <span
              data-viz-readout-hint=""
              className="mt-1 border-t border-[rgba(255,255,255,0.12)] pt-1.5 text-[11px] leading-[1.45] text-white/[0.64]"
            >
              {markReadout.hint}
            </span>
          )}
        </div>
      )}
      {markReadout === null &&
        zoneReadout !== null &&
        readoutStyle !== null && (
          <div
            data-viz-readout=""
            aria-hidden="true"
            className={`pointer-events-none absolute z-[2] flex flex-col gap-0.5 px-3 pt-2.5 pb-[11px] ${DARK_READOUT_CLASS}`}
            style={readoutStyle}
          >
            <span className="text-[12px] font-medium text-white">
              {zoneReadout.title}
            </span>
            {zoneReadout.lines.map((line, index) => (
              <span
                key={index}
                className="text-[11px] leading-[1.45] text-white/[0.64]"
              >
                {line}
              </span>
            ))}
          </div>
        )}
    </>
  );
}

/**
 * The Approaches cut's apron words (`approach-map-v9.html`, the wall card's
 * `ApproachCourtArt` labels): "Placement" over the far half, the opponent's
 * wing over each third just past the far baseline (the hitter's "Left ·
 * Middle · Right" where no one hand sides it, `approachLaneText`), "Contact"
 * under the near half. Under the marks, and deaf to the pointer, so no word
 * takes a hover.
 */
function ApproachApronLabels({
  leftIsForehand,
  scale,
}: {
  leftIsForehand: boolean | null;
  scale: number;
}) {
  const laneText = approachLaneText(leftIsForehand);
  const layout = approachApronLayout(scale);
  return (
    <g
      data-approach-labels=""
      aria-hidden="true"
      fill={APPROACH_LABEL_INK}
      fontFamily="var(--font-mono)"
      letterSpacing={APPROACH_LABEL_TRACKING * scale}
      textAnchor="middle"
      style={{ textTransform: "uppercase", pointerEvents: "none" }}
    >
      <text
        data-approach-label="placement"
        x={VIEWER_COURT.centreX}
        y={layout.placementY}
        fontSize={layout.side}
        fillOpacity={APPROACH_SIDE_LABEL_OPACITY}
      >
        Placement
      </text>
      <text
        data-approach-label="contact"
        x={VIEWER_COURT.centreX}
        y={layout.contactY}
        fontSize={layout.side}
        fillOpacity={APPROACH_SIDE_LABEL_OPACITY}
      >
        Contact
      </text>
      {(["left", "middle", "right"] as const).map((lane) => (
        <text
          key={lane}
          data-approach-lane={lane}
          x={APPROACH_LANE_X[lane]}
          y={layout.laneY}
          fontSize={layout.lane}
          fillOpacity={APPROACH_LANE_LABEL_OPACITY}
        >
          {laneText[lane]}
        </text>
      ))}
    </g>
  );
}

/** The outline's stroke: the court's line colour, dashed so it reads as a
 *  marker laid over the court and never as one of its painted lines. */
const OUTLINE_STROKE = {
  fill: "none",
  stroke: LINE_COLOR,
  strokeWidth: 1.5,
  strokeDasharray: "4 3",
  vectorEffect: "non-scaling-stroke",
} as const;

/**
 * The dashed white outline of a Statistics row's place on the court.
 *
 * A serve zone is a box, and a landing depth is a slice of the court, so
 * both are boxed where the court lines put them. A CONTACT band is neither:
 * it is how far behind the baseline the ball was met, a depth with no sides.
 * It runs the full width of the stage (`viz-bands-overlay.tsx`,
 * `BAND_BLEED`) and its marks run with it — a return is met wherever the
 * ball is, outside the singles lines as often as inside. Boxing it at those
 * lines drew sides the band does not have, through the middle of the
 * returns it was meant to contain. So a contact band is marked by the two
 * edges it does have, each ruled from one side of the stage to the other.
 */
function OutlineRect({ outline }: { outline: CourtOutline }) {
  if (outline.kind === "band" && outline.band === "contact") {
    const edges = viewerBandEdges(outline.band, outline.dividersFt);
    const left = VIEWER_COURT.viewBox.minX - BAND_BLEED;
    const right =
      VIEWER_COURT.viewBox.minX + VIEWER_COURT.viewBox.w + BAND_BLEED;
    return (
      <g data-viz-outline="contact" pointerEvents="none">
        {[edges[outline.index], edges[outline.index + 1]].map((y, index) => (
          <line
            key={index}
            x1={left}
            x2={right}
            y1={y}
            y2={y}
            {...OUTLINE_STROKE}
          />
        ))}
      </g>
    );
  }

  let x: number;
  let y: number;
  let w: number;
  let h: number;
  if (outline.kind === "zone") {
    const cell = zoneCellX(ZONES.findIndex((z) => z.key === outline.key));
    x = cell.x1;
    w = cell.x2 - cell.x1;
    y = VIEWER_COURT.farServiceY;
    h = VIEWER_COURT.netY - VIEWER_COURT.farServiceY;
  } else {
    const edges = viewerBandEdges(outline.band, outline.dividersFt);
    x = VIEWER_COURT.singlesLeft;
    w = VIEWER_COURT.singlesRight - VIEWER_COURT.singlesLeft;
    y = edges[outline.index];
    h = edges[outline.index + 1] - edges[outline.index];
  }
  return (
    <rect
      data-viz-outline={outline.kind}
      x={x}
      y={y}
      width={w}
      height={Math.max(0, h)}
      {...OUTLINE_STROKE}
      pointerEvents="none"
    />
  );
}

/** The readout's legend glyph: the mark's own shape and fill, 10px. */
function ReadoutGlyph({ dot }: { dot: VizDot }) {
  const fill = fillFor(dot);
  return (
    <svg
      aria-hidden="true"
      width={10}
      height={10}
      viewBox="0 0 10 10"
      className="shrink-0"
    >
      {dot.shape === "star" ? (
        <polygon
          points={starPoints(5, 5, 4.2)}
          fill={fill}
          stroke="#000"
          strokeWidth={0.4}
        />
      ) : dot.shape === "triangle" ? (
        <polygon
          points={trianglePointsFor("serve", 5, 5, 2.2)}
          fill={fill}
          stroke="#000"
          strokeWidth={0.4}
        />
      ) : (
        <circle
          cx={5}
          cy={5}
          r={3.6}
          fill={fill}
          stroke="#000"
          strokeWidth={0.4}
        />
      )}
    </svg>
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
  // The baselines come first and alone get square caps: with butt caps each
  // corner stroke stops at the other's centreline, leaving a missing
  // quarter-square at all four corners that shows plainly when zoomed in. A
  // square cap runs the baseline on by half a line width, just over the
  // sideline's outer edge. Every other line ends inside a crossing line, where
  // a butt end is already hidden.
  const baselines: [number, number, number, number][] = [
    [left, top, right, top],
    [left, bottom, right, bottom],
  ];
  const segments: [number, number, number, number][] = [
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
        strokeWidth={VIEWER_COURT.lineWidth * LINE_SCALE}
        fill="none"
      >
        {baselines.map(([x1, y1, x2, y2], index) => (
          <line
            key={`baseline-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeLinecap="square"
          />
        ))}
        {segments.map(([x1, y1, x2, y2], index) => (
          <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <line
        x1={VIEWER_COURT.netX1}
        y1={VIEWER_COURT.netY}
        x2={VIEWER_COURT.netX2}
        y2={VIEWER_COURT.netY}
        stroke={LINE_COLOR}
        strokeWidth={VIEWER_COURT.netWidth * LINE_SCALE}
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
  selectedId,
  rovingId,
  focusIds,
  interactive,
  onActivate,
  onDeactivate,
  onRove,
  onSelect,
  onPointPart,
}: {
  cut: Cut;
  dots: VizDot[];
  focusIds: ReadonlySet<string> | null;
  subjectName: string;
  /** `false` while the band editor is open: no mark is a tab stop, so Tab
   *  goes from the dividers straight to the slab. */
  interactive: boolean;
  activeId: string | null;
  focusedId: string | null;
  selectedId: string | null;
  /** Final review #3: the ONE mark that is a tab stop. `null` means "the
   *  first one" — nobody has moved within the group yet. */
  rovingId: string | null;
  onActivate: (id: string, keyboard: boolean) => void;
  onDeactivate: (id: string) => void;
  onRove: (id: string) => void;
  onSelect: (id: string) => void;
  /** Which of an Approaches pair's two marks the pointer is on (or the
   *  keyboard reached: the placement). Stable identity. */
  onPointPart: (id: string, part: PairPart) => void;
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
        // An Approaches pair: the same dot's contact, drawn in the near half
        // as the second mark of ONE interactive group.
        const contact = pairContactPoint(cut, dot);
        return { dot, x, y, contact, fill: fillFor(dot), label };
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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(placed[index].dot.id);
      return;
    }
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
      {placed.map(({ dot, x, y, contact, fill, label }, index) => {
        const isSelected = dot.id === selectedId;
        const isFocused = dot.id === focusedId;
        // A pair rings BOTH its marks whenever it is the one being read —
        // hovered, focused or selected — so the eye finds the other half.
        const pairLit = contact !== null && (isSelected || dot.id === activeId);
        const dimmed =
          selectedId !== null
            ? !isSelected
            : focusIds !== null && !focusIds.has(dot.id);
        return (
          <g
            key={dot.id}
            data-viz-mark={dot.id}
            data-active={dot.id === activeId || undefined}
            // Final review #3: a roving tabindex — ONE tab stop for the whole
            // court, not one per mark. On `rallyPosition` that was 150-250
            // Tab presses before a keyboard user reached the View menu.
            tabIndex={interactive && index === rovingIndex ? 0 : -1}
            role="button"
            aria-label={label}
            aria-pressed={dot.id === selectedId}
            // A mark that joins the court (a pick or filter let go, "Back
            // to all points") fades in rather than popping; one already on
            // court keeps its node (keyed by id) and never re-runs it. A
            // dim or undim eases too. Opacity only: no stagger, no travel —
            // 200 marks choreographed would be noise, and the counts and
            // bands are what say the numbers changed.
            className="animate-[fadeIn_var(--duration-hover)_var(--ease-chart)] cursor-pointer transition-opacity duration-[var(--duration-hover)] outline-none"
            opacity={dimmed ? UNSELECTED_OPACITY : undefined}
            onMouseEnter={() => onActivate(dot.id, false)}
            onMouseLeave={() => onDeactivate(dot.id)}
            onFocus={(e) => {
              const keyboard = e.currentTarget.matches(":focus-visible");
              // The keyboard reaches a pair as one stop: its card reads the
              // placement. A click's focus keeps the mark it landed on.
              if (keyboard && contact !== null)
                onPointPart(dot.id, "placement");
              onActivate(dot.id, keyboard);
            }}
            onBlur={() => onDeactivate(dot.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onClick={(e) => {
              e.stopPropagation();
              // A click on the SELECTED mark is its second click: the shell
              // watches it (`select`), it does not step the stack.
              if (dot.id === selectedId) {
                onSelect(dot.id);
                return;
              }
              // Two shots can land on the same coordinate (within 0.5
              // units). A click on a mark that is NOT the selected one, while
              // another mark of its stack is, steps the selection to the next
              // mark of that stack, so the one underneath is selectable too;
              // with nothing of the stack selected it selects the mark
              // clicked. Once the stepped-to mark is the one under the
              // pointer, the next click watches it. A mark wholly hidden
              // under another is reached from the Points list or the arrow
              // keys.
              const stack = placed.filter(
                (item) => Math.hypot(item.x - x, item.y - y) < 0.5,
              );
              const selectedIndex = stack.findIndex(
                (item) => item.dot.id === selectedId,
              );
              const next =
                selectedIndex < 0
                  ? dot.id
                  : stack[(selectedIndex + 1) % stack.length].dot.id;
              onSelect(next);
            }}
          >
            {contact === null ? (
              <MarkBody
                x={x}
                y={y}
                dot={dot}
                fill={fill}
                focused={isFocused}
                ringed={isSelected}
                selected={isSelected}
              />
            ) : (
              (
                [
                  ["contact", contact.x, contact.y],
                  ["placement", x, y],
                ] as const
              ).map(([part, px, py]) => (
                <g
                  key={part}
                  data-viz-mark-part={part}
                  onMouseEnter={() => onPointPart(dot.id, part)}
                >
                  <MarkBody
                    x={px}
                    y={py}
                    dot={dot}
                    fill={fill}
                    focused={isFocused}
                    ringed={pairLit}
                    selected={isSelected}
                    pair
                  />
                </g>
              ))
            )}
          </g>
        );
      })}
      {(() => {
        // A selected pair is drawn LAST, so neither of its marks sits under
        // another point's. Its interactive group keeps its place in the DOM —
        // moving a focused node blurs it, and the roving order is the dots'
        // own — so what rises is a copy of its rings and marks, which takes
        // no pointer and says nothing to a screen reader.
        const top = placed.find(
          (item) => item.dot.id === selectedId && item.contact !== null,
        );
        if (!top || top.contact === null) return null;
        return (
          <g
            data-viz-raised={top.dot.id}
            aria-hidden="true"
            pointerEvents="none"
          >
            {[top.contact, { x: top.x, y: top.y }].map((p, i) => (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={SELECTED_RING_R}
                  fill="none"
                  stroke={LINE_COLOR}
                  strokeWidth={SELECTED_RING_W}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Grows with the group it copies: `data-viz-mark-glyph`
                    carries the easing, and the scale is the one globals.css
                    gives an active mark's glyph, written here because the
                    copy is not itself a `[data-viz-mark]`. */}
                <g
                  data-viz-mark-glyph=""
                  style={
                    top.dot.id === activeId
                      ? { transform: `scale(${ACTIVE_GLYPH_SCALE})` }
                      : undefined
                  }
                >
                  <Mark dot={top.dot} x={p.x} y={p.y} fill={top.fill} />
                </g>
              </g>
            ))}
          </g>
        );
      })()}
    </>
  );
});

/**
 * One mark's drawing inside its interactive group: the keyboard ring, the
 * selection ring, the hit area and the glyph. A single-mark cut draws one; an
 * Approaches pair draws one at each of its two places, both under the same
 * group, so the pair is one tab stop, one hover and one selection.
 */
function MarkBody({
  x,
  y,
  dot,
  fill,
  focused,
  ringed,
  selected,
  pair = false,
}: {
  x: number;
  y: number;
  dot: VizDot;
  fill: string;
  focused: boolean;
  /** Draw the white ring: the selection, or a pair being read. */
  ringed: boolean;
  selected: boolean;
  pair?: boolean;
}) {
  return (
    <>
      {focused && (
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
      {ringed && (
        <circle
          data-viz-selected-ring={selected ? "" : undefined}
          data-viz-pair-ring={pair ? "" : undefined}
          cx={x}
          cy={y}
          r={SELECTED_RING_R}
          fill="none"
          stroke={LINE_COLOR}
          strokeWidth={SELECTED_RING_W}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* The hit area: the mark grown by a hair, so the readout comes
                up over the point and not a mark's width off it (it was r 9
                round a 2.2 mark, and answered 18px from its centre). */}
      {/* Plus a 3px ring that does not scale (a transparent
                non-scaling stroke still takes the pointer), so zoomed out
                to Full court the target never shrinks to a pixel or two. */}
      <circle
        cx={x}
        cy={y}
        r={MARK_HIT_R}
        fill="transparent"
        stroke="transparent"
        strokeWidth={MARK_HIT_FLOOR_PX}
        vectorEffect="non-scaling-stroke"
      />
      {/* Grows a little while hovered or focused (`data-active`,
                globals.css `[data-viz-mark-glyph]`): the point you are on
                answers under the pointer as well as in the readout. */}
      <g data-viz-mark-glyph="">
        <Mark dot={dot} x={x} y={y} fill={fill} />
      </g>
    </>
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
  rallyPlacement: (d) => toCxCy("rallyPlacement", d),
  errors: (d) => toCxCy("errors", d),
  approaches: (d) => toCxCy("approaches", d),
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
}: {
  dot: VizDot;
  x: number;
  y: number;
  fill: string;
}) {
  // Drawn at its own size; the hover's slight growth is its wrapper's
  // (`data-viz-mark-glyph`), and a selected mark keeps its size inside the
  // ring.
  const stroke = "#000";
  const strokeWidth = VIEWER_COURT.markStroke;
  const r = VIEWER_COURT.markRadius;

  if (dot.shape === "star") {
    return (
      <polygon
        points={starPoints(x, y, r * ACE_STAR_RADIUS_RATIO)}
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
  onZoneHover,
  onZonePin,
}: {
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  subjectName: string;
  onZoneHover: (zone: ZoneKey | null) => void;
  onZonePin: (zone: ZoneKey) => void;
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
              <g
                key={zone.key}
                data-serve-zone={zone.key}
                role="img"
                aria-label={`${subjectName} — ${zone.key.replace("-", " ")}: ${stats.winPct}% of ${stats.count} points won`}
                onMouseEnter={() => onZoneHover(zone.key)}
                onMouseLeave={() => onZoneHover(null)}
                onClick={() => onZonePin(zone.key)}
              >
                {/* The two numbers alone are a sliver to aim at, and less to
                    a finger. Under the marks, so it never takes one's hover. */}
                <rect
                  x={cell.x1}
                  y={VIEWER_COURT.netY}
                  width={cell.x2 - cell.x1}
                  height={ZONE_COUNT_Y + 3 - VIEWER_COURT.netY}
                  fill="transparent"
                />
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
