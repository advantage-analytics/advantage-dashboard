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
  return (
    <div className="bg-white border border-[#F3F3F3] rounded-xl px-3 py-2.5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <p className="text-[12px] font-medium text-[#0D0D0D] leading-none truncate max-w-[180px]">
        {d.opponent}
      </p>
      {dateLabel && (
        <p className="text-[11px] font-normal text-[#AAAAAA] mt-1 leading-none">
          {dateLabel}
        </p>
      )}
      <p className="text-[11px] font-normal text-[#71717A] mt-1.5 leading-none">
        <span className="font-medium text-[#3B82F6] tabular-nums">
          {formatValue(d.value, format)}
        </span>
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
        <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          {label}
        </p>
        <p className="text-[11px] font-normal text-[#71717A] mt-1">
          {hasData ? `Last ${points.length} matches` : "Match history"}
        </p>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-[130px] text-[12px] text-[#AAAAAA]">
          Not enough match history
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart
            data={points.map((p, index): ChartDatum => ({ ...p, index }))}
            margin={{ top: 6, right: 8, bottom: 2, left: -6 }}
          >
            <defs>
              <linearGradient id="kpiDetailGradient" x1="0" y1="0" x2="0" y2="1">
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
              activeDot={{ r: 5, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
