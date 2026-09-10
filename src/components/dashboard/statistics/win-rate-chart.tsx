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
    <div className="rounded-xl border border-[#F3F3F3] bg-white px-3 py-2.5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <p className="mb-1 text-[12px] font-medium text-[#0D0D0D]">{label}</p>
      <p className="text-[11px] font-normal text-[#71717A]">
        Win rate:{" "}
        <span className="font-medium text-[#3B82F6]">{d.winRate}%</span>
      </p>
      <p className="text-[11px] font-normal text-[#71717A]">
        {d.wins}W – {d.losses}L
      </p>
    </div>
  );
}

export function WinRateChart({ data }: WinRateChartProps) {
  const hasData = data.some((d) => d.wins + d.losses > 0);

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white p-5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] transition-[box-shadow,border-color,transform] duration-200 hover:scale-[1.008] hover:border-[#E7E7E7] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
            Win Rate Over Time
          </h2>
          <p className="mt-1 text-[12px] font-normal text-[#71717A]">
            Last 12 months
          </p>
        </div>
        {hasData && (
          <span className="rounded-full bg-[#EBF2FD] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
            {data.reduce((a, d) => a + d.wins, 0)}W –{" "}
            {data.reduce((a, d) => a + d.losses, 0)}L
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex h-[220px] items-center justify-center text-[12px] text-[#AAAAAA]">
          No match data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
          >
            <defs>
              <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F0F0F0"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#AAAAAA" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "#AAAAAA" }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#3B82F6",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="winRate"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#winRateGradient)"
              animationDuration={600}
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
