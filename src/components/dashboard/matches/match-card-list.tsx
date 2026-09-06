"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { formatShortDate } from "@/lib/ui/date-format";
import { NewPill } from "@/components/ui/new-pill";
import { RowLifecycle } from "./row-state";

/**
 * Date · Event · Opponent · Result · Score · lifecycle · ⋯ · chevron.
 *
 * The row reads the way the match would be said aloud — "Aug 22, Riverside
 * quarters, Okafor, lost, 3-6 6-7". Context first, then the three facts that
 * belong together, closing on a number the way every table in the product
 * does. Date keeps the lead, so this list, Schedule and the roster's match
 * history card all open on the same column.
 *
 * **Analysis** as a mid-row column is gone: it said "View report" on every
 * settled row, which is what clicking the row already does. What was worth
 * saying moved to `RowLifecycle`, in the trailing cell after the score, where
 * it is silent on a settled row and carries the upload's progress on the few
 * that are not. **Result**'s tracked word became `ResultMark`'s glyph — a
 * circle survives translation where a W or an L does not — and it is the one
 * centred cell in the product: its content is a single fixed-width glyph on
 * every row, so centring raggeds nothing, which is the case the rule against
 * centre-aligned cells exists to prevent.
 *
 * The round stays inside the Event cell. It was tried as a column of its own,
 * mirroring the LINE column on the roster card this grammar comes from, and the
 * analogy turned out to be false: a line is a property of the PLAYER and holds
 * across their matches, so a column of them is a pattern worth reading down. A
 * round is a property of one EVENT — a quarter-final at Riverside and one at
 * Marin are not the same measurement — so the column bought little and cost
 * something real. With the event cell bounded, a typical name leaves air after
 * it, which put the round column ~140px from its event and 16px from the
 * opponent, where it read as qualifying the person rather than the tournament.
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
 * given to Opponent left the name ~400px short of the result glyph, stranding
 * the three facts this order exists to keep together. Slack left after the
 * Score was simply air — and air is exactly what the lifecycle cell needs,
 * since it is empty on a settled row.
 *
 * So the leftover width IS the lifecycle column. It carries a 96px minimum, so
 * at the narrow end of `lg` the upload's bar collapses before its words do —
 * the chip is what has to survive — and every bounded column gives up its own
 * slack first. It heads nothing: the cell is an annotation, self-describing on
 * the rows that use it, and a label over a column that is blank eight rows in
 * ten only draws attention to the blanks.
 *
 * Opponent's 240px cap is measured, not round: a full name at 13/500 —
 * "Timofey Stepanov" is ~115px — with room for the "New" pill beside it, and
 * nothing wider, because every pixel past that pushes the result glyph away
 * from the name it belongs to.
 */
export const LIST_GRID_COLS = {
  gridTemplateColumns:
    `var(--date-col, ${DATE_COL}) minmax(150px,260px) minmax(150px,240px) 56px 116px minmax(96px,1fr) 28px 13px`,
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
  "flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 has-[:focus-visible]:opacity-100 has-[[data-state=open]]:opacity-100";

interface MatchCardListProps {
  match: DisplayMatch;
  /** Highlights briefly right after this match was created, this session. */
  isNew?: boolean;
  /** Never opened on this device — draws the blue "New" pill. */
  unseen?: boolean;
}

export function MatchCardList({ match, isNew, unseen }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";

  return (
    <div
      className={`${LIST_ROW_FRAME} group relative -mx-4 h-[52px] rounded-[var(--radius-element)] px-4 transition-colors duration-200 hover:bg-[var(--surface-muted)]${
        isNew ? " animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""
      }`}
      style={LIST_GRID_COLS}
      role="row"
    >
      {/* Date — the key column, tabular, matching Schedule and the roster card. */}
      <span className="tabular whitespace-nowrap text-[12px]" style={{ color: "var(--ink-700)" }}>
        {formatShortDate(match.date)}
      </span>

      {/* Event — the occasion, quieter than the name it sets up, with the round
          it qualifies trailing it in mono. The round never truncates: it is two
          or three characters, and a tournament losing its tail is a smaller
          loss than a stage nobody can read. */}
      <span className="flex min-w-0 items-baseline gap-1 text-[12px]" style={{ color: "var(--ink-500)" }}>
        <span className="min-w-0 truncate">{match.tournamentName}</span>
        {match.round && (
          <span className="mono shrink-0 text-[11px]" style={{ color: "var(--ink-400)" }}>
            · {match.round}
          </span>
        )}
      </span>

      {/* Opponent — the invisible full-row link lives here; it is the name a
          reader scans for, and the row's one state marker follows it. */}
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="flex min-w-0 items-center gap-[7px] rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
      >
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {match.player2.name}
        </span>
        {unseen && <NewPill className="shrink-0" />}
      </Link>

      {/* Result — the glyph register, centred under its header. The word is not
          lost: `ResultMark` carries "Won"/"Lost" as its accessible name. */}
      <ResultMark won={isWin} className="justify-self-center" />

      {/* Score — flush left in its fixed track, one precision, tabular, so
          every row's numbers start at the same x. */}
      <ScoreLine
        sets={match.score.sets}
        className="text-scoreboard-sm min-w-0 truncate"
      />

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
        <MatchActionsMenu
          matchId={match.id}
          matchLabel={match.tournamentName}
          className="bg-[var(--surface-subtle)]"
        />
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
