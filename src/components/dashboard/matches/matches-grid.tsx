"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import type { MatchView } from "./view-toggle";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList, LIST_GRID_COLS } from "./match-card-list";
import { ArrowUp, ArrowDown } from "lucide-react";

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
 * Four headers to match the condensed row. Opponent and Date moved into the
 * Match cell and Type dropped to the filter chips, so both stay sortable from
 * the toolbar's sort control rather than from a column header.
 */
const COLUMNS: { label: string; field?: SortField }[] = [
  { label: "Match", field: "event" },
  { label: "Score", field: "result" },
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
  const shouldReduceMotion = useReducedMotion();

  return (
    /* `initial={false}` matters: without it the mounted branch starts at
       opacity 0 and only reaches 1 via a rAF-driven tween. rAF is paused in a
       background tab and absent in headless/print renders, so the entire list
       would render blank. The crossfade still plays on view switches. */
    <AnimatePresence mode="wait" initial={false}>
      {view === "gallery" ? (
        <motion.div
          key="gallery"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {matches.map((match) => (
              <MatchCardGallery
                key={match.id}
                match={match}
                isNew={match.id === newMatchId}
              />
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Column headers — 28px tall, no underline of their own; the rows
              below open with a single top hairline and carry the rest. */}
          <div className="grid h-7 gap-x-6 items-center pl-3.5 pr-9" style={LIST_GRID_COLS} role="row">
            {COLUMNS.map((col, i) => (
              <div key={col.label || `col-${i}`} className="min-w-0" role="columnheader" aria-sort={col.field === sortField ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
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
          <div className="border-t border-[#F3F3F3]">

          {/* Rows — no per-item entrance tween. Content must never depend on an
              animation frame to become visible; PageTransition already carries
              the route-level entrance. */}
            {matches.map((match) => (
              <MatchCardList key={match.id} match={match} isNew={match.id === newMatchId} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
