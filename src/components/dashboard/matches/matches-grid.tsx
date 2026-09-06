"use client";

import { useMemo } from "react";

import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { DraftRow, type DraftRowData } from "./draft-row";
import { MatchCardGallery } from "./match-card-gallery";
import {
  MatchCardList,
  DATE_COL,
  DATE_COL_WITH_YEAR,
  LIST_GRID_COLS,
  LIST_ROW_FRAME,
} from "./match-card-list";

export type SortField = "date" | "opponent" | "event" | "result";
export type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  /** Half-finished uploads, listed at the top with Resume (design 11c). */
  drafts?: DraftRowData[];
  newMatchId?: string | null;
  /** Match ids never opened on this device — draws the blue "New" pill. */
  unseenIds?: Set<string>;
  /** Which wizard a draft resumes in. */
  scope?: "personal" | "team";
}

/**
 * One header per row column, in the same order as `LIST_GRID_COLS`. Flush left
 * but for Result, which centres over its glyph: the score is the only numeric
 * measure left and it sits in a fixed track, so left-aligning it starts every
 * row's numbers at one x — right-aligning would ragged them against a three-set
 * score.
 *
 * Plain eyebrows, no sort buttons: sorting lives in the toolbar's one sort
 * control. The last three tracks — lifecycle, the actions lane and the chevron
 * — head nothing and carry an empty label to keep the header's column count in
 * step with the row's.
 */
const COLUMNS: string[] = ["Date", "Opponent", "Event", "Score", "Result", "", "", ""];

export function MatchesGrid({
  matches,
  drafts = [],
  newMatchId,
  unseenIds,
  scope = "personal",
}: MatchesGridProps): React.JSX.Element {
  /* Which layout shows is a width question, so Tailwind answers it rather than
     React. Held in state it could only be read after mount, so the server — which
     has no viewport — always emitted the wide table and a phone painted
     that squeezed table for a frame before an effect swapped in the cards.
     Deciding in CSS renders the right layout the first time, and pins the
     breakpoint to `lg` instead of a 1023px literal with nothing tying it there.

     Both layouts sit in the tree. `hidden` is display:none, so the inactive one
     costs no paint and stays out of both the accessibility tree and the tab
     order; pagination caps the duplication at ten rows. */
  // The Date track widens for the whole card, not per row, so the columns keep
  // one x across the list — see `DATE_COL_WITH_YEAR`. A date needs the year
  // whenever it is not from the current year, which is the exact rule
  // `formatShortDate` applies — decided here by comparing years directly rather
  // than formatting every date twice (once to detect, once to render), and
  // memoized so a re-render that does not change the rows does not re-scan them.
  const needsYear = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return [...drafts.map((d) => d.updatedAt), ...matches.map((m) => m.date)].some(
      (date) => new Date(date).getFullYear() !== thisYear
    );
  }, [drafts, matches]);
  const cardStyle = {
    padding: "2px 24px 6px",
    "--date-col": needsYear ? DATE_COL_WITH_YEAR : DATE_COL,
  } as React.CSSProperties;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:hidden">
        {matches.map((match) => (
          <MatchCardGallery key={match.id} match={match} isNew={match.id === newMatchId} />
        ))}
      </div>

      <div className="hidden lg:block">
        {/* The whole table lives in one card (Platform Audit Pb2): surface-card,
            the Roster's 2px 24px 6px chrome — the 52px row is the vertical
            rhythm and the card should not add a second one — a hairline under
            the header only, and rows that carry a rounded inset hover instead
            of dividers (SKILL 8a). */}
        <div className="surface-card" style={cardStyle}>
          {/* Column headers — flush at the card inset, hairline underneath. */}
          <div
            className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2.5 pt-3.5`}
            style={LIST_GRID_COLS}
            role="row"
          >
            {COLUMNS.map((label, i) => (
              <span
                key={label || `col-${i}`}
                className="eyebrow-sm min-w-0 truncate"
                role="columnheader"
              >
                {label}
              </span>
            ))}
          </div>
          {/* Rows — no per-item entrance tween. Content must never depend on an
              animation frame to become visible; PageTransition already carries
              the route-level entrance. */}
          <div>
            {drafts.map((draft) => (
              <DraftRow key={draft.id} draft={draft} scope={scope} />
            ))}
            {matches.map((match) => (
              <MatchCardList
                key={match.id}
                match={match}
                isNew={match.id === newMatchId}
                unseen={unseenIds?.has(match.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
