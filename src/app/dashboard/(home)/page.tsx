import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getHomeFeed } from "@/lib/data/home-feed-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getPersonalSeasonKpis } from "@/lib/data/personal-kpis-server";
import { getAskPins } from "@/lib/data/ask-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { timeOfDayGreeting } from "@/lib/ui/greeting";
import { advButton } from "@/lib/ui/adv-button";
import { AskPinCard } from "@/components/dashboard/home/ask-pin-card";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { HomeTitle } from "@/components/dashboard/home-feed/home-title";
import { PilotBanner } from "@/components/dashboard/home-feed/pilot-banner";
import { StartCards } from "@/components/dashboard/home-feed/start-cards";
import { JustAnalyzed } from "@/components/dashboard/home-feed/just-analyzed";
import { LatestMatches } from "@/components/dashboard/home-feed/latest-matches";
import { YourNumbers } from "@/components/dashboard/home-feed/your-numbers";
import {
  BannerPending,
  HomeFeedFrame,
  LatestPending,
  LeadPending,
  TablePending,
  TitlePending,
} from "@/components/dashboard/home-feed/home-feed-pending";
import { loginRedirectPath } from "@/lib/auth/request-path";

export const metadata = { title: "Home" };

/**
 * The personal Home: Team Home's page for one player.
 *
 * Same order and the same parts — the greeting, the beta banner, the slot
 * that holds the getting-started cards until the first report and its
 * highlight after, then Latest matches — and where a program lists its
 * players, a player gets their own numbers.
 */
export default async function Home() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect(await loginRedirectPath("/dashboard"));
  const { active, viewer } = workspace;
  if (active.kind === "team") redirect("/dashboard/team");

  const feed = getHomeFeed();
  const usage = getPersonalUsage(active, currentBillingMonth());
  const season = getPersonalSeasonKpis(viewer.id);
  const pins = getAskPins(null, viewer.id);
  for (const pending of [feed, usage, season, pins]) pending.catch(() => {});

  const action = (
    <Link href="/dashboard/matches/new" className={advButton("primary")}>
      New match
    </Link>
  );
  const greeting = timeOfDayGreeting(new Date().getHours());

  return (
    <HomeFeedFrame key={viewer.id}>
      {region(
        "Season summary",
        <TitlePending action={action} />,
        <Title
          feed={feed}
          greeting={greeting}
          firstName={viewer.firstName}
          action={action}
        />,
      )}
      {region(
        "Beta",
        <BannerPending />,
        <Banner feed={feed} usage={usage} name={viewer.name} />,
      )}
      {region("Latest report", <LeadPending />, <Lead feed={feed} />)}
      {region(
        "Latest matches",
        <LatestPending scope="personal" />,
        <Latest feed={feed} />,
      )}
      {region(
        "Your numbers",
        <TablePending title="Your numbers" rows={5} />,
        <Numbers season={season} />,
      )}
      {region("Pinned from Ask", null, <Pins pins={pins} />)}
    </HomeFeedFrame>
  );
}

type Feed = ReturnType<typeof getHomeFeed>;

async function Title({
  feed,
  greeting,
  firstName,
  action,
}: {
  feed: Feed;
  greeting: string;
  firstName: string | null;
  action: ReactNode;
}) {
  return (
    <HomeTitle
      label="Home"
      greeting={greeting}
      firstName={firstName}
      feed={await feed}
      emptyLine="Start with your first match."
      action={action}
    />
  );
}

async function Banner({
  feed,
  usage,
  name,
}: {
  feed: Feed;
  usage: ReturnType<typeof getPersonalUsage>;
  name: string;
}) {
  const [{ analyzed }, used] = await Promise.all([feed, usage]);
  if (!used) return null;
  return (
    <PilotBanner
      recipient="Your account"
      eyebrow={`${name} · Beta`}
      usedSeconds={used.usedSeconds}
      capSeconds={used.capSeconds}
      creditSeconds={used.creditSeconds}
      analyzed={analyzed}
    />
  );
}

async function Lead({ feed }: { feed: Feed }) {
  const { highlights } = await feed;
  if (highlights.length > 0) return <JustAnalyzed highlights={highlights} />;
  return (
    <StartCards
      cards={[
        {
          href: "/dashboard/matches/new",
          title: "New match",
          body: "Advantage Intelligence charts every point",
          art: "court",
        },
        {
          href: "/dashboard/settings/teams",
          title: "Join your team",
          body: "Find your program and ask to join",
          art: "roster",
        },
        {
          href: "/dashboard/ask",
          title: "Ask about your game",
          body: "Your serve, your returns, an opponent",
          art: "ask",
        },
      ]}
    />
  );
}

async function Latest({ feed }: { feed: Feed }) {
  return (
    <LatestMatches
      matches={(await feed).latest}
      scope="personal"
      empty={{
        title: "Your first match goes here",
        body: "Upload a match video or import a SwingVision file. You’ll need the final score.",
      }}
    />
  );
}

async function Numbers({
  season,
}: {
  season: ReturnType<typeof getPersonalSeasonKpis>;
}) {
  return <YourNumbers kpis={(await season).kpis} />;
}

async function Pins({ pins }: { pins: ReturnType<typeof getAskPins> }) {
  const list = await pins;
  // Absent, not empty — the card's own rule (`AskPinCard`).
  if (list.length === 0) return null;
  return <AskPinCard pins={list} />;
}

function region(label: string, fallback: ReactNode, children: ReactNode) {
  return (
    <WidgetBoundary label={label}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </WidgetBoundary>
  );
}
