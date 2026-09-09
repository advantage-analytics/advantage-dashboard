"use client";

import {
  Zap,
  XCircle,
  Trophy,
  AlertCircle,
  Target,
  ArrowLeftRight,
} from "lucide-react";
import type { StatisticsPageData } from "@/lib/data/statistics-server";
import type { TrendData, StatTrend } from "./trend-utils";

interface StatsGridProps {
  data: StatisticsPageData;
  trends: TrendData;
}

function Sparkline({ data: values }: { data: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 64;
  const h = 20;
  const pad = 1;

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} aria-hidden="true" className="mt-2">
      <polyline
        points={points}
        fill="none"
        stroke="#3B82F6"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.4}
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: StatTrend | null }) {
  if (!trend || trend.direction === "flat") return null;
  const isGood = (trend.direction === "up") === trend.isPositive;
  const color = isGood ? "text-[#5DB955]" : "text-[#E51837]";
  const arrow = trend.direction === "up" ? "↑" : "↓";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${color}`}>
      {arrow} {trend.delta}
    </span>
  );
}

export function StatsGrid({ data, trends }: StatsGridProps) {
  const stats = [
    {
      label: "Aces / Match",
      value: data.avgAces !== null ? String(data.avgAces) : "—",
      icon: Zap,
      trend: trends.aces,
    },
    {
      label: "Double Faults",
      value: data.avgDoubleFaults !== null ? String(data.avgDoubleFaults) : "—",
      icon: XCircle,
      trend: trends.doubleFaults,
    },
    {
      label: "Winners",
      value: data.avgWinners !== null ? String(data.avgWinners) : "—",
      icon: Trophy,
      trend: trends.winners,
    },
    {
      label: "Unforced Errors",
      value:
        data.avgUnforcedErrors !== null ? String(data.avgUnforcedErrors) : "—",
      icon: AlertCircle,
      trend: trends.unforcedErrors,
    },
    {
      label: "1st Serve In",
      value: data.avgFirstServePct !== null ? `${data.avgFirstServePct}%` : "—",
      icon: Target,
      trend: trends.firstServePct,
    },
    {
      label: "Break Conversion",
      value:
        data.avgBreakPointsConvertedPct !== null
          ? `${data.avgBreakPointsConvertedPct}%`
          : "—",
      icon: ArrowLeftRight,
      trend: trends.breakPointsConvertedPct,
    },
  ];

  const hasData = stats.some((s) => s.value !== "—");

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white p-5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] transition-[box-shadow,border-color,transform] duration-200 hover:scale-[1.008] hover:border-[#E7E7E7] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]">
      <div className="mb-5">
        <h2 className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
          Key Stats
        </h2>
        <p className="mt-1 text-[12px] font-normal text-[#71717A]">
          {hasData
            ? "Averages per match — trends vs career"
            : "Upload matches with stats to see averages"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, trend }) => (
          <div
            key={label}
            className="flex flex-col gap-2 rounded-xl border border-[#F3F3F3] bg-[#FAFAFA] p-4"
          >
            <Icon
              className="size-4 text-[#AAAAAA]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <p className="mb-1 text-[9px] leading-[13.5px] font-normal tracking-[2px] text-[#AAAAAA] uppercase">
                {label}
              </p>
              <div className="flex items-baseline justify-between">
                <p className="text-[28px] leading-none font-light tracking-[-0.5px] text-[#0D0D0D] tabular-nums">
                  {value}
                </p>
                <TrendArrow trend={trend} />
              </div>
              {trend?.sparkline && trend.sparkline.length >= 2 && (
                <Sparkline data={trend.sparkline} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
