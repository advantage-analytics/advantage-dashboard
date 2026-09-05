"use client";

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
import { formatShortDate } from "@/lib/ui/date-format";

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
 * One header per row column, in the same order as `LIST_GRID_COLS`. Text and
 * its header flush left; the two numeric measures at the edge — Score and
 * Result — flush right with their headers (Updated Design System 20d). Plain
 * eyebrows: sorting lives in the toolbar's one sort control, not in the
 * header row.
 */
const COLUMNS: { label: string; align?: "right" }[] = [
  { label: "Date" },
  { label: "Opponent" },
  { label: "Event" },
  { label: "Analysis" },
  { label: "Score", align: "right" },
  { label: "Result", align: "right" },
  { label: "" },
];

export function MatchesGrid({
  matches,
  drafts = [],
  newMatchId,
  unseenIds,
  scope = "personal",
}: MatchesGridProps): React.JSX.Element {
  /* Which layout shows is a width question, so Tailwind answers it rather than
     React. Held in state it could only be read after mount, so the server — which
     has no viewport — always emitted the seven-column table and a phone painted
     that squeezed table for a frame before an effect swapped in the cards.
     Deciding in CSS renders the right layout the first time, and pins the
     breakpoint to `lg` instead of a 1023px literal with nothing tying it there.

     Both layouts sit in the tree. `hidden` is display:none, so the inactive one
     costs no paint and stays out of both the accessibility tree and the tab
     order; pagination caps the duplication at ten rows. */
  // The Date track widens for the whole card, not per row, so the columns keep
  // one x across the list — see `DATE_COL_WITH_YEAR`. Decided from the same
  // formatter the cells use, so the two cannot disagree about which dates
  // carry a year.
  const needsYear = [...drafts.map((d) => d.updatedAt), ...matches.map((m) => m.date)].some(
    (date) => /\d{4}$/.test(formatShortDate(date))
  );
  const cardStyle = {
    padding: "8px 24px 12px",
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
            8px 24px 12px padding, a hairline under the header only, and rows
            that carry a rounded inset hover instead of dividers (SKILL 8a). */}
        <div className="surface-card" style={cardStyle}>
          {/* Column headers — flush at the card inset, hairline underneath. */}
          <div
            className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2 pt-3`}
            style={LIST_GRID_COLS}
            role="row"
          >
            {COLUMNS.map((col, i) => (
              <span
                key={col.label || `col-${i}`}
                className={`eyebrow-sm min-w-0${col.align === "right" ? " text-right" : ""}`}
                role="columnheader"
              >
                {col.label}
              </span>
            ))}
          </div>
          {/* Rows — no per-item entrance tween. Content must never depend on an
              animation frame to become visible; PageTransition already carries
              the route-level entrance. */}
          <div className="pt-1">
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
