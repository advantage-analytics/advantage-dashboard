import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import KpiCards from "@/components/dashboard/home/kpi-cards";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";

import MatchHeatmap from "@/components/dashboard/home/match-heatmap";
import ActivityFeed from "@/components/dashboard/home/activity-feed";
import { createClient } from "@/lib/supabase/server";
import {
  getOverallPerformance,
  getTopKpiMovers,
} from "@/lib/data/performance-server";
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

  // Real name only — when absent, the greeting drops the name rather than
  // showing a "Player" placeholder.
  const displayName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ");

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

  // Deterministic evidence chips for the AI insight — the same top movers the
  // insight prompt narrates, sourced from real computed stats (never LLM text).
  const insightStats = getTopKpiMovers(kpiCards, 2);

  // Signature of the data the insight is built from. When a new match is uploaded
  // (and processed), these change, busting the client-side insight cache so the
  // card regenerates instead of showing the stale session-cached text.
  const insightSignature = `${matchCount}:${winRate.value}:${form.join("")}`;

  // Compute greeting server-side to avoid hydration flash
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 w-full bg-white">
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        <HomeContent
          displayName={displayName}
          greeting={greeting}
          hasMatches={hasMatches}
          userId={userId}
          kpiStrip={allKpiCards.length > 0 ? <KpiCards cards={allKpiCards} matchCount={matchCount} /> : undefined}
          sidebar={hasMatches ? (
            <>
              <AiInsightCard storageKey="advantage-ai-insight-dismissed">
                <HomeAiInsight
                  supportingStats={insightStats}
                  cacheSignature={insightSignature}
                />
              </AiInsightCard>
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
