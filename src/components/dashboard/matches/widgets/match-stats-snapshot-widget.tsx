"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { shortName } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import type { PlayerStatistics, StatFraction } from "@/lib/data/types";

/* ── Colors ────────────────────────────────────────────────── */

const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#F38439";

/* ── Radar stats (all percentage-based for comparable axes) ── */

interface RadarStat {
  key: keyof PlayerStatistics;
  label: string;
  shortLabel: string;
}

const RADAR_STATS: RadarStat[] = [
  { key: "firstServeInPct", label: "1st Serve In %", shortLabel: "1st Srv In" },
  { key: "firstServeWinPct", label: "1st Serve Won %", shortLabel: "1st Srv Won" },
  { key: "secondServeWinPct", label: "2nd Serve Won %", shortLabel: "2nd Srv Won" },
  { key: "serviceGamesWonPct", label: "Service Games %", shortLabel: "Svc Games" },
  { key: "breakpointsWonPct", label: "Break Pts Won %", shortLabel: "BPs Won" },
  { key: "firstReturnWonPct", label: "1st Return Won %", shortLabel: "1st Ret Won" },
  { key: "secondReturnWonPct", label: "2nd Return Won %", shortLabel: "2nd Ret Won" },
  { key: "returnGamesWonPct", label: "Return Games %", shortLabel: "Ret Games" },
];

/* ── Table stats (mix of pct and counting) ─────────────────── */

interface TableStat {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage?: boolean;
  isFraction?: boolean;
}

const TABLE_STATS: TableStat[] = [
  { key: "firstServeInPct", label: "1st Serve In", isPercentage: true },
  { key: "firstServeWinPct", label: "1st Serve Won", isPercentage: true },
  { key: "breakpointsWonPct", label: "Break Pts Conv.", isPercentage: true },
  { key: "winners", label: "Winners" },
  { key: "unforcedErrors", label: "Errors" },
  { key: "totalPointsWon", label: "Total Points Won" },
];

/* ── Custom radar label ────────────────────────────────────── */

function renderPolarAngleLabel(props: { payload: { value: string }; x: number; y: number; cx: number; cy: number }) {
  const { payload, x, y, cx, cy } = props;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offsetX = (dx / dist) * 14;
  const offsetY = (dy / dist) * 14;

  return (
    <text
      x={x + offsetX}
      y={y + offsetY}
      textAnchor={x > cx ? "start" : x < cx ? "end" : "middle"}
      dominantBaseline={y > cy ? "hanging" : y < cy ? "auto" : "central"}
      className="fill-[#888888] text-[9px] font-medium"
    >
      {payload.value}
    </text>
  );
}

/* ── Widget ────────────────────────────────────────────────── */

export function MatchStatsSnapshotWidget() {
  const { matchId } = useParams<{ matchId: string }>();
  const { statsResult } = useMatchData();

  const stats = statsResult?.statistics;
  const p1 = stats?.player1Stats;
  const p2 = stats?.player2Stats;

  const p1Short = shortName(statsResult?.player1Name ?? "Player 1", 14);
  const p2Short = shortName(statsResult?.player2Name ?? "Player 2", 14);

  const radarData = useMemo(() => {
    if (!p1 || !p2) return [];
    return RADAR_STATS.map((stat) => ({
      stat: stat.shortLabel,
      p1: p1[stat.key] as number,
      p2: p2[stat.key] as number,
    }));
  }, [p1, p2]);

  if (!stats || !p1 || !p2) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Key Stats
        </p>
        <p className="text-[12px] text-[#888888] mt-4">
          Statistics will be available after match data is processed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Performance Comparison
        </p>
        <Link
          href={`/dashboard/matches/${matchId}`}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] hover:text-[#2563EB] transition-colors duration-200"
        >
          VIEW ALL
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Radar chart */}
        <div className="flex-1 min-w-0 px-2 pb-2">
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
              <PolarGrid stroke="#E5E5EA" strokeWidth={0.5} />
              <PolarAngleAxis
                dataKey="stat"
                tick={renderPolarAngleLabel as never}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                name={p1Short}
                dataKey="p1"
                stroke={P1_COLOR}
                fill={P1_COLOR}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={{ r: 3, fill: P1_COLOR, strokeWidth: 0 }}
              />
              <Radar
                name={p2Short}
                dataKey="p2"
                stroke={P2_COLOR}
                fill={P2_COLOR}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={{ r: 3, fill: P2_COLOR, strokeWidth: 0 }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={6}
                wrapperStyle={{ fontSize: "10px", color: "#888888", paddingTop: "8px" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Compact stats table */}
        <div className="lg:w-[280px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#F3F3F3]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_56px_56px] items-center h-10 px-4 border-b border-[#F3F3F3]">
            <span className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1px]">Stat</span>
            <span className="text-[9px] font-medium uppercase tracking-[1px] text-right" style={{ color: P1_COLOR }}>
              {p1Short}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-[1px] text-right" style={{ color: P2_COLOR }}>
              {p2Short}
            </span>
          </div>

          {/* Table rows */}
          {TABLE_STATS.map((stat) => {
            const v1 = p1[stat.key] as number;
            const v2 = p2[stat.key] as number;
            const f1 = (stat.isPercentage || stat.isFraction) ? p1.fractions[stat.key] : undefined;
            const f2 = (stat.isPercentage || stat.isFraction) ? p2.fractions[stat.key] : undefined;
            const p1Leading = v1 > v2;
            const p2Leading = v2 > v1;

            return (
              <div
                key={stat.key}
                className="grid grid-cols-[1fr_56px_56px] items-center h-9 px-4 border-b border-[#F3F3F3] last:border-b-0"
              >
                <span className="text-[10px] font-normal text-[#888888]">{stat.label}</span>
                <span className={cn(
                  "text-[12px] font-medium tabular-nums text-right",
                  p1Leading ? "text-[#0D0D0D]" : "text-[#AAAAAA]",
                )}>
                  {v1}{stat.isPercentage && "%"}
                  {stat.isPercentage && f1 && (
                    <span className="text-[8px] font-normal text-[#CCCCCC] ml-0.5">
                      {f1.made}/{f1.attempts}
                    </span>
                  )}
                </span>
                <span className={cn(
                  "text-[12px] font-medium tabular-nums text-right",
                  p2Leading ? "text-[#0D0D0D]" : "text-[#AAAAAA]",
                )}>
                  {v2}{stat.isPercentage && "%"}
                  {stat.isPercentage && f2 && (
                    <span className="text-[8px] font-normal text-[#CCCCCC] ml-0.5">
                      {f2.made}/{f2.attempts}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
