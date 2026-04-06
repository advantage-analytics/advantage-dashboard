"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Inbox, Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { providers } from "@/lib/providers";
import { MatchesGrid } from "./matches-grid";
import { ViewToggle, type MatchView } from "./view-toggle";

function providerName(id: string): string {
  return providers.find((p) => p.id === id)?.name ?? id;
}

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

const FILTER_CHIPS: { key: FilterKey; label: string; getValues: (matches: DisplayMatch[]) => string[]; displayValue?: (val: string) => string }[] = [
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
    displayValue: providerName,
  },
];

const PAGE_SIZES = [10, 25, 50] as const;

/* ─── Individual filter chip with its own dropdown ─── */
function FilterChip({
  filterKey,
  label,
  values,
  activeValues,
  onToggle,
  displayValue,
}: {
  filterKey: FilterKey;
  label: string;
  values: string[];
  activeValues: string[];
  onToggle: (key: FilterKey, value: string) => void;
  displayValue?: (val: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (values.length === 0) return null;

  const hasActive = activeValues.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-[color,background-color] duration-200 ${
          hasActive
            ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
            : "ring-1 ring-inset ring-[#D9D9D9] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6]"
        }`}
      >
        {label}
        {hasActive && (
          <span className="min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#3B82F6] text-white text-[10px] font-semibold px-1">
            {activeValues.length}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""} ${
            hasActive ? "text-[#3B82F6]" : "text-[#888888]"
          }`}
        />
      </button>

      {open && (
        <div role="listbox" aria-label={`${label} options`} className="absolute top-full left-0 mt-1.5 min-w-[160px] bg-white border border-[#E7E7E7] rounded-xl shadow-[0px_4px_16px_rgba(0,0,0,0.08)] z-20 py-1.5 px-1.5">
          {values.map((val) => {
            const isActive = activeValues.includes(val);
            return (
              <button
                key={val}
                role="option"
                aria-selected={isActive}
                onClick={() => onToggle(filterKey, val)}
                className={`flex items-center gap-2 w-full px-2.5 py-2 text-xs rounded-lg transition-[background-color,color] duration-200 ${
                  isActive
                    ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                    : "text-[#525252] hover:bg-[#F7F7F7]"
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                    isActive
                      ? "border-[#3B82F6] bg-[#3B82F6]"
                      : "border-[#D9D9D9]"
                  }`}
                >
                  {isActive && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {displayValue ? displayValue(val) : val}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main content ─── */
export function MatchesPageContent({ matches }: MatchesPageContentProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<MatchView>(() => (searchParams.get("view") as MatchView) || "list");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [sortField, setSortField] = useState<SortField>(() => (searchParams.get("sort") as SortField) || "date");
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get("dir") as SortDir) || "desc");
  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    const result: ActiveFilter[] = [];
    for (const key of ["result", "matchType", "courtType", "source"] as FilterKey[]) {
      for (const value of searchParams.getAll(key)) {
        result.push({ key, value });
      }
    }
    return result;
  });
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const ps = Number(searchParams.get("pageSize"));
    return (PAGE_SIZES as readonly number[]).includes(ps) ? ps : 10;
  });
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  // Close page-size dropdown on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
        setPageSizeOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPageSizeOpen(false);
    }
    if (pageSizeOpen) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pageSizeOpen]);

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

  // Sync state to URL
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (view !== "list") params.set("view", view);
    if (sortField !== "date") params.set("sort", sortField);
    if (sortDir !== "desc") params.set("dir", sortDir);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    for (const f of filters) params.append(f.key, f.value);
    const query = params.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  }, [search, view, sortField, sortDir, page, pageSize, filters, pathname]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  const toggleFilter = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => {
      const exists = prev.some((f) => f.key === key && f.value === value);
      if (exists) return prev.filter((f) => !(f.key === key && f.value === value));
      return [...prev, { key, value }];
    });
  }, []);

  // Get active values per filter key
  function activeValuesFor(key: FilterKey): string[] {
    return filters.filter((f) => f.key === key).map((f) => f.value);
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
          <Inbox className="h-8 w-8 text-[#888888]" />
        </div>
        <p className="font-medium text-[#0D0D0D] mb-1">No matches yet</p>
        <p className="text-[14px] text-[#888888]">
          Upload your first match to see it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar: filters, search, sort, view toggle — single row */}
      <div className="flex items-center justify-between gap-3 mb-5">
        {/* Left: filter chips */}
        <div className="flex items-center gap-2">
          {FILTER_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              filterKey={chip.key}
              label={chip.label}
              values={chip.getValues(matches)}
              activeValues={activeValuesFor(chip.key)}
              onToggle={toggleFilter}
              displayValue={chip.displayValue}
            />
          ))}

          {/* Clear all + results count */}
          {filters.length > 0 && (
            <button
              onClick={() => { setFilters([]); setSearch(""); }}
              className="text-xs text-[#888888] hover:text-[#525252] transition-[color] duration-200 ml-1"
            >
              Clear all
            </button>
          )}
          {(search || filters.length > 0) && (
            <p className="text-xs text-[#BBBBBB] ml-1">
              {sorted.length} {sorted.length === 1 ? "match" : "matches"}
            </p>
          )}
        </div>

        {/* Right: search, sort, view toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#CCCCCC]" />
            <input
              type="text"
              placeholder="Search"
              aria-label="Search matches"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 pr-3 rounded-full ring-1 ring-inset ring-[#D9D9D9] text-xs text-[#0D0D0D] placeholder:text-[#CCCCCC] focus:outline-none focus:ring-[#3B82F6] focus:ring-2 transition-[color,background-color] duration-200 bg-white"
            />
          </div>

          <button
            onClick={() => toggleSort(sortField)}
            aria-label={`Sort by ${sortField}, ${sortDir === "asc" ? "ascending" : "descending"}`}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-full ring-1 ring-inset ring-[#D9D9D9] text-xs font-medium text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6] transition-[color,background-color] duration-200"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort order
          </button>

          <ViewToggle view={view} onViewChange={setView} />
        </div>
      </div>

      {/* Table / Grid */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="h-8 w-8 text-[#D9D9D9] mb-3" />
          <p className="text-[14px] font-medium text-[#0D0D0D] mb-1">No matches found</p>
          <p className="text-[12px] text-[#888888]">
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
          <div className="flex items-center gap-3 text-xs text-[#888888]">
            <span className="tabular-nums">
              {rangeStart}–{rangeEnd} of {sorted.length}
            </span>
            <span className="text-[#D9D9D9]">&middot;</span>
            <div className="flex items-center gap-2">
              <span>Results per page</span>
              <div className="relative" ref={pageSizeRef}>
                <button
                  onClick={() => setPageSizeOpen(!pageSizeOpen)}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-full ring-1 ring-inset ring-[#D9D9D9] bg-white text-xs font-medium text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6] transition-[color,background-color] duration-200 tabular-nums"
                >
                  {pageSize}
                  <ChevronDown
                    className={`w-3 h-3 text-[#888888] transition-transform ${
                      pageSizeOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {pageSizeOpen && (
                  <div className="absolute bottom-full left-0 mb-1.5 min-w-[56px] bg-white border border-[#E7E7E7] rounded-xl shadow-[0px_4px_16px_rgba(0,0,0,0.08)] z-20 py-1 px-1">
                    {PAGE_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          setPageSize(size);
                          setPageSizeOpen(false);
                        }}
                        className={`flex items-center justify-center w-full px-2 py-1.5 text-xs tabular-nums rounded-lg transition-[background-color,color] duration-200 ${
                          pageSize === size
                            ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                            : "text-[#525252] hover:bg-[#F7F7F7]"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className="flex items-center justify-center w-7 h-7 rounded-full ring-1 ring-inset ring-[#D9D9D9] text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6] disabled:opacity-30 disabled:pointer-events-none transition-[color,background-color] duration-200"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-[#525252] tabular-nums px-2">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className="flex items-center justify-center w-7 h-7 rounded-full ring-1 ring-inset ring-[#D9D9D9] text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#BFDBFE] hover:text-[#3B82F6] disabled:opacity-30 disabled:pointer-events-none transition-[color,background-color] duration-200"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
