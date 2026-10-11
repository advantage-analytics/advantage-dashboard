import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { OpponentsDayZero } from "@/components/dashboard/opponents/opponents-day-zero";
import { OpponentsPageContent } from "@/components/dashboard/opponents/opponents-page-content";
import { OpponentsSkeleton } from "@/components/dashboard/opponents/opponents-skeleton";
import { getPersonalOpponents } from "@/lib/data/personal-opponents-server";
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
 * The read streams behind a `Suspense` whose fallback is the page's own
 * skeleton. There is deliberately no route-level `loading.tsx`: that file
 * would wrap BOTH branches, and the team stub below — which reads nothing —
 * would flash a table skeleton on its way to "coming soon".
 *
 * ── Team ────────────────────────────────────────────────────────────────────
 * Who this program plays, and who it is about to — not finalised for a team, so
 * the page says so rather than showing a half-answer.
 *
 * The loaders it will need are live and stay in `opponents-server.ts`:
 * `getConferenceTable` is a seeded directory of 1,940 programs and is never
 * empty, and `getOpponentsPlayed` already has an honest empty state. The UI
 * that read them is gone because nothing about its shape was settled; the data
 * layer outlives it.
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
      <ComingSoonPage
        title="Opponents"
        heading="Opponent scouting is still being built."
        description="Who your program plays and who it is about to — a conference directory, and every lineup and result an opponent has shared, before you meet them."
        action={{ label: "View matches", href: "/dashboard/matches" }}
      />
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
