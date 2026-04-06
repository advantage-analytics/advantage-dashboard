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
import type { MonthlyTrendPoint } from "@/lib/data/statistics-server";

interface WinRateChartProps {
  data: MonthlyTrendPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: MonthlyTrendPoint }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      <p className="text-xs font-semibold text-[#0D0D0D] mb-1">{label}</p>
      <p className="text-xs text-[#888888]">
        Win rate:{" "}
        <span className="font-semibold text-[#3B82F6]">{d.winRate}%</span>
      </p>
      <p className="text-xs text-[#888888]">
        {d.wins}W – {d.losses}L
      </p>
    </div>
  );
}

export function WinRateChart({ data }: WinRateChartProps) {
  const hasData = data.some((d) => d.wins + d.losses > 0);

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-[#0D0D0D]">Win Rate Over Time</h2>
          <p className="text-xs text-[#888888] mt-0.5">Last 12 months</p>
        </div>
        {hasData && (
          <span className="text-xs font-medium text-[#3B82F6] bg-[#EBF0FE] px-2 py-0.5 rounded-full">
            {data.reduce((a, d) => a + d.wins, 0)}W –{" "}
            {data.reduce((a, d) => a + d.losses, 0)}L
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-[220px] text-sm text-[#CCCCCC]">
          No match data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#888888" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: "#888888" }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#3B82F6", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="winRate"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#winRateGradient)"
              animationDuration={600}
              dot={<Dot r={3} fill="#3B82F6" stroke="#fff" strokeWidth={1.5} />}
              activeDot={{ r: 5, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
