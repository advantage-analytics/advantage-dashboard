"use client";

import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList, LIST_GRID_COLS, LIST_ROW_FRAME } from "./match-card-list";
import { ArrowUp, ArrowDown } from "lucide-react";

export type SortField = "date" | "opponent" | "event" | "result";
export type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  newMatchId?: string | null;
  /** Match ids never opened on this device — draws the "New" `StatePill`. */
  unseenIds?: Set<string>;
}

/**
 * One header per row column, in the same order as `LIST_GRID_COLS`. Score
 * carries no sort — there is no ordering of a set score a player would ask
 * for — and Analysis is a filter concern, not a sort.
 */
const COLUMNS: { label: string; field?: SortField }[] = [
  { label: "Result", field: "result" },
  { label: "Opponent", field: "opponent" },
  { label: "Score" },
  { label: "Event", field: "event" },
  { label: "Analysis" },
  { label: "Date", field: "date" },
  { label: "" },
];

function SortIcon({ field, sortField, sortDir }: { field?: SortField; sortField: SortField; sortDir: SortDir }) {
  if (!field || field !== sortField) return null;
  const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
  return <Icon className="w-2.5 h-2.5 ml-0.5" />;
}

export function MatchesGrid({
  matches,
  sortField,
  sortDir,
  onSort,
  newMatchId,
  unseenIds,
}: MatchesGridProps): React.JSX.Element {
  /* Which layout shows is a width question, so Tailwind answers it rather than
     React. Held in state it could only be read after mount, so the server — which
     has no viewport — always emitted the six-column table and a phone painted
     that squeezed table for a frame before an effect swapped in the cards.
     Deciding in CSS renders the right layout the first time, and pins the
     breakpoint to `lg` instead of a 1023px literal with nothing tying it there.

     Both layouts sit in the tree. `hidden` is display:none, so the inactive one
     costs no paint and stays out of both the accessibility tree and the tab
     order; pagination caps the duplication at 50 rows. */
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:hidden">
        {matches.map((match) => (
          <MatchCardGallery key={match.id} match={match} isNew={match.id === newMatchId} />
        ))}
      </div>

      <div className="hidden lg:block">
        {/* The whole table lives in one card (design 1e/1f/1g): surface-card,
            8px 24px 12px padding, a hairline under the header only, and rows
            that carry a rounded inset hover instead of dividers (SKILL 8a). */}
        <div className="surface-card" style={{ padding: "8px 24px 12px" }}>
          {/* Column headers — flush at the card inset, hairline underneath. */}
          <div
            className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2 pt-3`}
            style={LIST_GRID_COLS}
            role="row"
          >
            {COLUMNS.map((col, i) => (
              <div
                key={col.label || `col-${i}`}
                className={`min-w-0 ${col.label === "Date" ? "text-right" : ""}`}
                role="columnheader"
                aria-sort={col.field === sortField ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              >
                {col.field ? (
                  <button
                    onClick={() => onSort(col.field!)}
                    className="eyebrow-sm inline-flex items-center gap-0.5 hover:text-[var(--ink-700)] hover:underline underline-offset-2 cursor-pointer transition-[color] duration-200"
                  >
                    {col.label}
                    <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
                  </button>
                ) : (
                  <span className="eyebrow-sm">{col.label}</span>
                )}
              </div>
            ))}
          </div>
          {/* Rows — no per-item entrance tween. Content must never depend on an
              animation frame to become visible; PageTransition already carries
              the route-level entrance. */}
          <div className="pt-1">
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
