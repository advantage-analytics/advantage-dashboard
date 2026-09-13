"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  buildScoreString,
  didUserWin,
  formatDisplayDate,
  shortName,
  type MatchScore,
} from "@/lib/data/match-utils";

type ActivityKind =
  | "result-win"
  | "result-loss"
  | "streak-win"
  | "streak-loss"
  | "milestone";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Primary text, e.g. "Won vs. Smith" or "3-match win streak". */
  label: string;
  /** Trailing figure (score, %, count) set apart with tabular-nums. */
  detail?: string;
  timeAgo: string;
  /** When present, the row deep-links to a match and becomes clickable. */
  href?: string;
}

// Restrained rail palette: wins/win-streaks earn green, losses stay neutral
// gray (never red; these are facts, not alerts), milestones get accent blue.
// The rail is decorative (aria-hidden); the label text always states the
// meaning, so no information is carried by color alone.
const RAIL_COLORS: Record<ActivityKind, string> = {
  "result-win": "bg-[#5DB955]",
  "result-loss": "bg-[#AAAAAA]",
  "streak-win": "bg-[#5DB955]",
  "streak-loss": "bg-[#AAAAAA]",
  milestone: "bg-[#3B82F6]",
};

interface DbMatchLite {
  id: string;
  player1_id: string | null;
  player1_name: string;
  player2_name: string;
  date: string;
  score: MatchScore | null;
}

interface StatLite {
  match_id: string;
  is_player1: boolean;
  first_serve_pct: string | null;
  winners: number | null;
}

/** Most recent match → "Won vs. {opp}" + score detail / "Lost to {opp}". */
function buildResultItem(m: DbMatchLite, userId: string): ActivityItem {
  const isUserP1 = m.player1_id === userId;
  const opponent = shortName(isUserP1 ? m.player2_name : m.player1_name);
  const won = didUserWin(m.score, isUserP1);
  const scoreStr = buildScoreString(m.score, isUserP1);
  return {
    id: `result-${m.id}`,
    kind: won ? "result-win" : "result-loss",
    label: won ? `Won vs. ${opponent}` : `Lost to ${opponent}`,
    detail: scoreStr || undefined,
    timeAgo: formatDisplayDate(m.date),
    href: `/dashboard/matches/${m.id}`,
  };
}

/** Current win/loss streak from the leading run of same-result matches. */
function buildStreakItem(scored: DbMatchLite[], userId: string): ActivityItem | null {
  if (scored.length < 2) return null;
  const firstWon = didUserWin(scored[0].score, scored[0].player1_id === userId);
  let count = 0;
  for (const m of scored) {
    if (didUserWin(m.score, m.player1_id === userId) === firstWon) count++;
    else break;
  }
  if (count < 2) return null;
  return {
    id: `streak-${scored[0].id}`,
    kind: firstWon ? "streak-win" : "streak-loss",
    label: `${count}-match ${firstWon ? "win" : "loss"} streak`,
    timeAgo: formatDisplayDate(scored[0].date),
  };
}

/**
 * Honest milestone: only surfaced when the MOST RECENT match set or tied the
 * high across the fetched window (so it's genuine news, never a stale record).
 * Prefers first-serve %, falls back to winners. Needs ≥3 samples to be meaningful.
 */
function buildMilestoneItem(
  scored: DbMatchLite[],
  userStat: Map<string, StatLite>,
): ActivityItem | null {
  if (scored.length < 3) return null;
  const recent = scored[0];
  const recentStat = userStat.get(recent.id);
  if (!recentStat) return null;

  const firstServe = scored
    .map((m) => parseFloat(userStat.get(m.id)?.first_serve_pct ?? ""))
    .filter((v) => Number.isFinite(v));
  const recentFs = parseFloat(recentStat.first_serve_pct ?? "");
  if (Number.isFinite(recentFs) && firstServe.length >= 3 && recentFs >= Math.max(...firstServe)) {
    return {
      id: `milestone-fs-${recent.id}`,
      kind: "milestone",
      label: `Best 1st-serve %, last ${firstServe.length}`,
      detail: `${Math.round(recentFs)}%`,
      timeAgo: formatDisplayDate(recent.date),
      href: `/dashboard/matches/${recent.id}`,
    };
  }

  const winners = scored
    .map((m) => userStat.get(m.id)?.winners)
    .filter((w): w is number => typeof w === "number");
  const recentWinners = recentStat.winners;
  if (
    typeof recentWinners === "number" &&
    recentWinners > 0 &&
    winners.length >= 3 &&
    recentWinners >= Math.max(...winners)
  ) {
    return {
      id: `milestone-win-${recent.id}`,
      kind: "milestone",
      label: `Most winners, last ${winners.length}`,
      detail: `${recentWinners}`,
      timeAgo: formatDisplayDate(recent.date),
      href: `/dashboard/matches/${recent.id}`,
    };
  }

  return null;
}

/** Fill up to 3 slots preferring category diversity, then backfill with results. */
function selectItems(
  results: ActivityItem[],
  streak: ActivityItem | null,
  milestone: ActivityItem | null,
): ActivityItem[] {
  const selected: ActivityItem[] = [];
  const add = (item: ActivityItem | null) => {
    if (!item || selected.length >= 3) return;
    if (selected.some((s) => s.id === item.id || s.label === item.label)) return;
    selected.push(item);
  };
  add(results[0]); // newest result anchors the feed
  add(streak);
  add(milestone);
  for (let i = 1; i < results.length && selected.length < 3; i++) add(results[i]);
  return selected;
}

export default function ActivityFeed({ userId }: { userId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    try {
      const { data: matches, error: matchError } = await supabase
        .from("matches")
        .select("id, player1_id, player1_name, player2_name, date, score")
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(10);

      if (matchError) throw new Error(matchError.message);

      const list = (matches ?? []) as DbMatchLite[];
      // Only matches with a real score can become results/streaks.
      const scored = list.filter((m) => m.score?.player1?.length);
      if (scored.length === 0) {
        setItems([]);
        return;
      }

      // Attribute each stat row to the user (player1 vs player2 perspective).
      const { data: stats } = await supabase
        .from("match_stats_with_percentages")
        .select("match_id, is_player1, first_serve_pct, winners")
        .in("match_id", list.map((m) => m.id));

      const userStat = new Map<string, StatLite>();
      if (stats) {
        for (const stat of stats as StatLite[]) {
          const match = list.find((m) => m.id === stat.match_id);
          if (!match) continue;
          if (stat.is_player1 === (match.player1_id === userId)) {
            userStat.set(stat.match_id, stat);
          }
        }
      }

      const results = scored.map((m) => buildResultItem(m, userId));
      const streak = buildStreakItem(scored, userId);
      const milestone = buildMilestoneItem(scored, userStat);

      setItems(selectItems(results, streak, milestone));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch only when match processing completes (stats are ready)
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("match-processed", handler);
    return () => window.removeEventListener("match-processed", handler);
  }, [load]);

  if (loading) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden">
        <div className="flex items-center h-14 px-5">
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Mirror the loaded layout exactly (items-stretch, per-row padding,
            self-stretch rail) so nothing shifts when content swaps in. */}
        <div className="flex flex-col gap-1 px-5 pb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 items-stretch py-2.5">
              <Skeleton className="w-px self-stretch shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden">
        <div className="flex items-center h-14 px-5">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">ACTIVITY</p>
        </div>
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center" role="alert">
          <AlertCircle className="text-[#E51837] size-5 mb-2" aria-hidden />
          <p className="text-[12px] font-medium text-[#0D0D0D] mb-1">Failed to load activity</p>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
          >
            <RefreshCw className="size-3" aria-hidden />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden">
        <div className="flex items-center h-14 px-5">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">ACTIVITY</p>
        </div>
        <div className="flex items-center justify-center py-6 px-5">
          <p className="text-[12px] text-[#888888]">No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden">
      <div className="flex items-center h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          ACTIVITY
        </p>
      </div>

      <div className="flex flex-col gap-1 px-5 pb-5">
        {items.map((item) => {
          const rail = (
            <span
              aria-hidden="true"
              className={`w-px shrink-0 self-stretch ${RAIL_COLORS[item.kind]}`}
            />
          );
          const body = (
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className="text-[12px] font-normal text-[#525252] leading-[1.5] line-clamp-2">
                {item.label}
                {item.detail && (
                  <span className="ml-1.5 font-medium tabular-nums">{item.detail}</span>
                )}
              </p>
              <p className="text-[10px] font-normal text-[#767676]">{item.timeAgo}</p>
            </div>
          );

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={`${item.label}${item.detail ? ` ${item.detail}` : ""}, ${item.timeAgo}`}
                className="group flex gap-3 items-stretch rounded-lg px-2 -mx-2 py-2.5 transition-[background-color,transform] duration-200 ease-out hover:bg-[#FAFAFA] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1"
              >
                {rail}
                {body}
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 self-center text-[#CCCCCC] group-hover:text-[#888888] transition-colors duration-200"
                />
              </Link>
            );
          }

          return (
            <div key={item.id} className="flex gap-3 items-stretch py-2.5">
              {rail}
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
