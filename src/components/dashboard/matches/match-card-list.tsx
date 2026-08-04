"use client";

import Link from "next/link";
import { CircleCheck, CircleX } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  ANALYSIS_LABEL,
  analysisAction,
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  outcomeInk,
  resultInk,
} from "@/lib/data/match-analysis";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";

/**
 * Event · Result · Score · Opponent · Analysis · action.
 *
 * Every field gets its own column and its own header, so the eye scans down a
 * column instead of parsing a stacked block per row. Result is a fixed 62px —
 * it only ever holds "Won" or "Lost", so giving it a share of the fluid space
 * would just pad it. Analysis stays the widest fluid column because it is the
 * only cell whose contents change shape (bar, check, cross, or a phrase).
 *
 * Date is not a column: it is one of the least-scanned fields and reachable
 * from the sort control, and dropping it is what buys Analysis its width.
 */
export const LIST_GRID_COLS = {
  gridTemplateColumns: "2fr 62px 1.05fr 1.2fr 1.9fr 84px",
} as const;

function formatScore(sets: DisplayMatch["score"]["sets"]): string {
  return sets.map((s) => `${s.player1}-${s.player2}`).join(", ");
}

interface MatchCardListProps {
  match: DisplayMatch;
  isNew?: boolean;
}

export function MatchCardList({ match, isNew }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const analysis = match.analysis;
  const action = analysis ? analysisAction(analysis, match.id) : null;

  return (
    /* Right padding runs past the 84px action column so the hover-revealed row
       menu — which the design has no equivalent for — sits outside the grid
       instead of colliding with the CTA. */
    <div
      className={`group relative grid h-[52px] items-center gap-x-5 border-b border-[#F3F3F3] pl-3.5 pr-9 transition-colors duration-200 hover:bg-[#F5F5F5]${
        isNew ? " animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Event */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="min-w-0 truncate rounded-sm text-[12px] text-[#0D0D0D] after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1"
      >
        {match.tournamentName}
      </Link>

      {/* Result */}
      <span
        className="whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[1.8px]"
        style={{ color: resultInk(isWin) }}
      >
        {isWin ? "Won" : "Lost"}
      </span>

      {/* Score */}
      <span className="min-w-0 truncate text-[12px] text-[#71717A] tabular-nums tracking-[0.3px]">
        {formatScore(match.score.sets)}
      </span>

      {/* Opponent — the bare name. The "vs" that used to prefix it was carrying
          no information the Opponent header does not already give. */}
      <span className="min-w-0 truncate text-[12px] text-[#0D0D0D]">
        {match.player2.name}
      </span>

      {/* Analysis */}
      <div className="min-w-0">
        {!analysis ? null : isInFlight(analysis.status) ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="whitespace-nowrap text-[11px] font-medium text-[#3B82F6]">
                {ANALYSIS_LABEL[analysis.status]}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium text-[#3B82F6] tabular-nums">
                {Math.round(analysis.progressPercent ?? 0)}%
              </span>
            </div>
            <div className="h-[2px] overflow-hidden rounded-full bg-[#F0F0F0]">
              <div
                className="h-full rounded-full bg-[#3B82F6] transition-[width] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                style={{ width: `${analysis.progressPercent ?? 0}%` }}
              />
            </div>
          </div>
        ) : isAnalysisReady(analysis.status) ? (
          <div className="flex items-center gap-[7px]">
            <CircleCheck
              className="size-3.5 shrink-0 text-[#5DB955]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span
              className="whitespace-nowrap text-[11px]"
              style={{ color: outcomeInk(analysis.status) }}
            >
              {ANALYSIS_LABEL[analysis.status]}
            </span>
          </div>
        ) : isAnalysisFailed(analysis.status) ? (
          <div className="flex items-center gap-[7px]">
            <CircleX
              className="size-3.5 shrink-0 text-[#E51837]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap text-[11px] text-[#E51837]">
              {ANALYSIS_LABEL[analysis.status]}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-[#AAAAAA]">{ANALYSIS_LABEL.manual}</span>
        )}
      </div>

      {/* Action — a text link, per the design, not a bordered button */}
      <div className="relative z-10 flex justify-end">
        {action &&
          (action.href ? (
            <Link
              href={action.href}
              className="group/cta whitespace-nowrap rounded-sm text-[11px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
              style={{ color: action.ink }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = action.hoverInk;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = action.ink;
              }}
            >
              {action.label}
            </Link>
          ) : (
            /* Cancel has no endpoint yet — rendered per the design but inert. */
            <button
              type="button"
              disabled
              className="cursor-default whitespace-nowrap text-[11px] font-medium"
              style={{ color: action.ink }}
            >
              {action.label}
            </button>
          ))}
      </div>

      <div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 transition-opacity duration-200 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <MatchActionsMenu matchId={match.id} matchLabel={match.tournamentName} />
      </div>
    </div>
  );
}
