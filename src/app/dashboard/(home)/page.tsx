import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import KpiCards from "@/components/dashboard/home/kpi-cards";
import { createClient } from "@/lib/supabase/server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import type { KpiCardData } from "@/lib/data/performance-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { buildInsightEvidence } from "@/lib/ui/insight-evidence";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId = data.claims.sub;
  const billingMonth = currentBillingMonth();
  const [{ data: user }, performanceData, myPlayerIds, usage] = await Promise.all([
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", userId)
      .single(),
    getOverallPerformance(),
    // Which ids mean "me" on a match row. `cache()`d, so the several readers on
    // this page share one round trip.
    getMyPlayerIds(),
    getPersonalUsage(userId, billingMonth),
  ]);

  // Real name only — when absent, the greeting drops the name rather than
  // showing a "Player" placeholder.
  const displayName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ");

  const { kpiCards, winRate, form, matchCount } = performanceData;
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

  // The Focus card's evidence line, composed here from the same computed KPI
  // movers the strip above it renders. The model never sees this sentence and
  // never writes a figure — it supplies only the claim above it. `null` when
  // there is no movement to report, which is what keeps the card off the page
  // entirely rather than letting it reach for something to say.
  const insightEvidence = buildInsightEvidence(kpiCards, matchCount);

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
          playerIds={myPlayerIds}
          kpiStrip={allKpiCards.length > 0 ? <KpiCards cards={allKpiCards} matchCount={matchCount} /> : undefined}
          usage={usage}
          matchCount={matchCount}
          insightEvidence={insightEvidence}
          insightSignature={insightSignature}
        />
      </div>
    </div>
  );
}
