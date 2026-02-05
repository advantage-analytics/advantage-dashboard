"use client";

import Link from "next/link";
import { useState } from "react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function WinningPercentageCircle({
  percentage,
  won,
  total,
}: {
  percentage: number;
  won: number;
  total: number;
}) {
  const r = 48;
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
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#3986F3"
            strokeWidth="6"
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
}: {
  label: string;
  value: number;
}) {
  const displayValue = value.toFixed(1);
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-row justify-between items-end gap-1">
        <span className="text-sm font-medium text-[#999999]">{label}</span>
        <span className="font-medium text-2xl leading-tight uppercase text-[#0D0D0D] tabular-nums">
          {displayValue}
        </span>
      </div>
      <div className="h-1.5 w-full bg-[#D9D9D9] rounded-lg overflow-hidden">
        <div
          className="h-full bg-[#3986F3] rounded-lg transition-[width] duration-500"
          style={{ width: `${pct}%` }}
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

  const sets = match.score.sets;
  const totalGames = sets.reduce(
    (acc, s) => acc + s.player1 + s.player2,
    0
  );
  const playerGames =
    selectedPlayer === "player1"
      ? sets.reduce((acc, s) => acc + s.player1, 0)
      : sets.reduce((acc, s) => acc + s.player2, 0);
  const winningPct =
    totalGames > 0 ? (playerGames / totalGames) * 100 : 0;

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const serveRating = playerStats?.firstServeWinPct ?? 0;
  const returnRating = playerStats
    ? (playerStats.returnGamesWon / Math.max(1, 10)) * 100
    : 0;
  const underPressureRating = playerStats
    ? Math.min(100, playerStats.breakpointsWon * 20)
    : 0;

  return (
    <div className="w-[320px] flex flex-col gap-6 p-6 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Match Score Block */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-row justify-between items-center gap-12">
          <span className="text-xs font-medium text-[#999999]">
            {match.matchContext}
          </span>
          <span className="px-2 py-0.5 rounded-[10px] bg-[#60A5FA] text-xs font-medium text-white">
            {match.duration ?? "—"}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {/* Player 1 */}
          <div className="flex flex-row justify-between items-center gap-[52px]">
            <div className="flex flex-row items-center gap-4">
              <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-[#BFBFBF]">
                  {getInitials(match.player1.name)}
                </span>
              </div>
              <span
                className={`text-sm font-semibold ${
                  match.score.winner === "player1"
                    ? "text-[#0D0D0D]"
                    : "text-[#999999]"
                }`}
              >
                {match.player1.name}
              </span>
            </div>
            <div className="flex flex-row gap-4">
              {match.score.sets.map((set, idx) => (
                <span
                  key={idx}
                  className={`text-lg font-semibold ${
                    match.score.winner === "player1"
                      ? "text-[#0D0D0D]"
                      : "text-[#999999]"
                  }`}
                >
                  {set.player1}
                </span>
              ))}
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex flex-row justify-between items-center gap-[52px]">
            <div className="flex flex-row items-center gap-4">
              <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-[#BFBFBF]">
                  {getInitials(match.player2.name)}
                </span>
              </div>
              <span
                className={`text-sm font-semibold ${
                  match.score.winner === "player2"
                    ? "text-[#0D0D0D]"
                    : "text-[#999999]"
                }`}
              >
                {match.player2.name}
              </span>
            </div>
            <div className="flex flex-row gap-4">
              {match.score.sets.map((set, idx) => (
                <span
                  key={idx}
                  className={`text-lg font-semibold ${
                    match.score.winner === "player2"
                      ? "text-[#0D0D0D]"
                      : "text-[#999999]"
                  }`}
                >
                  {set.player2}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Player Tabs */}
      <div className="flex flex-row border-b border-[#D9D9D9]">
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
              ? "text-[#3986F3] border-[#3986F3]"
              : "text-[#999999] border-transparent hover:text-[#666666]"
          }`}
        >
          {match.player2.name}
        </button>
      </div>

      {/* Stats Content */}
      <div className="flex flex-col gap-6">
        {/* Winning Percentage */}
        <div className="flex flex-col gap-2.5 min-h-[124px] justify-between">
          <WinningPercentageCircle
            percentage={winningPct}
            won={playerGames}
            total={totalGames}
          />
        </div>

        {/* Performance Ratings */}
        <div className="flex flex-col items-stretch gap-8">
          <PerformanceBar label="Serve Rating" value={serveRating} />
          <PerformanceBar label="Return Rating" value={returnRating} />
          <PerformanceBar label="Under Pressure Rating" value={underPressureRating} />
        </div>

        <Link
          href={`/dashboard/matches/${matchId}/overall`}
          className="block text-center text-xs font-medium text-[#999999] hover:text-[#666666] transition-colors"
        >
          View more
        </Link>
      </div>
    </div>
  );
}
