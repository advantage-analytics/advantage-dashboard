"use client";

import { useCallback, useMemo, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

import { PLAYER_1, PLAYER_2 } from "@/lib/design/player-colors";

export const RADAR_CHART_HEIGHT = 300;

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  payload?: { stat?: string };
}

interface RadarTooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  p1Name: string;
  p2Name: string;
}

function RadarTooltipContent({
  active,
  payload,
  label,
  p1Name,
  p2Name,
}: RadarTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const p1Raw = payload.find((p) => p.dataKey === "p1")?.value ?? 0;
  const p2Raw = payload.find((p) => p.dataKey === "p2")?.value ?? 0;
  const p1 = Math.round(p1Raw);
  const p2 = Math.round(p2Raw);
  const delta = p1 - p2;
  const leader = delta === 0 ? "even" : delta > 0 ? "p1" : "p2";
  const statLabel = label ?? payload[0]?.payload?.stat ?? "";

  const leaderColor = leader === "p1" ? PLAYER_1 : PLAYER_2;

  return (
    <div
      className="bg-white rounded-xl shadow-tooltip py-2.5 px-3 flex flex-col gap-2 min-w-[180px] w-max max-w-[260px]"
      style={{ border: "1px solid var(--color-border-card)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[1.5px] leading-[1.4] break-words">
          {statLabel}
        </span>
      </div>
      <div className="h-px bg-[var(--color-border-card)]" />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="size-[5px] rounded-full shrink-0"
              style={{ backgroundColor: PLAYER_1 }}
            />
            <span className="text-[10px] text-[var(--color-text-body)] truncate">{p1Name}</span>
          </span>
          <span
            className="text-[10px] tabular-nums font-medium shrink-0"
            style={{ color: PLAYER_1 }}
          >
            {p1}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="size-[5px] rounded-full shrink-0"
              style={{ backgroundColor: PLAYER_2 }}
            />
            <span className="text-[10px] text-[var(--color-text-body)] truncate">{p2Name}</span>
          </span>
          <span
            className="text-[10px] tabular-nums font-medium shrink-0"
            style={{ color: PLAYER_2 }}
          >
            {p2}%
          </span>
        </div>
        {delta !== 0 && (
          <div className="flex items-center justify-between pt-1.5 border-t border-[var(--color-border-card)]">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-[1px]">
              Lead
            </span>
            <span
              className="text-[10px] tabular-nums font-medium shrink-0"
              style={{ color: leaderColor }}
            >
              +{Math.abs(delta)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function buildLabelRenderer(
  onEnter: (stat: string, x: number, y: number, cx: number, cy: number) => void,
  onLeave: () => void,
  onRadius: (r: number) => void,
) {
  return function RenderPolarAngleLabel(props: {
    payload: { value: string };
    x: number;
    y: number;
    cx: number;
    cy: number;
  }) {
    const { payload, x, y, cx, cy } = props;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Recharts places PolarAngleAxis ticks at `outerRadius + tickSize` (8px
    // by default), so dist overshoots the actual grid circle. Subtract the
    // offset so the cursor line ends exactly on the boundary.
    onRadius(dist - 8);
    const offsetX = (dx / dist) * 4;
    const offsetY = (dy / dist) * 4;

    // Angle-aware anchoring: bias labels near the top/bottom to "middle" so
    // they don't extend horizontally past the card edge.
    const angleFromVertical = Math.abs(dx) / dist;
    const anchor =
      angleFromVertical < 0.3 ? "middle" : x > cx ? "start" : "end";
    const baseline = y > cy ? "hanging" : y < cy ? "auto" : "central";
    const tx = x + offsetX;
    const ty = y + offsetY;

    return (
      <g
        className="cursor-pointer outline-none focus-visible:[&_text]:fill-[var(--color-accent-blue)] focus-visible:[&_text]:font-medium"
        tabIndex={0}
        role="button"
        aria-label={payload.value}
        onFocus={() => onEnter(payload.value, tx, ty, cx, cy)}
        onBlur={onLeave}
      >
        {/* Invisible hit target — 18px high band behind the text to make
            hovering feel forgiving without changing label appearance. */}
        <rect
          x={tx - 48}
          y={ty - 10}
          width={96}
          height={20}
          fill="transparent"
          onMouseEnter={() => onEnter(payload.value, tx, ty, cx, cy)}
          onMouseLeave={onLeave}
          onTouchStart={() => onEnter(payload.value, tx, ty, cx, cy)}
        />
        <text
          x={tx}
          y={ty}
          textAnchor={anchor}
          dominantBaseline={baseline}
          className="fill-[var(--color-text-faint)] text-[10px] font-normal"
          style={{ pointerEvents: "none" }}
        >
          {payload.value}
        </text>
      </g>
    );
  };
}

interface RadarChartSectionProps {
  data: Array<{ stat: string; p1: number; p2: number }>;
  p1Name: string;
  p2Name: string;
}

export function RadarChartSection({
  data,
  p1Name,
  p2Name,
}: RadarChartSectionProps) {
  // Unified hover state — a single source of truth for BOTH the polygon
  // vertex hover (via Recharts onMouseMove) and the axis-label hover
  // (via label hit-rects). One tooltip node means seamless transitions.
  type HoverState = {
    stat: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
    source: "vertex" | "label";
  };
  const [hover, setHover] = useState<HoverState | null>(null);
  // Cached outer-circle radius in px — derived from vertex hovers so we can
  // clamp the cursor line to the radar boundary.
  const [outerRadiusPx, setOuterRadiusPx] = useState<number | null>(null);

  const labelRenderer = useMemo(
    () =>
      buildLabelRenderer(
        (stat, x, y, cx, cy) =>
          setHover({ stat, x, y, cx, cy, source: "label" }),
        () =>
          // Only clear if this is still a label-sourced hover; vertex hover
          // has its own clear path on chart leave.
          setHover((prev) => (prev?.source === "label" ? null : prev)),
        (r) => setOuterRadiusPx((prev) => (prev == null ? r : prev)),
      ),
    [],
  );

  const handleChartMove = useCallback(
    (state: unknown) => {
      const s = state as {
        activeTooltipIndex?: number;
        activeCoordinate?: { x: number; y: number; cx?: number; cy?: number };
      };
      if (s.activeTooltipIndex == null || !s.activeCoordinate) return;
      const entry = data[s.activeTooltipIndex];
      if (!entry) return;
      const { x, y, cx = x, cy = y } = s.activeCoordinate!;
      // Outer radius is captured from the label renderer (authoritative);
      // we don't derive it here because vertex activeCoordinate varies.
      setHover((prev) => {
        if (prev?.source === "label") return prev;
        return { stat: entry.stat, x, y, cx, cy, source: "vertex" };
      });
    },
    [data],
  );
  const handleChartLeave = useCallback(() => {
    setHover((prev) => (prev?.source === "vertex" ? null : prev));
  }, []);

  const hoveredEntry = hover ? data.find((d) => d.stat === hover.stat) : null;

  // Empty state — keep the widget shape so the carousel height is stable.
  if (data.length === 0) {
    return (
      <div
        className="flex-1 min-w-0 flex items-center justify-center"
        style={{ height: RADAR_CHART_HEIGHT }}
        role="status"
        aria-label="No comparison data"
      >
        <p className="text-[11px] font-normal text-[var(--color-text-muted)] leading-[1.6]">
          Comparison data unavailable.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-w-0"
      role="img"
      aria-label={`Radar chart comparing ${p1Name} and ${p2Name} across ${data.length} stats`}
    >
      <div className="relative w-full" style={{ height: RADAR_CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height={RADAR_CHART_HEIGHT}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius="62%"
          data={data}
          onMouseMove={handleChartMove}
          onMouseLeave={handleChartLeave}
        >
          <PolarGrid stroke="var(--color-radar-grid)" strokeWidth={1} gridType="circle" />
          <PolarAngleAxis
            dataKey="stat"
            tick={labelRenderer as never}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name={p1Name}
            dataKey="p1"
            stroke={PLAYER_1}
            fill={PLAYER_1}
            fillOpacity={0.1}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: PLAYER_1, strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: PLAYER_1,
              stroke: "var(--color-surface-card)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          <Radar
            name={p2Name}
            dataKey="p2"
            stroke={PLAYER_2}
            fill={PLAYER_2}
            fillOpacity={0.1}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: PLAYER_2, strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: PLAYER_2,
              stroke: "var(--color-surface-card)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          {/* Recharts Tooltip intentionally omitted — we render a single unified tooltip outside the SVG so vertex-hover and label-hover share one element. */}
        </RadarChart>
      </ResponsiveContainer>

      {/* Stat axis indicator — constant-length dashed line from center to the outer circle along the hovered stat's axis */}
      {hover && hoveredEntry && (() => {
        const dx = hover.x - hover.cx;
        const dy = hover.y - hover.cy;
        const dist = Math.hypot(dx, dy) || 1;
        // Fallback radius if we haven't yet observed a vertex we could
        // measure against (e.g., the first hover is a label).
        const radius = outerRadiusPx ?? dist;
        const endX = hover.cx + (dx / dist) * radius;
        const endY = hover.cy + (dy / dist) * radius;
        return (
          <svg
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height="100%"
          >
            <line
              x1={hover.cx}
              y1={hover.cy}
              x2={endX}
              y2={endY}
              stroke="var(--color-accent-blue)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              opacity={0.85}
            />
          </svg>
        );
      })()}

      {/* Unified hover tooltip — edge-aware positioning, used for both vertex and label hovers */}
      {hover && hoveredEntry && (() => {
        const { x, y, cx, cy, source } = hover;
        const dx = x - cx;
        const dy = y - cy;
        const horizRatio = Math.abs(dx) / (cx || 1);
        const translateX =
          horizRatio < 0.2 ? "-50%" : dx > 0 ? "-100%" : "0%";
        const translateY = dy <= 0 ? "calc(-100% - 10px)" : "10px";
        const marginX = dx > 0 ? -8 : dx < 0 ? 8 : 0;
        return (
          <div
            className="absolute pointer-events-none z-10"
            role="status"
            aria-live="polite"
            style={{
              left: x + marginX,
              top: y,
              transform: `translate(${translateX}, ${translateY})`,
              transition: source === "vertex"
                ? "left 120ms ease, top 120ms ease"
                : "none",
            }}
          >
            <RadarTooltipContent
              active
              label={hoveredEntry.stat}
              payload={[
                { dataKey: "p1", value: hoveredEntry.p1, payload: { stat: hoveredEntry.stat } },
                { dataKey: "p2", value: hoveredEntry.p2, payload: { stat: hoveredEntry.stat } },
              ]}
              p1Name={p1Name}
              p2Name={p2Name}
            />
          </div>
        );
      })()}
      </div>
    </div>
  );
}
