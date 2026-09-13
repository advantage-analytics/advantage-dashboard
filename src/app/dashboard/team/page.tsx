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
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { TeamSetupLine } from "@/components/dashboard/team/team-setup-line";
import { TeamDayZeroHome } from "@/components/dashboard/team/team-day-zero-home";

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
  TeamHomeRegions,
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
  const presence = getTeamHomePresence(active.id);
  const resources = getTeamHomeResources(
    active.id,
    currentBillingMonth(),
    active.orgType,
  );
  const isStaff = isProgramStaff(active);
  const action = (
    <NewMatchAction
      canUpload={canUploadForProgram(active)}
      canSubmitVideo={active.canSubmitVideo}
    />
  );
  const state = await presence;
  const isDayZero = !state.hasMatches && !state.hasRoster && !state.hasSchedule;
  const kpis = region(
    "Program summary",
    <HomeKpisPending />,
    <Kpis resources={resources} />,
  );
  const dual = region(
    "Dual",
    <DualPending />,
    <Dual
      resources={resources}
      canSchedule={canManageTeamSchedule(active)}
      isPreview={isDayZero}
    />,
  );
  const movers = region(
    "Top movers",
    <TopMoversFrame isPreview={isDayZero}>
      <MoversBodyPending />
    </TopMoversFrame>,
    <Movers resources={resources} canManage={isStaff} isPreview={isDayZero} />,
  );
  const insight = region(
    "Advantage Intelligence",
    null,
    <Insight
      resources={resources}
      programId={active.id}
      isPreview={isDayZero}
    />,
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
    <DualHistoryFrame isPreview={isDayZero}>
      <HistoryBodyPending />
    </DualHistoryFrame>,
    <History
      resources={resources}
      teamName={active.name}
      isPreview={isDayZero}
    />,
  );

  if (isDayZero) {
    return (
      <div className="w-full flex-1 bg-[var(--surface-card)]">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-14 pt-5 pb-8">
          <TeamDayZeroHome canManage={isStaff}>
            <TeamHomeRegions
              kpis={kpis}
              dual={dual}
              movers={movers}
              insight={insight}
              court={court}
              history={history}
            />
          </TeamDayZeroHome>
        </div>
      </div>
    );
  }

  return (
    <TeamHomeFrame
      key={`${workspace.viewer.id}:${active.id}`}
      title={region(
        "Team summary",
        <TeamTitlePending action={action} />,
        <Title resources={resources} action={action} />,
      )}
      kpis={kpis}
      dual={dual}
      movers={movers}
      insight={insight}
      court={court}
      history={history}
      footer={region(
        "Team usage",
        <HomeFooterPending />,
        <Footer resources={resources} isStaff={isStaff} />,
      )}
    />
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
  isPreview,
}: {
  resources: Resources;
  canSchedule: boolean;
  isPreview: boolean;
}) {
  const { weekendDual } = await resources.schedule;
  return weekendDual ? (
    <DualSheet dual={weekendDual} />
  ) : (
    <DualSheetEmpty canSchedule={canSchedule} isPreview={isPreview} />
  );
}
async function Movers({
  resources,
  canManage,
  isPreview,
}: {
  resources: Resources;
  canManage: boolean;
  isPreview: boolean;
}) {
  const roster = await resources.roster;
  return (
    <TopMovers
      movers={topMovers(roster.members)}
      rosterSize={
        roster.members.filter((member) => member.role === "player").length
      }
      canManage={canManage}
      isPreview={isPreview}
    />
  );
}
async function Court({ resources }: { resources: Resources }) {
  return <CourtRecord record={(await resources.schedule).courtRecord} />;
}
async function History({
  resources,
  teamName,
  isPreview,
}: {
  resources: Resources;
  teamName: string;
  isPreview: boolean;
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
      isPreview={isPreview}
    />
  );
}
async function Insight({
  resources,
  programId,
  isPreview,
}: {
  resources: Resources;
  programId: string;
  isPreview: boolean;
}) {
  const { insight, kpiMatchCount, kpiCards, matchCount } =
    await resources.analytics;
  if (insight)
    return (
      <FocusCard
        showStatisticsLink={!isPreview}
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
  return matchCount === 0 ? (
    <FocusCard
      showStatisticsLink={!isPreview}
      footer={{ left: "One thing to work on, after the first dual." }}
    >
      <FocusEmpty />
    </FocusCard>
  ) : null;
}
async function Footer({
  resources,
  isStaff,
}: {
  resources: Resources;
  isStaff: boolean;
}) {
  const usage = await resources.usage;
  return (
    <>
      <Suspense fallback={null}>
        {isStaff && <Setup resources={resources} />}
      </Suspense>
      <UsageFooter
        usedSeconds={usage.usedSeconds}
        capSeconds={usage.capSeconds}
        billingMonth={usage.billingMonth}
        dualWeekends
        note="free through Dec 31, 2026"
      />
    </>
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
