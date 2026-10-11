"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { useReducedMotion } from "framer-motion";
import {
  VIZ_BLUE,
  VIZ_BLUE_DEEP,
  VIZ_SLATE_LIGHT,
} from "@/lib/design/data-viz";
import type { KpiFormat } from "@/lib/data/performance-server";

export interface KpiDetailPoint {
  value: number;
  date: string;
  opponent: string;
}

interface KpiDetailChartProps {
  label: string;
  points: KpiDetailPoint[];
  format?: KpiFormat;
  /**
   * Draws a dashed reference line at this value — the mean of `points`.
   * Omitted (or null), nothing is drawn.
   */
  average?: number | null;
  /**
   * A rolling mean, one entry per point (null where there is none). Given,
   * it becomes the chart's line (`VIZ_BLUE_DEEP`, so it reads apart from the
   * dots), each match is drawn as a dot alone, and the readout names both
   * figures. Omitted, the chart is the plain one.
   */
  rolling?: (number | null)[];
  /** The window `rolling` was taken over, for "NN% rolling N"; null is Off. */
  rollingWindow?: number | null;
  /**
   * Only the plot, as wide as its parent at the trend frame's 760:250 — no
   * 280px box, no heading, no "not enough history" line. For a card that
   * draws those itself; `label` then names the plot to assistive technology.
   */
  plotOnly?: boolean;
}

function formatValue(value: number, format?: KpiFormat): string {
  if (format === "percent") return `${Math.round(value)}%`;
  if (format === "count") return `${Math.round(value)}`;
  return value.toFixed(1);
}

function formatDate(date: string): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A mean of counts is rarely whole: 4.4 aces a match is not "4". */
function formatMean(value: number, format?: KpiFormat): string {
  return format === "count" ? value.toFixed(1) : formatValue(value, format);
}

interface ChartDatum extends KpiDetailPoint {
  index: number;
  rolling?: number | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
  format?: KpiFormat;
  /** A rolling series is on the chart, so the match's figure says which it is. */
  trend?: boolean;
  rollingWindow?: number | null;
}

function CustomTooltip({
  active,
  payload,
  format,
  trend,
  rollingWindow,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dateLabel = formatDate(d.date);
  // The report page's dark chart readout, by decision — every chart mark in
  // the product opens the same black box, and this draws its skin from
  // `chart-tooltip.tsx` rather than restating it.
  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2.5 ${DARK_READOUT_CLASS}`}
      style={DARK_READOUT_STYLE}
    >
      <p className="max-w-[180px] truncate text-[12px] leading-none font-medium text-white">
        {d.opponent}
      </p>
      {dateLabel && (
        <p className="tabular text-[11px] leading-none text-white/[0.64]">
          {dateLabel}
        </p>
      )}
      <p className="tabular pt-0.5 text-[11px] leading-none font-medium text-white">
        {formatValue(d.value, format)}
        {trend ? " this match" : ""}
      </p>
      {trend && typeof d.rolling === "number" && rollingWindow != null && (
        <p className="tabular text-[11px] leading-none text-white/[0.64]">
          {formatMean(d.rolling, format)} rolling {rollingWindow}
        </p>
      )}
    </div>
  );
}

export default function KpiDetailChart({
  label,
  points,
  format,
  average,
  rolling,
  rollingWindow,
  plotOnly,
}: KpiDetailChartProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasData = points.length >= 2;
  // With a rolling series the line is the rolling mean and a match is a dot.
  const trend = rolling !== undefined;

  const chart = (
    <AreaChart
      data={points.map((p, index): ChartDatum =>
        trend
          ? { ...p, index, rolling: rolling[index] ?? null }
          : { ...p, index },
      )}
      margin={{ top: 6, right: 8, bottom: 2, left: -6 }}
    >
      <defs>
        <linearGradient id="kpiDetailGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={VIZ_BLUE} stopOpacity={0.15} />
          <stop offset="95%" stopColor={VIZ_BLUE} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#F3F3F3" />
      <XAxis
        dataKey="date"
        tickFormatter={(d: string) => formatDate(d)}
        tick={{ fontSize: 9, fill: "#AAAAAA" }}
        axisLine={{ stroke: "#E5E5EA" }}
        tickLine={{ stroke: "#E5E5EA" }}
        interval="preserveStartEnd"
        minTickGap={8}
        tickMargin={6}
      />
      <YAxis
        tick={{ fontSize: 9, fill: "#AAAAAA" }}
        axisLine={{ stroke: "#E5E5EA" }}
        tickLine={{ stroke: "#E5E5EA" }}
        width={38}
        tickCount={4}
        domain={["dataMin", "dataMax"]}
        tickFormatter={(v: number) => formatValue(v, format)}
      />
      <Tooltip
        content={
          <CustomTooltip
            format={format}
            trend={trend}
            rollingWindow={rollingWindow}
          />
        }
        cursor={{
          stroke: VIZ_BLUE,
          strokeWidth: 1,
          strokeDasharray: "4 4",
        }}
      />
      {typeof average === "number" && (
        <ReferenceLine
          y={average}
          stroke={VIZ_SLATE_LIGHT}
          strokeWidth={1}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
      )}
      <Area
        type="linear"
        dataKey="value"
        stroke={trend ? "none" : VIZ_BLUE}
        strokeWidth={2}
        fill={trend ? "none" : "url(#kpiDetailGradient)"}
        isAnimationActive={!shouldReduceMotion}
        animationDuration={shouldReduceMotion ? 0 : 600}
        dot={
          <Dot
            r={3}
            fill={VIZ_BLUE}
            stroke="#fff"
            strokeWidth={1.5}
            // Recharts hands a dot its series' 60% fill opacity. Alone on
            // the plot a dot IS the mark, so it is drawn solid; the prop is
            // left off (not set undefined) so the plain chart is unchanged.
            {...(trend ? { fillOpacity: 1 } : {})}
          />
        }
        activeDot={{
          r: 5,
          fill: VIZ_BLUE,
          stroke: "#fff",
          strokeWidth: 2,
        }}
      />
      {trend && (
        <Area
          type="linear"
          dataKey="rolling"
          stroke={VIZ_BLUE_DEEP}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="url(#kpiDetailGradient)"
          isAnimationActive={!shouldReduceMotion}
          animationDuration={shouldReduceMotion ? 0 : 600}
          dot={false}
          activeDot={{
            r: 4,
            fill: VIZ_BLUE_DEEP,
            stroke: "#fff",
            strokeWidth: 2,
          }}
        />
      )}
    </AreaChart>
  );

  if (plotOnly) {
    // The box holds its 760:250 before Recharts has measured it, so the card
    // does not jump when the plot arrives.
    return hasData ? (
      <div role="img" aria-label={label} className="aspect-[760/250] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    ) : null;
  }

  return (
    <div className="w-[280px]">
      <div className="mb-3">
        <p className="eyebrow">{label}</p>
        <p className="mt-1 text-[11px] font-normal text-[#71717A]">
          {hasData ? `Last ${points.length} matches` : "Match history"}
        </p>
      </div>

      {!hasData ? (
        <div className="flex h-[130px] items-center justify-center text-[12px] text-[#AAAAAA]">
          Not enough match history
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  );
}
