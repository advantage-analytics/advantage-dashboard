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

type StatKey =
  | "firstServePct" | "firstServeWonPct" | "secondServeWonPct"
  | "breakPointsSavedPct" | "serviceGamesWonPct"
  | "breakPointsConvertedPct" | "firstReturnWonPct" | "secondReturnWonPct" | "returnGamesWonPct"
  | "aces" | "doubleFaults" | "winners" | "unforcedErrors"
  | "netPointsWonPct" | "totalPointsWonPct"
  | "shortRallyWonPct" | "mediumRallyWonPct" | "longRallyWonPct"
  | "serveRating" | "returnRating";

interface StatConfig {
  label: string;
  color: string;
  axis: "left" | "right";
  category: "serve" | "return" | "other";
}

const STAT_CONFIG: Record<StatKey, StatConfig> = {
  // Serve (percentages → left axis, counts → right)
  aces:               { label: "Aces", color: "#0D0D0D", axis: "right", category: "serve" },
  doubleFaults:       { label: "DFs", color: "#E51837", axis: "right", category: "serve" },
  firstServePct:      { label: "1st In %", color: "#3B82F6", axis: "left", category: "serve" },
  firstServeWonPct:   { label: "1st Won %", color: "#2563EB", axis: "left", category: "serve" },
  secondServeWonPct:  { label: "2nd Won %", color: "#60A5FA", axis: "left", category: "serve" },
  breakPointsSavedPct:{ label: "BP Saved %", color: "#7C3AED", axis: "left", category: "serve" },
  serviceGamesWonPct: { label: "Svc Games %", color: "#8B5CF6", axis: "left", category: "serve" },
  // Return (percentages → left)
  breakPointsConvertedPct: { label: "BP Conv %", color: "#059669", axis: "left", category: "return" },
  firstReturnWonPct:  { label: "1st Ret Won %", color: "#10B981", axis: "left", category: "return" },
  secondReturnWonPct: { label: "2nd Ret Won %", color: "#34D399", axis: "left", category: "return" },
  returnGamesWonPct:  { label: "Ret Games %", color: "#6EE7B7", axis: "left", category: "return" },
  // Other
  winners:            { label: "Winners", color: "#0D0D0D", axis: "right", category: "other" },
  unforcedErrors:     { label: "Errors", color: "#F59E0B", axis: "right", category: "other" },
  netPointsWonPct:    { label: "Net Pts %", color: "#64748B", axis: "left", category: "other" },
  totalPointsWonPct:  { label: "Total Pts %", color: "#94A3B8", axis: "left", category: "other" },
  shortRallyWonPct:   { label: "Short Rally", color: "#F472B6", axis: "left", category: "other" },
  mediumRallyWonPct:  { label: "Med Rally", color: "#E879F9", axis: "left", category: "other" },
  longRallyWonPct:    { label: "Long Rally", color: "#C084FC", axis: "left", category: "other" },
  // Ratings (0-300+ scale → right axis)
  serveRating:        { label: "Serve Rtg", color: "#475569", axis: "right", category: "serve" },
  returnRating:       { label: "Return Rtg", color: "#64748B", axis: "right", category: "return" },
};

const CATEGORIES: { key: string; label: string; stats: StatKey[] }[] = [
  { key: "serve", label: "Serve", stats: Object.keys(STAT_CONFIG).filter((k) => STAT_CONFIG[k as StatKey].category === "serve") as StatKey[] },
  { key: "return", label: "Return", stats: Object.keys(STAT_CONFIG).filter((k) => STAT_CONFIG[k as StatKey].category === "return") as StatKey[] },
  { key: "other", label: "Other", stats: Object.keys(STAT_CONFIG).filter((k) => STAT_CONFIG[k as StatKey].category === "other") as StatKey[] },
];

const ALL_STATS = Object.keys(STAT_CONFIG) as StatKey[];
const DEFAULT_ENABLED = new Set<StatKey>(["firstServePct", "winners", "unforcedErrors"]);

interface Props {
  matches: SelectableMatch[];
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | null;
  color: string;
  name: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#F3F3F3] rounded-xl px-3 py-2.5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <p className="text-[12px] font-medium text-[#0D0D0D] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[11px] text-[#71717A]">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: p.color }}
          />
          {STAT_CONFIG[p.dataKey as StatKey]?.label ?? p.dataKey}:{" "}
          <span className="font-medium" style={{ color: p.color }}>
            {p.value != null ? p.value.toFixed(1) : "—"}
          </span>
        </p>
      ))}
    </div>
  );
}

export function StatProgressionChart({ matches }: Props) {
  const [enabled, setEnabled] = useState<Set<StatKey>>(() => new Set(DEFAULT_ENABLED));

  const chronological = useMemo(
    () => [...matches].sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    [matches]
  );

  // Dynamic window: adapts to dataset size so small datasets still show data
  const window = Math.max(2, Math.min(3, Math.ceil(chronological.length / 2)));
  const showDots = chronological.length <= 8;

  const chartData = useMemo(() => {
    const rollingData: Record<string, (number | null)[]> = {};
    for (const key of ALL_STATS) {
      const raw = chronological.map((m) => m[key]);
      rollingData[key] = rollingAverage(raw, window);
    }

    return chronological.map((m, i) => {
      const point: Record<string, string | number | null> = {
        label: m.player2Name.split(" ").pop() ?? `#${i + 1}`,
      };
      for (const key of ALL_STATS) {
        point[key] = rollingData[key][i];
      }
      return point;
    });
  }, [chronological, window]);

  const careerAvgs = useMemo(() => {
    const result: Partial<Record<StatKey, number>> = {};
    for (const key of ALL_STATS) {
      const vals = chronological
        .map((m) => m[key])
        .filter((v): v is number => v !== null);
      if (vals.length > 0) {
        result[key] =
          Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
      }
    }
    return result;
  }, [chronological]);

  function toggleStat(key: StatKey) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const hasRightAxis = ALL_STATS.some(
    (k) => enabled.has(k) && STAT_CONFIG[k].axis === "right"
  );
  const hasLeftAxis = ALL_STATS.some(
    (k) => enabled.has(k) && STAT_CONFIG[k].axis === "left"
  );

  if (chronological.length < 2) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Progression
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          Need at least 2 matches
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            Progression
          </h2>
          <p className="text-[12px] font-normal text-[#71717A] mt-1">
            {window}-match rolling averages
          </p>
        </div>
      </div>

      {/* Stat toggles by category */}
      <div className="flex flex-col gap-2 mb-4">
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[8px] font-medium text-[#AAAAAA] uppercase tracking-[1px] w-[42px] shrink-0">
              {cat.label}
            </span>
            {cat.stats.map((key) => {
              const cfg = STAT_CONFIG[key];
              const isOn = enabled.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStat(key)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
                    isOn
                      ? "text-[#0D0D0D] bg-[#F7F7F7]"
                      : "text-[#AAAAAA] bg-transparent hover:bg-[#FAFAFA]"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 transition-opacity duration-200"
                    style={{
                      backgroundColor: cfg.color,
                      opacity: isOn ? 1 : 0.25,
                    }}
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: hasRightAxis ? 4 : 4, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#F0F0F0"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#AAAAAA" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />

          {hasLeftAxis && (
            <YAxis
              yAxisId="left"
              orientation="left"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#AAAAAA" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
          )}
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation={hasLeftAxis ? "right" : "left"}
              tick={{ fontSize: 10, fill: "#AAAAAA" }}
              axisLine={false}
              tickLine={false}
            />
          )}
          {!hasLeftAxis && !hasRightAxis && <YAxis yAxisId="left" hide />}

          <Tooltip
            content={<ChartTooltip />}
            cursor={{
              stroke: "#3B82F6",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
          />

          {/* Career avg reference lines */}
          {ALL_STATS.filter(
            (k) => enabled.has(k) && careerAvgs[k] != null
          ).map((key) => (
            <ReferenceLine
              key={`ref-${key}`}
              yAxisId={STAT_CONFIG[key].axis}
              y={careerAvgs[key]}
              stroke={STAT_CONFIG[key].color}
              strokeDasharray="8 4"
              strokeOpacity={0.2}
            />
          ))}

          {/* Stat lines */}
          {ALL_STATS.filter((k) => enabled.has(k)).map((key) => (
            <Line
              key={key}
              yAxisId={STAT_CONFIG[key].axis}
              type="monotone"
              dataKey={key}
              stroke={STAT_CONFIG[key].color}
              strokeWidth={2}
              dot={
                showDots
                  ? {
                      r: 3,
                      fill: STAT_CONFIG[key].color,
                      stroke: "#fff",
                      strokeWidth: 1.5,
                    }
                  : false
              }
              activeDot={{
                r: 4,
                fill: STAT_CONFIG[key].color,
                stroke: "#fff",
                strokeWidth: 2,
              }}
              connectNulls
              animationDuration={600}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
