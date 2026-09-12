import { Suspense } from "react";
import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import RecentActivity from "./recent-activity";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPersonalMatches } from "@/lib/data/personal-matches-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import { getPersonalSeasonKpis } from "@/lib/data/personal-kpis-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getPersonalActivity } from "@/lib/data/personal-activity-server";
import {
  countViewerWins,
  loadRecentMatches,
  type DbRecentMatch,
} from "@/lib/data/home-recent-data";
import { loadHomeServes } from "@/lib/data/home-serve-data";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { buildInsightEvidenceWithCaption } from "@/lib/ui/insight-evidence";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { SeasonTitle } from "@/components/dashboard/home/season-title";
import { ActivityWidget } from "@/components/dashboard/home/activity-widget";
import { SetupLine } from "@/components/dashboard/home/setup-line";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";
import {
  HomeTitlePending,
  HomeKpisPending,
  HomeActivityBodyPending,
  HomeRecentBodyPending,
  HomeServesPending,
  HomeFooterPending,
} from "@/components/dashboard/loading/home-skeleton";
import { HomeWidgetFrame } from "@/components/dashboard/home/home-widget-frame";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";

export default async function Home() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  if (workspace.active.kind === "team") redirect("/dashboard/team");
  const supabase = await createClient();
  const userId = workspace.viewer.id;
  const billingMonth = currentBillingMonth();
  // Shared base rows are the only layout prerequisite. The analytics loader
  // reuses this cached query, rather than issuing an extra existence check.
  const matches = await getPersonalMatches(userId);
  const resources = startHomeResources(supabase, userId, matches, billingMonth);
  const { hasMatches } = resources;
  return (
    <div className="flex w-full flex-1 flex-col bg-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
        <HomeContent
          key={userId}
          hasMatches={hasMatches}
          title={region(
            "Season summary",
            <HomeTitlePending />,
            <Title resources={resources} />,
          )}
          kpiStrip={region(
            "Season statistics",
            <HomeKpisPending />,
            <Kpis resources={resources} />,
          )}
          recent={
            <HomeWidgetFrame
              title="Recent matches"
              href={hasMatches ? "/dashboard/matches" : undefined}
              action="All matches"
              className="@container/matches"
            >
              {region(
                "Recent matches",
                <HomeRecentBodyPending />,
                <Recent resources={resources} />,
              )}
            </HomeWidgetFrame>
          }
          activity={
            <HomeWidgetFrame
              title="Activity"
              href={hasMatches ? "/dashboard/matches" : undefined}
              action="Session log"
              className="@container/activity flex flex-col gap-1.5"
            >
              {region(
                "Activity",
                <HomeActivityBodyPending />,
                <Activity resources={resources} />,
              )}
            </HomeWidgetFrame>
          }
          insight={region(
            "Advantage Intelligence",
            null,
            <Insight resources={resources} />,
          )}
          serves={
            <HomeWidgetFrame
              title="Serve placement"
              href={hasMatches ? "/dashboard/statistics" : undefined}
              action="Placement view"
              className="flex flex-col gap-3"
            >
              {region(
                "Serve placement",
                <HomeServesPending />,
                <Serves resources={resources} />,
              )}
            </HomeWidgetFrame>
          }
          footer={region(
            "Usage",
            <HomeFooterPending />,
            <Footer resources={resources} />,
          )}
        />
      </div>
    </div>
  );
}

function startHomeResources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  matches: Awaited<ReturnType<typeof getPersonalMatches>>,
  billingMonth: string,
) {
  const hasMatches = matches.length > 0;
  const performance = hasMatches
    ? getOverallPerformance()
    : Promise.resolve(null);
  const usage = hasMatches
    ? getPersonalUsage(userId, billingMonth)
    : Promise.resolve(null);
  const season = hasMatches
    ? getPersonalSeasonKpis(userId)
    : Promise.resolve({ kpis: [], hasStats: false, matchesPlayed: 0 });
  const activity = getPersonalActivity(userId, matches);
  const players = hasMatches ? getMyPlayerIds() : Promise.resolve([userId]);
  const recent = players.then((ids) =>
    hasMatches
      ? loadRecentMatches(
          supabase,
          userId,
          ids,
          matches.slice(0, 50) as DbRecentMatch[],
        )
      : [],
  );
  const wonCount = players.then((ids) =>
    countViewerWins(matches as DbRecentMatch[], ids, userId),
  );
  const serves = hasMatches
    ? loadHomeServes(supabase, userId, matches.slice(0, 4))
    : Promise.resolve({ dots: [], matchCount: 0 });
  const setup = hasMatches
    ? Promise.all([
        supabase
          .from("users")
          .select("hand, backhand")
          .eq("id", userId)
          .single(),
        supabase
          .from("user_preferences")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
      ])
    : Promise.resolve(null);
  return {
    hasMatches,
    matches,
    userId,
    performance,
    usage,
    season,
    recent,
    wonCount,
    players,
    activity,
    serves,
    setup,
  };
}
type HomeResources = ReturnType<typeof startHomeResources>;
async function Title({ resources }: { resources: HomeResources }) {
  const { hasMatches, matches, userId, performance, usage } = resources;
  const [p, u] = await Promise.all([performance, usage]);
  if (!u) return null;
  return (
    <SeasonTitle
      hasMatches={hasMatches}
      matchCount={matches.length}
      analyzedMatchCount={p?.analyzedMatchCount ?? 0}
      usage={u}
      userId={userId}
    />
  );
}
async function Kpis({ resources }: { resources: HomeResources }) {
  const { season } = resources;
  const data = await season;
  return (
    <SeasonKpiStrip
      kpis={data.kpis}
      hasStats={data.hasStats}
      matchesPlayed={data.matchesPlayed}
    />
  );
}
async function Recent({ resources }: { resources: HomeResources }) {
  const { recent, players, wonCount, userId, hasMatches, matches } = resources;
  const [events, ids, wins] = await Promise.all([recent, players, wonCount]);
  return (
    <RecentActivity
      userId={userId}
      playerIds={ids}
      hasMatches={hasMatches}
      showEmptyAction={hasMatches}
      matchCount={matches.length}
      wonCount={wins}
      initialEvents={events}
    />
  );
}
async function Activity({ resources }: { resources: HomeResources }) {
  const { activity } = resources;
  return <ActivityWidget activity={await activity} />;
}
async function Serves({ resources }: { resources: HomeResources }) {
  return <ServePlacementHome initialData={await resources.serves} />;
}
async function Insight({ resources }: { resources: HomeResources }) {
  const { hasMatches, performance, userId } = resources;
  if (!hasMatches)
    return (
      <FocusCard
        showStatisticsLink={false}
        footer={{ left: "One thing to work on, after your first match." }}
      >
        <FocusEmpty />
      </FocusCard>
    );
  const p = await performance;
  if (!p) return null;
  const evidence = buildInsightEvidenceWithCaption(p.kpiCards, p.matchCount);
  // This card is conditional in the approved design. Do not reserve a fake
  // populated card before its evidence establishes that it belongs here.
  if (!evidence) return null;
  return (
    <FocusCard
      footer={{
        left: evidence.caption,
        right: `${p.analyzedMatchCount} ${p.analyzedMatchCount === 1 ? "match" : "matches"}`,
      }}
    >
      <HomeAiInsight
        evidence={evidence.parts}
        cacheSignature={`${userId}:${p.matchCount}:${p.winRate.value}:${p.form.join("")}`}
      />
    </FocusCard>
  );
}
async function Footer({ resources }: { resources: HomeResources }) {
  const { setup, usage } = resources;
  const [profile, u] = await Promise.all([setup, usage]);
  if (!profile || !u) return null;
  const [{ data: user }, { data: preferences }] = profile;
  return (
    <>
      <SetupLine
        setup={{
          playingProfile: Boolean(user?.hand && user?.backhand),
          notifications: Boolean(preferences),
        }}
      />
      <UsageFooter
        usedSeconds={u.usedSeconds}
        capSeconds={u.capSeconds}
        billingMonth={u.billingMonth}
      />
    </>
  );
}

const region = (
  label: string,
  fallback: React.ReactNode,
  content: React.ReactNode,
) => (
  <WidgetBoundary label={label}>
    <Suspense fallback={fallback}>{content}</Suspense>
  </WidgetBoundary>
);
