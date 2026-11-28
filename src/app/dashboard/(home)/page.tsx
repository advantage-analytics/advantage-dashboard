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
import {
  PilotCard,
  PlanHomeCard,
  pilotDaysLeft,
} from "@/components/dashboard/home-feed/pilot-card";
import {
  homeCardView,
  planStandingFor,
  plansApplyTo,
} from "@/lib/billing/plan-copy";
import { readPlanBilling } from "@/lib/billing/plan-fields";
import { utcToday } from "@/lib/data/match-day";
import { createClient } from "@/lib/supabase/server";
import { isPaidPlan } from "@/lib/user/plan";
import type { Workspace } from "@/lib/workspace/types";
import {
  StartCards,
  type StartCard,
} from "@/components/dashboard/home-feed/start-cards";
import { LatestMatches } from "@/components/dashboard/home-feed/latest-matches";
import { YourNumbers } from "@/components/dashboard/home-feed/your-numbers";
import {
  BottomRow,
  HomeFeedFrame,
  PilotPending,
  TitlePending,
  TopRow,
} from "@/components/dashboard/home-feed/home-feed-pending";
import { HomeListPending } from "@/components/dashboard/home-feed/home-shape-memory";
import { loginRedirectPath } from "@/lib/auth/request-path";

export const metadata = { title: "Home" };

/**
 * The personal Home: Team Home's page for one player.
 *
 * Same layout and the same parts — the greeting, the action cards beside the
 * beta card, then Latest matches — and where a program lists its players, a
 * player gets their own numbers.
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
  // Once plans apply to this player (January 1, or a plan bought before it)
  // the card is their plan and its hours. Until then it is the beta's card,
  // which goes when the beta does, and the cards take the row.
  const pilot = plansApplyTo(active)
    ? region(
        "Plan",
        <PilotPending />,
        <PlanBanner
          feed={feed}
          usage={usage}
          active={active}
          name={viewer.name}
        />,
      )
    : pilotDaysLeft() < 0
      ? null
      : region(
          "Beta",
          <PilotPending />,
          <Banner feed={feed} usage={usage} name={viewer.name} />,
        );

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
      <TopRow pilot={pilot} lead={<StartCards cards={CARDS} />} />
      <BottomRow>
        {region(
          "Latest matches",
          <HomeListPending list="matches" />,
          <Latest feed={feed} />,
        )}
        {region(
          "Your numbers",
          <HomeListPending list="numbers" />,
          <Numbers season={season} />,
        )}
      </BottomRow>
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
    <PilotCard
      eyebrow={`${name} · Beta`}
      usedSeconds={used.usedSeconds}
      capSeconds={used.capSeconds}
      creditSeconds={used.creditSeconds}
      analyzed={analyzed}
    />
  );
}

/** The plan's card: the same footprint, the plan's own words. */
async function PlanBanner({
  feed,
  usage,
  active,
  name,
}: {
  feed: Feed;
  usage: ReturnType<typeof getPersonalUsage>;
  active: Workspace;
  name: string;
}) {
  // The first-month line is only for an account that has never subscribed, so
  // a Free player's card asks; a subscriber's has no such line to decide.
  const firstMonth = isPaidPlan(active.plan)
    ? Promise.resolve(false)
    : createClient()
        .then((supabase) => readPlanBilling(supabase, active.id))
        .then((billing) => !billing.everSubscribed);
  const [{ analyzed }, used, firstMonthEligible] = await Promise.all([
    feed,
    usage,
    firstMonth,
  ]);
  return (
    <PlanHomeCard
      view={homeCardView({
        standing: planStandingFor(active),
        owner: name,
        usedSeconds: used.usedSeconds,
        capSeconds: used.capSeconds,
        creditSeconds: used.creditSeconds,
        analyzed,
        today: utcToday(),
        firstMonthEligible,
      })}
    />
  );
}

const CARDS: StartCard[] = [
  {
    href: "/dashboard/matches/new",
    title: "New match",
    body: "Advantage Intelligence charts every point",
    art: "court",
  },
  {
    // The sidebar's own "Create team workspace" destination.
    href: "/claim/team",
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
];

async function Latest({ feed }: { feed: Feed }) {
  return (
    <LatestMatches
      matches={(await feed).latest}
      scope="personal"
      empty={{
        title: "Add your first match",
        body: "Upload a video or import a SwingVision file. You’ll need the final score.",
        href: "/dashboard/matches/new",
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
