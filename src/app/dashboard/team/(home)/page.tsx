import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  canUploadForProgram,
  isProgramStaff,
  type Workspace,
} from "@/lib/workspace/types";
import { getHomeFeed } from "@/lib/data/home-feed-server";
import { getProgramUsage } from "@/lib/data/usage-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getAskPins } from "@/lib/data/ask-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { timeOfDayGreeting } from "@/lib/ui/greeting";
import { NewMatchAction } from "@/components/dashboard/team/team-season-title";
import { AskPinCard } from "@/components/dashboard/home/ask-pin-card";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { HomeTitle } from "@/components/dashboard/home-feed/home-title";
import { PilotBanner } from "@/components/dashboard/home-feed/pilot-banner";
import {
  StartCards,
  type StartCard,
} from "@/components/dashboard/home-feed/start-cards";
import { JustAnalyzed } from "@/components/dashboard/home-feed/just-analyzed";
import { LatestMatches } from "@/components/dashboard/home-feed/latest-matches";
import { PlayersTable } from "@/components/dashboard/home-feed/players-table";
import {
  BannerPending,
  HomeFeedFrame,
  LatestPending,
  LeadPending,
  TablePending,
  TitlePending,
} from "@/components/dashboard/home-feed/home-feed-pending";
import { loginRedirectPath } from "@/lib/auth/request-path";

export const metadata = { title: "Team home" };

/**
 * Team Home: one page through every stage of a program's life.
 *
 * The greeting, the pilot banner, Latest matches and Players are always
 * there. The slot under the banner holds the getting-started cards until the
 * program's first match is analyzed, and that match's highlight from then on
 * — so a new program and an established one see the same page, filled in.
 * Each region streams on its own read and fails on its own.
 */
export default async function TeamHomePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect(await loginRedirectPath("/dashboard"));
  const { active, viewer } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const feed = getHomeFeed();
  const usage = getProgramUsage(active.id, currentBillingMonth(), active);
  const roster = getRosterData(active.id);
  const pins = getAskPins(active.id);
  // A region that never renders (a failed sibling unmounting the tree) must
  // not leave its read as an unhandled rejection.
  for (const pending of [feed, usage, roster, pins]) pending.catch(() => {});

  const isStaff = isProgramStaff(active);
  const canUpload = canUploadForProgram(active);
  const action = (
    <NewMatchAction
      canUpload={canUpload}
      canSubmitVideo={active.canSubmitVideo}
    />
  );
  const greeting = timeOfDayGreeting(new Date().getHours());

  return (
    <HomeFeedFrame key={`${viewer.id}:${active.id}`}>
      {region(
        "Team summary",
        <TitlePending action={action} />,
        <Title
          feed={feed}
          greeting={greeting}
          firstName={viewer.firstName}
          teamName={active.name}
          action={action}
        />,
      )}
      {region(
        "Pilot",
        <BannerPending />,
        <Banner feed={feed} usage={usage} active={active} />,
      )}
      {region(
        "Latest report",
        <LeadPending />,
        <Lead feed={feed} canUpload={canUpload} isStaff={isStaff} />,
      )}
      {region(
        "Latest matches",
        <LatestPending scope="team" />,
        <Latest feed={feed} teamName={active.name} canUpload={canUpload} />,
      )}
      {region(
        "Players",
        <TablePending title="Players" rows={6} />,
        <Players
          roster={roster}
          teamName={active.name}
          canManage={isStaff}
          viewer={viewer}
        />,
      )}
      {/* Only while something is pinned: no skeleton and no empty state (see
          `AskPinCard`). A failed read is still the retry. */}
      {region("Pinned from Ask", null, <Pins pins={pins} />)}
    </HomeFeedFrame>
  );
}

type Feed = ReturnType<typeof getHomeFeed>;

async function Title({
  feed,
  greeting,
  firstName,
  teamName,
  action,
}: {
  feed: Feed;
  greeting: string;
  firstName: string | null;
  teamName: string;
  action: ReactNode;
}) {
  return (
    <HomeTitle
      label="Team home"
      greeting={greeting}
      firstName={firstName}
      feed={await feed}
      emptyLine={`Start with ${teamName}’s first match.`}
      action={action}
    />
  );
}

async function Banner({
  feed,
  usage,
  active,
}: {
  feed: Feed;
  usage: ReturnType<typeof getProgramUsage>;
  active: Workspace;
}) {
  const [{ analyzed }, used] = await Promise.all([feed, usage]);
  return (
    <PilotBanner
      recipient={active.name}
      eyebrow={`${active.name} · Pilot`}
      usedSeconds={used.usedSeconds}
      capSeconds={used.capSeconds}
      analyzed={analyzed}
    />
  );
}

/** The cards until the first report exists; that report's highlight after. */
async function Lead({
  feed,
  canUpload,
  isStaff,
}: {
  feed: Feed;
  canUpload: boolean;
  isStaff: boolean;
}) {
  const { highlights } = await feed;
  if (highlights.length > 0) return <JustAnalyzed highlights={highlights} />;
  const cards: StartCard[] = [
    ...(canUpload
      ? [
          {
            href: "/dashboard/matches/new",
            title: "New match",
            body: "Advantage Intelligence charts every point",
            art: "court" as const,
          },
        ]
      : []),
    ...(isStaff
      ? [
          {
            href: "/dashboard/team/roster?add=player",
            title: "Invite players",
            body: "Add them or send an invite",
            art: "roster" as const,
          },
        ]
      : []),
    {
      href: "/dashboard/team/ask",
      title: "Ask about the team",
      body: "Compare players, scout an opponent",
      art: "ask",
    },
  ];
  return <StartCards cards={cards} />;
}

async function Latest({
  feed,
  teamName,
  canUpload,
}: {
  feed: Feed;
  teamName: string;
  canUpload: boolean;
}) {
  return (
    <LatestMatches
      matches={(await feed).latest}
      scope="team"
      empty={{
        title: `${teamName}’s first match goes here`,
        body: canUpload
          ? "Upload a match video or import a SwingVision file. You’ll need the final score."
          : "Matches your coach or teammates add show up here.",
      }}
    />
  );
}

async function Players({
  roster,
  teamName,
  canManage,
  viewer,
}: {
  roster: ReturnType<typeof getRosterData>;
  teamName: string;
  canManage: boolean;
  viewer: { id: string; initials: string; avatarUrl: string | null };
}) {
  return (
    <PlayersTable
      members={(await roster).members}
      teamName={teamName}
      canManage={canManage}
      viewer={viewer}
    />
  );
}

async function Pins({ pins }: { pins: ReturnType<typeof getAskPins> }) {
  const list = await pins;
  // Absent, not empty — the card's own rule (`AskPinCard`).
  if (list.length === 0) return null;
  return (
    <AskPinCard pins={list} askHref="/dashboard/team/ask" scopeKind="team" />
  );
}

function region(label: string, fallback: ReactNode, children: ReactNode) {
  return (
    <WidgetBoundary label={label}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </WidgetBoundary>
  );
}
