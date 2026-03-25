"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import type { MatchView } from "./view-toggle";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList } from "./match-card-list";
import { ArrowUp, ArrowDown } from "lucide-react";

type SortField = "date" | "opponent" | "event" | "result";
type SortDir = "asc" | "desc";

interface MatchesGridProps {
  matches: DisplayMatch[];
  view: MatchView;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

const COLUMNS: { label: string; field?: SortField; className: string }[] = [
  { label: "Event", field: "event", className: "flex-1 min-w-0 pr-4" },
  { label: "Result", field: "result", className: "w-16 shrink-0 pr-4" },
  { label: "Opponent", field: "opponent", className: "w-44 shrink-0 pr-4" },
  { label: "Date", field: "date", className: "w-32 shrink-0 pr-4" },
  { label: "Duration", className: "w-20 shrink-0 pr-4" },
  { label: "Source", className: "w-32 shrink-0" },
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
}: MatchesGridProps): React.JSX.Element {
  return (
    <AnimatePresence mode="wait">
      {view === "gallery" ? (
        <motion.div
          key="gallery"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((match, i) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
              >
                <MatchCardGallery match={match} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Column headers */}
          <div className="flex items-center px-4 py-2.5 border-b border-[#F0F0F0]">
            {COLUMNS.map((col) => (
              <div key={col.label} className={col.className}>
                {col.field ? (
                  <button
                    onClick={() => onSort(col.field!)}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px] hover:text-[#999999] transition-colors"
                  >
                    {col.label}
                    <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
                  </button>
                ) : (
                  <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.02 }}
            >
              <MatchCardList match={match} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
