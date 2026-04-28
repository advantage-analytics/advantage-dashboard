import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import KpiCards from "@/components/dashboard/home/kpi-cards";
import AIInsight from "@/components/dashboard/home/ai-insight";

import MatchHeatmap from "@/components/dashboard/home/match-heatmap";
import ActivityFeed from "@/components/dashboard/home/activity-feed";
import { createClient } from "@/lib/supabase/server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import type { KpiCardData } from "@/lib/data/performance-server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/login");
  }

  // Fetch user profile and performance data in parallel
  const userId = data.claims.sub;
  const [{ data: user }, performanceData] = await Promise.all([
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", userId)
      .single(),
    getOverallPerformance(),
  ]);

  // Build display name with fallback
  const displayName =
    user?.first_name || user?.last_name
      ? [user.first_name, user.last_name].filter(Boolean).join(" ")
      : "Player";

  const { kpiCards, winRate, form, matchCount, heatmap, views } =
    performanceData;

  const overallView = views[0];
  const hasMatches = matchCount > 0;

  const allKpiCards: KpiCardData[] = [
    ...kpiCards,
    {
      key: "win-rate",
      label: "Win Rate",
      value: `${winRate.value}%`,
      change: winRate.change,
      changeLabel: "last 30 days",
      sparkline: winRate.sparkline,
      description: "Percentage of matches won overall",
      category: "Other",
    },
  ];

  // Compute greeting server-side to avoid hydration flash
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 w-full bg-white">
      <div className="px-8 py-10">
        <HomeContent
          displayName={displayName}
          greeting={greeting}
          hasMatches={hasMatches}
          userId={userId}
          kpiStrip={allKpiCards.length > 0 ? <KpiCards cards={allKpiCards} matchCount={matchCount} /> : undefined}
          sidebar={hasMatches ? (
            <>
              <AIInsight />
              <MatchHeatmap
                heatmap={heatmap}
                matchCount={matchCount}
                wins={overallView.wins}
                losses={overallView.losses}
                form={form}
              />
              <ActivityFeed userId={userId} />
            </>
          ) : undefined}
        />
      </div>
    </div>
  );
}
