"use client";

import { useState } from "react";
import type { StatisticsPageData } from "@/lib/data/statistics-server";
import type { TrendData, StatTrend } from "./trend-utils";

type Tab = "serve" | "return" | "other";

interface Props {
  data: StatisticsPageData;
  trends: TrendData;
}

interface StatItem {
  label: string;
  value: string;
  trend: StatTrend | null;
}

function TrendArrow({ trend }: { trend: StatTrend | null }) {
  if (!trend || trend.direction === "flat") return null;
  const isGood = (trend.direction === "up") === trend.isPositive;
  const color = isGood ? "text-[#5DB955]" : "text-[#E51837]";
  const arrow = trend.direction === "up" ? "↑" : "↓";
  return (
    <span className={`text-[10px] font-medium tabular-nums ${color} ml-0.5`}>
      {arrow}{trend.delta}
    </span>
  );
}

function fmt(v: number | null, suffix = ""): string {
  if (v === null || v === 0) return "—";
  return `${v}${suffix}`;
}

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "other", label: "Other" },
];

export function StatSummaryStrip({ data, trends }: Props) {
  const [tab, setTab] = useState<Tab>("serve");

  const TABS: Record<Tab, StatItem[]> = {
    serve: [
      { label: "Aces", value: fmt(data.avgAces), trend: trends.aces },
      { label: "DFs", value: fmt(data.avgDoubleFaults), trend: trends.doubleFaults },
      { label: "1st In", value: fmt(data.avgFirstServePct, "%"), trend: trends.firstServePct },
      { label: "1st Won", value: fmt(data.avgFirstServeWonPct, "%"), trend: trends.firstServeWonPct },
      { label: "2nd Won", value: fmt(data.avgSecondServeWonPct, "%"), trend: trends.secondServeWonPct },
      { label: "BP Saved", value: fmt(data.avgBreakPointsSavedPct, "%"), trend: trends.breakPointsSavedPct },
      { label: "Svc Games", value: fmt(data.avgServiceGamesWonPct, "%"), trend: trends.serviceGamesWonPct },
    ],
    return: [
      { label: "BP Conv", value: fmt(data.avgBreakPointsConvertedPct, "%"), trend: trends.breakPointsConvertedPct },
      { label: "1st Ret Won", value: fmt(data.avgFirstReturnWonPct, "%"), trend: trends.firstReturnWonPct },
      { label: "2nd Ret Won", value: fmt(data.avgSecondReturnWonPct, "%"), trend: trends.secondReturnWonPct },
      { label: "Ret Games", value: fmt(data.avgReturnGamesWonPct, "%"), trend: trends.returnGamesWonPct },
    ],
    other: [
      { label: "Winners", value: fmt(data.avgWinners), trend: trends.winners },
      { label: "Errors", value: fmt(data.avgUnforcedErrors), trend: trends.unforcedErrors },
      { label: "Net Pts", value: fmt(data.avgNetPointsWonPct, "%"), trend: trends.netPointsWonPct },
      { label: "Short", value: fmt(data.shortRallyWonPct, "%"), trend: trends.shortRallyWonPct },
      { label: "Medium", value: fmt(data.mediumRallyWonPct, "%"), trend: trends.mediumRallyWonPct },
      { label: "Long", value: fmt(data.longRallyWonPct, "%"), trend: trends.longRallyWonPct },
      { label: "Total Pts", value: fmt(data.avgTotalPointsWonPct, "%"), trend: trends.totalPointsWonPct },
    ],
  };

  const items = TABS[tab];
  if (data.totalMatches === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Tab pills */}
      <div className="flex items-center gap-1.5">
        {TAB_OPTIONS.map((option) => {
          const isActive = tab === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all duration-200 ${
                isActive
                  ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-[#888888] hover:text-[#525252]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Stat values */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1.5px]">
              {item.label}
            </span>
            <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">
              {item.value}
            </span>
            <TrendArrow trend={item.trend} />
          </div>
        ))}
      </div>
    </div>
  );
}
