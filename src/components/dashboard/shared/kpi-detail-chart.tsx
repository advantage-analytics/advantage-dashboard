"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from "recharts";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { useReducedMotion } from "framer-motion";
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

interface ChartDatum extends KpiDetailPoint {
  index: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
  format?: KpiFormat;
}

function CustomTooltip({ active, payload, format }: CustomTooltipProps) {
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
      </p>
    </div>
  );
}

export default function KpiDetailChart({
  label,
  points,
  format,
}: KpiDetailChartProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasData = points.length >= 2;

  return (
    <div className="w-[280px]">
      <div className="mb-3">
        <p className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
          {label}
        </p>
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
          <AreaChart
            data={points.map((p, index): ChartDatum => ({ ...p, index }))}
            margin={{ top: 6, right: 8, bottom: 2, left: -6 }}
          >
            <defs>
              <linearGradient
                id="kpiDetailGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
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
              content={<CustomTooltip format={format} />}
              cursor={{
                stroke: "#3B82F6",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#kpiDetailGradient)"
              isAnimationActive={!shouldReduceMotion}
              animationDuration={shouldReduceMotion ? 0 : 600}
              dot={<Dot r={3} fill="#3B82F6" stroke="#fff" strokeWidth={1.5} />}
              activeDot={{
                r: 5,
                fill: "#3B82F6",
                stroke: "#fff",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
