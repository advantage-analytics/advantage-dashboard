import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import type { SetupProgress } from "@/components/dashboard/home/setup-line";
import { createClient } from "@/lib/supabase/server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import { getPersonalSeasonKpis } from "@/lib/data/personal-kpis-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getPersonalActivity } from "@/lib/data/personal-activity-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { buildInsightEvidenceWithCaption } from "@/lib/ui/insight-evidence";

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
    season,
  ] = await Promise.all([
    // `hand` and `backhand` are the getting-set-up checklist's first answer.
    // The name used to ride along here for the page's greeting; that greeting
    // now lives in the header (Platform Audit Pa2), which reads the viewer the
    // layout already resolved.
    supabase.from("users").select("hand, backhand").eq("id", userId).single(),
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
    // The season strip's five tiles — the same strip a team player's profile
    // draws, over the personal matches above.
    getPersonalSeasonKpis(userId),
  ]);

  const { kpiCards, winRate, form, matchCount, analyzedMatchCount, wonCount } =
    performanceData;
  const hasMatches = matchCount > 0;

  // The Focus card's evidence line, composed here from the same computed KPI
  // movers the strip above it renders. The model never sees this sentence and
  // never writes a figure — it supplies only the claim above it. `null` when
  // there is no movement to report, which is what keeps the card off the page
  // entirely rather than letting it reach for something to say.
  const insight = buildInsightEvidenceWithCaption(kpiCards, matchCount);

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
    notifications: Boolean(savedPreferences),
  };

  return (
    <div className="flex w-full flex-1 flex-col bg-white">
      {/* `w-full` alongside `mx-auto`: auto side margins on a column flex item
          switch off the stretch that would otherwise size it, so without an
          explicit width the container would shrink to fit its content.

          20px top and 56px sides are Platform Audit Pa2's content column,
          which tightened 21a's 32px vertical padding so the usage footer sits
          above the fold at 1440×900. The max-width never binds at that size;
          it only stops the column running edge to edge on a much wider
          monitor.

          **The bottom is 32px, not the frame's 10px.** That is the one
          measurement the artboard cannot be copied on: on the canvas the 10px
          sits inside a rounded 900px card, where it reads as a margin, and in
          a browser it is the last 10px before the window edge, where the
          footer reads as clipped rather than placed. Every sibling page runs
          32-40px here, and Team Home — which draws this exact `UsageFooter` —
          runs 32px, so the footer now sits at the same height above the fold
          in both workspaces instead of two. */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
        <HomeContent
          hasMatches={hasMatches}
          userId={userId}
          playerIds={myPlayerIds}
          // One strip, shared with a team player's profile (Platform Audit
          // `Te`): Record, First serve in, 1st serve won, Break pts won, Games
          // won — the viewer's own numbers, trends from their second match.
          // It draws itself empty until a match has statistics, so the page a
          // player learns on day zero is the page they keep; a first match
          // still in the pipeline reads "When the report lands", not a promise
          // about a match that has not been analysed once.
          kpiStrip={
            <SeasonKpiStrip
              kpis={season.kpis}
              hasStats={season.hasStats}
              matchesPlayed={season.matchesPlayed}
            />
          }
          usage={usage}
          matchCount={matchCount}
          analyzedMatchCount={analyzedMatchCount}
          wonCount={wonCount}
          insightEvidence={insight?.parts ?? null}
          insightCaption={insight?.caption ?? null}
          insightSignature={insightSignature}
          activity={activity}
          setup={setup}
        />
      </div>
    </div>
  );
}
