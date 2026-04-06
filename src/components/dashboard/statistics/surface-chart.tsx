"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SurfaceBreakdownItem } from "@/lib/data/statistics-server";

interface SurfaceChartProps {
  data: SurfaceBreakdownItem[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const wins = payload.find((p) => p.name === "wins")?.value ?? 0;
  const losses = payload.find((p) => p.name === "losses")?.value ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      <p className="text-xs font-semibold text-[#0D0D0D] mb-1">{label}</p>
      <p className="text-xs text-[#888888]">
        Wins: <span className="font-semibold text-[#3B82F6]">{wins}</span>
      </p>
      <p className="text-xs text-[#888888]">
        Losses: <span className="font-semibold text-[#888888]">{losses}</span>
      </p>
      <p className="text-xs text-[#888888] mt-1 border-t border-[#F0F0F0] pt-1">
        Win rate: <span className="font-semibold text-[#0D0D0D]">{winRate}%</span>
      </p>
    </div>
  );
}

export function SurfaceChart({ data }: SurfaceChartProps) {
  const filtered = data.filter((d) => d.wins + d.losses > 0);
  const chartHeight = Math.max(filtered.length * 56, 120);

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-[#0D0D0D]">Surface Breakdown</h2>
        <p className="text-xs text-[#888888] mt-0.5">Wins and losses by court type</p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-sm text-[#CCCCCC]">
          No surface data yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={filtered}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              barCategoryGap="30%"
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#888888" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="surface"
                tick={{ fontSize: 12, fill: "#333333", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar dataKey="wins" name="wins" fill="#3B82F6" radius={[0, 4, 4, 0]} animationDuration={500} />
              <Bar dataKey="losses" name="losses" fill="#E5E5E5" radius={[0, 4, 4, 0]} animationDuration={500} />
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span className="text-xs text-[#888888]">Wins</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#E5E5E5]" />
              <span className="text-xs text-[#888888]">Losses</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
