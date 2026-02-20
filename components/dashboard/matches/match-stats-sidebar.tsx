"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { shortName, PLAYER_COLORS } from "@/lib/data/match-utils";

/* ── Private sub-components ───────────────────────────────── */

function PlayerTabs({
  match,
  selectedPlayer,
  onSelectPlayer,
}: {
  match: Match;
  selectedPlayer: "player1" | "player2";
  onSelectPlayer: (p: "player1" | "player2") => void;
}) {
  return (
    <div className="flex flex-row shadow-[inset_0_-1px_0_0_#D9D9D9]">
      <button
        type="button"
        onClick={() => onSelectPlayer("player1")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player1"
            ? "text-[#3986F3] border-[#3986F3]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player1.name)}
      </button>
      <button
        type="button"
        onClick={() => onSelectPlayer("player2")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player2"
            ? "text-[#F38439] border-[#F38439]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player2.name)}
      </button>
    </div>
  );
}

function WinningPercentageCircle({
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
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-row py-3 items-center gap-4">
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
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={barColor}
            strokeWidth="10"
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
        <span className="text-sm font-normal text-[#999999]">{label}</span>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-xs font-medium tracking-[0.16em] uppercase text-[#525252]">
      {children}
    </div>
  );
}

function ViewMoreButton({
  showMore,
  onToggle,
}: {
  showMore: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="block text-center text-xs font-medium text-[#999999] hover:text-[#666666] transition-colors"
    >
      {showMore ? "View less" : "View more"}
    </button>
  );
}

function PercentageBarRow({
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

/* ── Named exports (explicit variants) ────────────────────── */

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
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-2xl border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <PlayerTabs
        match={match}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      />

      <WinningPercentageCircle
        percentage={winningPct}
        won={totalPointsWon}
        total={totalPoints}
        label="Winning Percentage"
        barColor={barColor}
      />

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
            <PercentageBarRow
              label="1-4 shots"
              valuePct={playerStats?.shortRallyWonPct ?? 0}
              fillPct={playerStats?.shortRallyWonPct ?? 0}
              barColor={barColor}
            />
            <PercentageBarRow
              label="5-9 shots"
              valuePct={playerStats?.mediumRallyWonPct ?? 0}
              fillPct={playerStats?.mediumRallyWonPct ?? 0}
              barColor={barColor}
            />
            <PercentageBarRow
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

interface MatchVisualsSidebarProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
}

export function MatchVisualsSidebar({
  match,
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
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-2xl border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <PlayerTabs
        match={match}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      />

      <WinningPercentageCircle
        percentage={circlePct}
        won={circleWon}
        total={totalPoints}
        label={circleLabel}
        barColor={barColor}
      />

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

      {breakdownView === "return" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Return placement Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <PercentageBarRow label="Cross Court" valuePct={playerStats?.returnCrossCourtPct ?? 0} fillPct={playerStats?.returnCrossCourtPct ?? 0} barColor={barColor} />
            <PercentageBarRow label="Down The Line" valuePct={playerStats?.returnDownTheLinePct ?? 0} fillPct={playerStats?.returnDownTheLinePct ?? 0} barColor={barColor} />
            <PercentageBarRow label="Middle" valuePct={playerStats?.returnMiddlePct ?? 0} fillPct={playerStats?.returnMiddlePct ?? 0} barColor={barColor} />
          </div>
        </div>
      )}

      {breakdownView === "return" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Return Contact Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <PercentageBarRow label="Inside" valuePct={playerStats?.returnContactInsidePct ?? 0} fillPct={playerStats?.returnContactInsidePct ?? 0} barColor={barColor} />
            <PercentageBarRow label="Middle" valuePct={playerStats?.returnContactMiddlePct ?? 0} fillPct={playerStats?.returnContactMiddlePct ?? 0} barColor={barColor} />
            <PercentageBarRow label="Deep" valuePct={playerStats?.returnContactDeepPct ?? 0} fillPct={playerStats?.returnContactDeepPct ?? 0} barColor={barColor} />
          </div>
        </div>
      )}

      {breakdownView === "serve" && showMore && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Serve placement Distribution</SectionHeader>

          <div className="flex flex-col gap-5 self-stretch">
            <PercentageBarRow label="Wide" valuePct={playerStats?.serveWidePct ?? 0} fillPct={playerStats?.serveWidePct ?? 0} barColor={barColor} />
            <PercentageBarRow label="Body" valuePct={playerStats?.serveBodyPct ?? 0} fillPct={playerStats?.serveBodyPct ?? 0} barColor={barColor} />
            <PercentageBarRow label="T" valuePct={playerStats?.serveTpct ?? 0} fillPct={playerStats?.serveTpct ?? 0} barColor={barColor} />
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
