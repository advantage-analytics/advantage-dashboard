"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import RecentMatches from "@/components/dashboard/home/recent-matches";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/components/dashboard/home/upload-match-modal/utils";

/** DB match row from Supabase matches table */
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

/** Event group: same tournament + date, with one or more matches */
interface EventGroup {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string;
  courtType: string | null;
  verificationStatus: string | null;
  matches: Array<{
    id: string;
    round: string;
    matchContext: string;
    duration: string;
    player1: { name: string; school: string };
    player2: { name: string; school: string };
    score: {
      sets: Array<{ player1: number; player2: number; tiebreak?: boolean }>;
      winner: "player1" | "player2";
      finalScore: string;
    };
    won: boolean;
  }>;
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

function mapDbScoreToDisplay(score: DbMatch["score"]): {
  sets: Array<{ player1: number; player2: number; tiebreak?: boolean }>;
  winner: "player1" | "player2";
  finalScore: string;
} | null {
  if (!score?.player1?.length || !score?.player2?.length) return null;
  const p1 = score.player1;
  const p2 = score.player2;
  const tb1 = score.player1_tiebreaks ?? [];
  const tb2 = score.player2_tiebreaks ?? [];
  const sets = p1.map((a, i) => ({
    player1: a,
    player2: p2[i] ?? 0,
    tiebreak: (tb1[i] ?? 0) > 0 || (tb2[i] ?? 0) > 0,
  }));
  let p1Sets = 0,
    p2Sets = 0;
  sets.forEach((s) => {
    if (s.player1 > s.player2) p1Sets++;
    else if (s.player2 > s.player1) p2Sets++;
  });
  const winner: "player1" | "player2" = p1Sets > p2Sets ? "player1" : "player2";
  const finalScore = sets.map((s) => `${s.player1}-${s.player2}`).join(", ");
  return { sets, winner, finalScore };
}

function mapDbMatchToEventMatch(
  row: DbMatch,
  createdBy: string
): EventGroup["matches"][number] | null {
  const scoreDisplay = mapDbScoreToDisplay(row.score);
  if (!scoreDisplay) return null;
  const durationStr = formatDuration(row.duration ?? undefined);
  const isUserPlayer1 = row.player1_id === createdBy;
  const won =
    (isUserPlayer1 && scoreDisplay.winner === "player1") ||
    (!isUserPlayer1 && scoreDisplay.winner === "player2");
  return {
    id: row.id,
    round: row.round ?? "",
    matchContext: row.result ?? "Final Score",
    duration: durationStr,
    player1: { name: row.player1_name, school: "" },
    player2: { name: row.player2_name, school: "" },
    score: scoreDisplay,
    won,
  };
}

function groupMatchesIntoEvents(
  rows: DbMatch[],
  createdBy: string
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
    const mapped = matches
      .map((m) => mapDbMatchToEventMatch(m, createdBy))
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (mapped.length === 0) continue;
    events.push({
      id: first.id,
      tournamentName: first.tournament_name ?? "Unknown event",
      date: formatDisplayDate(first.date),
      matchType: first.match_type ?? "Match",
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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
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

        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setEvents([]);
          return;
        }
        const list = (rows ?? []) as DbMatch[];
        setEvents(groupMatchesIntoEvents(list, user.id));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load matches");
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl h-fit">
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex flex-col">
          <p className="font-medium text-xl text-[#000000]">Recent Activity</p>
          <p className="font-normal text-sm text-[#999999] mt-1">
            Your Last 3 Events with Insights
          </p>
        </div>
        <button
          type="button"
          className="h-6 w-6 rounded-full bg-[#1D1D1F] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors"
          aria-label="View all"
        >
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-[#999999] text-sm">
          Loading…
        </div>
      )}

      {error && (
        <div className="py-6 text-center text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-12 px-4 text-center"
          data-state="empty"
        >
          <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
            <Inbox className="h-8 w-8 text-[#999999]" aria-hidden />
          </div>
          <p className="font-medium text-[#000000] mb-1">No matches yet</p>
          <p className="text-sm text-[#999999] max-w-[260px]">
            Upload your first match to see your recent activity and insights here.
          </p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-4">
          {events.map((event) => (
            <RecentMatches
              key={event.id}
              tournamentName={event.tournamentName}
              date={event.date}
              matchType={event.matchType}
              courtType={event.courtType ?? undefined}
              verificationStatus={event.verificationStatus ?? undefined}
              matches={event.matches}
            />
          ))}
        </div>
      )}
    </div>
  );
}
