"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SelectableMatch } from "@/lib/data/statistics-server";

interface Props {
  matches: SelectableMatch[];
}

interface DotData {
  x: number;
  y: number;
  isWin: boolean;
  opponent: string;
  date: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: DotData }[];
}

function MatrixTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#F3F3F3] rounded-xl px-3 py-2.5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <p className="text-[12px] font-medium text-[#0D0D0D]">vs {d.opponent}</p>
      <p className="text-[11px] text-[#71717A]">{d.date}</p>
      <p className="text-[11px] text-[#71717A]">
        Winners: <span className="font-medium text-[#0D0D0D]">{d.x}</span>
        {" · "}
        UE: <span className="font-medium text-[#0D0D0D]">{d.y}</span>
      </p>
      <p className={`text-[11px] font-medium ${d.isWin ? "text-[#5DB955]" : "text-[#E51837]"}`}>
        {d.isWin ? "Win" : "Loss"}
      </p>
    </div>
  );
}

export function EfficiencyMatrix({ matches }: Props) {
  const dots = useMemo(
    () =>
      matches
        .filter((m) => m.winners != null && m.unforcedErrors != null)
        .map(
          (m): DotData => ({
            x: m.winners!,
            y: m.unforcedErrors!,
            isWin: m.isWin,
            opponent: m.player2Name,
            date: m.displayDate,
          })
        ),
    [matches]
  );

  const maxVal = useMemo(() => {
    if (dots.length === 0) return 20;
    return Math.max(...dots.map((d) => Math.max(d.x, d.y))) + 2;
  }, [dots]);

  if (dots.length < 3) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Efficiency Matrix
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">Need at least 3 matches with shot data</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Efficiency Matrix
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          Winners vs unforced errors per match
        </p>
      </div>

      {/* Zone label */}
      <div className="flex justify-end px-8 mb-1">
        <span className="text-[8px] font-medium text-[rgba(229,24,55,0.5)] uppercase tracking-[1px]">
          Error-prone zone ↑
        </span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 16, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
          <XAxis
            type="number"
            dataKey="x"
            name="Winners"
            domain={[0, maxVal]}
            tick={{ fontSize: 10, fill: "#AAAAAA" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Winners →", position: "insideBottom", offset: -8, fontSize: 9, fill: "#AAAAAA" }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="UE"
            domain={[0, maxVal]}
            tick={{ fontSize: 10, fill: "#AAAAAA" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "UE →", angle: -90, position: "insideLeft", offset: 16, fontSize: 9, fill: "#AAAAAA" }}
          />
          <Tooltip content={<MatrixTooltip />} cursor={{ strokeDasharray: "4 4", stroke: "#D9D9D9" }} />

          {/* Diagonal break-even line */}
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
            stroke="#D9D9D9"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          <Scatter data={dots} animationDuration={500}>
            {dots.map((d, i) => (
              <Cell
                key={i}
                fill={d.isWin ? "#5DB955" : "#E51837"}
                fillOpacity={0.65}
                stroke={d.isWin ? "#5DB955" : "#E51837"}
                strokeWidth={1}
                strokeOpacity={0.9}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#5DB955]" />
          <span className="text-[10px] font-normal text-[#AAAAAA]">Win</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#E51837]" />
          <span className="text-[10px] font-normal text-[#AAAAAA]">Loss</span>
        </div>
        <span className="text-[8px] font-medium text-[rgba(93,185,85,0.6)] uppercase tracking-[1px] ml-2">
          ↓ Efficient zone
        </span>
      </div>
    </div>
  );
}
