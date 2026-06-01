"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Inbox, RefreshCw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RecentMatches from "@/components/dashboard/home/recent-matches";
import { createClient } from "@/lib/supabase/client";

type ToastState =
  | { kind: "idle" }
  | { kind: "created"; matchId: string }
  | { kind: "analyzing"; matchId: string }
  | { kind: "ready"; matchId: string };

// How long to wait for the match_stats INSERT before giving up (dropped socket /
// failed processing). Detection is push-based via Supabase Realtime, so this is only
// a safety net, not a poll interval.
const PROCESSING_TIMEOUT_MS = 120000;
const PROCESSING_STORAGE_KEY = "match-processing";

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
  opponent_hand: string | null;
  opponent_backhand: string | null;
}

function formatOpponentMeta(
  hand: string | null,
  backhand: string | null
): string[] {
  const meta: string[] = [];
  if (hand === "left" || hand === "right") {
    meta.push(`${hand.toUpperCase()} HANDED`);
  }
  if (backhand === "one-handed" || backhand === "two-handed") {
    meta.push(`${backhand === "one-handed" ? "1" : "2"}-HANDED BACKHAND`);
  }
  return meta;
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
    if (Number.isNaN(d.getTime())) return isoDate;
    const now = new Date();
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
      (nowDay.getTime() - dDay.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
    if (diffDays > 6 && diffDays <= 13) return "Last week";

    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
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
        opponentMeta: formatOpponentMeta(m.opponent_hand, m.opponent_backhand),
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
  const newEventIds = new Set<string>();
  if (seenEventIdsRef.current !== null) {
    for (const event of events) {
      if (!seenEventIdsRef.current.has(event.id)) {
        newEventIds.add(event.id);
      }
    }
  }

  useEffect(() => {
    const ids = new Set<string>();
    for (const event of events) ids.add(event.id);
    seenEventIdsRef.current = ids;
  }, [events, seenEventIdsRef]);

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
  const [toast, setToast] = useState<ToastState>({ kind: "idle" });
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const storedMatchId = sessionStorage.getItem(PROCESSING_STORAGE_KEY);
    if (storedMatchId) {
      setToast({ kind: "analyzing", matchId: storedMatchId });
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
          "id, created_by, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player1_id, player2_id, opponent_hand, opponent_backhand"
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

      const matchById = new Map(list.map((m) => [m.id, m]));
      const statsMap = new Map<string, MatchStats>();
      if (stats) {
        for (const stat of stats as MatchStats[]) {
          const match = matchById.get(stat.match_id);
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
    let createdTimer: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: Event) => {
      const matchId = (e as CustomEvent<{ matchId: string }>).detail?.matchId;
      if (!matchId) return;
      sessionStorage.setItem(PROCESSING_STORAGE_KEY, matchId);
      setToast({ kind: "created", matchId });
      // Show the newly created match right away — its row (with the score) already
      // exists. Stats fill in later when processing completes (finish() → load()).
      // Without this, the list wouldn't change until processing finished.
      load();
      createdTimer = setTimeout(() => {
        setToast((current) =>
          current.kind === "created"
            ? { kind: "analyzing", matchId: current.matchId }
            : current
        );
      }, 1200);
    };
    window.addEventListener("match-created", handler);
    return () => {
      window.removeEventListener("match-created", handler);
      if (createdTimer) clearTimeout(createdTimer);
    };
  }, [load]);

  const targetMatchId =
    toast.kind === "created" || toast.kind === "analyzing" ? toast.matchId : null;

  useEffect(() => {
    if (!targetMatchId) return;
    const supabase = createClient();
    let settled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Processing is done once calculate_match_stats writes the match's rows. Detect
    // that via a Realtime INSERT on match_stats rather than polling the heavy
    // percentages view. `settled` guards against the event, the existence-check, and
    // the safety reconcile all firing.
    const finish = () => {
      if (settled) return;
      settled = true;
      sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
      setToast({ kind: "ready", matchId: targetMatchId });
      load();
      window.dispatchEvent(new Event("match-processed"));
    };

    const statsExist = async () => {
      // Base table, not the percentages view — we only need existence (lighter).
      const { data } = await supabase
        .from("match_stats")
        .select("id")
        .eq("match_id", targetMatchId)
        .limit(1);
      return Boolean(data && data.length > 0);
    };

    (async () => {
      // Authenticate the realtime socket with the user's JWT BEFORE subscribing.
      // match_stats is RLS-protected, and supabase-js does not proactively push the
      // token to the socket on sign-in (it only stores it), so a channel can join as
      // anon and RLS silently delivers ZERO postgres_changes — the subscription
      // "succeeds" but no INSERT events ever arrive. setAuth() forces the token on.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (settled) return;

      channel = supabase
        .channel(`match-stats:${targetMatchId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "match_stats",
            filter: `match_id=eq.${targetMatchId}`,
          },
          () => finish(),
        )
        .subscribe(async (status) => {
          // Race guard: processing may have finished before the subscription opened,
          // so the INSERT event would never arrive — reconcile once on connect.
          if (status === "SUBSCRIBED" && !settled && (await statsExist())) {
            finish();
          }
        });
    })();

    // Safety net: if the realtime event never arrives (dropped socket), reconcile by
    // checking directly; only give up if the stats genuinely aren't there yet.
    const timeout = setTimeout(async () => {
      if (settled) return;
      if (await statsExist()) {
        finish();
      } else {
        sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
        setToast({ kind: "idle" });
      }
    }, PROCESSING_TIMEOUT_MS);

    return () => {
      settled = true;
      clearTimeout(timeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [targetMatchId, load]);

  const dismissToast = useCallback(() => {
    sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
    setToast({ kind: "idle" });
  }, []);

  const handleToastClick = useCallback(() => {
    if (toast.kind === "ready") {
      router.push(`/dashboard/matches/${toast.matchId}`);
      setToast({ kind: "idle" });
    }
  }, [toast, router]);

  return (
    <>
    <div className="bg-white border border-[#F3F3F3] shadow-card-elevated rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          RECENT MATCHES
        </p>
        <Link
          href="/dashboard/matches"
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] transition-colors duration-200 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
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
                <div className="flex flex-col gap-3 mt-2">
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
                        {[0, 1, 2].map((k) => (
                          <div key={k} className="flex flex-col gap-2 items-end">
                            <Skeleton className="h-2 w-12" />
                            <Skeleton className="h-3 w-10" />
                          </div>
                        ))}
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              <RefreshCw className="size-3" aria-hidden />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <Inbox className="h-7 w-7 text-[#CCCCCC] mb-4" aria-hidden />
            <p className="text-[14px] font-medium text-[#0D0D0D] mb-1.5">
              No matches yet
            </p>
            <p className="text-[13px] text-[#888888] max-w-[320px] leading-[1.55]">
              Upload a SwingVision match file to see your stats, serve placement,
              and AI-powered analysis.
            </p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <EventsList events={events} seenEventIdsRef={seenEventIdsRef} />
        )}
      </div>
    </div>

    {/* Floating upload-status pill — confirm → analyzing → ready */}
    {mounted && createPortal(
      <AnimatePresence>
        {toast.kind !== "idle" && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.95 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{
              duration: shouldReduceMotion ? 0.15 : 0.35,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            role="status"
            onClick={toast.kind === "ready" ? handleToastClick : undefined}
            className={
              "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-5 py-3 bg-[#0D0D0D] rounded-[12px] shadow-[0px_8px_32px_rgba(0,0,0,0.25),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset] " +
              (toast.kind === "ready" ? "cursor-pointer hover:bg-[#1A1A1A] transition-colors duration-200" : "")
            }
          >
            {/* Status icon — swaps cleanly across states */}
            <div className="relative flex items-center justify-center size-5 shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                {toast.kind === "created" || toast.kind === "ready" ? (
                  <motion.div
                    key={toast.kind}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <CheckCircle2 className="size-5 text-[#5DB955]" strokeWidth={1.75} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="analyzing"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="absolute inset-0 rounded-full border-[1.5px] border-[#3B82F6]/30" aria-hidden />
                    {!shouldReduceMotion && (
                      <motion.div
                        className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-[#3B82F6]"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, ease: "linear", repeat: Infinity }}
                        aria-hidden
                      />
                    )}
                    <div className="size-1.5 rounded-full bg-[#3B82F6]" aria-hidden />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-0.5 min-w-[180px]">
              <p className="text-[12px] font-medium text-white leading-none">
                {toast.kind === "created"
                  ? "Match created"
                  : toast.kind === "ready"
                  ? "Stats ready"
                  : "Analyzing match data"}
              </p>
              <p className="text-[10px] font-normal text-[#888888] leading-none">
                {toast.kind === "created"
                  ? "Analyzing your stats…"
                  : toast.kind === "ready"
                  ? "Tap to view your match"
                  : "Stats will refresh automatically"}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast();
              }}
              className="ml-1 p-1 rounded-full text-white/60 hover:text-white/80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}
