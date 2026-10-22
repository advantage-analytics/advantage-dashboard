import { Suspense } from "react";
import { redirect } from "next/navigation";
import HomeContent from "./home-content";
import { HomeDayZeroPage } from "./home-day-zero-page";
import { PresenceReport } from "@/components/dashboard/presence-provider";
import RecentActivity from "./recent-activity";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getWorkspacePresence } from "@/lib/workspace/presence-server";
import { getPersonalMatches } from "@/lib/data/personal-matches-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { getOverallPerformance } from "@/lib/data/performance-server";
import { getPersonalSeasonKpis } from "@/lib/data/personal-kpis-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { isUnlimitedCap } from "@/lib/data/usage-format";
import type { Workspace } from "@/lib/workspace/types";
import { getPersonalActivity } from "@/lib/data/personal-activity-server";
import {
  countViewerWins,
  loadRecentMatches,
  type DbRecentMatch,
} from "@/lib/data/home-recent-data";
import { loadHomeServes } from "@/lib/data/home-serve-data";
import { getAskPins } from "@/lib/data/ask-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { buildInsightEvidenceWithCaption } from "@/lib/ui/insight-evidence";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { SeasonTitle } from "@/components/dashboard/home/season-title";
import { ActivityWidget } from "@/components/dashboard/home/activity-widget";
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
  FocusCardPending,
} from "@/components/dashboard/loading/home-skeleton";
import { HomeWidgetFrame } from "@/components/dashboard/home/home-widget-frame";
import { AskPinCard } from "@/components/dashboard/home/ask-pin-card";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";

export const metadata = { title: "Home" };

export default async function Home() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  if (workspace.active.kind === "team") redirect("/dashboard/team");
  const supabase = await createClient();
  const userId = workspace.viewer.id;
  const billingMonth = currentBillingMonth();
  // Day zero is decided by the presence read — one `limit(1)` row, over the
  // same `created_by = me AND program_id IS NULL` predicate as the match list
  // below — rather than by awaiting every personal match before any region
  // can start. `cache()` makes this the layout's own in-flight read, not a
  // second one. Its failure answer is "present", which draws the populated
  // page and lets each widget's own empty state speak, never a false day zero
  // over somebody's data.
  const presence = await getWorkspacePresence(workspace);
  // Keeps the loading fallback's day-zero hint honest across navigation.
  const report = (
    <PresenceReport
      workspaceId={workspace.active.id}
      matches={presence.matches}
    />
  );
  // Day zero reads nothing further — see `HomeDayZeroPage`, which the route's
  // loading fallback also draws.
  if (!presence.matches) {
    return (
      <>
        {report}
        <HomeDayZeroPage userId={userId} />
      </>
    );
  }
  // Past this point the viewer has at least one match. The full list is
  // started, not awaited: only the regions that draw from it wait for it,
  // each inside its own Suspense boundary. Not bounded, deliberately — the
  // win/loss record, match count and season figures are totals over every
  // personal match, and `getOverallPerformance` shares this cached read; a
  // limit here would quietly change those numbers. The per-widget slices
  // below are the bounds.
  const matches = getPersonalMatches(userId);
  const resources = startHomeResources(
    supabase,
    workspace.active,
    matches,
    billingMonth,
  );
  return (
    <div className="flex w-full flex-1 flex-col bg-white">
      {report}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-8 pt-5 pb-8 xl:px-14">
        <HomeContent
          key={userId}
          hasMatches
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
              href="/dashboard/matches"
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
              href="/dashboard/matches"
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
            <FocusCardPending />,
            <Insight resources={resources} />,
          )}
          serves={
            <HomeWidgetFrame
              title="Serve placement"
              href="/dashboard/statistics"
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
          // The last card in the right column, and only while something is
          // pinned: no skeleton (a bar would promise a card most Home pages
          // never get) and no empty state (see `AskPinCard`). A failed read
          // is still the retry. When the right column is the taller one, the
          // Usage footer under the grid moves down as the card streams in —
          // accepted: the footer is a quiet last line read after everything
          // else, and a placeholder for a card most players never pin would
          // cost every page a gap to save a few of them one shift.
          pins={region("Pinned from Ask", null, <Pins resources={resources} />)}
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
  personal: Workspace,
  matches: ReturnType<typeof getPersonalMatches>,
  billingMonth: string,
) {
  // A personal workspace is keyed by its owner's id.
  const userId = personal.id;
  const performance = getOverallPerformance();
  const usage = getPersonalUsage(personal, billingMonth);
  const season = getPersonalSeasonKpis(userId);
  const activity = matches.then((rows) => getPersonalActivity(userId, rows));
  const players = getMyPlayerIds();
  const recent = Promise.all([players, matches]).then(([ids, rows]) =>
    loadRecentMatches(
      supabase,
      userId,
      ids,
      rows.slice(0, 50) as DbRecentMatch[],
    ),
  );
  const wonCount = Promise.all([players, matches]).then(([ids, rows]) =>
    countViewerWins(rows as DbRecentMatch[], ids, userId),
  );
  const serves = matches.then((rows) =>
    loadHomeServes(supabase, userId, rows.slice(0, 4)),
  );
  const pins = getAskPins(null, userId);
  return {
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
    pins,
  };
}
type HomeResources = ReturnType<typeof startHomeResources>;
async function Title({ resources }: { resources: HomeResources }) {
  const { matches, userId, performance, usage } = resources;
  const [p, u, rows] = await Promise.all([performance, usage, matches]);
  if (!u) return null;
  return (
    <SeasonTitle
      hasMatches
      matchCount={rows.length}
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
  const { recent, players, wonCount, userId, matches } = resources;
  const [events, ids, wins, rows] = await Promise.all([
    recent,
    players,
    wonCount,
    matches,
  ]);
  return (
    <RecentActivity
      userId={userId}
      playerIds={ids}
      hasMatches
      showEmptyAction
      matchCount={rows.length}
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
  const { performance, userId } = resources;
  const p = await performance;
  const evidence = p
    ? buildInsightEvidenceWithCaption(p.kpiCards, p.matchCount)
    : null;
  // Matches exist but none has analysed stats to build evidence from yet: the
  // honest zero state (empty anatomy, one line on what arrives), never a
  // fabricated finding and never a silently missing card.
  if (!p || !evidence)
    return (
      <FocusCard
        showStatisticsLink={false}
        footer={{ left: "One thing to work on, once a match is analysed." }}
      >
        <FocusEmpty />
      </FocusCard>
    );
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
async function Pins({ resources }: { resources: HomeResources }) {
  const pins = await resources.pins;
  // Absent, not empty — the card's own rule (`AskPinCard`).
  if (pins.length === 0) return null;
  return <AskPinCard pins={pins} />;
}
async function Footer({ resources }: { resources: HomeResources }) {
  const u = await resources.usage;
  // An admin's personal workspace has no cap to meter.
  if (!u || isUnlimitedCap(u.capSeconds)) return null;
  return (
    <UsageFooter
      usedSeconds={u.usedSeconds}
      capSeconds={u.capSeconds}
      billingMonth={u.billingMonth}
      creditSeconds={u.creditSeconds}
    />
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
