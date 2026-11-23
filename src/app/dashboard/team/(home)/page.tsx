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
import {
  PilotCard,
  pilotDaysLeft,
} from "@/components/dashboard/home-feed/pilot-card";
import {
  StartCards,
  type StartCard,
} from "@/components/dashboard/home-feed/start-cards";
import { LatestMatches } from "@/components/dashboard/home-feed/latest-matches";
import { PlayersTable } from "@/components/dashboard/home-feed/players-table";
import {
  BottomRow,
  HomeFeedFrame,
  PilotPending,
  TitlePending,
  TopRow,
} from "@/components/dashboard/home-feed/home-feed-pending";
import {
  HomeListPending,
  RememberHomeRows,
} from "@/components/dashboard/home-feed/home-shape-memory";
import { YourNumbers } from "@/components/dashboard/home-feed/your-numbers";
import { getPlayerHomeKpis } from "@/lib/data/home-player-numbers-server";
import { loginRedirectPath } from "@/lib/auth/request-path";

export const metadata = { title: "Team home" };

/**
 * Team Home: one page through every stage of a program's life.
 *
 * The greeting, the action cards beside the pilot card, Latest matches and
 * Players are always there; a match on its way shows its progress in its own
 * row of Latest matches. Each region streams on its own read and fails on its
 * own.
 */
export default async function TeamHomePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect(await loginRedirectPath("/dashboard"));
  const { active, viewer } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  // A player with a roster row of their own gets the page turned to them:
  // their matches and their numbers, with the team's latest beneath. Staff —
  // including staff who also play — keep the program's page.
  const myPlayerId = active.role === "player" ? active.myPlayerId : null;

  const feed = getHomeFeed();
  const usage = getProgramUsage(active.id, currentBillingMonth(), active);
  // One or the other, never both: the player's page lists no roster.
  const roster = myPlayerId ? null : getRosterData(active.id);
  const numbers = myPlayerId ? getPlayerHomeKpis(active.id, myPlayerId) : null;
  const pins = getAskPins(active.id);
  // A region that never renders (a failed sibling unmounting the tree) must
  // not leave its read as an unhandled rejection.
  for (const pending of [feed, usage, roster, numbers, pins])
    pending?.catch(() => {});

  const isStaff = isProgramStaff(active);
  const canUpload = canUploadForProgram(active);
  const action = (
    <NewMatchAction
      canUpload={canUpload}
      canSubmitVideo={active.canSubmitVideo}
    />
  );
  // The same cards at every stage, each only for someone who can act on it.
  const newMatch: StartCard[] = canUpload
    ? [
        {
          href: "/dashboard/matches/new",
          title: "New match",
          body: "Advantage Intelligence charts every point",
          art: "court",
        },
      ]
    : [];
  const cards: StartCard[] = myPlayerId
    ? [
        ...newMatch,
        {
          href: `/dashboard/team/roster/${myPlayerId}`,
          title: "Your profile",
          body: "Your season, match by match",
          art: "roster",
        },
        {
          href: "/dashboard/team/ask",
          title: "Ask about your game",
          body: "Your serve, your returns, an opponent",
          art: "ask",
        },
        // A player who may not add matches still has three things to do.
        ...(canUpload
          ? []
          : [
              {
                href: "/dashboard/matches",
                title: "Team matches",
                body: "Every match your team has added",
                art: "court" as const,
              },
            ]),
      ]
    : [
        ...newMatch,
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
  const greeting = timeOfDayGreeting(new Date().getHours());
  // Once the pilot is over there is no card, and the cards take the row.
  const pilot =
    pilotDaysLeft() < 0
      ? null
      : region(
          "Pilot",
          <PilotPending />,
          <Banner feed={feed} usage={usage} active={active} />,
        );

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
          player={myPlayerId != null}
          canUpload={canUpload}
        />,
      )}
      <TopRow pilot={pilot} lead={<StartCards cards={cards} />} />
      {myPlayerId && numbers ? (
        <BottomRow>
          {region(
            "Your matches",
            <div className="flex min-w-0 flex-col gap-5">
              <HomeListPending list="yours" />
              <HomeListPending list="team" />
            </div>,
            <PlayerMatches
              feed={feed}
              profileHref={`/dashboard/team/roster/${myPlayerId}`}
              canUpload={canUpload}
            />,
          )}
          {region(
            "Your numbers",
            <HomeListPending list="playerNumbers" />,
            <PlayerNumbers numbers={numbers} />,
          )}
        </BottomRow>
      ) : (
        <BottomRow>
          {region(
            "Latest matches",
            <HomeListPending list="matches" />,
            <Latest feed={feed} teamName={active.name} canUpload={canUpload} />,
          )}
          {roster
            ? region(
                "Players",
                <HomeListPending list="players" />,
                <Players
                  roster={roster}
                  teamName={active.name}
                  canManage={isStaff}
                  viewer={viewer}
                />,
              )
            : null}
        </BottomRow>
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
  player,
  canUpload,
}: {
  feed: Feed;
  greeting: string;
  firstName: string | null;
  teamName: string;
  action: ReactNode;
  /** The page is turned to this reader's own matches. */
  player: boolean;
  canUpload: boolean;
}) {
  const loaded = await feed;
  const own = player ? loaded.player : null;
  return (
    <HomeTitle
      label="Team home"
      greeting={greeting}
      firstName={firstName}
      feed={own ? own.summary : loaded}
      yours={own != null}
      emptyLine={
        own
          ? canUpload
            ? "Start with your first match."
            : "Your coach adds your matches."
          : `Start with ${teamName}’s first match.`
      }
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
    <PilotCard
      eyebrow={`${active.name} · Pilot`}
      usedSeconds={used.usedSeconds}
      capSeconds={used.capSeconds}
      analyzed={analyzed}
    />
  );
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
      empty={
        canUpload
          ? {
              title: `Add ${teamName}’s first match`,
              body: "Upload a video or import a SwingVision file. You’ll need the final score.",
              href: "/dashboard/matches/new",
            }
          : {
              title: `${teamName}’s first match goes here`,
              body: "Matches your coach or teammates add show up here.",
            }
      }
    />
  );
}

/**
 * The player's main column: their own matches in the personal Home's grammar,
 * then teammates' latest — which is simply absent when there are none they
 * may see.
 */
async function PlayerMatches({
  feed,
  profileHref,
  canUpload,
}: {
  feed: Feed;
  profileHref: string;
  canUpload: boolean;
}) {
  const player = (await feed).player;
  if (!player) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <LatestMatches
        matches={player.own}
        scope="personal"
        title="Your matches"
        list="yours"
        link={
          player.own.length > 0
            ? { label: "All your matches", href: profileHref }
            : null
        }
        empty={
          canUpload
            ? {
                title: "Add your first match",
                body: "Upload a video or import a SwingVision file. You’ll need the final score.",
                href: "/dashboard/matches/new",
              }
            : {
                title: "Your first match goes here",
                body: "Matches your coach adds for you show up here.",
              }
        }
      />
      {player.team.length > 0 ? (
        <LatestMatches
          matches={player.team}
          scope="team"
          title="Latest from the team"
          list="team"
          link={{ label: "All team matches", href: "/dashboard/matches" }}
        />
      ) : (
        // Teach the skeleton that this list is absent here.
        <RememberHomeRows list="team" rows={0} />
      )}
    </div>
  );
}

async function PlayerNumbers({
  numbers,
}: {
  numbers: ReturnType<typeof getPlayerHomeKpis>;
}) {
  return (
    <YourNumbers
      kpis={await numbers}
      limit={8}
      askHref="/dashboard/team/ask"
      list="playerNumbers"
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
