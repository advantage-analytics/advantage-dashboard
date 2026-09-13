"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { SelectableMatch } from "@/lib/data/statistics-server";
import { rollingAverage } from "./trend-utils";

type StatKey = "firstServePct" | "winners" | "unforcedErrors" | "aces" | "breakPointsConvertedPct";

interface StatOption {
  key: StatKey;
  label: string;
  short: string;
  color: string;
  dashed: boolean;
}

const STAT_PAIRS: [StatOption, StatOption][] = [
  [
    { key: "firstServePct", label: "1st Serve %", short: "1st Srv", color: "#3B82F6", dashed: false },
    { key: "unforcedErrors", label: "Unforced Errors", short: "UE", color: "#0D0D0D", dashed: true },
  ],
  [
    { key: "winners", label: "Winners", short: "Winners", color: "#3B82F6", dashed: false },
    { key: "aces", label: "Aces", short: "Aces", color: "#0D0D0D", dashed: true },
  ],
  [
    { key: "firstServePct", label: "1st Serve %", short: "1st Srv", color: "#3B82F6", dashed: false },
    { key: "breakPointsConvertedPct", label: "Break Conv %", short: "BP Conv", color: "#0D0D0D", dashed: true },
  ],
];

interface Props {
  matches: SelectableMatch[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#F3F3F3] rounded-xl px-3 py-2.5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <p className="text-[12px] font-medium text-[#0D0D0D] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[11px] text-[#71717A]">
          {p.dataKey === "rolling1" ? "Avg" : "Avg"}: <span className="font-medium" style={{ color: p.color }}>{p.value?.toFixed(1) ?? "—"}</span>
        </p>
      ))}
    </div>
  );
}

export function StatTrajectoryChart({ matches }: Props) {
  const [pairIndex, setPairIndex] = useState(0);
  const pair = STAT_PAIRS[pairIndex];

  const chronological = useMemo(
    () => [...matches].sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    [matches]
  );

  const chartData = useMemo(() => {
    const stat1Values = chronological.map((m) => m[pair[0].key]);
    const stat2Values = chronological.map((m) => m[pair[1].key]);
    const rolling1 = rollingAverage(stat1Values, 5);
    const rolling2 = rollingAverage(stat2Values, 5);

    return chronological.map((m, i) => ({
      label: m.player2Name.split(" ").pop() ?? `#${i + 1}`,
      rolling1: rolling1[i],
      rolling2: rolling2[i],
    }));
  }, [chronological, pair]);

  // Career averages for reference lines
  const careerAvg = useMemo(() => {
    function avg(values: (number | null)[]): number | null {
      const valid = values.filter((v): v is number => v !== null);
      return valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : null;
    }
    return {
      avg1: avg(chronological.map((m) => m[pair[0].key])),
      avg2: avg(chronological.map((m) => m[pair[1].key])),
    };
  }, [chronological, pair]);

  if (chronological.length < 3) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Stat Trajectory
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">Need at least 3 matches</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            Stat Trajectory
          </h2>
          <p className="text-[12px] font-normal text-[#71717A] mt-1">
            5-match rolling averages
          </p>
        </div>

        {/* Pair selector */}
        <div className="flex items-center bg-[#F7F7F7] rounded-full p-0.5">
          {STAT_PAIRS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPairIndex(i)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all duration-200 ${
                pairIndex === i
                  ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-[#888888] hover:text-[#525252]"
              }`}
            >
              {p[0].short} / {p[1].short}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: pair[0].color }} />
          <span className="text-[10px] font-normal text-[#525252]">{pair[0].label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full border-t border-dashed" style={{ borderColor: pair[1].color }} />
          <span className="text-[10px] font-normal text-[#525252]">{pair[1].label}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#AAAAAA" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#AAAAAA" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#3B82F6", strokeWidth: 1, strokeDasharray: "4 4" }} />

          {careerAvg.avg1 !== null && (
            <ReferenceLine y={careerAvg.avg1} stroke={pair[0].color} strokeDasharray="8 4" strokeOpacity={0.3} />
          )}
          {careerAvg.avg2 !== null && (
            <ReferenceLine y={careerAvg.avg2} stroke={pair[1].color} strokeDasharray="8 4" strokeOpacity={0.3} />
          )}

          <Line
            type="monotone"
            dataKey="rolling1"
            stroke={pair[0].color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: pair[0].color, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
            animationDuration={600}
          />
          <Line
            type="monotone"
            dataKey="rolling2"
            stroke={pair[1].color}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, fill: pair[1].color, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
