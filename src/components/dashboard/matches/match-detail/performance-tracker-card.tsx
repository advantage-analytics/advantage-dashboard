"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Info } from "lucide-react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { shortName } from "@/lib/data/match-utils";
import {
  PLAYER_1,
  PLAYER_2,
  EVENT_ACCENT,
} from "@/lib/design/player-colors";
import { ChartErrorBoundary } from "@/components/dashboard/shared/chart-error-boundary";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MomentumChartCompact = dynamic(
  () =>
    import("@/components/dashboard/matches/performance-tracker").then(
      (m) => m.MomentumChartCompact,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Loading momentum chart"
        className="h-[160px] w-full rounded-[12px] bg-[var(--color-surface-muted)] animate-pulse"
      />
    ),
  },
);

interface PerformanceTrackerCardProps {
  points: MatchPoint[];
  p1Name: string;
  p2Name: string;
  matchDurationSec?: number | null;
}

const eyebrowClass =
  "text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13.5px]";

export function PerformanceTrackerCard({
  points,
  p1Name,
  p2Name,
  matchDurationSec,
}: PerformanceTrackerCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const detailsId = useId();

  if (points.length < 2) return null;

  const p1Short = shortName(p1Name, 18);
  const p2Short = shortName(p2Name, 18);

  let p1Cum = 0;
  let p2Cum = 0;
  let p1PeakLead = 0;
  let p2PeakLead = 0;
  let p1Breaks = 0;
  let p2Breaks = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.wonByPlayer1) p1Cum++;
    else p2Cum++;
    const d = p1Cum - p2Cum;
    if (d > p1PeakLead) p1PeakLead = d;
    if (-d > p2PeakLead) p2PeakLead = -d;
    if (i > 0) {
      const prev = points[i - 1];
      const newGame =
        pt.gameNumber !== prev.gameNumber || pt.setNumber !== prev.setNumber;
      if (newGame) {
        const serverWon = prev.serverIsPlayer1
          ? prev.wonByPlayer1
          : !prev.wonByPlayer1;
        if (!serverWon) {
          if (prev.serverIsPlayer1) p2Breaks++;
          else p1Breaks++;
        }
      }
    }
  }
  const finalDiff = p1Cum - p2Cum;
  const p1IsLeader = finalDiff > 0;
  const p2IsLeader = finalDiff < 0;

  return (
    <section
      id="match-performance"
      aria-labelledby="performance-tracker-heading"
      className="surface-card scroll-mt-6 flex flex-col"
    >
      <div className="flex items-center justify-between gap-x-4 h-14 px-5">
        <div className="flex items-center gap-1.5">
          <h2
            id="performance-tracker-heading"
            className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
          >
            Momentum Tracker
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About the Momentum chart"
                className="relative inline-flex items-center justify-center size-5 -m-1 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-full"
              >
                <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              showArrow={false}
              className="!bg-white !text-[var(--color-text-primary)] !rounded-xl !px-0 !py-0 !border !border-[var(--color-border-card)] !shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] !text-left !w-auto"
            >
              <div className="w-[260px] py-3 px-3.5 flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13px]">
                    Momentum
                  </span>
                  <p className="text-[11px] leading-[16px] text-[var(--color-text-secondary)]">
                    Running point differential across the match. Each step shows who won the next point.
                  </p>
                </div>
                <div className="h-px bg-[var(--color-border-card)]" />
                <dl className="flex flex-col gap-1.5 text-[11px] leading-[16px]">
                  <TooltipLegendRow
                    swatch={<TooltipSwatch color={PLAYER_1} />}
                    term={`${p1Short} ahead`}
                    detail="above"
                  />
                  <TooltipLegendRow
                    swatch={<TooltipSwatch color={PLAYER_2} />}
                    term={`${p2Short} ahead`}
                    detail="below"
                  />
                  <TooltipLegendRow
                    swatch={<TooltipDash color={EVENT_ACCENT} />}
                    term="Break of serve"
                  />
                </dl>
                <div className="h-px bg-[var(--color-border-card)]" />
                <p className="text-[10px] leading-[14px] text-[var(--color-text-dim)]">
                  Hover the chart for point-by-point detail.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={() => setIsDetailsOpen((o) => !o)}
          aria-expanded={isDetailsOpen}
          aria-controls={detailsId}
          className="flex items-center gap-1.5 px-2.5 py-1.5 -mr-2 rounded-md text-[10px] font-medium uppercase tracking-[2.5px] text-[#3B82F6] hover:text-[#2563EB] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
        >
          <span>{isDetailsOpen ? "Hide details" : "Match details"}</span>
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn(
              "size-3 transition-transform duration-200 ease-out motion-reduce:transition-none",
              isDetailsOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      <div className="px-5 pb-5">
        <div className="min-w-0">
          <ChartErrorBoundary minHeight={160}>
            <MomentumChartCompact
              points={points}
              player1Name={p1Name}
              player2Name={p2Name}
              matchDurationSec={matchDurationSec}
            />
          </ChartErrorBoundary>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <LegendSwatch color={PLAYER_1} label={p1Short} />
          <LegendSwatch color={PLAYER_2} label={p2Short} />
          <span aria-hidden="true" className="h-3 w-px bg-[var(--color-border-card)]" />
          <LegendDash color={EVENT_ACCENT} label="Break of Serve" />
        </div>

        <div
          id={detailsId}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            isDetailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
        <div className="overflow-hidden">
          <div className="pt-7">
            <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Player
              </th>
              <th scope="col" className={cn(eyebrowClass, "text-right font-normal pb-2.5 px-3 sm:px-4 first:pl-0 last:pr-0")}>
                Points
              </th>
              <th scope="col" className={cn(eyebrowClass, "text-right font-normal pb-2.5 px-3 sm:px-4 first:pl-0 last:pr-0")}>
                Breaks Won
              </th>
              <th scope="col" className={cn(eyebrowClass, "text-right font-normal pb-2.5 px-3 sm:px-4 first:pl-0 last:pr-0")}>
                Peak Lead
              </th>
            </tr>
          </thead>
          <tbody>
            <PlayerStatRow
              name={p1Short}
              color={PLAYER_1}
              points={p1Cum}
              breaks={p1Breaks}
              peakLead={p1PeakLead}
              isLeader={p1IsLeader}
            />
            <PlayerStatRow
              name={p2Short}
              color={PLAYER_2}
              points={p2Cum}
              breaks={p2Breaks}
              peakLead={p2PeakLead}
              isLeader={p2IsLeader}
            />
          </tbody>
        </table>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

function PlayerStatRow({
  name,
  color,
  points,
  breaks,
  peakLead,
  isLeader,
}: {
  name: string;
  color: string;
  points: number;
  breaks: number;
  peakLead: number;
  isLeader: boolean;
}) {
  return (
    <tr>
      <th
        scope="row"
        className="text-left font-normal py-3.5 pr-3 sm:pr-4 first:pl-0"
      >
        <span
          className={cn(
            "truncate whitespace-nowrap text-[13px] leading-[18px]",
            isLeader
              ? "font-medium text-[var(--color-text-primary)]"
              : "font-normal text-[var(--color-text-secondary)]",
          )}
        >
          {name}
        </span>
      </th>
      <StatCell
        primary={`${points}`}
        primaryColor={isLeader ? color : "var(--color-text-primary)"}
      />
      <StatCell
        primary={`${breaks}`}
        primaryColor="var(--color-text-primary)"
      />
      <StatCell
        primary={peakLead === 0 ? "—" : `+${peakLead}`}
        primaryColor={peakLead === 0 ? "var(--color-text-dim)" : "var(--color-text-primary)"}
      />
    </tr>
  );
}

function StatCell({
  primary,
  primaryColor,
}: {
  primary: string;
  primaryColor: string;
}) {
  return (
    <td className="text-right py-3.5 px-3 sm:px-4 last:pr-0 align-baseline">
      <span
        className="text-[18px] font-light tabular-nums leading-none tracking-[-0.4px]"
        style={{ color: primaryColor }}
      >
        {primary}
      </span>
    </td>
  );
}

function TooltipLegendRow({
  swatch,
  term,
  detail,
}: {
  swatch: React.ReactNode;
  term: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-[var(--color-text-secondary)]">
        {swatch}
        <span>{term}</span>
      </dt>
      {detail && (
        <dd className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--color-text-dim)] tabular-nums">
          {detail}
        </dd>
      )}
    </div>
  );
}

function TooltipSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 rounded-[2px] shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function TooltipDash({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className="shrink-0"
    >
      <line
        x1="0"
        y1="5"
        x2="10"
        y2="5"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-light text-[var(--color-text-secondary)] leading-[16px]">
        {label}
      </span>
    </div>
  );
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className="shrink-0"
      >
        <line
          x1="0"
          y1="5"
          x2="10"
          y2="5"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      </svg>
      <span className="text-[10px] font-light text-[var(--color-text-secondary)] leading-[16px]">
        {label}
      </span>
    </div>
  );
}
