"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import {
  PlayerTabs,
  WinningPercentageCircle,
  SectionHeader,
  ViewMoreButton,
  PLAYER_COLORS,
} from "./sidebar-shared";

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-row justify-between items-center self-stretch">
      <div className="flex flex-row items-center gap-2">
        {/* <div className="w-px h-3 bg-[#D9D9D9]" /> */}
        <span className="text-xs font-normal leading-none text-[#999999]">
          {label}
        </span>
      </div>
      <span className="text-xl leading-none font-medium text-[#525252] tabular-nums">
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
      <div className="flex flex-row justify-between items-end self-stretch">
        <span className="text-xs font-normal leading-[1.1] text-[#999999]">
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
  const searchParams = useSearchParams();
  const vizParam = searchParams.get("viz");
  const breakdownView: "serve" | "return" =
    vizParam === "return" ? "return" : "serve";

  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1"
  );
  const [showMore, setShowMore] = useState(false);

  // Reset "view more" when switching between serve/return
  useEffect(() => {
    setShowMore(false);
  }, [breakdownView]);

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const barColor = PLAYER_COLORS[selectedPlayer];

  // Serve breakdown values
  const firstServeInPct = playerStats?.firstServeInPct ?? 0;
  const firstServeWonPct = playerStats?.firstServeWinPct ?? 0;
  const secondServeWonPct = playerStats?.secondServeWinPct ?? 0;
  const serviceGamesWonPct = playerStats?.serviceGamesWonPct ?? 0;
  const aces = playerStats?.aces ?? 0;
  const doubleFaults = playerStats?.doubleFaults ?? 0;

  // Return breakdown values (percentages)
  const firstReturnWonPct = playerStats?.firstReturnWonPct ?? 0;
  const secondReturnWonPct = playerStats?.secondReturnWonPct ?? 0;
  const returnGamesWonPct = playerStats?.returnGamesWonPct ?? 0;
  const breakpointsWonPct = playerStats?.breakpointsWonPct ?? 0;

  // Circle values
  const totalPoints = playerStats?.totalPoints ?? 0;
  const servicePointsWon = playerStats?.servicePointsWon ?? 0;
  const returnPointsWon = playerStats?.returnPointsWon ?? 0;

  const circleWon = breakdownView === "serve" ? servicePointsWon : returnPointsWon;
  const circlePct = totalPoints > 0 ? (circleWon / totalPoints) * 100 : 0;
  const circleLabel =
    breakdownView === "serve"
      ? "Total Serve Points Won"
      : "Total Return Points Won";

  return (
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Player tabs */}
      <PlayerTabs
        match={match}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      />

      {/* Circle card */}
      <WinningPercentageCircle
        percentage={circlePct}
        won={circleWon}
        total={totalPoints}
        label={circleLabel}
        barColor={barColor}
      />

      {/* Breakdown section */}
      <div className="flex flex-col items-stretch gap-5">
        <SectionHeader>
          {breakdownView === "serve" ? "Serve Break down" : "Return Break down"}
        </SectionHeader>

        <div className="flex flex-col gap-4 self-stretch">
          {breakdownView === "serve" ? (
            <>
              <MetricRow label="First Serve Points In" value={`${Math.round(firstServeInPct)}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="First Serve Points Won" value={`${Math.round(firstServeWonPct)}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Second Serve Points Won" value={`${Math.round(secondServeWonPct)}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Service Games Won" value={`${serviceGamesWonPct}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Aces" value={aces.toFixed(1)} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Double Faults" value={doubleFaults.toFixed(1)} />
            </>
          ) : (
            <>
              <MetricRow label="First Serve Returns Won" value={`${firstReturnWonPct}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Second Serve Returns Won" value={`${secondReturnWonPct}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Return Games Won" value={`${returnGamesWonPct}%`} />
              <div className="h-px w-full bg-[#D9D9D9] self-stretch" />
              <MetricRow label="Break Points Won" value={`${breakpointsWonPct}%`} />
            </>
          )}
        </div>
      </div>

      {/* Return placement Distribution (revealed on View more, return only) */}
      {breakdownView === "return" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Return placement Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <DistributionRow label="Cross Court" valuePct={playerStats?.returnCrossCourtPct ?? 0} fillPct={playerStats?.returnCrossCourtPct ?? 0} barColor={barColor} />
            <DistributionRow label="Down The Line" valuePct={playerStats?.returnDownTheLinePct ?? 0} fillPct={playerStats?.returnDownTheLinePct ?? 0} barColor={barColor} />
            <DistributionRow label="Middle" valuePct={playerStats?.returnMiddlePct ?? 0} fillPct={playerStats?.returnMiddlePct ?? 0} barColor={barColor} />
          </div>
        </div>
      )}

      {/* Return Contact Distribution (revealed on View more, return only) */}
      {breakdownView === "return" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Return Contact Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <DistributionRow label="Inside" valuePct={playerStats?.returnContactInsidePct ?? 0} fillPct={playerStats?.returnContactInsidePct ?? 0} barColor={barColor} />
            <DistributionRow label="Middle" valuePct={playerStats?.returnContactMiddlePct ?? 0} fillPct={playerStats?.returnContactMiddlePct ?? 0} barColor={barColor} />
            <DistributionRow label="Deep" valuePct={playerStats?.returnContactDeepPct ?? 0} fillPct={playerStats?.returnContactDeepPct ?? 0} barColor={barColor} />
          </div>
        </div>
      )}

      {/* Serve placement Distribution (revealed on View more, serve only) */}
      {breakdownView === "serve" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Serve placement Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <DistributionRow label="Wide" valuePct={playerStats?.serveWidePct ?? 0} fillPct={playerStats?.serveWidePct ?? 0} barColor={barColor} />
            <DistributionRow label="Body" valuePct={playerStats?.serveBodyPct ?? 0} fillPct={playerStats?.serveBodyPct ?? 0} barColor={barColor} />
            <DistributionRow label="T" valuePct={playerStats?.serveTpct ?? 0} fillPct={playerStats?.serveTpct ?? 0} barColor={barColor} />
          </div>
        </div>
      )}

      {/* View more / less */}
      <ViewMoreButton
        showMore={showMore}
        onToggle={() => setShowMore((v) => !v)}
      />
    </div>
  );
}
