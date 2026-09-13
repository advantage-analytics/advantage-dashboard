"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock, Calendar, Users, Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

// --- Types ---

interface MatchResult {
  id: string;
  opponentName: string;
  tournamentName: string;
  score: string;
  date: string;
  isWin: boolean;
}

interface GroupedResult {
  name: string;
  matchCount: number;
}

interface SearchResults {
  matches: MatchResult[];
  opponents: GroupedResult[];
  events: GroupedResult[];
}

type FlatItem =
  | { type: "match"; data: MatchResult }
  | { type: "opponent"; data: GroupedResult }
  | { type: "event"; data: GroupedResult }
  | { type: "recent"; query: string };

// --- Helpers ---

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const RECENT_KEY = "advantage-search-recent";
const MAX_RECENT = 5;
const MAX_PER_CATEGORY = 3;

function formatShortDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatScore(
  score: { player1: number[]; player2: number[] } | null,
  isUserPlayer1: boolean
): string {
  if (!score?.player1?.length || !score?.player2?.length) return "";
  const user = isUserPlayer1 ? score.player1 : score.player2;
  const opp = isUserPlayer1 ? score.player2 : score.player1;
  return user.map((s, i) => `${s}-${opp[i] ?? 0}`).join(", ");
}

function didUserWin(
  score: { player1: number[]; player2: number[] } | null,
  isUserPlayer1: boolean
): boolean {
  if (!score?.player1?.length || !score?.player2?.length) return false;
  let p1 = 0;
  let p2 = 0;
  score.player1.forEach((s, i) => {
    if (s > (score.player2[i] ?? 0)) p1++;
    else if ((score.player2[i] ?? 0) > s) p2++;
  });
  return isUserPlayer1 ? p1 > p2 : p2 > p1;
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(
      0,
      MAX_RECENT
    );
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const existing = loadRecent();
    const updated = [query, ...existing.filter((q) => q !== query)].slice(
      0,
      MAX_RECENT
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// --- Component ---

interface SearchCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommandPalette({
  open,
  onOpenChange,
}: SearchCommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Debounce query
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      setResults(null);
      return;
    }
    timerRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setRecentSearches(loadRecent());
    } else {
      setQuery("");
      setDebouncedQuery("");
      setResults(null);
      setHighlightIndex(0);
    }
  }, [open]);

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery) return;

    let stale = false;
    setIsLoading(true);

    async function search() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || stale) {
        setIsLoading(false);
        return;
      }

      const escaped = debouncedQuery
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");

      const { data } = await supabase
        .from("matches")
        .select(
          "id, player1_id, player1_name, player2_name, tournament_name, round, date, score"
        )
        .or(
          `tournament_name.ilike.%${escaped}%,player1_name.ilike.%${escaped}%,player2_name.ilike.%${escaped}%,round.ilike.%${escaped}%`
        )
        .order("date", { ascending: false })
        .limit(20);

      if (stale) return;

      if (!data || data.length === 0) {
        setResults({ matches: [], opponents: [], events: [] });
        setIsLoading(false);
        return;
      }

      const userId = user.id;

      const matches: MatchResult[] = data.slice(0, MAX_PER_CATEGORY).map((m) => {
        const isP1 = m.player1_id === userId;
        return {
          id: m.id,
          opponentName: isP1 ? m.player2_name : m.player1_name,
          tournamentName: m.tournament_name ?? "Unknown event",
          score: formatScore(m.score, isP1),
          date: formatShortDate(m.date),
          isWin: didUserWin(m.score, isP1),
        };
      });

      const oppCounts = new Map<string, number>();
      for (const m of data) {
        const opp = m.player1_id === userId ? m.player2_name : m.player1_name;
        oppCounts.set(opp, (oppCounts.get(opp) ?? 0) + 1);
      }
      const opponents: GroupedResult[] = Array.from(oppCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PER_CATEGORY)
        .map(([name, matchCount]) => ({ name, matchCount }));

      const eventCounts = new Map<string, number>();
      for (const m of data) {
        const name = m.tournament_name ?? "Unknown event";
        eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1);
      }
      const events: GroupedResult[] = Array.from(eventCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PER_CATEGORY)
        .map(([name, matchCount]) => ({ name, matchCount }));

      setResults({ matches, opponents, events });
      setHighlightIndex(0);
      setIsLoading(false);
    }

    search();
    return () => {
      stale = true;
    };
  }, [debouncedQuery]);

  // Flat items for keyboard nav
  const flatItems = useMemo<FlatItem[]>(() => {
    if (!results) {
      return recentSearches.map((q) => ({ type: "recent" as const, query: q }));
    }
    const items: FlatItem[] = [];
    for (const m of results.matches) items.push({ type: "match", data: m });
    for (const o of results.opponents) items.push({ type: "opponent", data: o });
    for (const e of results.events) items.push({ type: "event", data: e });
    return items;
  }, [results, recentSearches]);

  // Navigate to result
  const navigateTo = useCallback(
    (item: FlatItem) => {
      if (item.type === "recent") {
        setQuery(item.query);
        return;
      }
      if (query.trim()) saveRecent(query.trim());
      onOpenChange(false);
      if (item.type === "match") {
        router.push(`/dashboard/matches/${item.data.id}`);
      } else {
        router.push(
          `/dashboard/matches?q=${encodeURIComponent(item.data.name)}`
        );
      }
    },
    [query, onOpenChange, router]
  );

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatItems.length > 0) {
        e.preventDefault();
        navigateTo(flatItems[highlightIndex]);
      }
    },
    [flatItems, highlightIndex, navigateTo]
  );

  // Scroll highlighted into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  // State flags
  const hasQuery = debouncedQuery.length > 0;
  const hasResults = results && flatItems.length > 0;
  const noResults = results && flatItems.length === 0;
  const showRecent = !hasQuery && recentSearches.length > 0;
  const showHint = !hasQuery && recentSearches.length === 0;

  // Track flat index for rendering
  let flatIdx = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] sm:rounded-xl p-0 overflow-hidden sm:top-[20%] sm:translate-y-0 border border-[#E5E5EA] shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
        hideCloseButton
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search across matches, opponents, and events
        </DialogDescription>

        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 h-11 border-b border-[#F3F3F3]">
          <Search
            className="size-3.5 text-[#AAAAAA] shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search matches, opponents, events..."
            className="flex-1 bg-transparent text-[13px] text-[#0D0D0D] placeholder-[#AAAAAA] outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 p-1 rounded-lg hover:bg-[#F5F5F5] transition-colors duration-200"
              aria-label="Clear search"
            >
              <X className="size-3.5 text-[#AAAAAA]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0] px-1 py-0.5 rounded [font-variant-caps:small-caps]">
              esc
            </kbd>
          )}
        </div>

        {/* Results area */}
        <div
          ref={listRef}
          className="max-h-[320px] overflow-y-auto"
          role="listbox"
          aria-label="Search results"
        >
          <AnimatePresence mode="wait">
            {/* Loading */}
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="p-4 flex flex-col gap-3"
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded bg-[#F0F0F0] animate-pulse shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="h-3 w-40 rounded bg-[#F0F0F0] animate-pulse" />
                      <div className="h-2.5 w-28 rounded bg-[#F0F0F0] animate-pulse" />
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Empty hint */}
            {!isLoading && showHint && (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="flex flex-col items-center justify-center py-10 px-6 text-center"
              >
                <div className="bg-[#F5F5F5] p-3 rounded-full mb-3">
                  <Search className="size-5 text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="text-[12px] text-[#888888] leading-[1.6]">
                  Search across your matches, opponents, and events
                </p>
              </motion.div>
            )}

            {/* Recent searches */}
            {!isLoading && showRecent && (
              <motion.div
                key="recent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="py-2"
              >
                <p className="px-4 py-2 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                  Recent
                </p>
                {recentSearches.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    data-index={i}
                    onClick={() => navigateTo({ type: "recent", query: q })}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`flex items-center gap-2.5 w-full px-4 py-2 text-left transition-colors duration-200 ${
                      highlightIndex === i ? "bg-[#F5F5F5]" : ""
                    }`}
                    role="option"
                    aria-selected={highlightIndex === i}
                  >
                    <Clock
                      className="size-3.5 text-[#AAAAAA] shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className="text-[13px] text-[#0D0D0D]">{q}</span>
                  </button>
                ))}
              </motion.div>
            )}

            {/* No results */}
            {!isLoading && noResults && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="flex flex-col items-center justify-center py-10 px-6 text-center"
              >
                <div className="bg-[#F5F5F5] p-3 rounded-full mb-3">
                  <Search className="size-5 text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="text-[13px] font-medium text-[#0D0D0D] mb-1">
                  No results for &ldquo;{debouncedQuery}&rdquo;
                </p>
                <p className="text-[12px] text-[#888888] leading-[1.6]">
                  Try a different opponent name, tournament, or round
                </p>
              </motion.div>
            )}

            {/* Results */}
            {!isLoading && hasResults && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="py-2"
              >
                {/* Matches */}
                {results.matches.length > 0 && (
                  <div className="mb-1">
                    <p className="px-4 py-2 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                      Matches
                    </p>
                    {results.matches.map((match) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={match.id}
                          type="button"
                          data-index={idx}
                          onClick={() =>
                            navigateTo({ type: "match", data: match })
                          }
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors duration-200 ${
                            highlightIndex === idx ? "bg-[#F5F5F5]" : ""
                          }`}
                          role="option"
                          aria-selected={highlightIndex === idx}
                        >
                          <Calendar
                            className="size-3.5 text-[#AAAAAA] shrink-0"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-[#0D0D0D] truncate">
                                vs. {match.opponentName}
                              </span>
                              <span
                                className={`shrink-0 px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold ${
                                  match.isWin
                                    ? "bg-[rgba(115,230,104,0.15)] text-[#5DB955]"
                                    : "bg-[rgba(229,24,55,0.15)] text-[#E51837]"
                                }`}
                              >
                                {match.isWin ? "W" : "L"}
                              </span>
                            </div>
                            <span className="text-[12px] text-[#888888]">
                              {match.tournamentName}
                              <span className="text-[#CCCCCC] mx-1">&middot;</span>
                              <span className="tabular-nums">{match.score}</span>
                              <span className="text-[#CCCCCC] mx-1">&middot;</span>
                              {match.date}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Opponents */}
                {results.opponents.length > 0 && (
                  <div className="mb-1">
                    <p className="px-4 py-2 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                      Opponents
                    </p>
                    {results.opponents.map((opp) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={opp.name}
                          type="button"
                          data-index={idx}
                          onClick={() =>
                            navigateTo({ type: "opponent", data: opp })
                          }
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors duration-200 ${
                            highlightIndex === idx ? "bg-[#F5F5F5]" : ""
                          }`}
                          role="option"
                          aria-selected={highlightIndex === idx}
                        >
                          <Users
                            className="size-3.5 text-[#AAAAAA] shrink-0"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <span className="text-[13px] text-[#0D0D0D] flex-1 truncate">
                            {opp.name}
                          </span>
                          <span className="text-[12px] text-[#888888] tabular-nums shrink-0">
                            {opp.matchCount} match{opp.matchCount !== 1 ? "es" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Events */}
                {results.events.length > 0 && (
                  <div className="mb-1">
                    <p className="px-4 py-2 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                      Events
                    </p>
                    {results.events.map((evt) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={evt.name}
                          type="button"
                          data-index={idx}
                          onClick={() =>
                            navigateTo({ type: "event", data: evt })
                          }
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors duration-200 ${
                            highlightIndex === idx ? "bg-[#F5F5F5]" : ""
                          }`}
                          role="option"
                          aria-selected={highlightIndex === idx}
                        >
                          <Trophy
                            className="size-3.5 text-[#AAAAAA] shrink-0"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <span className="text-[13px] text-[#0D0D0D] flex-1 truncate">
                            {evt.name}
                          </span>
                          <span className="text-[12px] text-[#888888] tabular-nums shrink-0">
                            {evt.matchCount} match{evt.matchCount !== 1 ? "es" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 h-9 border-t border-[#F3F3F3]">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[#AAAAAA]">
            <kbd className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]">↑↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[#AAAAAA]">
            <kbd className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]">↵</kbd>
            open
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[#AAAAAA]">
            <kbd className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0] [font-variant-caps:small-caps]">esc</kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
