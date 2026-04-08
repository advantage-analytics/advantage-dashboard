"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import RecentMatches from "@/components/dashboard/home/recent-matches";
import { createClient } from "@/lib/supabase/client";

interface DbMatch {
  id: string;
  created_by: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string;
  player2_name: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  } | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  verified: boolean | null;
  duration: number | null;
}

interface MatchStats {
  match_id: string;
  is_player1: boolean;
  first_serve_pct: string | null;
  winners: number | null;
  unforced_errors: number | null;
  break_points_saved: number | null;
  break_points_faced: number | null;
  break_point_opportunities: number | null;
  break_points_converted: number | null;
}

export interface EventGroup {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string | null;
  courtType: string | null;
  verificationStatus: string | null;
  matches: MatchRow[];
}

export interface MatchRow {
  id: string;
  opponentName: string;
  score: string;
  won: boolean;
  firstServePct: number | null;
  winners: number | null;
  errors: number | null;
  breakpointsWon: number | null;
  breakpointsTotal: number | null;
  opponentMeta?: string[];
}

function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function buildScoreString(
  score: DbMatch["score"],
  isUserPlayer1: boolean
): string {
  if (!score?.player1?.length || !score?.player2?.length) return "";
  const userScores = isUserPlayer1 ? score.player1 : score.player2;
  const oppScores = isUserPlayer1 ? score.player2 : score.player1;
  return userScores.map((s, i) => `${s}-${oppScores[i] ?? 0}`).join(" ");
}

function didUserWin(
  score: DbMatch["score"],
  isUserPlayer1: boolean
): boolean {
  if (!score?.player1?.length || !score?.player2?.length) return false;
  let p1Sets = 0;
  let p2Sets = 0;
  score.player1.forEach((s, i) => {
    if (s > (score.player2[i] ?? 0)) p1Sets++;
    else if ((score.player2[i] ?? 0) > s) p2Sets++;
  });
  return isUserPlayer1 ? p1Sets > p2Sets : p2Sets > p1Sets;
}

function groupMatchesIntoEvents(
  rows: DbMatch[],
  createdBy: string,
  statsMap: Map<string, MatchStats>
): EventGroup[] {
  const byKey = new Map<string, DbMatch[]>();
  for (const row of rows) {
    const dateOnly =
      row.date && row.date.length >= 10 ? row.date.slice(0, 10) : row.date;
    const key = `${row.tournament_name ?? ""}|${dateOnly}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  const events: EventGroup[] = [];
  const keys = Array.from(byKey.keys()).sort((a, b) => {
    const dateA = byKey.get(a)![0].date;
    const dateB = byKey.get(b)![0].date;
    return dateB.localeCompare(dateA);
  });
  for (const key of keys.slice(0, 3)) {
    const matches = byKey.get(key)!;
    const first = matches[0];
    const mapped: MatchRow[] = [];

    for (const m of matches) {
      if (!m.score?.player1?.length) continue;
      const isUserPlayer1 = m.player1_id === createdBy;
      const opponent = isUserPlayer1 ? m.player2_name : m.player1_name;
      const stat = statsMap.get(m.id);

      mapped.push({
        id: m.id,
        opponentName: opponent,
        score: buildScoreString(m.score, isUserPlayer1),
        won: didUserWin(m.score, isUserPlayer1),
        firstServePct: stat ? Math.round(parseFloat(stat.first_serve_pct ?? "0")) : null,
        winners: stat?.winners ?? null,
        errors: stat?.unforced_errors ?? null,
        breakpointsWon: stat
          ? (stat.break_points_converted ?? stat.break_points_saved ?? null)
          : null,
        breakpointsTotal: stat
          ? (stat.break_point_opportunities ?? stat.break_points_faced ?? null)
          : null,
        // TODO: Replace with real data from users table once upload flow collects hand/backhand
        opponentMeta: ["LEFT HANDED", "2-HANDED BACKHAND"],
      });
    }

    if (mapped.length === 0) continue;
    events.push({
      id: first.id,
      tournamentName: first.tournament_name ?? "Unknown event",
      date: formatDisplayDate(first.date),
      matchType: first.match_type ?? null,
      courtType: first.court_type ?? null,
      verificationStatus: first.verified ? "Verified Result" : null,
      matches: mapped,
    });
  }
  return events;
}

function EventsList({
  events,
  seenEventIdsRef,
}: {
  events: EventGroup[];
  seenEventIdsRef: React.MutableRefObject<Set<string> | null>;
}) {
  const currentIds = events.map((e) => e.id);
  const newEventIds = new Set<string>();

  if (seenEventIdsRef.current === null) {
    // First render — mark all as seen
    seenEventIdsRef.current = new Set(currentIds);
  } else {
    for (const id of currentIds) {
      if (!seenEventIdsRef.current.has(id)) {
        newEventIds.add(id);
      }
    }
    seenEventIdsRef.current = new Set(currentIds);
  }

  return (
    <div className="flex flex-col gap-8">
      {events.map((event) => (
        <RecentMatches
          key={event.id}
          event={event}
          isNewEvent={newEventIds.has(event.id)}
        />
      ))}
    </div>
  );
}

export default function RecentActivity({ userId }: { userId: string }) {
  const [events, setEvents] = useState<EventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate processing state from sessionStorage on mount
  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem("match-processing") === "true") {
      setProcessing(true);
    }
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    // Only show skeleton on initial load — subsequent fetches update in-place
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const { data: rows, error: fetchError } = await supabase
        .from("matches")
        .select(
          "id, created_by, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player1_id, player2_id"
        )
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(50);

      if (fetchError) {
        setError(fetchError.message);
        setEvents([]);
        return;
      }
      const list = (rows ?? []) as DbMatch[];
      const matchIds = list.map((m) => m.id);

      // Fetch stats for these matches
      const { data: stats } = await supabase
        .from("match_stats_with_percentages")
        .select(
          "match_id, is_player1, first_serve_pct, winners, unforced_errors, break_points_saved, break_points_faced, break_point_opportunities, break_points_converted"
        )
        .in("match_id", matchIds);

      // Build a map of match_id -> user's stats
      const statsMap = new Map<string, MatchStats>();
      if (stats) {
        for (const stat of stats as MatchStats[]) {
          const match = list.find((m) => m.id === stat.match_id);
          if (!match) continue;
          const isUserPlayer1 = match.player1_id === userId;
          if (stat.is_player1 === isUserPlayer1) {
            statsMap.set(stat.match_id, stat);
          }
        }
      }

      setEvents(groupMatchesIntoEvents(list, userId, statsMap));
      hasLoadedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => {
      sessionStorage.setItem("match-processing", "true");
      setProcessing(true);
    };
    window.addEventListener("match-created", handler);
    return () => window.removeEventListener("match-created", handler);
  }, [load]);

  // Poll for stats once processing starts, auto-dismiss when stats arrive
  useEffect(() => {
    if (!processing) return;
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id")
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(1);
      if (!matches?.[0]) return;
      const { data: stats } = await supabase
        .from("match_stats_with_percentages")
        .select("match_id")
        .eq("match_id", matches[0].id)
        .limit(1);
      if (stats && stats.length > 0) {
        sessionStorage.removeItem("match-processing");
        setProcessing(false);
        load();
        window.dispatchEvent(new Event("match-processed"));
      }
    }, 3000);
    // Safety timeout — dismiss after 60s regardless
    const timeout = setTimeout(() => {
      sessionStorage.removeItem("match-processing");
      setProcessing(false);
    }, 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [processing, load, userId]);

  return (
    <>
    <div className="bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          RECENT MATCHES
        </p>
        <Link
          href="/dashboard/matches"
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] transition-colors duration-200 hover:text-[#2563EB]"
        >
          VIEW ALL
        </Link>
      </div>

      {/* Content */}
      <div className="pb-5">
        {loading && (
          <div className="flex flex-col gap-8 px-5 py-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56" />
                <div className="flex flex-col gap-5 mt-2">
                  {[0, 1].map((j) => (
                    <div key={j} className="flex items-center justify-between">
                      <div className="flex gap-3 items-center">
                        <Skeleton className="w-px h-10" />
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <Skeleton className="h-8 w-14" />
                        <Skeleton className="h-8 w-14" />
                        <Skeleton className="h-8 w-14" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center" role="alert">
            <AlertCircle className="text-[#E51837] size-6 mb-2" aria-hidden />
            <p className="text-[13px] font-medium text-[#0D0D0D] mb-1">Failed to load matches</p>
            <p className="text-[12px] text-[#888888] mb-4">Something went wrong. Please try again.</p>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200"
            >
              <RefreshCw className="size-3" aria-hidden />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
              <Inbox className="h-8 w-8 text-[#888888]" aria-hidden />
            </div>
            <p className="font-medium text-[#0D0D0D] mb-1">No matches yet</p>
            <p className="text-[12px] text-[#888888] max-w-[300px] leading-[1.6] mb-5">
              Upload a SwingVision match file (.xlsx) to see your stats,
              serve placement, and AI-powered analysis here.
            </p>
            <div className="flex flex-col gap-2 text-[10px] text-[#AAAAAA] uppercase tracking-[1.5px]">
              <div className="flex items-center gap-2">
                <span className="w-4 h-px bg-[#E7E7E7]" aria-hidden />
                <span>KPI breakdown</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-px bg-[#E7E7E7]" aria-hidden />
                <span>Serve placement court map</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-px bg-[#E7E7E7]" aria-hidden />
                <span>Match-by-match trends</span>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <EventsList events={events} seenEventIdsRef={seenEventIdsRef} />
        )}
      </div>
    </div>

    {/* Floating processing popup */}
    {mounted && createPortal(
      <AnimatePresence>
        {processing && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{
              duration: 0.35,
              ease: [0.25, 0.46, 0.45, 0.94],
              exit: { duration: 0.2 },
            }}
            role="status"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-5 py-3 bg-[#0D0D0D] rounded-[12px] shadow-[0px_8px_32px_rgba(0,0,0,0.25),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset]"
          >
            {/* Animated progress dot */}
            <div className="relative flex items-center justify-center size-5 shrink-0">
              <motion.div
                className="absolute inset-0 rounded-full border-[1.5px] border-[#3B82F6]/30"
                aria-hidden
              />
              <motion.div
                className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-[#3B82F6]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, ease: "linear", repeat: Infinity }}
                aria-hidden
              />
              <div className="size-1.5 rounded-full bg-[#3B82F6]" aria-hidden />
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="text-[12px] font-medium text-white leading-none">
                Analyzing match data
              </p>
              <p className="text-[10px] font-normal text-[#888888] leading-none">
                Stats will refresh automatically
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}
