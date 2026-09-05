"use client";

import Link from "next/link";
import { ChevronRight, TriangleAlert, Clock, VideoOff } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  ANALYSIS_LABEL,
  analysisAction,
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isSubmitStalled,
  isWorking,
} from "@/lib/data/match-analysis";
import { Badge } from "@/components/ui/badge";
import { NewPill } from "@/components/ui/new-pill";
import { StatusChip } from "@/components/ui/status-chip";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { formatShortDate } from "@/lib/ui/date-format";

/**
 * Date · Opponent · Event · Analysis · Score · Result · chevron.
 *
 * One column grammar for every list (Updated Design System 20d, drawn for this
 * page in Platform Audit Pb2): the list is newest-first, so Date leads as the
 * key column; then the name; then context; then numbers and outcome
 * right-aligned at the edge. Schedule reads the same way, so the two tables
 * read as one system.
 *
 * Every track is fixed or bounded except Event and Analysis, so scores and
 * results start at the same x on every row. Date is the frame's 72px, sized
 * for "Aug 23"; `formatShortDate` stamps the year once a match is not from this
 * year ("Nov 13, 2025", ~80px), which at 72px ran straight into the Opponent
 * name. Each row is its own grid, so the track cannot size to its content and
 * still line up — `MatchesGrid` measures the list once and sets
 * `--date-col` to `DATE_COL_WITH_YEAR` on the card when any row needs it. A
 * list of this year's matches renders the frame exactly.
 */
export const DATE_COL = "72px";
export const DATE_COL_WITH_YEAR = "84px";
export const LIST_GRID_COLS = {
  gridTemplateColumns:
    `var(--date-col, ${DATE_COL}) minmax(150px,1.1fr) minmax(160px,1.3fr) minmax(140px,1.1fr) 116px 64px 13px`,
} as const;

/**
 * The grid frame, shared with the header row above. Only the columns and the
 * column gap travel together here — the header sits flush at the card's inset
 * while the data rows pull out 16px each side for a rounded, inset hover wash
 * (SKILL 8a). Both still land their content on the same x because the row's
 * `-mx-4 px-4` cancels out to the header's flush edge.
 */
export const LIST_ROW_FRAME = "grid items-center gap-x-3";

/**
 * The hover swap for the lifecycle cell, shared with `DraftRow`.
 *
 * On hover the row's ⋯ trigger takes the Analysis cell's place and the row-end
 * chevron holds — direction encodes behaviour, so the one thing that must
 * never move or hide between states is the chevron (Updated Design System 14a,
 * row 2). Keyboard users are not hovering: the cell's own links stay visible
 * and focusable, and the trigger reveals itself only when it is the thing
 * focused (`peer-has`), so a focused control is never a faded one.
 */
export const LIFECYCLE_ACTIONS_SLOT =
  "peer absolute left-0 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 has-[:focus-visible]:opacity-100 group-has-[[data-state=open]]:opacity-100";
export const LIFECYCLE_CONTENT =
  "transition-opacity duration-200 group-hover:pointer-events-none group-hover:opacity-0 peer-has-[:focus-visible]:opacity-0 group-has-[[data-state=open]]:opacity-0";
/** 28px, radius-element, surface-subtle — 14a's trigger, on the menu's own button. */
export const LIFECYCLE_TRIGGER = "bg-[var(--surface-subtle)]";

interface MatchCardListProps {
  match: DisplayMatch;
  /** Highlights briefly right after this match was created, this session. */
  isNew?: boolean;
  /** Never opened on this device — draws the blue "New" pill (19f). */
  unseen?: boolean;
}

export function MatchCardList({ match, isNew, unseen }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const analysis = match.analysis;
  const action = analysis ? analysisAction(analysis, match.id) : null;

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative -mx-4 h-[52px] rounded-[var(--radius-element)] px-4 transition-colors duration-200 hover:bg-[var(--surface-muted)]${
        isNew ? " animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Date — the key column, 12px tabular ink-700, matching Schedule. */}
      <span className="tabular whitespace-nowrap text-[12px]" style={{ color: "var(--ink-700)" }}>
        {formatShortDate(match.date)}
      </span>

      {/* Opponent — the invisible full-row link lives here; it's the primary
          name a reader scans for, second only to the date. */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="flex min-w-0 items-center gap-[7px] rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {match.player2.name}
        </span>
        {unseen && <NewPill className="shrink-0" />}
      </Link>

      {/* Event — the round trails the name after a middot, in mono. */}
      <span className="min-w-0 truncate text-[12px]" style={{ color: "var(--ink-600)" }}>
        {match.tournamentName}
        {match.round && (
          <>
            {" · "}
            <span className="mono text-[11px]">{match.round}</span>
          </>
        )}
      </span>

      {/* Analysis — the one fluid cell, and the one that swaps for the row's
          ⋯ trigger on hover. */}
      <div className="relative min-w-0">
        <div className={LIFECYCLE_ACTIONS_SLOT}>
          <MatchActionsMenu
            matchId={match.id}
            matchLabel={match.tournamentName}
            className={LIFECYCLE_TRIGGER}
          />
        </div>
        <div className={LIFECYCLE_CONTENT}>
          {!analysis ? null : isInFlight(analysis.status) && !isSubmitStalled(analysis) ? (
            /* A dot and a word while it runs — no percentage, no elapsed time;
               the activity tray owns progress. `live` pulses only while
               something is actually happening: `uploaded` and `processed` are
               in flight but idle, and a pulse there would claim work that is
               not being done. */
            <StatusChip tone="blue" live={isWorking(analysis.status)}>
              {ANALYSIS_LABEL[analysis.status]}
            </StatusChip>
          ) : isSubmitStalled(analysis) ? (
            /* The one `uploaded` job in this list whose hand-off to the vendor
               never went through — see `isSubmitStalled`. A live chip here
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
            /* The row already opens the report; the link says so in words for
               anyone reading the column. */
            <Link
              href={`/dashboard/matches/${match.id}`}
              className="relative z-10 whitespace-nowrap text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              View report
            </Link>
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
      </div>

      {/* Score — flush right in its fixed 116px track, one precision, tabular. */}
      <ScoreLine
        sets={match.score.sets}
        className="text-scoreboard-sm min-w-0 truncate text-right"
      />

      {/* Result — the word register, bare tracked text against the "RESULT"
          header, right-aligned at the edge with the score beside it. */}
      <span className="inline-flex justify-self-end">
        <Badge variant={isWin ? "win" : "loss"}>{isWin ? "Won" : "Lost"}</Badge>
      </span>

      {/* Row end — the 13px column is never empty: chevron-right because the
          row opens a destination. Held resting and hovered, so nothing shifts
          between states. */}
      <ChevronRight
        className="size-[13px] text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </div>
  );
}
