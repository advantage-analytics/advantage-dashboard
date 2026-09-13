import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getTeamSingleMatch } from "@/lib/data/single-match-server";
import { SingleDetail } from "@/components/dashboard/schedule/single-detail";

/**
 * 25i and 25j — a single match's page.
 *
 * Nested under `schedule/` because that is where the breadcrumb puts it, and
 * `single` is a static segment so it never collides with `[eventId]`.
 *
 * Deliberately thin: it answers "what is still missing?" and, once analysis
 * lands, points at the real report rather than reproducing it.
 */
export default async function TeamSingleMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect(`/dashboard/matches/${matchId}`);

  // Scoped to the active program AND to matches with no event, so an id from
  // another program — or a dual line, which has a richer page — is a 404 rather
  // than a page pretending this is a challenge match.
  const match = await getTeamSingleMatch(active.id, matchId);
  if (!match) notFound();

  return <SingleDetail match={match} canEdit={isProgramStaff(active)} />;
}
