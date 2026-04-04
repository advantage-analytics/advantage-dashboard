import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import KpiCards from "@/components/dashboard/home/kpi-cards";
import AIInsight from "@/components/dashboard/home/ai-insight";
import PerformanceProfile from "@/components/dashboard/home/performance-profile";
import WinRateCard from "@/components/dashboard/home/win-rate-card";
import MatchHeatmap from "@/components/dashboard/home/match-heatmap";
import { createClient } from "@/lib/supabase/server";
import { getOverallPerformance } from "@/lib/data/performance-server";

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

  const { kpiCards, winRate, form, matchCount, heatmap, performanceProfile, views } =
    performanceData;

  const overallView = views[0];

  return (
    <div className="flex-1 w-full bg-white">
      {/* Hero Background - Fixed to viewport */}
      <div
        className="absolute top-0 left-0 right-0 h-[320px] -z-0"
        style={{
          backgroundImage: [
            "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 30%)",
            "radial-gradient(ellipse at 80% 20%, rgba(57,134,243,0.06) 0%, transparent 60%)",
            "radial-gradient(ellipse at 20% 80%, rgba(57,134,243,0.04) 0%, transparent 60%)",
            "linear-gradient(138deg, #000 32%, #505050 100%)",
          ].join(", "),
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 px-8 pt-24">
        <HomeContent
          displayName={displayName}
          kpiStrip={kpiCards.length > 0 ? <KpiCards cards={kpiCards} /> : undefined}
          sidebar={
            <>
              <AIInsight />
              <PerformanceProfile dimensions={performanceProfile} />
              <WinRateCard
                value={winRate.value}
                change={winRate.change}
                sparkline={winRate.sparkline}
              />
              <MatchHeatmap
                heatmap={heatmap}
                matchCount={matchCount}
                wins={overallView.wins}
                losses={overallView.losses}
                form={form}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
