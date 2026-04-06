"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
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

export default function RecentActivity() {
  const [events, setEvents] = useState<EventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setEvents([]);
        return;
      }
      const { data: rows, error: fetchError } = await supabase
        .from("matches")
        .select(
          "id, created_by, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player1_id, player2_id"
        )
        .eq("created_by", user.id)
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
          const isUserPlayer1 = match.player1_id === user.id;
          if (stat.is_player1 === isUserPlayer1) {
            statsMap.set(stat.match_id, stat);
          }
        }
      }

      setEvents(groupMatchesIntoEvents(list, user.id, statsMap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("match-created", handler);
    return () => window.removeEventListener("match-created", handler);
  }, [load]);

  return (
    <div className="bg-white border border-[#F3F3F3] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          RECENT MATCHES
        </p>
        <Link
          href="/dashboard/matches"
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] transition-colors duration-200 hover:text-[#2563EB]"
        >
          VIEW ALL
        </Link>
      </div>

      {/* Content */}
      <div className="pb-5">
        {loading && (
          <div className="flex items-center justify-center py-12 text-[#888888] text-sm">
            Loading...
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-sm text-red-600" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
              <Inbox className="h-8 w-8 text-[#888888]" aria-hidden />
            </div>
            <p className="font-medium text-[#0D0D0D] mb-1">No matches yet</p>
            <p className="text-sm text-[#888888] max-w-[260px]">
              Upload your first match to see your recent activity here.
            </p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="flex flex-col gap-8">
            {events.map((event) => (
              <RecentMatches key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
