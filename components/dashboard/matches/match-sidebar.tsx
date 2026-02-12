"use client";

import { useState } from "react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";

function RallyWinRow({
  label,
  valuePct,
  fillPct,
  barColor,
}: {
  label: string;
  valuePct: number;
  fillPct: number;
  barColor: string;
}) {
  const pct = Math.min(100, Math.max(0, fillPct));

  return (
    <div className="flex flex-col gap-3 self-stretch">
      <div className="flex flex-row justify-between items-end self-stretch gap-1">
        <span className="text-xs font-normal text-[#999999] leading-[1.1]">
          {label}
        </span>
        <span className="text-[16px] leading-[1.1] font-medium text-[#525252] tabular-nums">
          {valuePct}%
        </span>
      </div>
      <div className="h-[6px] w-full bg-[#D9D9D9] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

function WinningPercentageCircle({
  percentage,
  won,
  total,
  barColor,
}: {
  percentage: number;
  won: number;
  total: number;
  barColor: string;
}) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-row items-center gap-4">
      <div className="relative w-[100px] h-[100px] shrink-0">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#D9D9D9"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={barColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
      </div>
      <div className="flex flex-col justify-center gap-1">
        <span className="font-medium text-2xl leading-tight uppercase text-black">
          {percentage.toFixed(1)}%{" "}
          <span className="text-xs">{`(${won}/${total})`}</span>
        </span>
        <span className="text-sm font-normal text-[#999999]">
          Winning Percentage
        </span>
      </div>
    </div>
  );
}

function PerformanceBar({
  label,
  value,
  barColor,
}: {
  label: string;
  value: number;
  barColor: string;
}) {
  const displayValue = value.toFixed(1);
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-row justify-between items-end gap-1">
        <span className="text-sm font-medium text-[#999999] leading-none">
          {label}
        </span>
        <span className="font-medium text-2xl leading-none uppercase text-[#0D0D0D] tabular-nums">
          {displayValue}
        </span>
      </div>
      <div className="h-1.5 w-full bg-[#D9D9D9] rounded-lg overflow-hidden">
        <div
          className="h-full rounded-lg transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

interface MatchSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
}

export function MatchSidebar({
  match,
  matchId,
  statsResult,
}: MatchSidebarProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1"
  );
  const [showMore, setShowMore] = useState(false);

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const totalPoints = playerStats?.totalPoints ?? 0;
  const totalPointsWon = playerStats?.totalPointsWon ?? 0;
  const winningPct =
    totalPoints > 0 ? (totalPointsWon / totalPoints) * 100 : 0;

  const barColor = selectedPlayer === "player1" ? "#3986F3" : "#F38439";

  const serveRating = playerStats?.serveRating ?? 0;
  const returnRating = playerStats
    ? (playerStats.returnGamesWon / Math.max(1, 10)) * 100
    : 0;
  const underPressureRating = playerStats
    ? Math.min(100, playerStats.breakpointsWon * 20)
    : 0;

  return (
    <div className="w-[320px] flex flex-col gap-6 p-6 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Player Tabs */}
      <div className="flex flex-row gap-2 shadow-[inset_0_-1px_0_0_#D9D9D9]">
        <button
          type="button"
          onClick={() => setSelectedPlayer("player1")}
          className={`flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
            selectedPlayer === "player1"
              ? "text-[#3986F3] border-[#3986F3]"
              : "text-[#999999] border-transparent hover:text-[#666666]"
          }`}
        >
          {match.player1.name}
        </button>
        <button
          type="button"
          onClick={() => setSelectedPlayer("player2")}
          className={`flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
            selectedPlayer === "player2"
              ? "text-[#F38439] border-[#F38439]"
              : "text-[#999999] border-transparent hover:text-[#666666]"
          }`}
        >
          {match.player2.name}
        </button>
      </div>

      {/* Stats Content */}
      <div className="flex flex-col gap-6">
        <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252]">
          Performance breakdown
        </div>

        {/* Winning Percentage */}
        <div className="flex flex-col gap-2.5 min-h-[124px] justify-between">
          <WinningPercentageCircle
            percentage={winningPct}
            won={totalPointsWon}
            total={totalPoints}
            barColor={barColor}
          />
        </div>

        {/* Performance Ratings */}
        <div className="flex flex-col items-stretch gap-8">
          <PerformanceBar label="Serve Rating" value={serveRating} barColor={barColor} />
          <PerformanceBar label="Return Rating" value={returnRating} barColor={barColor} />
          <PerformanceBar
            label="Under Pressure Rating"
            value={underPressureRating}
            barColor={barColor}
          />
        </div>

        {showMore && (
          <div className="flex flex-col gap-3">
            <div className="h-px w-full bg-[#D9D9D9]" />
            <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252] px-1 pt-1">
              Rally win Percentage
            </div>
            {/* Placeholder values (until rally-length stats exist) */}
            <div className="flex flex-col gap-5 px-1 pt-1">
              <RallyWinRow
                label="1-4 shots"
                valuePct={25}
                fillPct={50}
                barColor={barColor}
              />
              <RallyWinRow
                label="5-9 shots"
                valuePct={14}
                fillPct={23}
                barColor={barColor}
              />
              <RallyWinRow
                label="10+ shots"
                valuePct={21}
                fillPct={35}
                barColor={barColor}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="block text-center text-xs font-medium text-[#999999] hover:text-[#666666] transition-colors"
        >
          {showMore ? "View less" : "View more"}
        </button>
      </div>
    </div>
  );
}
