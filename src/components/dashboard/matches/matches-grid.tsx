"use client";

import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList, LIST_GRID_COLS } from "./match-card-list";
import { ArrowUp, ArrowDown } from "lucide-react";

/**
 * Not a user preference — the matches page picks this off the viewport width.
 * The six-column table needs room, so narrow screens get cards instead.
 */
export type MatchView = "gallery" | "list";

type SortField = "date" | "opponent" | "event" | "result";
type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  view: MatchView;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  newMatchId?: string | null;
}

/**
 * One header per row column. Score and Analysis carry no sort: there is no
 * ordering of a set score that a player would ask for, and analysis state is a
 * filter concern, not a sort. Date has no column but is still sortable from the
 * toolbar's sort control, which is where the remaining fields live too.
 */
const COLUMNS: { label: string; field?: SortField }[] = [
  { label: "Event", field: "event" },
  { label: "Result", field: "result" },
  { label: "Score" },
  { label: "Opponent", field: "opponent" },
  { label: "Analysis" },
  { label: "" },
];

function SortIcon({ field, sortField, sortDir }: { field?: SortField; sortField: SortField; sortDir: SortDir }) {
  if (!field || field !== sortField) return null;
  const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
  return <Icon className="w-2.5 h-2.5 ml-0.5" />;
}

export function MatchesGrid({
  matches,
  view,
  sortField,
  sortDir,
  onSort,
  newMatchId,
}: MatchesGridProps): React.JSX.Element {
  /* No crossfade between the two layouts. It existed to soften a deliberate
     view switch, and that control is gone — `view` now only changes when the
     window crosses 1024px, where a fade adds nothing. It also actively hurt:
     `AnimatePresence mode="wait"` holds the outgoing subtree until its exit
     tween finishes, and that tween is rAF-driven. In a background tab rAF is
     paused, so a resize left the old layout mounted and frozen — no longer
     receiving props — while state had already moved on. */
  return view === "gallery" ? (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {matches.map((match) => (
        <MatchCardGallery key={match.id} match={match} isNew={match.id === newMatchId} />
      ))}
    </div>
  ) : (
    <div>
      {/* Column headers — 28px tall, no underline of their own; the rows
          below open with a single top hairline and carry the rest. */}
      <div className="grid h-7 gap-x-5 items-center pl-3.5 pr-9" style={LIST_GRID_COLS} role="row">
        {COLUMNS.map((col, i) => (
          <div
            key={col.label || `col-${i}`}
            className="min-w-0"
            role="columnheader"
            aria-sort={col.field === sortField ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
          >
            {col.field ? (
              <button
                onClick={() => onSort(col.field!)}
                className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] hover:text-[#525252] hover:underline underline-offset-2 cursor-pointer transition-[color] duration-200"
              >
                {col.label}
                <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
              </button>
            ) : (
              <span className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
                {col.label}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Rows — no per-item entrance tween. Content must never depend on an
          animation frame to become visible; PageTransition already carries
          the route-level entrance. */}
      <div className="border-t border-[#F3F3F3]">
        {matches.map((match) => (
          <MatchCardList key={match.id} match={match} isNew={match.id === newMatchId} />
        ))}
      </div>
    </div>
  );
}
