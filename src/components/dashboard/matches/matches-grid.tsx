"use client";

import { useMemo } from "react";

import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { DraftCard } from "./draft-card";
import { DraftRow, draftHref, type DraftRowData } from "./draft-row";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList } from "./match-card-list";
import {
  DATE_COL,
  DATE_COL_WITH_YEAR,
  LIST_ROW_FRAME,
  listColumnLabels,
  listGridCols,
  LIST_MIN_WIDTH,
  TEAM_LIST_MIN_WIDTH,
  datesNeedYear,
} from "./match-list-layout";
import { cn } from "@/lib/utils";

export type SortField = "date" | "opponent" | "event" | "result";
export type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  /** Half-finished uploads, listed at the top (design 11c). */
  drafts?: DraftRowData[];
  /**
   * Drafts that fill a listed match, keyed by that match's id — drawn as the
   * match row's Draft pill and "Continue" instead of rows of their own
   * (`foldDrafts`).
   */
  foldedDrafts?: ReadonlyMap<string, DraftRowData>;
  newMatchId?: string | null;
  /** Match ids never opened on this device — draws the blue "New" pill. */
  unseenIds?: Set<string>;
  /** Which wizard a draft resumes in. */
  scope?: "personal" | "team";
  /**
   * Drawn in place of the cards and in the table body when neither `matches`
   * nor `drafts` lists anything: a listed draft is an answer to give.
   */
  empty?: React.ReactNode;
}

export function MatchesGrid({
  matches,
  drafts = [],
  foldedDrafts,
  newMatchId,
  unseenIds,
  scope = "personal",
  empty,
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
  // whenever it is not from the current year, which is the exact rule each
  // row's formatter applies (`datesNeedYear` — a match's day and the day a
  // draft has entered, read the same way) — decided by comparing years directly rather
  // than formatting every date twice (once to detect, once to render), and
  // memoized so a re-render that does not change the rows does not re-scan them.
  const needsYear = useMemo(
    () =>
      datesNeedYear(
        matches.map((m) => m.date),
        drafts.map((d) => d.matchDate),
      ),
    [drafts, matches],
  );
  const continueHref = (matchId: string) => {
    const folded = foldedDrafts?.get(matchId);
    return folded ? draftHref(folded.id, scope) : null;
  };
  const cardStyle = {
    padding: "2px 24px 6px",
    "--date-col": needsYear ? DATE_COL_WITH_YEAR : DATE_COL,
  } as React.CSSProperties;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:hidden">
        {drafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} scope={scope} />
        ))}
        {matches.map((match) => (
          <MatchCardGallery
            key={match.id}
            match={match}
            scope={scope}
            isNew={match.id === newMatchId}
          />
        ))}
        {matches.length === 0 && drafts.length === 0 ? (
          <div className="surface-card md:col-span-2">{empty}</div>
        ) : null}
      </div>

      <div className="hidden lg:block">
        {/* The whole table lives in one card (Platform Audit Pb2): surface-card,
            the Roster's 2px 24px 6px chrome — the 52px row is the vertical
            rhythm and the card should not add a second one — a hairline under
            the header only, and rows that carry a rounded inset hover instead
            of dividers (SKILL 8a). */}
        <div className="surface-card overflow-x-auto" style={cardStyle}>
          <div
            className={
              scope === "personal" ? LIST_MIN_WIDTH : TEAM_LIST_MIN_WIDTH
            }
          >
            {/* Column headers — flush at the card inset, hairline underneath. */}
            <div
              className={cn(
                LIST_ROW_FRAME,
                "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
              )}
              style={listGridCols(scope)}
              role="row"
            >
              {listColumnLabels(scope).map((label, i) => (
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
                  scope={scope}
                  isNew={match.id === newMatchId}
                  unseen={unseenIds?.has(match.id)}
                  hasDraft={foldedDrafts?.has(match.id) ?? false}
                  continueHref={continueHref(match.id)}
                />
              ))}
              {matches.length === 0 && drafts.length === 0 ? empty : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
