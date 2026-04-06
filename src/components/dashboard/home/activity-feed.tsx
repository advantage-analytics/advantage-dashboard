"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ActivityItem {
  id: string;
  type: "milestone" | "alert" | "system";
  message: string;
  timeAgo: string;
}

const INDICATOR_COLORS: Record<ActivityItem["type"], string> = {
  milestone: "bg-[#3B82F6]",
  alert: "bg-[#E51837]",
  system: "bg-[#AAAAAA]",
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
}

export default function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        return;
      }

      // Fetch recent matches to generate activity items
      const { data: matches } = await supabase
        .from("matches")
        .select("id, player2_name, date, score, player1_id")
        .eq("created_by", user.id)
        .order("date", { ascending: false })
        .limit(10);

      if (!matches || matches.length === 0) {
        setItems([]);
        return;
      }

      // Fetch match stats for milestone detection
      const matchIds = matches.map((m) => m.id);
      const { data: stats } = await supabase
        .from("match_stats_with_percentages")
        .select("match_id, is_player1, first_serve_pct, break_points_saved_pct")
        .in("match_id", matchIds);

      const activities: ActivityItem[] = [];

      // Find personal bests and declines from stats
      if (stats && stats.length > 0) {
        const userStats = stats.filter((s) => {
          const match = matches.find((m) => m.id === s.match_id);
          if (!match) return false;
          const isPlayer1 = match.player1_id === user.id;
          return s.is_player1 === isPlayer1;
        });

        // Check for best first serve percentage
        let bestFirstServe = 0;
        let bestFirstServeMatch: (typeof matches)[0] | null = null;
        for (const stat of userStats) {
          const pct = parseFloat(stat.first_serve_pct ?? "0");
          if (pct > bestFirstServe) {
            bestFirstServe = pct;
            bestFirstServeMatch = matches.find((m) => m.id === stat.match_id) ?? null;
          }
        }
        if (bestFirstServeMatch && bestFirstServe > 0) {
          activities.push({
            id: `milestone-${bestFirstServeMatch.id}`,
            type: "milestone",
            message: `Personal best: ${Math.round(bestFirstServe)}% first serve in a match this season`,
            timeAgo: formatTimeAgo(new Date(bestFirstServeMatch.date)),
          });
        }

        // Check for break point save rate decline
        const bpRates = userStats
          .map((s) => parseFloat(s.break_points_saved_pct ?? "0"))
          .filter((v) => v > 0);
        if (bpRates.length >= 3) {
          const recent3 = bpRates.slice(0, 3);
          const declining = recent3.every((v, i) => i === 0 || v <= recent3[i - 1]);
          if (declining && recent3[2] < recent3[0]) {
            activities.push({
              id: "alert-bp-decline",
              type: "alert",
              message: "Three-match decline in break point save rate",
              timeAgo: formatTimeAgo(new Date(matches[0].date)),
            });
          }
        }
      }

      // Add system messages for recent processed matches
      const recentMatch = matches[0];
      if (recentMatch) {
        activities.push({
          id: `system-${recentMatch.id}`,
          type: "system",
          message: `Match vs. ${recentMatch.player2_name} processed and analyzed`,
          timeAgo: formatTimeAgo(new Date(recentMatch.date)),
        });
      }

      setItems(activities.slice(0, 3));
    } catch {
      setItems([]);
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

  if (loading || items.length === 0) return null;

  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[16px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden py-5">
      <div className="px-5 mb-4">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          ACTIVITY
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 items-stretch px-5 py-1.5"
          >
            <div className="flex flex-row items-center">
              <div
                className={`w-px self-stretch rounded-full ${INDICATOR_COLORS[item.type]}`}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <p className="text-[12px] font-light text-[#71717A] leading-[1.5]">
                {item.message}
              </p>
              <p className="text-[10px] font-normal text-[#AAAAAA] capitalize">
                {item.timeAgo}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
