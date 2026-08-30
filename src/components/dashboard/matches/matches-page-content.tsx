"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft, ChevronRight, ChevronDown, Filter as FilterIcon } from "lucide-react";
import { EmptyMatches } from "./empty-matches";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isLiveUpdating,
} from "@/lib/data/match-analysis";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";
import { normalizedPersonName } from "@/lib/data/person-name";
import { providers } from "@/lib/providers";
import { useUnseenReportIds } from "@/lib/ui/seen-reports";
import { MatchesGrid, type SortField, type SortDir } from "./matches-grid";
import {
  MatchesFilterPanel,
  type FilterOption,
  type FilterPanelSection,
} from "./matches-filter-panel";
import { LifecycleChips, type LifecycleValue } from "./lifecycle-chips";

function providerName(id: string): string {
  return providers.find((p) => p.id === id)?.name ?? id;
}

interface MatchesPageContentProps {
  matches: DisplayMatch[];
  /** Signed-in user, for the live job subscription. Absent = no subscription. */
  userId?: string;
  /** Which workspace this list belongs to. Only the empty state reads it. */
  scope?: "personal" | "team";
}

type FilterKey =
  | "result"
  | "matchType"
  | "courtType"
  | "source"
  | "analysis"
  /** Team scope only — see `FILTER_GROUPS`. */
  | "player"
  /** A scouting axis (who you played), not a lifecycle one — grouped apart in the panel. */
  | "hand"
  | "backhand";

/**
 * Whether a stored filter value and a chip mean the same thing.
 *
 * Exact for every group but `player`, whose values are people's names and so
 * answer to the same rule the list itself filters by. The chip list keeps ONE
 * raw spelling per person, so a value stored from a different spelling — an
 * older bookmark, or a newer upload that changed which spelling wins the label
 * — would otherwise render its chip unchecked while the list stayed filtered,
 * and clicking it would append a second filter rather than clearing the first.
 *
 * Values stay raw rather than normalized so URLs written before this still
 * resolve; the normalization happens on comparison instead.
 */
function sameValue(key: FilterKey, a: string, b: string): boolean {
  return key === "player"
    ? normalizedPersonName(a) === normalizedPersonName(b)
    : a === b;
}

const FILTER_KEYS: FilterKey[] = [
  "result",
  "matchType",
  "courtType",
  "source",
  "analysis",
  "player",
  "hand",
  "backhand",
];

/**
 * Collapses the nine job statuses into the four buckets a player actually
 * filters by. This is the analysis queue's filter, folded into the chip row
 * that was already here.
 */
function analysisGroup(match: DisplayMatch): string | null {
  const status = match.analysis?.status;
  if (!status) return null;
  if (isInFlight(status)) return "In progress";
  if (isAnalysisFailed(status)) return "Failed";
  if (status === "manual") return "No video";
  return "Ready";
}

const ANALYSIS_GROUP_ORDER = ["In progress", "Ready", "Failed", "No video"];

interface ActiveFilter {
  key: FilterKey;
  value: string;
}

/**
 * Design 18a's three fixed 2-option facets — segmented, not checklists, so
 * they're single-select by construction (see `matches-filter-panel.tsx`).
 * `HAND_OPTIONS`/`BACKHAND_OPTIONS` also back `describeFilters`'s scouting
 * sentence below, which needs the same value → phrase mapping.
 */
const RESULT_OPTIONS: FilterOption[] = [
  { value: null, label: "All" },
  { value: "Won", label: "Won" },
  { value: "Loss", label: "Lost" },
];
const HAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
];
const BACKHAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "one-handed", label: "One-hand" },
  { value: "two-handed", label: "Two-hand" },
];

/** For every facet's stored value → its human label, used uniformly by `describeFilters`. */
function displayValueFor(key: FilterKey, value: string): string {
  if (key === "result") return RESULT_OPTIONS.find((o) => o.value === value)?.label ?? value;
  const group = FILTER_GROUPS.find((g) => g.key === key);
  return group?.displayValue ? group.displayValue(value) : value;
}

/**
 * The applied-filter strip's sentence. Hand + backhand together get the
 * curated scouting phrase; anything else falls back to a plain joined list of
 * each facet's own display label — honest, if less like a sentence, rather
 * than a template guessing at combinations it was never written for.
 */
function describeFilters(filters: ActiveFilter[]): string {
  const hand = filters.find((f) => f.key === "hand")?.value;
  const backhand = filters.find((f) => f.key === "backhand")?.value;
  const rest = filters.filter((f) => f.key !== "hand" && f.key !== "backhand");
  const parts: string[] = [];

  if (hand && backhand) {
    parts.push(
      `${hand === "left" ? "Left" : "Right"}-handed opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`
    );
  } else if (hand) {
    parts.push(`${hand === "left" ? "Left" : "Right"}-handed opponents`);
  } else if (backhand) {
    parts.push(`Opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`);
  }

  parts.push(...rest.map((f) => displayValueFor(f.key, f.value)));
  return parts.join(" · ");
}

/**
 * The open, data-driven checklist facets only — Result/Hand/Backhand moved to
 * the fixed segmented constants above, since a segmented control needs a
 * known-ahead-of-time option list, not one read off the matches.
 */
const FILTER_GROUPS: {
  key: FilterKey;
  label: string;
  getValues: (matches: DisplayMatch[]) => string[];
  displayValue?: (val: string) => string;
  /** Omitted outside a team workspace — a personal list is one player already. */
  teamOnly?: boolean;
}[] = [
  {
    // First, because inside a program "who" is the question asked before any
    // other. The list shows the whole squad — every member reads the program's
    // matches, staff and player alike — and until now the only way to read one
    // person's season was to scroll.
    // It reads `player1` because that is always the program's side of the row:
    // `recordResult` and the upload wizard both put the opponent in `player2`.
    key: "player",
    label: "Player",
    teamOnly: true,
    // Deduplicated by the app's name rule, not by raw string: a season
    // recorded under both "Dana Brooks" and "Dana  Brooks" otherwise offers two
    // chips that render identically — HTML collapses the double space — and
    // each shows half her matches with nothing on screen saying so. The label
    // keeps the first spelling seen; the filter below compares by the same rule,
    // so either spelling's rows come back under the one chip.
    getValues: (matches) => {
      const byName = new Map<string, string>();
      for (const m of matches) {
        const key = normalizedPersonName(m.player1.name);
        if (key && !byName.has(key)) byName.set(key, m.player1.name);
      }
      return [...byName.values()].sort((a, b) =>
        normalizedPersonName(a).localeCompare(normalizedPersonName(b))
      );
    },
  },
  {
    key: "matchType",
    label: "Match type",
    getValues: (matches) => [...new Set(matches.map((m) => m.matchType))].sort(),
  },
  {
    key: "courtType",
    label: "Court",
    getValues: (matches) => [...new Set(matches.map((m) => m.courtType).filter(Boolean) as string[])].sort(),
  },
  {
    key: "source",
    label: "Source",
    getValues: (matches) => [...new Set(matches.map((m) => m.sourceProvider).filter(Boolean) as string[])].sort(),
    displayValue: providerName,
  },
  {
    key: "analysis",
    label: "Analysis",
    getValues: (matches) => {
      const present = new Set(matches.map(analysisGroup).filter(Boolean) as string[]);
      // Fixed order — these are pipeline stages, so alphabetising them would
      // scramble the sequence a reader expects.
      return ANALYSIS_GROUP_ORDER.filter((group) => present.has(group));
    },
  },
];

const PAGE_SIZES = [10, 25, 50] as const;

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
  // One quiet phrase, the canvas register: "Newest first" for the default date
  // sort, "{Field} A–Z" for the text fields.
  const sortPhrase = sortField === "date"
    ? (sortDir === "asc" ? "Oldest first" : "Newest first")
    : `${activeLabel} ${dirLabel}`;

  return (
    <div className="relative" ref={ref} onKeyDown={handleContainerKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        title={`Sorted by ${activeLabel}, ${dirLabel}`}
        className={`flex h-7 items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-150 ${open ? "" : "hover:bg-[var(--surface-subtle)]"}`}
        style={{
          background: open ? "var(--surface-subtle)" : undefined,
          color: open ? "var(--ink-900)" : "var(--ink-600)",
          fontWeight: open ? 500 : 400,
        }}
      >
        {sortPhrase}
        <ChevronDown
          className="h-3 w-3"
          strokeWidth={1.5}
          style={{ color: open ? "var(--ink-500)" : "var(--ink-400)" }}
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
            aria-label="Sort options"
            className="absolute top-full right-0 z-20 mt-1.5 min-w-[160px] rounded-xl border px-1.5 py-1.5"
            style={{
              background: "var(--surface-card)",
              borderColor: "var(--border-medium)",
              boxShadow: "var(--shadow-dropdown)",
            }}
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
                  className={`flex w-full items-center justify-between rounded-[var(--radius-element)] px-2.5 py-2 text-xs transition-colors duration-150 ${isActive ? "" : "hover:bg-[var(--surface-subtle)]"}`}
                  style={{
                    background: isActive ? "var(--surface-subtle)" : undefined,
                    color: isActive ? "var(--ink-900)" : "var(--ink-700)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {opt.label}
                  {isActive && (
                    <span className="text-[10px]" style={{ color: "var(--ink-500)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>
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
export function MatchesPageContent({
  matches: serverMatches,
  userId,
  scope = "personal",
}: MatchesPageContentProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Live job state, merged over what the server rendered. Without this the bar
  // is a snapshot from page load — a long upload appears frozen, and a job that
  // finishes while the tab is open never says so.
  //
  // Merged before everything below so filtering, sorting and grouping all see
  // the live status: a job that fails mid-view should leave the "In progress"
  // group without a refresh, not just change colour.
  // Only subscribe when there is something to follow. Otherwise every visit to
  // this page holds a WebSocket and a 25-second heartbeat for a channel that
  // will never deliver a message, against a per-project connection cap.
  //
  // Trade-off: a match that enters flight from ANOTHER tab will not light up
  // here without a refresh. Acceptable — uploads start from this app, in the
  // tab the user is already looking at.
  // isLiveUpdating, not isInFlight. A match parked at `processed` is in flight
  // but nothing will move it until Phase 2 ships, so subscribing for it would
  // hold the socket described above open forever rather than briefly.
  const hasInFlight = serverMatches.some(
    (m) => m.analysis && isLiveUpdating(m.analysis.status)
  );
  const livePatches = useLiveMatchAnalysis({
    by: "user",
    userId: hasInFlight ? userId : undefined,
  });
  const matches = useMemo(() => {
    if (livePatches.size === 0) return serverMatches;
    return serverMatches.map((m) => {
      const patch = livePatches.get(m.id);
      if (!patch || !m.analysis) return m;
      return { ...m, analysis: withLiveAnalysis(m.analysis, patch) };
    });
  }, [serverMatches, livePatches]);

  /* Layout is decided by the viewport alone — there is no view control any
     more. Six columns need the width, so under 1024px the same matches render
     as cards instead. That choice is made in CSS inside MatchesGrid, so it
     needs no state, no listener, and no URL parameter here. */
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  // Whether the search input is expanded. At rest it collapses to a compact
  // "Search" trigger that hugs its label (no dead field width in the toolbar);
  // it opens on click or "/", and re-collapses on blur when empty.
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>(() => (searchParams.get("sort") as SortField) || "date");
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get("dir") as SortDir) || "desc");
  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    const result: ActiveFilter[] = [];
    for (const key of FILTER_KEYS) {
      for (const value of searchParams.getAll(key)) {
        // Deduplicated on the way in, by the same rule the chips use. A URL
        // written before the Player chips collapsed to one spelling per person
        // can carry both — `?player=Dana+Brooks&player=Dana++Brooks` — and two
        // entries for one chip make the badge out-count the checked chips and
        // render two pills that look identical in the empty state.
        if (result.some((f) => f.key === key && sameValue(key, f.value, value))) {
          continue;
        }
        result.push({ key, value });
      }
    }
    return result;
  });
  const [lifecycle, setLifecycle] = useState<LifecycleValue>(() => {
    const v = searchParams.get("lifecycle");
    return v === "new" || v === "in-progress" ? v : "all";
  });
  const readyMatchIds = useMemo(
    () => matches.filter((m) => !m.analysis || isAnalysisReady(m.analysis.status)).map((m) => m.id),
    [matches]
  );
  const unseenIds = useUnseenReportIds(readyMatchIds);
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

  // "/" focuses search; the input's own onFocus animates the chip open.
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
      // Two needles, because one box searches two kinds of thing. Names go
      // through the app's own rule so a row stored as "Dana  Brooks" is
      // reachable by typing her name; tournament and round are not people and
      // keep the plain contains. The plain needle is trimmed either way — a
      // trailing space in the box used to empty the whole list.
      const q = search.trim().toLowerCase();
      const person = normalizedPersonName(search);
      result = result.filter(
        (m) =>
          m.tournamentName.toLowerCase().includes(q) ||
          normalizedPersonName(m.player1.name).includes(person) ||
          normalizedPersonName(m.player2.name).includes(person) ||
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
          case "analysis":
            return analysisGroup(m) === filter.value;
          case "hand":
            return m.player2Hand === filter.value;
          case "backhand":
            return m.player2Backhand === filter.value;
          case "player":
            return (
              normalizedPersonName(m.player1.name) ===
              normalizedPersonName(filter.value)
            );
          default:
            return true;
        }
      });
    }

    // Lifecycle — independent of the panel (v3's Data Table law 6): chips
    // answer "what's the state of this match", the panel answers everything
    // else, and the two never gate on the same predicate.
    if (lifecycle === "new") {
      result = result.filter((m) => unseenIds.has(m.id));
    } else if (lifecycle === "in-progress") {
      result = result.filter((m) => !!m.analysis && isInFlight(m.analysis.status));
    }

    return result;
  }, [matches, search, filters, lifecycle, unseenIds]);

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

  // Reset page when filters/search/lifecycle change
  useEffect(() => {
    setPage(1);
  }, [search, filters, lifecycle, pageSize]);

  // Sync state to URL
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sortField !== "date") params.set("sort", sortField);
    if (sortDir !== "desc") params.set("dir", sortDir);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    if (lifecycle !== "all") params.set("lifecycle", lifecycle);
    for (const f of filters) params.append(f.key, f.value);
    const query = params.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  }, [search, sortField, sortDir, page, pageSize, filters, lifecycle, pathname]);

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
      const exists = prev.some((f) => f.key === key && sameValue(key, f.value, value));
      if (exists)
        return prev.filter((f) => !(f.key === key && sameValue(key, f.value, value)));
      return [...prev, { key, value }];
    });
  }, []);

  /**
   * A segmented facet's click always replaces, never toggles — that's what
   * keeps Result/Hand/Backhand single-select. Selecting the neutral option
   * ("All"/"Any", `value === null`) just clears the key.
   */
  const selectSegment = useCallback((key: FilterKey, value: string | null) => {
    setFilters((prev) => {
      const withoutKey = prev.filter((f) => f.key !== key);
      return value === null ? withoutKey : [...withoutKey, { key, value }];
    });
  }, []);

  const segmentedValue = useCallback(
    (key: FilterKey) => filters.find((f) => f.key === key)?.value ?? null,
    [filters]
  );

  const clearFilters = useCallback(() => setFilters([]), []);

  const isFilterActive = useCallback(
    (key: FilterKey, value: string) =>
      filters.some((f) => f.key === key && sameValue(key, f.value, value)),
    [filters]
  );

  // Values are read off the matches, so a category with nothing to offer drops
  // out of the panel rather than opening onto an empty list. Order matches
  // design 18a: Player (team scope) → Result → the data-driven checklists →
  // Analysis → Opponent last, behind its own divider.
  const filterSections: FilterPanelSection<FilterKey>[] = useMemo(() => {
    const checklistSection = (
      group: (typeof FILTER_GROUPS)[number]
    ): FilterPanelSection<FilterKey> | null => {
      if (group.teamOnly && scope !== "team") return null;
      const values = group.getValues(matches);
      if (values.length === 0) return null;
      return {
        label: group.label,
        checklist: { key: group.key, values, displayValue: group.displayValue },
      };
    };

    const byKey = new Map(FILTER_GROUPS.map((g) => [g.key, g]));
    const sections: FilterPanelSection<FilterKey>[] = [];

    const playerSection = checklistSection(byKey.get("player")!);
    if (playerSection) sections.push(playerSection);

    sections.push({
      label: "Result",
      segmented: [{ key: "result", options: RESULT_OPTIONS }],
    });

    for (const key of ["matchType", "courtType", "source"] as const) {
      const section = checklistSection(byKey.get(key)!);
      if (section) sections.push(section);
    }

    const analysisSection = checklistSection(byKey.get("analysis")!);
    if (analysisSection) sections.push(analysisSection);

    const handHasData = matches.some((m) => m.player2Hand);
    const backhandHasData = matches.some((m) => m.player2Backhand);
    if (handHasData || backhandHasData) {
      sections.push({
        label: "Opponent",
        segmented: [
          ...(handHasData ? [{ key: "hand" as FilterKey, rowLabel: "Hand", options: HAND_OPTIONS }] : []),
          ...(backhandHasData
            ? [{ key: "backhand" as FilterKey, rowLabel: "Backhand", options: BACKHAND_OPTIONS }]
            : []),
        ],
      });
    }

    return sections;
  }, [matches, scope]);

  const lifecycleCounts = useMemo(
    () => ({
      all: matches.length,
      new: unseenIds.size,
      inProgress: matches.filter((m) => !!m.analysis && isInFlight(m.analysis.status)).length,
    }),
    [matches, unseenIds]
  );

  if (matches.length === 0) {
    return <EmptyMatches scope={scope} />;
  }

  return (
    <div>
      {/* Toolbar: lifecycle chips, filters, search, sort — wraps on medium screens */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <LifecycleChips active={lifecycle} counts={lifecycleCounts} onSelect={setLifecycle} />

        {/* Right: filters, search, sort */}
        <div className="flex items-center gap-2">
          <MatchesFilterPanel
            sections={filterSections}
            hasActive={filters.length > 0}
            isChecklistActive={isFilterActive}
            onToggleChecklist={toggleFilter}
            segmentedValue={segmentedValue}
            onSelectSegment={selectSegment}
            onClear={clearFilters}
            resultCount={sorted.length}
            totalCount={matches.length}
          />

          {/* The canvas's quiet "Search" chip. At rest the chip hugs its
              "Search" label (76px, no dead field width in the toolbar). Focusing
              it — by click or "/" — animates the width open into a full input,
              easing back on blur when empty. `overflow-hidden` clips the input
              while it slides; the collapse is disabled under reduced motion. */}
          <label
            className={`flex h-7 cursor-text items-center gap-1.5 overflow-hidden rounded-[var(--radius-element)] px-2 transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none hover:bg-[var(--surface-subtle)] ${
              searchOpen || search ? "w-[184px]" : "w-[76px]"
            }`}
            style={{ background: searchOpen || search ? "var(--surface-subtle)" : undefined }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--ink-500)" }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search"
              aria-label="Search matches"
              aria-keyshortcuts="/"
              title="Search by event, opponent, or round"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                if (!search) setSearchOpen(false);
              }}
              // Opt out of focus.css's neutral field ring: the chip's own
              // surface-subtle background is the visible active-field state, so a
              // ring on top is the "stray box" the DS underline-exception
              // describes. WCAG-safe for the same reason.
              data-focus-ring="none"
              className="min-w-0 flex-1 bg-transparent text-[12px] placeholder:text-[var(--ink-600)] focus:outline-none"
              style={{ color: "var(--ink-900)" }}
            />
          </label>

          <SortDropdown sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
        </div>
      </div>

      {/* Applied-filter strip — the panel closes on apply, this states the cut
          in words. Never chips, never a badge (v3's Data Table law 6). */}
      {filters.length > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
          style={{ background: "var(--surface-subtle)" }}
        >
          <FilterIcon className="size-[13px] shrink-0" strokeWidth={1.5} style={{ color: "var(--ink-500)" }} aria-hidden="true" />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            {describeFilters(filters)}
          </span>
          <span className="size-[3px] rounded-full" style={{ background: "var(--ink-300)" }} aria-hidden="true" />
          <span className="text-micro tabular">
            {sorted.length} of {matches.length}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearFilters}
            className="whitespace-nowrap text-[11px] font-medium"
            style={{ color: "var(--blue)" }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Table / Grid */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--ink-300)" }} />
          <p className="mb-1 text-[14px] font-medium" style={{ color: "var(--ink-900)" }}>No matches found</p>
          {(filters.length > 0 || search || lifecycle !== "all") && (
            <div className="mt-1 flex flex-col items-center gap-2">
              {search && (
                <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
                  &ldquo;{search}&rdquo;
                </span>
              )}
              <button
                onClick={() => {
                  clearFilters();
                  setSearch("");
                  setLifecycle("all");
                }}
                className="text-[11px] font-medium"
                style={{ color: "var(--blue)" }}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <MatchesGrid
          matches={paginatedMatches}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          newMatchId={newMatchId}
          unseenIds={unseenIds}
        />
      )}

      {/* Pagination — no rule of its own. Every row already carries a bottom
          hairline, so the last one closes the table; a second line 16px below it
          just read as a doubled edge. Whitespace separates the two now. */}
      {sorted.length > 0 && (
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-micro tabular">
              {rangeStart}–{rangeEnd} of {sorted.length}
            </span>
            <span className="size-[3px] rounded-full" style={{ background: "var(--ink-300)" }} aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="text-micro">Results per page</span>
              <div className="relative" ref={pageSizeRef} onKeyDown={handlePageSizeKeyDown}>
                <button
                  ref={pageSizeTriggerRef}
                  onClick={() => setPageSizeOpen(!pageSizeOpen)}
                  aria-expanded={pageSizeOpen}
                  aria-haspopup="listbox"
                  aria-controls={pageSizeOpen ? "pagesize-listbox" : undefined}
                  className={`flex h-7 items-center gap-1 rounded-[var(--radius-element)] px-2 text-[12px] tabular-nums transition-colors duration-150 ${pageSizeOpen ? "" : "hover:bg-[var(--surface-subtle)]"}`}
                  style={{
                    background: pageSizeOpen ? "var(--surface-subtle)" : undefined,
                    color: pageSizeOpen ? "var(--ink-900)" : "var(--ink-600)",
                  }}
                >
                  {pageSize}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${pageSizeOpen ? "rotate-180" : ""}`}
                    strokeWidth={1.5}
                    style={{ color: "var(--ink-400)" }}
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
                      className="absolute bottom-full left-0 z-20 mb-1.5 min-w-[56px] rounded-xl border px-1 py-1"
                      style={{
                        background: "var(--surface-card)",
                        borderColor: "var(--border-medium)",
                        boxShadow: "var(--shadow-dropdown)",
                      }}
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
                          className={`flex w-full items-center justify-center rounded-[var(--radius-element)] px-2 py-1.5 text-xs tabular-nums transition-colors duration-150 ${pageSize === size ? "" : "hover:bg-[var(--surface-subtle)]"}`}
                          style={{
                            background: pageSize === size ? "var(--surface-subtle)" : undefined,
                            color: pageSize === size ? "var(--ink-900)" : "var(--ink-700)",
                            fontWeight: pageSize === size ? 500 : 400,
                          }}
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
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] disabled:pointer-events-none disabled:opacity-30"
              style={{ color: "var(--ink-600)" }}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <span className="px-2 text-[12px] tabular-nums" style={{ color: "var(--ink-600)" }}>
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              title="Next page"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] disabled:pointer-events-none disabled:opacity-30"
              style={{ color: "var(--ink-600)" }}
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
