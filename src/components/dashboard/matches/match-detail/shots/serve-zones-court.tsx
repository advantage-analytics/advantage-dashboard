"use client";

import { useMemo } from "react";

import {
  CourtDotStyles,
  dotStagger,
  FullCourtSVG,
  BASELINE_Y,
  CENTER_X,
  COURT_H,
  COURT_W,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SERVICE_Y,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  type CourtDot,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import type {
  ServeDot,
  ZoneKey,
  ZoneStats,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";
import type {
  CourtView,
  ShotMode,
} from "@/components/dashboard/matches/match-detail/shots/use-shot-filters";

/**
 * The Shots tab's court card (artboard 46b lines 693–733 / 47a lines 122–162).
 *
 * Three renders share it:
 * - Serve · Zones — the artboard's six-cell SVG, cells shaded by how often the
 *   serve goes there, labeled with points-won % and the serve count.
 * - Serve · Placements — the same court frame with the actual landing dots.
 *   Dot positions come in as `ServeDot`s produced by the widget's exported
 *   `pointToServeDot`, and are projected with the identical
 *   `SINGLES_LEFT + x·(SINGLES_RIGHT−SINGLES_LEFT)` mapping the old
 *   ServePlacementCard's court used — same math, same pixels.
 * - Return — the existing `FullCourtSVG` (visuals/half-court-svg.tsx), landing
 *   dots on the far half, contact markers on the near half.
 *
 * The geometry constants are imported from `visuals/half-court-svg.tsx`; the
 * artboard was drawn on the same 447×350 frame, so its literal coordinates and
 * these constants agree to the decimal.
 */

const CELL_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6;

const ZONE_ORDER: { key: ZoneKey; colLabel: string }[] = [
  { key: "deuce-wide", colLabel: "WIDE" },
  { key: "deuce-body", colLabel: "BODY" },
  { key: "deuce-t", colLabel: "T" },
  { key: "ad-t", colLabel: "T" },
  { key: "ad-body", colLabel: "BODY" },
  { key: "ad-wide", colLabel: "WIDE" },
];

/**
 * Cell shade from the zone's share of serves, on the artboard legend's scale:
 * 10% of serves ≈ 0.14 opacity, 40% ≈ 0.52 (both are share × 1.3).
 */
function cellOpacity(pct: number): number {
  return Math.min(0.6, Math.max(0.06, (pct / 100) * 1.3));
}

const MONO_STACK = "var(--font-mono), 'Roboto Mono', monospace";

interface ServeZonesCourtProps {
  mode: ShotMode;
  view: CourtView;
  serveDots: ServeDot[];
  returnDots: CourtDot[];
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  /** Shots drawn for the cut / shots in the whole pool (for empty states). */
  count: number;
  total: number;
  /** Maximize-dialog render — the same court, wider (flags doc item 7). */
  large?: boolean;
}

export function ServeZonesCourt({
  mode,
  view,
  serveDots,
  returnDots,
  zoneStats,
  count,
  total,
  large,
}: ServeZonesCourtProps) {
  const isServe = mode === "serve";
  const showZones = isServe && view === "zones";

  // Overall points-won share across the drawn cut (the zones legend's right
  // micro) — aces count as won, unresolved dots don't count at all, matching
  // computeZoneStats' per-cell winPct.
  const overallWonPct = useMemo(() => {
    if (!zoneStats) return null;
    let won = 0;
    let resolved = 0;
    for (const { key } of ZONE_ORDER) {
      const zs = zoneStats[key];
      won += zs.won + zs.ace;
      resolved += zs.won + zs.lost + zs.ace + zs.doubleFault;
    }
    return resolved > 0 ? Math.round((won / resolved) * 100) : null;
  }, [zoneStats]);

  const emptyLabel =
    total === 0
      ? isServe
        ? "No serve landing data for this match"
        : "No return landing data for this match"
      : count === 0
        ? isServe
          ? "No serves match this cut"
          : "No returns match this cut"
        : null;

  return (
    <div className="surface-card flex flex-col gap-2.5 px-5 pb-3 pt-4">
      <div className="flex justify-center">
        <div
          className={
            isServe
              ? large
                ? "relative w-full max-w-[820px]"
                : "relative w-full max-w-[640px]"
              : large
                ? "relative w-full max-w-[480px]"
                : "relative w-full max-w-[400px]"
          }
        >
          {isServe ? (
            <ServeHalfCourt
              showZones={showZones}
              zoneStats={zoneStats}
              dots={view === "placements" ? serveDots : []}
            />
          ) : (
            <FullCourtSVG
              dots={returnDots}
              halfLabels={{ top: "RETURN LANDING", bottom: "RETURN CONTACT" }}
            />
          )}
          {emptyLabel && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                role="status"
                className="rounded-xl border border-[var(--border-card)] bg-[var(--surface-card)] px-4 py-2.5 text-[12px] text-[var(--ink-600)] shadow-[var(--shadow-card-emphasis)]"
              >
                {emptyLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legend row */}
      <div className="flex min-h-[22px] flex-wrap items-center gap-3">
        {showZones ? (
          <>
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              Serve frequency, per side
            </span>
            <span className="flex items-center gap-[3px]" aria-hidden>
              {[0.14, 0.3, 0.44, 0.52].map((o) => (
                <span
                  key={o}
                  className="h-2 w-[22px] rounded-[2px] bg-[var(--viz-you)]"
                  style={{ opacity: o }}
                />
              ))}
            </span>
            <span
              className="text-micro tabular"
              style={{ color: "var(--ink-400)" }}
            >
              10% → 40%
            </span>
            <div className="flex-1" />
            {overallWonPct !== null && (
              <span className="text-micro tabular">
                {overallWonPct}% of serves won
              </span>
            )}
          </>
        ) : isServe ? (
          <>
            <LegendSwatch color="var(--viz-you)" label="First serve" />
            <LegendSwatch color="var(--viz-you-mid)" label="Second serve" />
            <div className="flex-1" />
            <span className="text-micro tabular">
              {count} {count === 1 ? "serve" : "serves"} drawn
            </span>
          </>
        ) : (
          <>
            <LegendSwatch color="var(--viz-good)" label="Won" />
            <LegendSwatch color="var(--viz-bad)" label="Lost" />
            <LegendSwatch color="var(--ink-400)" label="Out · net" />
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              Triangles are backhands · outlines mark contact
            </span>
            <div className="flex-1" />
            <span className="text-micro tabular">
              {count} {count === 1 ? "return" : "returns"} drawn
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2 rounded-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {label}
      </span>
    </span>
  );
}

/* ── The serve half-court SVG (artboard geometry, verbatim) ──────────────── */

function ServeHalfCourt({
  showZones,
  zoneStats,
  dots,
}: {
  showZones: boolean;
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  dots: ServeDot[];
}) {
  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
      className="block h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        showZones
          ? "Serve placement by zone: six service-box zones shaded by serve frequency, labeled with points won and serve counts"
          : "Serve placement: each dot is where one serve landed"
      }
    >
      <defs>
        <CourtDotStyles />
      </defs>

      {/* Zone cells — behind the lines */}
      {showZones &&
        zoneStats &&
        ZONE_ORDER.map(({ key }, i) => {
          const zs = zoneStats[key];
          if (zs.count === 0) return null;
          return (
            <rect
              key={key}
              x={SINGLES_LEFT + i * CELL_W}
              y={SERVICE_Y}
              width={CELL_W}
              height={BASELINE_Y - SERVICE_Y}
              fill="var(--viz-you)"
              fillOpacity={cellOpacity(zs.pct)}
            />
          );
        })}

      {/* Court lines — artboard 47a lines 130–137 */}
      <line x1={DOUBLES_LEFT} y1={0} x2={DOUBLES_RIGHT} y2={0} stroke="var(--border-medium)" strokeWidth={3.2} />
      <line x1={DOUBLES_LEFT} y1={0} x2={DOUBLES_LEFT} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={2} />
      <line x1={DOUBLES_RIGHT} y1={0} x2={DOUBLES_RIGHT} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={2} />
      <line x1={SINGLES_LEFT} y1={0} x2={SINGLES_LEFT} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={1.5} />
      <line x1={SINGLES_RIGHT} y1={0} x2={SINGLES_RIGHT} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={1.5} />
      <line x1={SINGLES_LEFT} y1={SERVICE_Y} x2={SINGLES_RIGHT} y2={SERVICE_Y} stroke="var(--border-medium)" strokeWidth={1.5} />
      <line x1={CENTER_X} y1={SERVICE_Y} x2={CENTER_X} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={1.5} />
      <line x1={CENTER_X} y1={0} x2={CENTER_X} y2={9} stroke="var(--border-medium)" strokeWidth={1.5} />

      {/* Zone dividers — placements view only (the cells imply them in zones) */}
      {!showZones &&
        [1, 2, 4, 5].map((i) => (
          <line
            key={i}
            x1={SINGLES_LEFT + i * CELL_W}
            y1={SERVICE_Y}
            x2={SINGLES_LEFT + i * CELL_W}
            y2={BASELINE_Y}
            stroke="var(--border-medium)"
            strokeWidth={1}
            strokeDasharray="5,5"
          />
        ))}

      {/* Column labels */}
      {ZONE_ORDER.map(({ key, colLabel }, i) => (
        <text
          key={key}
          x={SINGLES_LEFT + (i + 0.5) * CELL_W}
          y={146}
          textAnchor="middle"
          fill="var(--ink-400)"
          fontSize={8.5}
          fontWeight={500}
          letterSpacing={1.9}
        >
          {colLabel}
        </text>
      ))}

      {/* Net */}
      <line x1={14} y1={BASELINE_Y} x2={433} y2={BASELINE_Y} stroke="var(--border-medium)" strokeWidth={3.2} />
      <text
        x={223.5}
        y={348}
        textAnchor="middle"
        fill="var(--ink-400)"
        fontSize={7}
        fontWeight={400}
        letterSpacing={2}
        fontFamily={MONO_STACK}
      >
        NET
      </text>

      {/* Cell figures — points won % (13px) over serve count (8px) */}
      {showZones &&
        zoneStats &&
        ZONE_ORDER.map(({ key }, i) => {
          const zs = zoneStats[key];
          if (zs.count === 0) return null;
          const cx = SINGLES_LEFT + (i + 0.5) * CELL_W;
          return (
            <g key={key} style={{ pointerEvents: "none" }}>
              <text
                x={cx}
                y={238}
                textAnchor="middle"
                fill="var(--ink-900)"
                fontSize={13}
                fontWeight={400}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {zs.winPct}%
              </text>
              <text
                x={cx}
                y={254}
                textAnchor="middle"
                fill="var(--ink-500)"
                fontSize={8}
                letterSpacing={0.5}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {zs.count}
              </text>
            </g>
          );
        })}

      {/* Placement dots — identical projection to the old ServePlacementCard's
          court (HalfCourtWithZones in serve-placement-widget.tsx, lines
          556–558): the normalized ServeDot maps back through the same
          service-box frame. */}
      {!showZones &&
        dots.map((d, i) => (
          <circle
            key={d.id ?? i}
            className="court-dot"
            cx={SINGLES_LEFT + d.x * (SINGLES_RIGHT - SINGLES_LEFT)}
            cy={SERVICE_Y + d.y * (BASELINE_Y - SERVICE_Y)}
            r={3}
            fill={d.isFirstServe ? "var(--viz-you)" : "var(--viz-you-mid)"}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1}
            opacity={0.85}
            style={{ animationDelay: dotStagger(i) }}
          />
        ))}
    </svg>
  );
}
