"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { ResultMark } from "@/components/dashboard/result-mark";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { formatShortDate } from "@/lib/ui/date-format";
import { NewPill } from "@/components/ui/new-pill";
import { RowLifecycle } from "./row-state";

/**
 * Date · Opponent · Event · Score · Result · lifecycle · ⋯ · chevron.
 *
 * Data Table law 1's canonical order for this list, and the grammar the Roster
 * and Schedule open with: the date leads, the 13/500 name comes next with its
 * 26px mark (an initials avatar here, where the name is a person; `EventMark`
 * on Schedule, where it is a program or a tournament), context in 12px ink-500
 * after it, then the numbers and the outcome. Score before Result, because
 * Schedule reads Score → Result and a coach moving between the two pages should
 * find the outcome in the same place.
 *
 * An earlier cut ran Event before Opponent ("the way the match would be said
 * aloud") and drew the outcome as `ResultMark`'s glyph, centred, ahead of the
 * score. Each was defensible alone; together they made this the one table that
 * did not look like the other two — no mark leading the name, the outcome in a
 * different column, register and alignment from Schedule's. The word under a
 * labelled "Result" header is law 2's register for a table that keeps its
 * headers; the glyph is for headerless rows, and the roster still uses it that
 * way inside its Last-match cell.
 *
 * The round stays inside the Event cell. It was tried as a column of its own,
 * mirroring the LINE column on the roster card this grammar comes from, and the
 * analogy turned out to be false: a line is a property of the PLAYER and holds
 * across their matches, so a column of them is a pattern worth reading down. A
 * round is a property of one EVENT — a quarter-final at Riverside and one at
 * Marin are not the same measurement — so the column bought little and cost
 * something real.
 */
export const DATE_COL = "72px";
/**
 * `formatShortDate` stamps the year once a match is not from this year
 * ("Nov 13, 2025", ~80px), which at 72px runs into the Event cell. Each row is
 * its own grid, so the track cannot size to its content and still line up:
 * `MatchesGrid` measures the list once and sets `--date-col` on the card when
 * any row needs the wider one. A list of this year's matches is the 72px frame.
 */
export const DATE_COL_WITH_YEAR = "84px";

/**
 * The LIFECYCLE cell is the fluid track, and everything else is bounded.
 *
 * That is the opposite of what a table usually does, and each alternative was
 * tried and broke the row. Slack given to Event grew it past 300px while a
 * typical name draws ~140, pushing the round away from its own event. Slack
 * given to Opponent stranded the name far from the score it belongs with.
 * Slack left after the Result was simply air — and air is exactly what the
 * lifecycle cell needs, since it is empty on a settled row.
 *
 * So the leftover width IS the lifecycle column. It carries a 96px minimum, so
 * at the narrow end of `lg` the upload's bar collapses before its words do —
 * the chip is what has to survive — and every bounded column gives up its own
 * slack first. It heads nothing: the cell is an annotation, self-describing on
 * the rows that use it, and a label over a column that is blank eight rows in
 * ten only draws attention to the blanks.
 *
 * Opponent's cap is measured, not round: a full name at 13/500 — "Timofey
 * Stepanov" is ~115px — with the "New" pill beside it came to 240px; the 26px
 * mark and its 10px gap add 36, so 276. Result is 64px, the width Schedule
 * gives the same mark and header. Score is 116px at one precision.
 */
export const LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(186px,276px) minmax(150px,260px) 116px 64px minmax(96px,1fr) 28px 13px`,
} as const;

/**
 * The grid frame, shared with the header row above. The 16px column gap is
 * most of what separates this row from the one it replaced — the columns
 * changed less than the air between them did.
 *
 * The header sits flush at the card's inset while data rows pull out 16px each
 * side for a rounded, inset hover wash (SKILL 8a). Both still land content on
 * the same x because the row's `-mx-4 px-4` cancels to the header's edge.
 */
export const TEAM_LIST_GRID_COLS = {
  gridTemplateColumns: `var(--date-col, ${DATE_COL}) minmax(130px,1fr) minmax(150px,1fr) minmax(130px,1fr) 116px 64px minmax(96px,1fr) 28px 13px`,
} as const;

export const LIST_ROW_FRAME = "grid items-center gap-x-4";

/**
 * The row's actions lane: 28px at the row's end, inside the chevron, empty at
 * rest and holding the ⋯ on hover.
 *
 * v3's law says hover swaps the *lifecycle cell* for the trigger, which was
 * sound when Analysis sat second-to-last — it put the ⋯ where the cursor was
 * already heading. Once the columns were reordered that same rule dropped the
 * menu into the middle of the row, over content it also had to hide. A lane of
 * its own costs 28px of permanent gutter and buys a trigger that is always in
 * the same place, over nothing, with the chevron still closing the row.
 */
export const ACTIONS_LANE =
  "relative z-[1] flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 has-[:focus-visible]:opacity-100 has-[[data-state=open]]:opacity-100";

interface MatchCardListProps {
  match: DisplayMatch;
  /** Highlights briefly right after this match was created, this session. */
  isNew?: boolean;
  /** Never opened on this device — draws the blue "New" pill. */
  unseen?: boolean;
  scope?: "personal" | "team";
}

export function MatchCardList({
  match,
  isNew,
  unseen,
  scope = "personal",
}: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative -mx-4 h-[52px] rounded-[var(--radius-element)] px-4 transition-colors duration-200 hover:bg-[var(--surface-muted)]${
        isNew ? "animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={scope === "team" ? TEAM_LIST_GRID_COLS : LIST_GRID_COLS}
      role="row"
    >
      {/* Date — the key column, tabular, matching Schedule and the roster card. */}
      <span
        className="tabular text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {formatShortDate(match.date)}
      </span>

      {scope === "team" && (
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {match.player1.name}
        </span>
      )}

      {/* Opponent — the name a reader scans for, led by its mark like every
          name column in the product. The invisible full-row link lives here,
          and the row's one state marker follows the name. */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="flex min-w-0 items-center gap-2.5 rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <InitialsAvatar name={match.player2.name} />
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {match.player2.name}
        </span>
        {unseen && <NewPill className="shrink-0" />}
      </Link>

      {/* Event — the occasion, quieter than the name it follows, with the round
          it qualifies trailing it in mono. The round never truncates: it is two
          or three characters, and a tournament losing its tail is a smaller
          loss than a stage nobody can read. */}
      <span
        className="flex min-w-0 items-baseline gap-1 text-[12px]"
        style={{ color: "var(--ink-500)" }}
      >
        <span className="min-w-0 truncate">{match.tournamentName}</span>
        {match.round && (
          <span
            className="mono shrink-0 text-[11px]"
            style={{ color: "var(--ink-400)" }}
          >
            · {match.round}
          </span>
        )}
      </span>

      {/* Score — flush left in its fixed track, one precision, tabular, so
          every row's numbers start at the same x. 13px, like the Roster's
          Record and Schedule's Score: the one column a coach reads straight
          down is the same size on every page. */}
      <ScoreLine
        sets={match.score.sets}
        className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
      />

      {/* Result — the outcome glyph, the product's one register, under its
          labelled header. Flush left, matching the header above it and the
          `EmptyMark` a draft row draws in this same column; this row's edge is
          the chevron, not this cell, so right-aligning would only push the
          outcome away from the score it belongs to. */}
      <ResultMark won={isWin} className="justify-self-start" />

      {/* Lifecycle — silent on a settled row; the upload's chip and bar, or the
          one word that explains an exception, on the rest. */}
      {/* `grid`, and both parts of that are load-bearing. Grid items are
          blockified, so `StatusChip`'s `inline-flex` stops sitting on the
          cell's text baseline — on a bare block it landed a few pixels below
          the upload's stacked label-and-bar, which is a flex column. And a grid
          item stretches across the track, which a flex item does not.

          `row-lifecycle` makes it a container: the rotating analysis copy is
          gated on THIS cell's width rather than the viewport's, because the
          cell is the row's fluid track and shrinks far faster than the window
          does. See globals.css. */}
      <div className="row-lifecycle grid min-w-0 items-center">
        <RowLifecycle
          analysis={match.analysis}
          label={`${match.player2.name}, ${match.tournamentName}`}
        />
      </div>

      <span className={ACTIONS_LANE}>
        {match.canManage !== false && (
          <MatchActionsMenu
            matchId={match.id}
            matchLabel={match.tournamentName}
            className="bg-[var(--surface-subtle)]"
          />
        )}
      </span>

      {/* Row end — never empty, never moving: chevron-right because the row
          opens a destination, held resting and hovered alike. */}
      <ChevronRight
        className="size-[13px] text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </div>
  );
}
