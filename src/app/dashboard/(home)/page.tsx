import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import KpiCards from "@/components/dashboard/home/kpi-cards";
import type { SetupProgress } from "@/components/dashboard/home/empty-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import type { KpiCardData } from "@/lib/data/performance-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getPersonalActivity } from "@/lib/data/personal-activity-server";
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
  const [
    { data: user },
    performanceData,
    myPlayerIds,
    usage,
    { data: savedPreferences },
    activity,
  ] = await Promise.all([
    // `hand` and `backhand` are the getting-set-up checklist's first answer.
    // The name used to ride along here for the page's greeting; that greeting
    // now lives in the header (Platform Audit Pa2), which reads the viewer the
    // layout already resolved.
    supabase
      .from("users")
      .select("hand, backhand")
      .eq("id", userId)
      .single(),
    getOverallPerformance(),
    // Which ids mean "me" on a match row. `cache()`d, so the several readers on
    // this page share one round trip.
    getMyPlayerIds(),
    getPersonalUsage(userId, billingMonth),
    // Has this account ever saved Settings › Preferences?
    //
    // `user_preferences` carries a NOT NULL default on every column and has no
    // row until the first save, so the row's existence IS the answer to "have
    // you chosen how you're notified" — the values cannot answer it, because
    // the defaults a saver kept are byte-identical to the defaults a stranger
    // never saw. RLS on this table is own-row only in all three directions;
    // the filter states that rather than leaning on it.
    supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    // 52-week match-day heatmap for the Activity widget. Personal scope only
    // (created_by = me AND program_id IS NULL), matching the Matches list.
    getPersonalActivity(userId),
  ]);

  const { kpiCards, winRate, form, matchCount, analyzedMatchCount } =
    performanceData;
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

  // The getting-set-up checklist's three answers, each a persisted fact rather
  // than a local flag — so the list is right on a second device, and a step
  // stays done after a sign-out.
  const setup: SetupProgress = {
    // Both, not either: a hand without a backhand orients half the analysis,
    // and the row asks for the pair.
    playingProfile: Boolean(user?.hand && user?.backhand),
    // False everywhere the empty state actually renders — it renders only when
    // this is false. Passed anyway; see `SetupProgress`.
    firstMatch: hasMatches,
    notifications: Boolean(savedPreferences),
  };

  return (
    <div className="flex flex-1 w-full flex-col bg-white">
      {/* `w-full` alongside `mx-auto`: auto side margins on a column flex item
          switch off the stretch that would otherwise size it, so without an
          explicit width the container would shrink to fit its content.

          20px 56px 10px — the content column of Platform Audit Pa2 (and Pa,
          the audit's as-built mirror), which tightened 21a's 32px vertical
          padding so the usage footer sits above the fold at 1440×900. The
          max-width never binds at that size; it only stops the column
          running edge to edge on a much wider monitor. */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-2.5">
        <HomeContent
          hasMatches={hasMatches}
          userId={userId}
          playerIds={myPlayerIds}
          kpiStrip={allKpiCards.length > 0 ? <KpiCards cards={allKpiCards} matchCount={matchCount} /> : undefined}
          usage={usage}
          matchCount={matchCount}
          analyzedMatchCount={analyzedMatchCount}
          insightEvidence={insightEvidence}
          insightSignature={insightSignature}
          activity={activity}
          setup={setup}
        />
      </div>
    </div>
  );
}
