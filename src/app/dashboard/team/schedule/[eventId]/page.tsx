import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getEventDetail } from "@/lib/data/schedule-server";
import { DualDetail } from "@/components/dashboard/schedule/dual-detail";
import { TournamentDetail } from "@/components/dashboard/schedule/tournament-detail";

/**
 * 25c/25d and 25f/25g -- one route, one renderer per kind.
 *
 * Empty and filled are not separate routes: they are the same page with
 * different data, and the transition between them is the thing being designed.
 * The kind, though, really is two pages -- a dual is a fixed grid of courts and
 * a tournament is a set of runs, and rendering both from one component would be
 * a component that is two components with a flag.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const detail = await getEventDetail(active.id, eventId);
  if (!detail) notFound();

  const canEdit = isProgramStaff(active);

  return detail.event.kind === "dual" ? (
    <DualDetail detail={detail} canEdit={canEdit} />
  ) : (
    <TournamentDetail detail={detail} canEdit={canEdit} />
  );
}
