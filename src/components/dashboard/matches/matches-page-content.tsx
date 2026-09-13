"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";
import { EmptyMatches } from "./empty-matches";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { providers } from "@/lib/providers";
import { MatchesGrid } from "./matches-grid";
import { ViewToggle, type MatchView } from "./view-toggle";
import { CreateMatchButton } from "./create-match-button";

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

const FILTER_CHIPS: { key: FilterKey; label: string; title?: string; getValues: (matches: DisplayMatch[]) => string[]; displayValue?: (val: string) => string }[] = [
  {
    key: "result",
    label: "Result",
    title: "Filter by match result",
    getValues: () => ["Won", "Loss"],
  },
  {
    key: "matchType",
    label: "Match Type",
    title: "Filter by match type",
    getValues: (matches) => [...new Set(matches.map((m) => m.matchType))].sort(),
  },
  {
    key: "courtType",
    label: "Court Type",
    title: "Filter by court surface",
    getValues: (matches) => [...new Set(matches.map((m) => m.courtType).filter(Boolean) as string[])].sort(),
  },
  {
    key: "source",
    label: "Source",
    title: "Data source provider",
    getValues: (matches) => [...new Set(matches.map((m) => m.sourceProvider).filter(Boolean) as string[])].sort(),
    displayValue: providerName,
  },
];

const PAGE_SIZES = [10, 25, 50] as const;

/* ─── Individual filter chip with its own dropdown ─── */
function FilterChip({
  filterKey,
  label,
  title,
  values,
  activeValues,
  onToggle,
  displayValue,
}: {
  filterKey: FilterKey;
  label: string;
  title?: string;
  values: string[];
  activeValues: string[];
  onToggle: (key: FilterKey, value: string) => void;
  displayValue?: (val: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = `filter-${filterKey}-listbox`;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Return focus to trigger when closing
  const closeAndReturn = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Scoped keyboard handler on the container
  function handleContainerKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); closeAndReturn(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((prev) => {
        const next = prev < values.length - 1 ? prev + 1 : 0;
        optionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((prev) => {
        const next = prev > 0 ? prev - 1 : values.length - 1;
        optionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      optionRefs.current[0]?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const last = values.length - 1;
      setFocusIdx(last);
      optionRefs.current[last]?.focus();
    }
  }

  // Reset focus index when closing
  useEffect(() => {
    if (!open) setFocusIdx(-1);
  }, [open]);

  if (values.length === 0) return null;

  const hasActive = activeValues.length > 0;

  return (
    <div className="relative" ref={ref} onKeyDown={handleContainerKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        title={title}
        className={`flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-[color,background-color] duration-200 ${
          hasActive
            ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
            : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
        }`}
      >
        {label}
        {hasActive && (
          <span className="min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#3B82F6] text-white text-[10px] font-semibold px-1">
            {activeValues.length}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""} ${
            hasActive ? "text-[#3B82F6]" : "text-[#888888]"
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            id={listboxId}
            role="listbox"
            aria-label={`${label} options`}
            aria-multiselectable="true"
            className="absolute top-full left-0 mt-1.5 min-w-[160px] bg-white border border-[#E5E5EA] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] z-20 py-1.5 px-1.5"
          >
            {values.map((val, idx) => {
              const isActive = activeValues.includes(val);
              return (
                <button
                  key={val}
                  ref={(el) => { optionRefs.current[idx] = el; }}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={idx === focusIdx ? 0 : -1}
                  onClick={() => onToggle(filterKey, val)}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 text-xs rounded-lg transition-[background-color,color] duration-200 ${
                    isActive
                      ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                      : "text-[#525252] hover:bg-[#F5F5F5]"
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${
                      isActive
                        ? "border-[#3B82F6] bg-[#3B82F6]"
                        : "border-[#EAECF0]"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sort dropdown ─── */
const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "date", label: "Date" },
  { field: "event", label: "Event" },
  { field: "opponent", label: "Opponent" },
  { field: "result", label: "Result" },
];

function SortDropdown({
  sortField,
  sortDir,
  onSort,
}: {
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = "sort-listbox";

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const closeAndReturn = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Scoped keyboard handler
  function handleContainerKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); closeAndReturn(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((prev) => {
        const next = prev < SORT_OPTIONS.length - 1 ? prev + 1 : 0;
        optionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((prev) => {
        const next = prev > 0 ? prev - 1 : SORT_OPTIONS.length - 1;
        optionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      optionRefs.current[0]?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const last = SORT_OPTIONS.length - 1;
      setFocusIdx(last);
      optionRefs.current[last]?.focus();
    }
  }

  useEffect(() => {
    if (!open) setFocusIdx(-1);
  }, [open]);

  const activeLabel = SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? "Date";
  const dirLabel = sortField === "date"
    ? (sortDir === "asc" ? "Oldest" : "Newest")
    : (sortDir === "asc" ? "A–Z" : "Z–A");

  return (
    <div className="relative" ref={ref} onKeyDown={handleContainerKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        title={`Sorted by ${activeLabel}, ${dirLabel}`}
        className="flex items-center gap-1.5 h-8 px-3.5 rounded-full ring-1 ring-inset ring-[#EAECF0] text-xs font-medium text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6] transition-[color,background-color] duration-200"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        {activeLabel}
        <span className="text-[10px] text-[#888888]">{dirLabel}</span>
        <ChevronDown className={`w-3 h-3 text-[#888888] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            id={listboxId}
            role="listbox"
            aria-label="Sort options"
            className="absolute top-full right-0 mt-1.5 min-w-[160px] bg-white border border-[#E5E5EA] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] z-20 py-1.5 px-1.5"
          >
            {SORT_OPTIONS.map((opt, idx) => {
              const isActive = sortField === opt.field;
              return (
                <button
                  key={opt.field}
                  ref={(el) => { optionRefs.current[idx] = el; }}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={idx === focusIdx ? 0 : -1}
                  onClick={() => { onSort(opt.field); setOpen(false); }}
                  className={`flex items-center justify-between w-full px-2.5 py-2 text-xs rounded-lg transition-[background-color,color] duration-200 ${
                    isActive
                      ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                      : "text-[#525252] hover:bg-[#F5F5F5]"
                  }`}
                >
                  {opt.label}
                  {isActive && (
                    <span className="text-[10px] text-[#3B82F6]">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main content ─── */
export function MatchesPageContent({ matches }: MatchesPageContentProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [view, setView] = useState<MatchView>(() => (searchParams.get("view") as MatchView) || "list");
  const [userSetView, setUserSetView] = useState(false);

  // Auto-switch to gallery on narrow screens (< 1024px) unless user explicitly chose a view
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    function handleChange(e: MediaQueryListEvent | MediaQueryList) {
      if (!userSetView) {
        setView(e.matches ? "gallery" : "list");
      }
    }
    handleChange(mql);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [userSetView]);

  const handleViewChange = useCallback((v: MatchView) => {
    setView(v);
    setUserSetView(true);
  }, []);
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Close page-size dropdown on outside click; scoped keyboard nav
  const [pageSizeFocusIdx, setPageSizeFocusIdx] = useState(-1);
  const pageSizeOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pageSizeTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pageSizeOpen) { setPageSizeFocusIdx(-1); return; }
    function handleClick(e: MouseEvent) {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
        setPageSizeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pageSizeOpen]);

  function handlePageSizeKeyDown(e: React.KeyboardEvent) {
    if (!pageSizeOpen) return;
    if (e.key === "Escape") { e.preventDefault(); setPageSizeOpen(false); pageSizeTriggerRef.current?.focus(); return; }
    if (e.key === "Tab") { setPageSizeOpen(false); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setPageSizeFocusIdx((prev) => {
        const next = prev > 0 ? prev - 1 : PAGE_SIZES.length - 1;
        pageSizeOptionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPageSizeFocusIdx((prev) => {
        const next = prev < PAGE_SIZES.length - 1 ? prev + 1 : 0;
        pageSizeOptionRefs.current[next]?.focus();
        return next;
      });
    }
    if (e.key === "Home") {
      e.preventDefault();
      setPageSizeFocusIdx(0);
      pageSizeOptionRefs.current[0]?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const last = PAGE_SIZES.length - 1;
      setPageSizeFocusIdx(last);
      pageSizeOptionRefs.current[last]?.focus();
    }
  }

  // "/" shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Track newly created match for highlight animation
  const [newMatchId, setNewMatchId] = useState<string | null>(null);

  useEffect(() => {
    function handleMatchCreated(e: Event) {
      const matchId = (e as CustomEvent<{ matchId: string }>).detail?.matchId;
      if (matchId) {
        setNewMatchId(matchId);
        // Clear highlight after animation completes
        const timer = setTimeout(() => setNewMatchId(null), 2000);
        return () => clearTimeout(timer);
      }
    }
    window.addEventListener("match-created", handleMatchCreated);
    return () => window.removeEventListener("match-created", handleMatchCreated);
  }, []);

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
    return <EmptyMatches />;
  }

  return (
    <div>
      {/* Toolbar: filters, search, sort, view toggle — wraps on medium screens */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-5">
        {/* Left: filter chips */}
        <div className="flex items-center gap-2">
          {FILTER_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              filterKey={chip.key}
              label={chip.label}
              title={chip.title}
              values={chip.getValues(matches)}
              activeValues={activeValuesFor(chip.key)}
              onToggle={toggleFilter}
              displayValue={chip.displayValue}
            />
          ))}

          {/* Clear all filters + results count */}
          {filters.length > 0 && (
            <button
              onClick={() => setFilters([])}
              className="text-xs text-[#888888] hover:text-[#525252] transition-[color] duration-200 ml-1"
            >
              Clear filters
            </button>
          )}
          {(search || filters.length > 0) && (
            <p className="text-xs text-[#AAAAAA] ml-1" aria-live="polite">
              {sorted.length} {sorted.length === 1 ? "match" : "matches"}
            </p>
          )}
        </div>

        {/* Right: search, sort, view toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#CCCCCC]" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search"
              aria-label="Search matches"
              aria-keyshortcuts="/"
              title="Search by event, opponent, or round"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 pr-8 rounded-full ring-1 ring-inset ring-[#EAECF0] text-xs text-[#0D0D0D] placeholder:text-[#CCCCCC] focus:outline-none focus:ring-[#3B82F6] focus:ring-2 transition-[color,background-color] duration-200 bg-white"
            />
            {!search && (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#CCCCCC] pointer-events-none">/</kbd>
            )}
          </div>

          <SortDropdown sortField={sortField} sortDir={sortDir} onSort={toggleSort} />

          <ViewToggle view={view} onViewChange={handleViewChange} />
        </div>
      </div>

      {/* Table / Grid */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="h-8 w-8 text-[#D9D9D9] mb-3" />
          <p className="text-[14px] font-medium text-[#0D0D0D] mb-1">No matches found</p>
          {(filters.length > 0 || search) && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {search && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[11px] text-[#525252]">
                    &ldquo;{search}&rdquo;
                  </span>
                )}
                {filters.map((f) => (
                  <span key={`${f.key}-${f.value}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF2FD] text-[11px] text-[#3B82F6]">
                    {f.value}
                    <button
                      onClick={() => toggleFilter(f.key, f.value)}
                      className="hover:text-[#1D4ED8] transition-[color] duration-200"
                      aria-label={`Remove ${f.value} filter`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={() => setFilters([])}
                className="text-xs text-[#888888] hover:text-[#3B82F6] underline underline-offset-2 transition-[color] duration-200"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <MatchesGrid
          matches={paginatedMatches}
          view={view}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          newMatchId={newMatchId}
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
              <div className="relative" ref={pageSizeRef} onKeyDown={handlePageSizeKeyDown}>
                <button
                  ref={pageSizeTriggerRef}
                  onClick={() => setPageSizeOpen(!pageSizeOpen)}
                  aria-expanded={pageSizeOpen}
                  aria-haspopup="listbox"
                  aria-controls={pageSizeOpen ? "pagesize-listbox" : undefined}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-full ring-1 ring-inset ring-[#EAECF0] bg-white text-xs font-medium text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6] transition-[color,background-color] duration-200 tabular-nums"
                >
                  {pageSize}
                  <ChevronDown
                    className={`w-3 h-3 text-[#888888] transition-transform duration-200 ${
                      pageSizeOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {pageSizeOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                      id="pagesize-listbox"
                      role="listbox"
                      aria-label="Results per page"
                      className="absolute bottom-full left-0 mb-1.5 min-w-[56px] bg-white border border-[#E5E5EA] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] z-20 py-1 px-1"
                    >
                      {PAGE_SIZES.map((size, idx) => (
                        <button
                          key={size}
                          ref={(el) => { pageSizeOptionRefs.current[idx] = el; }}
                          role="option"
                          aria-selected={pageSize === size}
                          tabIndex={idx === pageSizeFocusIdx ? 0 : -1}
                          onClick={() => {
                            setPageSize(size);
                            setPageSizeOpen(false);
                          }}
                          className={`flex items-center justify-center w-full px-2 py-1.5 text-xs tabular-nums rounded-lg transition-[background-color,color] duration-200 ${
                            pageSize === size
                              ? "bg-[#EBF2FD] text-[#3B82F6] font-medium"
                              : "text-[#525252] hover:bg-[#F5F5F5]"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              title="Previous page"
              className="flex items-center justify-center w-8 h-8 rounded-full ring-1 ring-inset ring-[#EAECF0] text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6] disabled:opacity-30 disabled:pointer-events-none transition-[color,background-color] duration-200"
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
              title="Next page"
              className="flex items-center justify-center w-8 h-8 rounded-full ring-1 ring-inset ring-[#EAECF0] text-[#525252] hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6] disabled:opacity-30 disabled:pointer-events-none transition-[color,background-color] duration-200"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
