"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SelectableMatch } from "@/lib/data/statistics-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface MatchSelectorProps {
  matches: SelectableMatch[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function MatchSelector({
  matches,
  selectedIds,
  onSelectionChange,
}: MatchSelectorProps): React.JSX.Element {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const dateFiltered = useMemo(() => {
    return matches.filter((m) => {
      if (fromDate && m.isoDate < fromDate) return false;
      if (toDate && m.isoDate > toDate + "T23:59:59") return false;
      return true;
    });
  }, [matches, fromDate, toDate]);

  const isFiltered = selectedIds.size < matches.length;
  const allDateFilteredSelected = dateFiltered.every((m) =>
    selectedIds.has(m.id)
  );

  function toggleMatch(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  function selectAllFiltered() {
    const next = new Set(selectedIds);
    for (const m of dateFiltered) next.add(m.id);
    onSelectionChange(next);
  }

  function reset() {
    setFromDate("");
    setToDate("");
    onSelectionChange(new Set(matches.map((m) => m.id)));
  }

  return (
    <div className="mb-6">
      {/* Collapsed pill */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-white ring-1 ring-inset ring-[#D9D9D9] rounded-full text-[12px] text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1"
      >
        <span className="text-[#0D0D0D] font-medium">
          {isFiltered
            ? `${selectedIds.size} of ${matches.length} matches selected`
            : `All ${matches.length} matches`}
        </span>
        {isFiltered && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shrink-0" />
        )}
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: shouldReduceMotion ? { duration: 0.1 } : { duration: 0.2, ease: EASE_CURVE } }}
            exit={{ opacity: 0, height: 0, transition: shouldReduceMotion ? { duration: 0.05 } : { duration: 0.14, ease: EASE_CURVE } }}
            className="overflow-hidden"
          >
            <div className="mt-2 bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden">
              {/* Date range row */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F0F0F0]">
                <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] shrink-0">
                  Filter by date
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="text-[12px] text-[#0D0D0D] bg-[#F7F7F7] border border-[#F3F3F3] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1"
                    aria-label="From date"
                  />
                  <span className="text-[12px] text-[#AAAAAA]">&rarr;</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="text-[12px] text-[#0D0D0D] bg-[#F7F7F7] border border-[#F3F3F3] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1"
                    aria-label="To date"
                  />
                </div>
                {(fromDate || toDate) && (
                  <span className="text-[11px] text-[#888888]">
                    {dateFiltered.length} matches in range
                  </span>
                )}
              </div>

              {/* Match list */}
              <div className="max-h-64 overflow-y-auto">
                {dateFiltered.length === 0 ? (
                  <p className="text-[12px] text-[#888888] text-center py-8">
                    No matches in this date range.
                  </p>
                ) : (
                  dateFiltered.map((m) => {
                    const isSelected = selectedIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 px-5 py-3 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#FAFAFA] cursor-pointer transition-colors duration-200"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMatch(m.id)}
                          className="w-3.5 h-3.5 rounded accent-[#3B82F6] shrink-0"
                          aria-label={`${m.tournamentName} vs ${m.player2Name}`}
                        />
                        <span
                          className={`size-[24px] rounded-[4px] flex items-center justify-center text-[11px] font-semibold leading-none shrink-0 ${
                            m.isWin
                              ? "bg-[rgba(93,185,85,0.1)] text-[#5DB955]"
                              : "bg-[rgba(229,24,55,0.1)] text-[#E51837]"
                          }`}
                        >
                          {m.isWin ? "W" : "L"}
                        </span>
                        <span className="text-[12px] font-normal text-[#0D0D0D] truncate flex-1">
                          {m.tournamentName}
                        </span>
                        <span className="text-[12px] font-normal text-[#71717A] truncate max-w-[120px]">
                          vs {m.player2Name}
                        </span>
                        <span className="text-[10px] font-normal text-[#AAAAAA] shrink-0 tabular-nums">
                          {m.displayDate}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-[#F0F0F0]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={allDateFilteredSelected}
                    className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Select all
                  </button>
                  <span className="text-[#E0E0E0]">&middot;</span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] hover:text-[#525252] transition-colors duration-200 active:scale-[0.97]"
                  >
                    Reset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] font-medium text-white bg-[#0D0D0D] px-3 py-1.5 rounded-[6px] hover:bg-[#2D2D2D] transition-colors duration-200 active:scale-[0.97]"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
