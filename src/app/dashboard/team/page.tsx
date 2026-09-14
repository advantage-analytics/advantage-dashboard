import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  canManageTeamSchedule,
  canUploadForProgram,
  isProgramStaff,
} from "@/lib/workspace/types";
import {
  getTeamHomePresence,
  getTeamHomeResources,
} from "@/lib/data/team-home-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import {
  NewMatchAction,
  TeamSeasonTitle,
} from "@/components/dashboard/team/team-season-title";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { DualSheet } from "@/components/dashboard/team/dual-sheet";
import { DualSheetEmpty } from "@/components/dashboard/team/dual-sheet-empty";
import { TopMovers } from "@/components/dashboard/team/top-movers";
import { DualHistory } from "@/components/dashboard/team/dual-history";
import { CourtRecord } from "@/components/dashboard/team/court-record";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import { FocusCardPending } from "@/components/dashboard/loading/home-skeleton";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { TeamSetupLine } from "@/components/dashboard/team/team-setup-line";
import { TeamHomeDayZeroPage } from "@/components/dashboard/team/team-home-day-zero-page";
import { PresenceReport } from "@/components/dashboard/presence-provider";

import { topMovers } from "@/lib/data/team-movers";
import { TopMoversFrame } from "@/components/dashboard/team/top-movers";
import { CourtRecordFrame } from "@/components/dashboard/team/court-record";
import { DualHistoryFrame } from "@/components/dashboard/team/dual-history";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import {
  HomeKpisPending,
  HomeFooterPending,
} from "@/components/dashboard/loading/home-skeleton";
import {
  TeamHomeFrame,
  TeamTitlePending,
  DualPending,
  MoversBodyPending,
  CourtBodyPending,
  HistoryBodyPending,
} from "@/components/dashboard/loading/team-home-skeleton";

export const metadata = { title: "Team Home" };
type Resources = ReturnType<typeof getTeamHomeResources>;

/** Known card frames render immediately; each resource fills its own region. */
export default async function TeamHomePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  // Both start together: on a client navigation the layout does not re-run,
  // so presence is not cached and awaiting it first would add a round trip to
  // every populated visit.
  const presence = getTeamHomePresence(active.id);
  const resources = getTeamHomeResources(
    active.id,
    currentBillingMonth(),
    active.orgType,
  );
  const state = await presence;
  const isStaff = isProgramStaff(active);
  const isDayZero = !state.hasMatches && !state.hasRoster && !state.hasSchedule;
  // Keeps the loading fallback's day-zero hint honest across navigation.
  const report = (
    <PresenceReport
      workspaceId={active.id}
      matches={state.hasMatches}
      roster={state.hasRoster}
      duals={state.hasSchedule}
    />
  );

  // Day zero reads nothing: every card's empty anatomy is the whole truth for
  // a program with no match, player or dual (see `TeamHomeDayZeroPage`), and
  // the route's loading fallback draws the same page. The resources already
  // started are left to settle unobserved.
  if (isDayZero) {
    for (const pending of Object.values(resources)) pending.catch(() => {});
    return (
      <>
        {report}
        <TeamHomeDayZeroPage canManage={isStaff} teamName={active.name} />
      </>
    );
  }

  const action = (
    <NewMatchAction
      canUpload={canUploadForProgram(active)}
      canSubmitVideo={active.canSubmitVideo}
    />
  );

  const kpis = region(
    "Program summary",
    <HomeKpisPending />,
    <Kpis resources={resources} />,
  );
  const dual = region(
    "Dual",
    <DualPending />,
    <Dual resources={resources} canSchedule={canManageTeamSchedule(active)} />,
  );
  const movers = region(
    "Top movers",
    <TopMoversFrame>
      <MoversBodyPending />
    </TopMoversFrame>,
    <Movers resources={resources} canManage={isStaff} />,
  );
  const insight = region(
    "Advantage Intelligence",
    <FocusCardPending />,
    <Insight resources={resources} programId={active.id} />,
  );
  const court = region(
    "Court record",
    <CourtRecordFrame>
      <CourtBodyPending />
    </CourtRecordFrame>,
    <Court resources={resources} />,
  );
  const history = region(
    "Dual match history",
    <DualHistoryFrame>
      <HistoryBodyPending />
    </DualHistoryFrame>,
    <History resources={resources} teamName={active.name} />,
  );
  const setupLine = isStaff
    ? region("Getting set up", null, <Setup resources={resources} />)
    : null;

  return (
    <>
      {report}
      <TeamHomeFrame
        key={`${workspace.viewer.id}:${active.id}`}
        title={region(
          "Team summary",
          <TeamTitlePending action={action} />,
          <Title resources={resources} action={action} />,
        )}
        setupLine={setupLine}
        kpis={kpis}
        dual={dual}
        movers={movers}
        insight={insight}
        court={court}
        history={history}
        footer={region(
          "Team usage",
          <HomeFooterPending />,
          <Footer resources={resources} />,
        )}
      />
    </>
  );
}
function awaiting(data: Awaited<Resources["analytics"]>) {
  return (
    data.matchCount > 0 &&
    data.analyzedCount === 0 &&
    data.firstReport?.state === "progress"
  );
}
async function Title({
  resources,
  action,
}: {
  resources: Resources;
  action: ReactNode;
}) {
  const [data, usage] = await Promise.all([
    resources.analytics,
    resources.usage,
  ]);
  return (
    <TeamSeasonTitle
      matchCount={data.matchCount}
      analyzedCount={data.analyzedCount}
      newResults={data.newResults}
      usage={usage}
      awaitingReport={awaiting(data)}
      action={action}
    />
  );
}
async function Kpis({ resources }: { resources: Resources }) {
  const data = await resources.analytics;
  return (
    <SeasonKpiStrip
      kpis={data.kpiCards}
      hasStats={data.kpiHasStats}
      matchesPlayed={data.kpiMatchCount}
      awaitingReport={awaiting(data)}
      emptyHint={
        data.analyzedCount > 0 && !awaiting(data)
          ? "After your first dual match"
          : undefined
      }
      ariaLabel="Program summary"
    />
  );
}
async function Dual({
  resources,
  canSchedule,
}: {
  resources: Resources;
  canSchedule: boolean;
}) {
  const { weekendDual } = await resources.schedule;
  return weekendDual ? (
    <DualSheet dual={weekendDual} />
  ) : (
    <DualSheetEmpty canSchedule={canSchedule} />
  );
}
async function Movers({
  resources,
  canManage,
}: {
  resources: Resources;
  canManage: boolean;
}) {
  const roster = await resources.roster;
  return (
    <TopMovers
      movers={topMovers(roster.members)}
      rosterSize={
        roster.members.filter((member) => member.role === "player").length
      }
      canManage={canManage}
    />
  );
}
async function Court({ resources }: { resources: Resources }) {
  return <CourtRecord record={(await resources.schedule).courtRecord} />;
}
async function History({
  resources,
  teamName,
}: {
  resources: Resources;
  teamName: string;
}) {
  const { dualHistory, dualForm, dualWins, decidedDuals } =
    await resources.schedule;
  return (
    <DualHistory
      rows={dualHistory}
      form={{
        form: dualForm,
        wins: dualWins,
        losses: decidedDuals.length - dualWins,
      }}
      teamName={teamName}
    />
  );
}
async function Insight({
  resources,
  programId,
}: {
  resources: Resources;
  programId: string;
}) {
  const { insight, kpiMatchCount, kpiCards, matchCount } =
    await resources.analytics;
  if (insight)
    return (
      <FocusCard
        showStatisticsLink
        footer={{
          left: insight.caption,
          right: `${kpiMatchCount} ${kpiMatchCount === 1 ? "match" : "matches"}`,
        }}
      >
        <HomeAiInsight
          evidence={insight.parts}
          cacheSignature={`${programId}:${kpiMatchCount}:${kpiCards.map((card) => card.value).join(",")}`}
          endpoint="/api/team-insight"
        />
      </FocusCard>
    );
  return (
    <FocusCard
      showStatisticsLink={matchCount > 0}
      footer={{
        left:
          matchCount === 0
            ? "One thing to work on, after the first dual."
            : "One thing to work on, once a match is analysed.",
      }}
    >
      <FocusEmpty />
    </FocusCard>
  );
}
async function Footer({ resources }: { resources: Resources }) {
  const usage = await resources.usage;
  return (
    <UsageFooter
      usedSeconds={usage.usedSeconds}
      capSeconds={usage.capSeconds}
      billingMonth={usage.billingMonth}
      dualWeekends
      note="free through Dec 31, 2026"
    />
  );
}
async function Setup({ resources }: { resources: Resources }) {
  const [roster, schedule, analytics] = await Promise.all([
    resources.roster,
    resources.schedule,
    resources.analytics,
  ]);
  return (
    <TeamSetupLine
      setup={{
        roster: roster.members.some((member) => member.role === "player"),
        schedule: schedule.scheduleRows.some((row) => row.kind === "dual"),
        report: analytics.firstReport !== null,
      }}
    />
  );
}
function region(label: string, fallback: ReactNode, children: ReactNode) {
  return (
    <WidgetBoundary label={label}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </WidgetBoundary>
  );
}
