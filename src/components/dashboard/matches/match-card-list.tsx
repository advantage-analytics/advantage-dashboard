"use client";

import Link from "next/link";
import { CircleCheck, TriangleAlert, Clock, VideoOff, ChevronRight } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  ANALYSIS_LABEL,
  analysisAction,
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isSubmitStalled,
  isWorking,
  outcomeInk,
} from "@/lib/data/match-analysis";
import { Badge } from "@/components/ui/badge";
import { StatePill } from "@/components/ui/state-pill";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { AnalysisProgressTrack } from "./analysis-progress-track";
import { formatShortDate } from "@/lib/ui/date-format";

/**
 * Result · Opponent · Score · Event · Analysis · Date · chevron.
 *
 * The order is a decision sequence, left to right: outcome → who → measure →
 * context → when (v3's Data Table law). Result is a fixed 62px — it holds one
 * tracked `Badge`, so the width is set by the "RESULT" header above it.
 */
export const LIST_GRID_COLS = {
  gridTemplateColumns: "62px minmax(150px,1.1fr) 116px minmax(160px,1.3fr) minmax(140px,1.2fr) 52px 13px",
} as const;

/**
 * The row frame, shared with the header row that sits above these. Column
 * widths already travel together via LIST_GRID_COLS; the gap and the side
 * padding have to as well, or a header cell drifts out of line with the column
 * it names and nothing catches it.
 */
export const LIST_ROW_FRAME = "grid items-center gap-x-3 pl-3.5 pr-9";

interface MatchCardListProps {
  match: DisplayMatch;
  /** Highlights briefly right after this match was created, this session. */
  isNew?: boolean;
  /** Never opened on this device — draws the "New" `StatePill`. */
  unseen?: boolean;
}

export function MatchCardList({ match, isNew, unseen }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const analysis = match.analysis;
  const action = analysis ? analysisAction(analysis, match.id) : null;

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative h-[52px] border-b border-[var(--border-hairline)] transition-colors duration-200 hover:bg-[var(--surface-muted)]${
        isNew ? " animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Result — the word register: this table keeps its column headers, so
          Badge (bare tracked text) reads against "RESULT" rather than needing
          a glyph. */}
      <Badge variant={isWin ? "win" : "loss"}>{isWin ? "Won" : "Lost"}</Badge>

      {/* Opponent — the invisible full-row link lives here; it's the primary
          name a reader scans for, second only to the outcome. */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="flex min-w-0 items-center gap-[7px] rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {match.player2.name}
        </span>
        {unseen && <StatePill className="shrink-0">New</StatePill>}
      </Link>

      {/* Score */}
      <ScoreLine
        sets={match.score.sets}
        className="text-scoreboard-sm min-w-0 truncate"
      />

      {/* Event */}
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        {match.tournamentName}
        {match.round && <span className="mono ml-1 text-[11px]">· {match.round}</span>}
      </span>

      {/* Analysis */}
      <div className="min-w-0">
        {!analysis ? null : isInFlight(analysis.status) && !isSubmitStalled(analysis) ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="whitespace-nowrap text-[11px] font-medium" style={{ color: "var(--blue)" }}>
                {ANALYSIS_LABEL[analysis.status]}
              </span>
              {analysis.uploadPercent !== undefined && (
                <span className="tabular whitespace-nowrap text-[11px] font-medium" style={{ color: "var(--blue)" }}>
                  {Math.round(analysis.uploadPercent)}%
                </span>
              )}
            </div>
            <AnalysisProgressTrack
              percent={analysis.progressPercent ?? 0}
              live={isWorking(analysis.status)}
              label={ANALYSIS_LABEL[analysis.status]}
            />
          </div>
        ) : isSubmitStalled(analysis) ? (
          /* The one `uploaded` job in this list whose hand-off to the vendor
             never went through — see `isSubmitStalled`. A progress bar here
             would keep claiming work is under way; nothing is, and nothing
             will move until someone retries from the match page. "Not sent
             for analysis" echoes match-analysis-progress.tsx's heading for
             this same state rather than coining a second phrase for it. */
          <div className="flex items-center gap-[7px]">
            <Clock className="size-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--ink-400)" }} aria-hidden="true" />
            <span className="whitespace-nowrap text-[11px]" style={{ color: "var(--ink-400)" }}>
              Not sent for analysis
            </span>
          </div>
        ) : isAnalysisReady(analysis.status) ? (
          action?.href ? (
            <Link
              href={action.href}
              className="relative z-10 whitespace-nowrap text-[11px] font-medium"
              style={{ color: "var(--blue-text)" }}
            >
              {action.label}
            </Link>
          ) : (
            <div className="flex items-center gap-[7px]">
              <CircleCheck className="size-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--viz-good)" }} aria-hidden="true" />
              <span className="whitespace-nowrap text-[11px]" style={{ color: outcomeInk(analysis.status) }}>
                {ANALYSIS_LABEL[analysis.status]}
              </span>
            </div>
          )
        ) : isAnalysisFailed(analysis.status) ? (
          <div className="flex items-center gap-[7px]">
            {/* Not `CircleX` — the Result column's `Badge` already owns
                won/lost for this row, and `ResultMark` (used elsewhere in
                this same list) reserves circle-check/circle-x for that
                outcome alone. This is a job failing, not a match being lost;
                `TriangleAlert` is `needs-attention.tsx`'s own glyph for the
                identical state. `--danger`, not `--viz-bad` — the `--viz-*`
                ramp is chart data only, never chrome. */}
            <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--danger)" }} aria-hidden="true" />
            {action?.href ? (
              <Link
                href={action.href}
                className="relative z-10 whitespace-nowrap text-[11px] font-medium"
                style={{ color: "var(--danger)" }}
              >
                {action.label}
              </Link>
            ) : (
              <span className="whitespace-nowrap text-[11px]" style={{ color: "var(--danger)" }}>
                {ANALYSIS_LABEL[analysis.status]}
              </span>
            )}
          </div>
        ) : (
          /* `manual` — no video was ever submitted for this match. The only
             row of the five that has nothing running, nothing broken and
             nothing to check: VideoOff says that in one glyph rather than
             leaving the word to carry it alone. */
          <div className="flex items-center gap-[7px]">
            <VideoOff className="size-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--ink-400)" }} aria-hidden="true" />
            <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
              {ANALYSIS_LABEL.manual}
            </span>
          </div>
        )}
      </div>

      {/* Date */}
      <span className="mono tabular whitespace-nowrap text-right text-[11px]" style={{ color: "var(--ink-500)" }}>
        {formatShortDate(match.date)}
      </span>

      <div aria-hidden className="flex items-center justify-end">
        <ChevronRight className="size-[13px] text-[var(--ink-300)]" strokeWidth={1.5} />
      </div>

      <div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 transition-opacity duration-200 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <MatchActionsMenu matchId={match.id} matchLabel={match.tournamentName} />
      </div>
    </div>
  );
}
