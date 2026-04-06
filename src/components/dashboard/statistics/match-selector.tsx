"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SelectableMatch } from "@/lib/data/statistics-server";

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
      if (next.size > 1) next.delete(id); // always keep at least 1
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
        className="flex items-center gap-2 px-4 py-2 bg-[#F7F7F7] border border-[rgba(0,0,0,0.06)] rounded-xl text-sm text-[#555555] hover:bg-[#F0F0F0] transition-colors"
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
          <ChevronUp className="w-3.5 h-3.5 text-[#888888]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#888888]" />
        )}
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="mt-2 bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Date range row */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F0F0F0]">
            <span className="text-xs font-medium text-[#888888] shrink-0">
              Filter by date
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs text-[#0D0D0D] bg-[#F7F7F7] border border-[rgba(0,0,0,0.06)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                aria-label="From date"
              />
              <span className="text-xs text-[#CCCCCC]">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs text-[#0D0D0D] bg-[#F7F7F7] border border-[rgba(0,0,0,0.06)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                aria-label="To date"
              />
            </div>
            {(fromDate || toDate) && (
              <span className="text-xs text-[#888888]">
                {dateFiltered.length} matches in range
              </span>
            )}
          </div>

          {/* Match list */}
          <div className="max-h-64 overflow-y-auto">
            {dateFiltered.length === 0 ? (
              <p className="text-xs text-[#888888] text-center py-8">
                No matches in this date range.
              </p>
            ) : (
              dateFiltered.map((m) => {
                const isSelected = selectedIds.has(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-5 py-3 border-b border-[#F7F7F7] last:border-b-0 hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMatch(m.id)}
                      className="w-3.5 h-3.5 rounded accent-[#3B82F6] shrink-0"
                      aria-label={`${m.tournamentName} vs ${m.player2Name}`}
                    />
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${
                        m.isWin
                          ? "bg-[#EBF0FE] text-[#4A8AF4]"
                          : "bg-[#F5F5F5] text-[#ABABAB]"
                      }`}
                    >
                      {m.isWin ? "W" : "L"}
                    </span>
                    <span className="text-xs text-[#0D0D0D] truncate flex-1">
                      {m.tournamentName}
                    </span>
                    <span className="text-xs text-[#ABABAB] truncate max-w-[120px]">
                      vs {m.player2Name}
                    </span>
                    <span className="text-[11px] text-[#CCCCCC] shrink-0 tabular-nums">
                      {m.displayDate}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#F0F0F0] bg-[#FAFAFA]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={allDateFilteredSelected}
                className="text-xs font-medium text-[#3B82F6] hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Select all
              </button>
              <span className="text-[#E0E0E0]">·</span>
              <button
                type="button"
                onClick={reset}
                className="text-xs font-medium text-[#888888] hover:text-[#0D0D0D] transition-colors"
              >
                Reset
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-white bg-[#0D0D0D] px-3 py-1.5 rounded-lg hover:bg-[#2D2D2D] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
