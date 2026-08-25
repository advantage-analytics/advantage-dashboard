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
  isWorking,
  outcomeInk,
} from "@/lib/data/match-analysis";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { AnalysisProgressTrack } from "./analysis-progress-track";

/**
 * Event · Result · Score · Opponent · Analysis · action.
 *
 * Every field gets its own column and its own header, so the eye scans down a
 * column instead of parsing a stacked block per row. Result is a fixed 62px —
 * it holds a single 14px `ResultMark`, so the width is set by the "RESULT"
 * header above it and a share of the fluid space would just pad it. Analysis
 * stays the widest fluid column because it is the only cell whose contents
 * change shape (bar, check, cross, or a phrase).
 *
 * Date is not a column: it is one of the least-scanned fields and reachable
 * from the sort control, and dropping it is what buys Analysis its width.
 */
export const LIST_GRID_COLS = {
  gridTemplateColumns: "2fr 62px 1.05fr 1.2fr 1.9fr 84px",
} as const;

/**
 * The row frame, shared with the header row that sits above these. Column
 * widths already travel together via LIST_GRID_COLS; the gap and the side
 * padding have to as well, or a header cell drifts out of line with the column
 * it names and nothing catches it.
 */
export const LIST_ROW_FRAME = "grid items-center gap-x-5 pl-3.5 pr-9";

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
      className={`${LIST_ROW_FRAME} group relative h-[52px] border-b border-[#F3F3F3] transition-colors duration-200 hover:bg-[#F5F5F5]${
        isNew ? " animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Event */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="min-w-0 truncate rounded-sm text-[12px] text-[#0D0D0D] after:absolute after:inset-0 focus-visible:outline-none"
      >
        {match.tournamentName}
      </Link>

      {/* Result — round 44's glyph rather than the word. The column keeps its
          "RESULT" header, so the mark is still read against a label; "Won" /
          "Lost" itself survives as the mark's accessible name. */}
      <ResultMark won={isWin} />

      {/* Score */}
      <ScoreLine
        sets={match.score.sets}
        className="min-w-0 truncate text-[12px] text-[#71717A] tracking-[0.3px]"
      />

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
              {analysis.uploadPercent !== undefined && (
                <span className="whitespace-nowrap text-[11px] font-medium text-[#3B82F6] tabular-nums">
                  {Math.round(analysis.uploadPercent)}%
                </span>
              )}
            </div>
            {/* 3px, matching the match page's stage bars — the same state
                should not be two different weights on two screens. */}
            <AnalysisProgressTrack
              percent={analysis.progressPercent ?? 0}
              live={isWorking(analysis.status)}
              label={ANALYSIS_LABEL[analysis.status]}
            />
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
              className="group/cta whitespace-nowrap rounded-sm text-[11px] font-medium transition-colors duration-200 focus-visible:outline-none"
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
