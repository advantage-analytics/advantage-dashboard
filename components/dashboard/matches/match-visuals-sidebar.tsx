"use client";

import { useState } from "react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-row justify-between items-center self-stretch px-1">
      <div className="flex flex-row items-center gap-2">
        <div className="w-px h-3 bg-[#D9D9D9]" />
        <span className="text-[12px] font-normal leading-[0.75] text-[#999999]">
          {label}
        </span>
      </div>
      <span className="w-[51px] text-right text-[20px] leading-[1.1] font-medium text-[#525252] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function DistributionRow({
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
        <span className="text-[12px] font-normal leading-[1.1] text-[#999999]">
          {label}
        </span>
        <span className="text-[16px] leading-[1.1] font-medium text-[#525252] tabular-nums">
          {valuePct}%
        </span>
      </div>
      <div className="h-[6px] w-full bg-[#D9D9D9] overflow-hidden rounded-full">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  );
}

function WinningCircleCard({
  percentage,
  won,
  total,
  label,
  barColor,
}: {
  percentage: number;
  won: number;
  total: number;
  label: string;
  barColor: string;
}) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="w-full h-[124px] rounded-2xl flex flex-col justify-between">
      <div className="flex flex-row items-center gap-4">
        <div className="relative w-[100px] h-[100px] shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" stroke="#D9D9D9" strokeWidth="8" />
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
          <span className="font-medium text-[24px] leading-[1.1] uppercase text-black">
            {percentage.toFixed(1)}%{" "}
            <span className="text-[24px] leading-[1.1] font-medium uppercase text-black">{`(${won}/${total})`}</span>
          </span>
          <span className="text-[14px] font-normal text-[#999999] leading-[1.21]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

interface MatchVisualsSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
}

export function MatchVisualsSidebar({
  match,
  matchId: _matchId,
  statsResult,
}: MatchVisualsSidebarProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1"
  );
  const [showMore, setShowMore] = useState(false);

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const barColor = selectedPlayer === "player1" ? "#3986F3" : "#F38439";

  // Serve breakdown values (mapped to existing stats)
  const firstServeInPct = playerStats?.firstServeInPct ?? 0;
  const firstServeWonPct = playerStats?.firstServeWinPct ?? 0;
  const secondServeWonPct = playerStats?.secondServeWinPct ?? 0;

  const serviceGamesWon = playerStats?.serviceGamesWon ?? 0;
  const aces = playerStats?.aces ?? 0;
  const doubleFaults = playerStats?.doubleFaults ?? 0;

  const serviceGamesWonPct = playerStats?.serviceGamesWonPct ?? 0;

  // The data pipeline currently doesn't expose "total serve points" (attempted),
  // so we use total points won/total points as the best available proxy for now.
  const totalPoints = playerStats?.totalPoints ?? 0;
  const totalPointsWon = playerStats?.totalPointsWon ?? 0;
  const proxyPct = totalPoints > 0 ? (totalPointsWon / totalPoints) * 100 : 0;

  return (
    <div className="w-[320px] flex flex-col gap-6 px-6 pt-4 pb-6 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Player tabs */}
      <div className="flex flex-row gap-2 self-stretch shadow-[inset_0_-1px_0_0_#D9D9D9]">
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

      {/* Circle card */}
      <WinningCircleCard
        percentage={proxyPct}
        won={totalPointsWon}
        total={totalPoints}
        label="Total Serve Points Won"
        barColor={barColor}
      />

      {/* Serve Break down */}
      <div className="flex flex-col gap-5 self-stretch">
        <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252]">
          Serve Break down
        </div>

        <div className="flex flex-col gap-4 self-stretch">
          <MetricRow label="First Serve Points In" value={`${Math.round(firstServeInPct)}%`} />
          <div className="h-px w-full bg-[#D9D9D9]" />
          <MetricRow label="First Serve Points Won" value={`${Math.round(firstServeWonPct)}%`} />
          <div className="h-px w-full bg-[#D9D9D9]" />
          <MetricRow label="Second Serve Points Won" value={`${Math.round(secondServeWonPct)}%`} />
          <div className="h-px w-full bg-[#D9D9D9]" />
          <MetricRow label="Service Games Won" value={`${serviceGamesWonPct}%`} />
          <div className="h-px w-full bg-[#D9D9D9]" />
          <MetricRow label="Aces" value={aces.toFixed(1)} />
          <div className="h-px w-full bg-[#D9D9D9]" />
          <MetricRow label="Double Faults" value={doubleFaults.toFixed(1)} />
        </div>
      </div>

      {/* Serve placement Distribution (revealed on View more) */}
      {showMore && (
        <div className="flex flex-col gap-5 self-stretch">
          <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252]">
            Serve placement Distribution
          </div>

          {/* Placeholder values (until placement distribution stats exist) */}
          <div className="flex flex-col gap-5 self-stretch">
            <DistributionRow label="Wide" valuePct={25} fillPct={50} barColor={barColor} />
            <DistributionRow label="Body" valuePct={14} fillPct={23} barColor={barColor} />
            <DistributionRow label="T" valuePct={21} fillPct={35} barColor={barColor} />
          </div>
        </div>
      )}

      {/* View more / less (bottom) */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-center text-xs font-medium text-[#999999] hover:text-[#666666] transition-colors"
      >
        {showMore ? "View less" : "View more"}
      </button>
    </div>
  );
}

