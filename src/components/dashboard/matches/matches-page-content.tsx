"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Inbox, SlidersHorizontal, Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchesGrid } from "./matches-grid";
import { ViewToggle, type MatchView } from "./view-toggle";

interface MatchesPageContentProps {
  matches: DisplayMatch[];
}

type SortField = "date" | "opponent" | "event" | "result";
type SortDir = "asc" | "desc";
type FilterKey = "result" | "matchType" | "courtType" | "source";

interface ActiveFilter {
  key: FilterKey;
  value: string;
}

const FILTER_OPTIONS: { key: FilterKey; label: string; getValues: (matches: DisplayMatch[]) => string[] }[] = [
  {
    key: "result",
    label: "Result",
    getValues: () => ["Won", "Loss"],
  },
  {
    key: "matchType",
    label: "Match Type",
    getValues: (matches) => [...new Set(matches.map((m) => m.matchType))].sort(),
  },
  {
    key: "courtType",
    label: "Court Type",
    getValues: (matches) => [...new Set(matches.map((m) => m.courtType).filter(Boolean) as string[])].sort(),
  },
  {
    key: "source",
    label: "Source",
    getValues: (matches) => [...new Set(matches.map((m) => m.sourceProvider).filter(Boolean) as string[])].sort(),
  },
];

const PAGE_SIZES = [10, 25, 50] as const;

export function MatchesPageContent({ matches }: MatchesPageContentProps): React.JSX.Element {
  const [view, setView] = useState<MatchView>("list");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedFilter, setExpandedFilter] = useState<FilterKey | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filters dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
        setExpandedFilter(null);
      }
    }
    if (filtersOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filtersOpen]);

  // Filter matches
  const filtered = useMemo(() => {
    let result = matches;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.tournamentName.toLowerCase().includes(q) ||
          m.player1.name.toLowerCase().includes(q) ||
          m.player2.name.toLowerCase().includes(q) ||
          (m.round?.toLowerCase().includes(q) ?? false)
      );
    }

    // Filters
    for (const filter of filters) {
      result = result.filter((m) => {
        switch (filter.key) {
          case "result":
            return filter.value === "Won"
              ? m.score.winner === "player1"
              : m.score.winner === "player2";
          case "matchType":
            return m.matchType === filter.value;
          case "courtType":
            return m.courtType === filter.value;
          case "source":
            return m.sourceProvider === filter.value;
          default:
            return true;
        }
      });
    }

    return result;
  }, [matches, search, filters]);

  // Sort matches
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "opponent":
          cmp = a.player2.name.localeCompare(b.player2.name);
          break;
        case "event":
          cmp = a.tournamentName.localeCompare(b.tournamentName);
          break;
        case "result": {
          const aWin = a.score.winner === "player1" ? 1 : 0;
          const bWin = b.score.winner === "player1" ? 1 : 0;
          cmp = aWin - bWin;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedMatches = sorted.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, sorted.length);

  // Reset page when filters/search change
  useEffect(() => {
    setPage(1);
  }, [search, filters, pageSize]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  function addFilter(key: FilterKey, value: string) {
    setFilters((prev) => {
      const without = prev.filter((f) => !(f.key === key && f.value === value));
      if (without.length < prev.length) return without; // toggle off
      return [...prev, { key, value }];
    });
  }

  function removeFilter(key: FilterKey, value: string) {
    setFilters((prev) => prev.filter((f) => !(f.key === key && f.value === value)));
  }

  function clearFilters() {
    setFilters([]);
    setSearch("");
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
          <Inbox className="h-8 w-8 text-[#999999]" />
        </div>
        <p className="font-medium text-[#000000] mb-1">No matches yet</p>
        <p className="text-sm text-[#999999]">
          Upload your first match to see it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          {/* Filters button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => {
                setFiltersOpen(!filtersOpen);
                setExpandedFilter(null);
              }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
                filtersOpen || filters.length > 0
                  ? "border-[#3986F3] text-[#3986F3] bg-[#EBF0FE]"
                  : "border-[#E7E7E7] text-[#525252] hover:border-[#D0D0D0] bg-white"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {filters.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#3986F3] text-white text-[10px] font-semibold px-1">
                  {filters.length}
                </span>
              )}
            </button>

            {/* Filters dropdown */}
            {filtersOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-[#E7E7E7] rounded-xl shadow-[0px_4px_16px_rgba(0,0,0,0.08)] z-20 py-1">
                {FILTER_OPTIONS.map((opt) => {
                  const isExpanded = expandedFilter === opt.key;
                  const values = opt.getValues(matches);
                  if (values.length === 0) return null;

                  return (
                    <div key={opt.key}>
                      <button
                        onClick={() => setExpandedFilter(isExpanded ? null : opt.key)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#333333] hover:bg-[#F7F7F7] transition-colors"
                      >
                        <span>{opt.label}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#999999] transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-1">
                          {values.map((val) => {
                            const isActive = filters.some(
                              (f) => f.key === opt.key && f.value === val
                            );
                            return (
                              <button
                                key={val}
                                onClick={() => addFilter(opt.key, val)}
                                className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md transition-colors ${
                                  isActive
                                    ? "bg-[#EBF0FE] text-[#3986F3] font-medium"
                                    : "text-[#525252] hover:bg-[#F7F7F7]"
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                    isActive
                                      ? "border-[#3986F3] bg-[#3986F3]"
                                      : "border-[#D9D9D9]"
                                  }`}
                                >
                                  {isActive && (
                                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                      <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </span>
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active filter pills */}
          {filters.map((f) => (
            <span
              key={`${f.key}-${f.value}`}
              className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-[#F5F5F5] text-xs text-[#525252]"
            >
              {f.value}
              <button
                onClick={() => removeFilter(f.key, f.value)}
                className="p-0.5 rounded-full hover:bg-[#E5E5E5] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filters.length > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-[#999999] hover:text-[#525252] transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#CCCCCC]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 pr-3 rounded-lg border border-[#E7E7E7] text-xs text-[#0D0D0D] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#3986F3] transition-colors bg-white"
            />
          </div>

          {/* Sort */}
          <button
            onClick={() => toggleSort(sortField)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E7E7E7] text-xs font-medium text-[#525252] hover:border-[#D0D0D0] bg-white transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort order
          </button>

          {/* View toggle */}
          <ViewToggle view={view} onViewChange={setView} />
        </div>
      </div>

      {/* Results info */}
      {(search || filters.length > 0) && (
        <p className="text-xs text-[#999999] mb-3">
          {sorted.length} {sorted.length === 1 ? "match" : "matches"} found
        </p>
      )}

      {/* Table / Grid */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="h-8 w-8 text-[#D9D9D9] mb-3" />
          <p className="text-sm font-medium text-[#0D0D0D] mb-1">No matches found</p>
          <p className="text-xs text-[#999999]">
            Try adjusting your filters or search query.
          </p>
        </div>
      ) : (
        <MatchesGrid
          matches={paginatedMatches}
          view={view}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#F0F0F0]">
          <div className="flex items-center gap-2 text-xs text-[#888888]">
            <span>
              {rangeStart}-{rangeEnd} of {sorted.length}
            </span>
            <span className="text-[#D9D9D9]">·</span>
            <span>Results per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-6 px-1.5 rounded border border-[#E7E7E7] text-xs text-[#525252] bg-white focus:outline-none focus:border-[#3986F3]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-[#E7E7E7] text-[#525252] hover:bg-[#F7F7F7] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-[#525252] tabular-nums px-2">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-[#E7E7E7] text-[#525252] hover:bg-[#F7F7F7] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
