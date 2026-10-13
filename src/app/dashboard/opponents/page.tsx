import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { OpponentsDayZero } from "@/components/dashboard/opponents/opponents-day-zero";
import { OpponentsPageContent } from "@/components/dashboard/opponents/opponents-page-content";
import { OpponentsSkeleton } from "@/components/dashboard/opponents/opponents-skeleton";
import { TeamOpponentsPageContent } from "@/components/dashboard/opponents/team-opponents-page-content";
import { getPersonalOpponents } from "@/lib/data/personal-opponents-server";
import { getTeamOpponents } from "@/lib/data/team-opponents-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const metadata = { title: "Opponents" };

/**
 * One route, two products, decided by the active workspace's kind.
 *
 * ── Personal ────────────────────────────────────────────────────────────────
 * The player's own matches grouped by who was across the net
 * (`personal-opponents-server.ts`): a title row, one table card and a footer
 * line, or the day-zero offer while there is nobody to list.
 *
 * ── Team ────────────────────────────────────────────────────────────────────
 * Every opponent player the program's roster has faced
 * (`team-opponents-server.ts`): the same title row, toolbar, table card and
 * footer, over six columns — Opponent · Program · Faced by · Plays · Record ·
 * Last match — with who on the roster met each one as a stack of faces. The
 * filter panel adds Program and Faced by to the personal page's facets, and a
 * row opens the team opponent drawer beside the table. With nobody to list it
 * is the same day-zero offer in the team's words.
 *
 * Not to be confused with `opponents-server.ts`, the program directory and
 * pooled public-record loaders: those are keyed by program and are live
 * elsewhere; this page is players only.
 *
 * ── Loading ─────────────────────────────────────────────────────────────────
 * Each branch streams its one read behind a `Suspense` whose fallback is the
 * page's own skeleton at that branch's tracks, inside a `WidgetBoundary`.
 * There is deliberately no route-level `loading.tsx`: that file would wrap
 * BOTH branches and could only draw one of the two tables.
 */
export default async function OpponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ opponent?: string | string[] }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  if (workspace.active.kind === "team") {
    return (
      <WidgetBoundary label="Opponents">
        <Suspense fallback={<OpponentsSkeleton scope="team" />}>
          <TeamOpponents
            programId={workspace.active.id}
            viewerId={workspace.viewer.id}
            searchParams={searchParams}
          />
        </Suspense>
      </WidgetBoundary>
    );
  }

  return (
    <WidgetBoundary label="Opponents">
      <Suspense fallback={<OpponentsSkeleton />}>
        <PersonalOpponents
          userId={workspace.viewer.id}
          searchParams={searchParams}
        />
      </Suspense>
    </WidgetBoundary>
  );
}

/**
 * The personal page once its one read lands.
 *
 * Day zero is "nobody to list", not "the table happens to be filtered empty":
 * the loader returns no opponents exactly when the account holds no personal
 * match against a named opponent, and that is the state the offer answers.
 */
async function PersonalOpponents({
  userId,
  searchParams,
}: {
  userId: string;
  searchParams: Promise<{ opponent?: string | string[] }>;
}) {
  const [{ opponents, totals }, { opponent }] = await Promise.all([
    getPersonalOpponents(userId),
    searchParams,
  ]);
  if (opponents.length === 0) {
    return <OpponentsDayZero unnamedMatches={totals.unnamed} />;
  }
  return (
    <OpponentsPageContent
      opponents={opponents}
      totals={totals}
      // A deep link is the one case that lands with the drawer already open.
      initialSelectedKey={typeof opponent === "string" ? opponent : null}
    />
  );
}

/**
 * The team page once its one read lands.
 *
 * Day zero is the same "nobody to list": the loader returns no opponents
 * exactly when no roster player has a match against a named opponent.
 */
async function TeamOpponents({
  programId,
  viewerId,
  searchParams,
}: {
  programId: string;
  viewerId: string;
  searchParams: Promise<{ opponent?: string | string[] }>;
}) {
  const [{ opponents, totals }, { opponent }] = await Promise.all([
    getTeamOpponents(programId, viewerId),
    searchParams,
  ]);
  if (opponents.length === 0) {
    return <OpponentsDayZero scope="team" />;
  }
  return (
    <TeamOpponentsPageContent
      opponents={opponents}
      totals={totals}
      initialSelectedKey={typeof opponent === "string" ? opponent : null}
    />
  );
}
