"use client";

import { Fragment, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { shortName, PLAYER_COLORS } from "@/lib/data/match-utils";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const CARD_CLASS =
  "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5";

/* ── Private sub-components (shared) ─────────────────────── */

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-medium tracking-[2.5px] uppercase text-[#AAAAAA]">
      {children}
    </div>
  );
}

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
    <div className="flex flex-row gap-2">
      {(["player1", "player2"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelectPlayer(p)}
          className={`h-8 rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-colors duration-200 ${
            selectedPlayer === p
              ? "ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
              : "ring-[#D9D9D9] text-[#525252] bg-white"
          }`}
        >
          {shortName(match[p].name)}
        </button>
      ))}
    </div>
  );
}

function PercentageBarRow({
  label,
  valuePct,
  fillPct,
  barColor,
  index = 0,
  reduceMotion = false,
}: {
  label: string;
  valuePct: number;
  fillPct: number;
  barColor: string;
  index?: number;
  reduceMotion?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, fillPct));
  return (
    <motion.div
      className="flex flex-col gap-3 self-stretch"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.04 }}
    >
      <div className="flex flex-row justify-between items-end self-stretch">
        <span className="text-[12px] text-[#525252]">{label}</span>
        <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">
          {valuePct}%
        </span>
      </div>
      <div className="h-2 w-full bg-[#F3F3F3] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </motion.div>
  );
}

function MetricRow({
  label,
  value,
  index = 0,
  reduceMotion = false,
}: {
  label: string;
  value: string;
  index?: number;
  reduceMotion?: boolean;
}) {
  return (
    <motion.div
      className="flex flex-row justify-between items-center self-stretch"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.04 }}
    >
      <span className="text-[12px] text-[#525252]">{label}</span>
      <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">
        {value}
      </span>
    </motion.div>
  );
}

function StatHero({
  pct,
  won,
  total,
  label,
  barColor,
}: {
  pct: number;
  won: number;
  total: number;
  label: string;
  barColor: string;
}) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 py-2">
        <motion.span
          key={`${barColor}-${pct}`}
          className="text-[48px] font-bold tabular-nums leading-none"
          style={{ color: barColor }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {clampedPct.toFixed(1)}%
        </motion.span>
        <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] text-center">
          {label}
        </span>
        <span className="text-[12px] tabular-nums text-[#525252] font-medium">
          {won} / {total} pts
        </span>
      </div>
      <div className="h-2 w-full bg-[#F3F3F3] rounded-full overflow-hidden">
        <motion.div
          key={`bar-${barColor}-${pct}`}
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPct}%` }}
          transition={{ duration: 0.85, ease: EASE }}
        />
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
  const prefersReducedMotion = useReducedMotion();
  const reduced = !!prefersReducedMotion;

  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1",
  );

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const totalPoints = playerStats?.totalPoints ?? 0;
  const totalPointsWon = playerStats?.totalPointsWon ?? 0;
  const winningPct = totalPoints > 0 ? (totalPointsWon / totalPoints) * 100 : 0;

  const barColor = PLAYER_COLORS[selectedPlayer];

  return (
    <div className="w-[320px] flex flex-col gap-5">
      {/* Points Won card */}
      <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <PlayerTabs
          match={match}
          selectedPlayer={selectedPlayer}
          onSelectPlayer={setSelectedPlayer}
        />

        <StatHero
          pct={winningPct}
          won={totalPointsWon}
          total={totalPoints}
          label="Winning Percentage"
          barColor={barColor}
        />
      </div>

      {/* Performance breakdown card */}
      <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <SectionHeader>Performance Breakdown</SectionHeader>
        <div className="flex flex-col gap-2.5">
          <MetricRow
            label="Serve Rating"
            value={(playerStats?.serveRating ?? 0).toFixed(1)}
            index={0}
            reduceMotion={reduced}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <MetricRow
            label="Return Rating"
            value={(playerStats?.returnRating ?? 0).toFixed(1)}
            index={1}
            reduceMotion={reduced}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <MetricRow
            label="Under Pressure Rating"
            value={(playerStats?.underPressureRating ?? 0).toFixed(1)}
            index={2}
            reduceMotion={reduced}
          />
        </div>
      </div>

      {/* Rally Win Percentage card */}
      <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <SectionHeader>Rally Win Percentage</SectionHeader>
        <div className="flex flex-col gap-4">
          <PercentageBarRow
            label="1-4 shots"
            valuePct={playerStats?.shortRallyWonPct ?? 0}
            fillPct={playerStats?.shortRallyWonPct ?? 0}
            barColor={barColor}
            index={0}
            reduceMotion={reduced}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <PercentageBarRow
            label="5-9 shots"
            valuePct={playerStats?.mediumRallyWonPct ?? 0}
            fillPct={playerStats?.mediumRallyWonPct ?? 0}
            barColor={barColor}
            index={1}
            reduceMotion={reduced}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <PercentageBarRow
            label="10+ shots"
            valuePct={playerStats?.longRallyWonPct ?? 0}
            fillPct={playerStats?.longRallyWonPct ?? 0}
            barColor={barColor}
            index={2}
            reduceMotion={reduced}
          />
        </div>
      </div>
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
  const prefersReducedMotion = useReducedMotion();
  const reduced = !!prefersReducedMotion;
  const searchParams = useSearchParams();
  const vizParam = searchParams.get("viz");
  const breakdownView: "serve" | "return" =
    vizParam === "return" ? "return" : "serve";

  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1",
  );

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const barColor = PLAYER_COLORS[selectedPlayer];

  const totalPoints = playerStats?.totalPoints ?? 0;
  const servicePointsWon = playerStats?.servicePointsWon ?? 0;
  const returnPointsWon = playerStats?.returnPointsWon ?? 0;

  const circleWon = breakdownView === "serve" ? servicePointsWon : returnPointsWon;
  const circlePct = totalPoints > 0 ? (circleWon / totalPoints) * 100 : 0;
  const circleLabel =
    breakdownView === "serve"
      ? "Total Serve Points Won"
      : "Total Return Points Won";

  const serveMetrics = [
    { label: "First Serve Points In", value: `${Math.round(playerStats?.firstServeInPct ?? 0)}%` },
    { label: "First Serve Points Won", value: `${Math.round(playerStats?.firstServeWinPct ?? 0)}%` },
    { label: "Second Serve Points Won", value: `${Math.round(playerStats?.secondServeWinPct ?? 0)}%` },
    { label: "Service Games Won", value: `${playerStats?.serviceGamesWonPct ?? 0}%` },
    { label: "Aces", value: (playerStats?.aces ?? 0).toFixed(1) },
    { label: "Double Faults", value: (playerStats?.doubleFaults ?? 0).toFixed(1) },
  ];

  const returnMetrics = [
    { label: "First Serve Returns Won", value: `${playerStats?.firstReturnWonPct ?? 0}%` },
    { label: "Second Serve Returns Won", value: `${playerStats?.secondReturnWonPct ?? 0}%` },
    { label: "Return Games Won", value: `${playerStats?.returnGamesWonPct ?? 0}%` },
    { label: "Break Points Won", value: `${playerStats?.breakpointsWonPct ?? 0}%` },
  ];

  const metrics = breakdownView === "serve" ? serveMetrics : returnMetrics;

  return (
    <div className="w-[320px] flex flex-col gap-5">
      {/* Player selection + stat hero card */}
      <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <SectionHeader>Shot Analysis</SectionHeader>

        <PlayerTabs
          match={match}
          selectedPlayer={selectedPlayer}
          onSelectPlayer={setSelectedPlayer}
        />

        <StatHero
          key={`${selectedPlayer}-${breakdownView}`}
          pct={circlePct}
          won={circleWon}
          total={totalPoints}
          label={circleLabel}
          barColor={barColor}
        />
      </div>

      {/* Breakdown card */}
      <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <SectionHeader>
          {breakdownView === "serve" ? "Serve Breakdown" : "Return Breakdown"}
        </SectionHeader>
        <div className="flex flex-col gap-2.5">
          {metrics.map((m, i) => (
            <Fragment key={m.label}>
              {i > 0 && <div className="h-px bg-[#F0F0F0]" />}
              <MetricRow
                label={m.label}
                value={m.value}
                index={i}
                reduceMotion={reduced}
              />
            </Fragment>
          ))}
        </div>
      </div>

      {/* Placement distribution cards */}
      {breakdownView === "serve" && (
        <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
          <SectionHeader>Serve Placement Distribution</SectionHeader>
          <div className="flex flex-col gap-4">
            <PercentageBarRow label="Wide" valuePct={playerStats?.serveWidePct ?? 0} fillPct={playerStats?.serveWidePct ?? 0} barColor={barColor} index={0} reduceMotion={reduced} />
            <div className="h-px bg-[#F0F0F0]" />
            <PercentageBarRow label="Body" valuePct={playerStats?.serveBodyPct ?? 0} fillPct={playerStats?.serveBodyPct ?? 0} barColor={barColor} index={1} reduceMotion={reduced} />
            <div className="h-px bg-[#F0F0F0]" />
            <PercentageBarRow label="T" valuePct={playerStats?.serveTpct ?? 0} fillPct={playerStats?.serveTpct ?? 0} barColor={barColor} index={2} reduceMotion={reduced} />
          </div>
        </div>
      )}

      {breakdownView === "return" && (
        <>
          <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
            <SectionHeader>Return Placement Distribution</SectionHeader>
            <div className="flex flex-col gap-4">
              <PercentageBarRow label="Cross Court" valuePct={playerStats?.returnCrossCourtPct ?? 0} fillPct={playerStats?.returnCrossCourtPct ?? 0} barColor={barColor} index={0} reduceMotion={reduced} />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow label="Down The Line" valuePct={playerStats?.returnDownTheLinePct ?? 0} fillPct={playerStats?.returnDownTheLinePct ?? 0} barColor={barColor} index={1} reduceMotion={reduced} />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow label="Middle" valuePct={playerStats?.returnMiddlePct ?? 0} fillPct={playerStats?.returnMiddlePct ?? 0} barColor={barColor} index={2} reduceMotion={reduced} />
            </div>
          </div>

          <div className={`flex flex-col gap-5 ${CARD_CLASS}`}>
            <SectionHeader>Return Contact Distribution</SectionHeader>
            <div className="flex flex-col gap-4">
              <PercentageBarRow label="Inside" valuePct={playerStats?.returnContactInsidePct ?? 0} fillPct={playerStats?.returnContactInsidePct ?? 0} barColor={barColor} index={0} reduceMotion={reduced} />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow label="Middle" valuePct={playerStats?.returnContactMiddlePct ?? 0} fillPct={playerStats?.returnContactMiddlePct ?? 0} barColor={barColor} index={1} reduceMotion={reduced} />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow label="Deep" valuePct={playerStats?.returnContactDeepPct ?? 0} fillPct={playerStats?.returnContactDeepPct ?? 0} barColor={barColor} index={2} reduceMotion={reduced} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
