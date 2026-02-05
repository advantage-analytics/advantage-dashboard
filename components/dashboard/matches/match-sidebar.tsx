"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <div className="flex items-center justify-center gap-4">
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
          {percentage.toFixed(1)}% ({won}/{total})
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
    <div className="flex flex-col gap-3 w-full max-w-[264px]">
      <div className="flex flex-row justify-between items-end gap-1">
        <span className="text-xs font-medium uppercase text-[#999999]">
          {label}
        </span>
        <span className="font-medium text-2xl leading-tight uppercase text-black tabular-nums">
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
  const pathname = usePathname();
  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1"
  );

  const player =
    selectedPlayer === "player1" ? match.player1 : match.player2;
  const playerName = player.name;
  const initials = getInitials(playerName);

  // Winning percentage: from sets or from stats (e.g. service games won)
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

  const serveRating = playerStats
    ? playerStats.firstServeWinPct
    : 0;
  const returnRating = playerStats
    ? (playerStats.returnGamesWon / Math.max(1, 10)) * 100 // approximate
    : 0;
  const secondServeRating = playerStats
    ? playerStats.secondServeWinPct
    : 0;

  const summaryHref = `/dashboard/matches/${matchId}/overall`;
  const eventsHref = `/dashboard/matches/${matchId}/overall`; // or future /events

  return (
    <div className="flex flex-col items-center gap-6 w-full bg-white rounded-2xl border-2 border-[#D9D9D9] px-4 py-8">
      {/* Tabs */}
      <div className="flex flex-row justify-stretch items-stretch w-full gap-4 border-b border-[#D9D9D9]">
        <Link
          href={summaryHref}
          className={`flex-1 flex items-center justify-center py-0 px-2 pb-3 border-b-2 transition-colors ${
            pathname === summaryHref
              ? "text-[#3986F3] border-[#3986F3]"
              : "text-[#999999] border-transparent hover:text-[#666666]"
          }`}
        >
          <span className="font-medium text-base leading-tight">Summary</span>
        </Link>
        <Link
          href={eventsHref}
          className={`flex-1 flex items-center justify-center py-0 px-2 pb-3 border-b-2 transition-colors ${
            pathname === eventsHref
              ? "text-[#3986F3] border-[#3986F3]"
              : "text-[#999999] border-transparent hover:text-[#666666]"
          }`}
        >
          <span className="font-medium text-base leading-tight">Events</span>
        </Link>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center gap-6 w-full">
        {/* Player row */}
        <div className="flex flex-row justify-between items-center w-full gap-4 py-3 px-4">
          <div className="flex flex-row items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-[#F2F2F2] flex items-center justify-center shrink-0">
              <span className="font-medium text-[10px] leading-tight text-[#BFBFBF]">
                {initials}
              </span>
            </div>
            <span className="font-medium text-xs leading-tight text-black">
              {playerName}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setSelectedPlayer((p) =>
                p === "player1" ? "player2" : "player1"
              )
            }
            className="p-0 border-0 bg-transparent cursor-pointer text-black hover:opacity-80"
            aria-label="Switch player"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-[#0D0D0D]"
            >
              <path
                d="M4.57 6L8 9.43L11.43 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Winning percentage */}
        <WinningPercentageCircle
          percentage={winningPct}
          won={playerGames}
          total={totalGames}
        />

        {/* Performance rating */}
        <div className="flex flex-col items-center gap-4 w-full px-3">
          <span className="font-medium text-base leading-tight text-black w-full">
            Performance Rating
          </span>
          <div className="flex flex-col gap-5 w-full">
            <PerformanceBar label="Serve" value={serveRating} />
            <PerformanceBar label="Return" value={returnRating} />
            <PerformanceBar label="2nd Serve" value={secondServeRating} />
          </div>
        </div>
      </div>
    </div>
  );
}
