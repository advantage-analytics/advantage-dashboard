"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
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
    selectedIds.has(m.id),
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
    <div>
      {/* Collapsed pill */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] text-[#525252] ring-1 ring-[#D9D9D9] transition-colors duration-200 ring-inset hover:bg-[#EFF6FF] hover:text-[#3B82F6] hover:ring-[#BFDBFE] focus-visible:outline-none"
      >
        <span className="font-medium text-[#0D0D0D]">
          {isFiltered
            ? `${selectedIds.size} of ${matches.length} matches selected`
            : `All ${matches.length} matches`}
        </span>
        {isFiltered && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B82F6]" />
        )}
        {isOpen ? (
          <ChevronUp
            className="h-3.5 w-3.5 text-[#888888]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="h-3.5 w-3.5 text-[#888888]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={
              shouldReduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }
            }
            animate={{
              opacity: 1,
              height: "auto",
              transition: shouldReduceMotion
                ? { duration: 0.1 }
                : { duration: 0.2, ease: EASE_CURVE },
            }}
            exit={{
              opacity: 0,
              height: 0,
              transition: shouldReduceMotion
                ? { duration: 0.05 }
                : { duration: 0.14, ease: EASE_CURVE },
            }}
            className="overflow-hidden"
          >
            <div className="mt-2 overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
              {/* Date range row */}
              <div className="flex items-center gap-3 border-b border-[#F0F0F0] px-5 py-4">
                <span className="shrink-0 text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
                  Filter by date
                </span>
                <div className="flex items-center gap-2">
                  <DateField
                    label="From date"
                    variant="boxed"
                    value={fromDate}
                    onChange={setFromDate}
                    max={toDate || undefined}
                  />
                  <span className="text-[12px] text-[#AAAAAA]">&rarr;</span>
                  <DateField
                    label="To date"
                    variant="boxed"
                    value={toDate}
                    onChange={setToDate}
                    min={fromDate || undefined}
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
                  <p className="py-8 text-center text-[12px] text-[#888888]">
                    No matches in this date range.
                  </p>
                ) : (
                  dateFiltered.map((m) => {
                    const isSelected = selectedIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-[#F0F0F0] px-5 py-3 transition-colors duration-200 last:border-b-0 hover:bg-[#FAFAFA]"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMatch(m.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded accent-[#3B82F6]"
                          aria-label={`${m.tournamentName} vs ${m.player2Name}`}
                        />
                        <span
                          className={`flex size-[24px] shrink-0 items-center justify-center rounded-[4px] text-[11px] leading-none font-semibold ${
                            m.isWin
                              ? "bg-[rgba(93,185,85,0.1)] text-[#5DB955]"
                              : "bg-[rgba(229,24,55,0.1)] text-[#E51837]"
                          }`}
                        >
                          {m.isWin ? "W" : "L"}
                        </span>
                        <span className="flex-1 truncate text-[12px] font-normal text-[#0D0D0D]">
                          {m.tournamentName}
                        </span>
                        <span className="max-w-[120px] truncate text-[12px] font-normal text-[#71717A]">
                          vs {m.player2Name}
                        </span>
                        <span className="shrink-0 text-[10px] font-normal text-[#AAAAAA] tabular-nums">
                          {m.displayDate}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between border-t border-[#F0F0F0] px-5 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={allDateFilteredSelected}
                    className="text-[9px] font-medium tracking-[1.5px] text-[#3B82F6] uppercase transition-colors duration-200 hover:text-[#2563EB] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                  >
                    Select all
                  </button>
                  <span className="text-[#E0E0E0]">&middot;</span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[9px] font-medium tracking-[1.5px] text-[#AAAAAA] uppercase transition-colors duration-200 hover:text-[#525252] active:scale-[0.97]"
                  >
                    Reset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-[6px] bg-[#0D0D0D] px-3 py-1.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-[#2D2D2D] active:scale-[0.97]"
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
