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

const STAGGER_CAP = 5;
const STAGGER_DELAY = 0.03;

const COLUMNS: { label: string; field?: SortField }[] = [
  { label: "Event", field: "event" },
  { label: "Result", field: "result" },
  { label: "Score" },
  { label: "Opponent", field: "opponent" },
  { label: "Type" },
  { label: "Date", field: "date" },
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
    <AnimatePresence mode="wait">
      {view === "gallery" ? (
        <motion.div
          key="gallery"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {matches.map((match, i) => (
              <motion.div
                key={match.id}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(i, STAGGER_CAP) * STAGGER_DELAY, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <MatchCardGallery match={match} isNew={match.id === newMatchId} />
              </motion.div>
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
          {/* Column headers */}
          <div className="grid gap-x-4 items-center px-4 py-2.5 border-b border-[#F0F0F0] mb-4" style={LIST_GRID_COLS} role="row">
            {COLUMNS.map((col) => (
              <div key={col.label} className="min-w-0" role="columnheader" aria-sort={col.field === sortField ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                {col.field ? (
                  <button
                    onClick={() => onSort(col.field!)}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] hover:text-[#525252] hover:underline underline-offset-2 cursor-pointer transition-[color] duration-200"
                  >
                    {col.label}
                    <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
                  </button>
                ) : (
                  <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                    {col.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Rows */}
          {matches.map((match, i) => (
            <motion.div
              key={match.id}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(i, STAGGER_CAP) * STAGGER_DELAY, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <MatchCardList match={match} isNew={match.id === newMatchId} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
