"use client";

import { useState } from "react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import {
  PlayerTabs,
  WinningPercentageCircle,
  SectionHeader,
  ViewMoreButton,
  PLAYER_COLORS,
} from "./sidebar-shared";

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
      <div className="flex flex-row justify-between items-end self-stretch">
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

function PerformanceRow({ label, value }: { label: string; value: number }) {
  const displayValue = value.toFixed(1);

  return (
    <div className="flex flex-col gap-3 w-full self-stretch">
      <div className="h-[15px] flex flex-row justify-between items-center self-stretch">
        <span className="text-xs font-regular text-[#999999] leading-none">
          {label}
        </span>
        <span className="font-medium text-xl items-center leading-none uppercase text-[#525252]">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

interface MatchOverallSidebarProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
}

export function MatchOverallSidebar({
  match,
  statsResult,
}: MatchOverallSidebarProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1",
  );
  const [showMore, setShowMore] = useState(false);

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const totalPoints = playerStats?.totalPoints ?? 0;
  const totalPointsWon = playerStats?.totalPointsWon ?? 0;
  const winningPct = totalPoints > 0 ? (totalPointsWon / totalPoints) * 100 : 0;

  const barColor = PLAYER_COLORS[selectedPlayer];

  const serveRating = playerStats?.serveRating ?? 0;
  const returnRating = playerStats?.returnRating ?? 0;
  const underPressureRating = playerStats?.underPressureRating ?? 0;

  return (
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Player Tabs */}
      <PlayerTabs
        match={match}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      />

      {/* Winning Percentage */}
      <WinningPercentageCircle
        percentage={winningPct}
        won={totalPointsWon}
        total={totalPoints}
        label="Winning Percentage"
        barColor={barColor}
      />

      {/* Performance Ratings */}
      <div className="flex flex-col items-stretch gap-5">
        <SectionHeader>Performance breakdown</SectionHeader>
        <div className="flex flex-col gap-4">
          <PerformanceRow label="Serve Rating" value={serveRating} />
          <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
          <PerformanceRow label="Return Rating" value={returnRating} />
          <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
          <PerformanceRow
            label="Under Pressure Rating"
            value={underPressureRating}
          />
          <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
        </div>
      </div>

      {showMore && (
        <div className="flex flex-col gap-5">
          <SectionHeader>Rally win Percentage</SectionHeader>
          <div className="flex flex-col gap-4">
            <RallyWinRow
              label="1-4 shots"
              valuePct={playerStats?.shortRallyWonPct ?? 0}
              fillPct={playerStats?.shortRallyWonPct ?? 0}
              barColor={barColor}
            />
            <RallyWinRow
              label="5-9 shots"
              valuePct={playerStats?.mediumRallyWonPct ?? 0}
              fillPct={playerStats?.mediumRallyWonPct ?? 0}
              barColor={barColor}
            />
            <RallyWinRow
              label="10+ shots"
              valuePct={playerStats?.longRallyWonPct ?? 0}
              fillPct={playerStats?.longRallyWonPct ?? 0}
              barColor={barColor}
            />
          </div>
        </div>
      )}

      <ViewMoreButton
        showMore={showMore}
        onToggle={() => setShowMore((v) => !v)}
      />
    </div>
  );
}
