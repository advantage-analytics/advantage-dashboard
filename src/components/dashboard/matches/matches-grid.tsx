"use client";

import { useMemo } from "react";

import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { DraftRow, type DraftRowData } from "./draft-row";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList } from "./match-card-list";
import {
  DATE_COL,
  DATE_COL_WITH_YEAR,
  LIST_ROW_FRAME,
  listGridCols,
  LIST_MIN_WIDTH,
  LIST_TRACK_TRANSITION,
  TEAM_LIST_MIN_WIDTH,
  TEAM_LIST_MIN_WIDTH_COMPACT,
  eventCellFade,
} from "./match-list-layout";
import { cn } from "@/lib/utils";

export type SortField = "date" | "opponent" | "event" | "result";
export type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  /** Half-finished uploads, listed at the top (design 11c). */
  drafts?: DraftRowData[];
  newMatchId?: string | null;
  /** Match ids never opened on this device — draws the blue "New" pill. */
  unseenIds?: Set<string>;
  /** Which wizard a draft resumes in. */
  scope?: "personal" | "team";
  /** The match or draft open in the drawer, or null. */
  selectedId?: string | null;
  /** Row click and Enter/Space: open, switch or close the drawer. */
  onToggle?: (id: string, viaKeyboard: boolean) => void;
  /** The drawer is open (or closing) beside the table. */
  drawerOpen?: boolean;
}

/**
 * One header per row column, in `match-list-layout.ts`'s order, every one flush
 * left over its value — the Result glyph included, never centred.
 *
 * Plain eyebrows, no sort buttons: sorting lives in the toolbar's one sort
 * control. The last track — lifecycle — heads nothing and
 * carries an empty label to keep the header's column count in step with the
 * row's.
 */
function columnsFor(scope: "personal" | "team"): string[] {
  if (scope === "personal") {
    return ["Date", "Opponent", "Result", "Score", "Event", ""];
  }
  // Event stays in the team header beside the drawer: its track collapses and
  // the label fades with the cells under it (`TEAM_LIST_GRID_COLS_COMPACT`).
  return ["Date", "Player", "Opponent", "Result", "Score", "Event", ""];
}

export function MatchesGrid({
  matches,
  drafts = [],
  newMatchId,
  unseenIds,
  scope = "personal",
  selectedId = null,
  onToggle,
  drawerOpen = false,
}: MatchesGridProps): React.JSX.Element {
  // Only the team table gives a track up beside the drawer; the personal one
  // fits at 1440 with every column.
  const compact = scope === "team" && drawerOpen;
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
    return [
      ...drafts.map((d) => d.updatedAt),
      ...matches.map((m) => m.date),
    ].some((date) => new Date(date).getFullYear() !== thisYear);
  }, [drafts, matches]);
  const cardStyle = {
    padding: "2px 24px 6px",
    "--date-col": needsYear ? DATE_COL_WITH_YEAR : DATE_COL,
  } as React.CSSProperties;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:hidden">
        {matches.map((match) => (
          <MatchCardGallery
            key={match.id}
            match={match}
            scope={scope}
            isNew={match.id === newMatchId}
          />
        ))}
      </div>

      <div className="hidden lg:block">
        {/* The whole table lives in one card (Platform Audit Pb2): surface-card,
            the Roster's 2px 24px 6px chrome — the 52px row is the vertical
            rhythm and the card should not add a second one — a hairline under
            the header only, and rows that carry a rounded inset hover instead
            of dividers (SKILL 8a). */}
        <div className="surface-card overflow-x-auto" style={cardStyle}>
          <div
            className={cn(
              LIST_TRACK_TRANSITION,
              scope === "personal"
                ? LIST_MIN_WIDTH
                : compact
                  ? TEAM_LIST_MIN_WIDTH_COMPACT
                  : TEAM_LIST_MIN_WIDTH,
            )}
          >
            {/* Column headers — flush at the card inset, hairline underneath. */}
            <div
              className={cn(
                LIST_ROW_FRAME,
                LIST_TRACK_TRANSITION,
                "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
              )}
              style={listGridCols(scope, compact)}
              role="row"
            >
              {columnsFor(scope).map((label, i) => (
                <span
                  key={label || `col-${i}`}
                  aria-hidden={
                    (label === "Event" && scope === "team" && compact) ||
                    undefined
                  }
                  className={cn(
                    "eyebrow-sm min-w-0 truncate",
                    label === "Event" &&
                      scope === "team" &&
                      eventCellFade(compact),
                  )}
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
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  scope={scope}
                  compact={compact}
                  selected={draft.id === selectedId}
                  onToggle={onToggle}
                />
              ))}
              {matches.map((match) => (
                <MatchCardList
                  key={match.id}
                  match={match}
                  scope={scope}
                  isNew={match.id === newMatchId}
                  unseen={unseenIds?.has(match.id)}
                  compact={compact}
                  selected={match.id === selectedId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
