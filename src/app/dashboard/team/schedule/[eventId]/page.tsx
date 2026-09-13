import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import {
  eventDetailFrom,
  getOpponentPrograms,
  getProgramSchedule,
} from "@/lib/data/schedule-server";
import { getEventTeamTotals } from "@/lib/data/event-team-totals-server";
import { readyMatchIdsFrom } from "@/lib/schedule/entry-state";
import { EventHeaderSlot } from "@/components/dashboard/schedule/event-header-slot";
import { DualDetail } from "@/components/dashboard/schedule/dual-detail";
import { TournamentDetail } from "@/components/dashboard/schedule/tournament-detail";

/**
 * One route, one renderer per kind.
 *
 * Empty and filled are not separate routes: they are the same page with
 * different data, and the transition between them is the thing being designed.
 * The kind, though, really is two pages -- a dual is a fixed grid of courts and
 * a tournament is a set of runs, and rendering both from one component would be
 * a component that is two components with a flag.
 *
 * **The season, not the event.** This reads `getProgramSchedule` and slices the
 * event out of it with `eventDetailFrom` rather than calling `getEventDetail`:
 * `getProgramSchedule` is `cache()`d, so Team Home, the Schedule and this page
 * share one round trip. Team totals are read for a tournament only; a dual's
 * page is its lines.
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

  const schedule = await getProgramSchedule(active.id);
  const detail = eventDetailFrom(schedule, eventId);
  if (!detail) notFound();

  const canEdit = canManageTeamSchedule(active);

  if (detail.event.kind !== "dual") {
    const totals = await getEventTeamTotals(readyMatchIdsFrom(detail.entries));
    return (
      <>
        <EventHeaderSlot
          eventId={eventId}
          name={detail.event.name}
          kind={detail.event.kind}
        />
        <TournamentDetail detail={detail} canEdit={canEdit} totals={totals} />
      </>
    );
  }

  // The conference printed beside the opponent's name — the drawer's subline.
  const opponentProgramId = detail.entries.find(
    (entry) => entry.opponentProgramId,
  )?.opponentProgramId;
  const opponent = opponentProgramId
    ? ((await getOpponentPrograms([opponentProgramId]))[opponentProgramId] ??
      null)
    : null;

  return (
    <>
      <EventHeaderSlot
        eventId={eventId}
        name={detail.event.name}
        kind={detail.event.kind}
      />
      <DualDetail
        detail={detail}
        canEdit={canEdit}
        conference={opponent?.conference ?? null}
        viewer={{
          // A lineup can name the viewer by auth uid or by their claimed
          // program player id — `matches.player1_id`'s two id spaces.
          ids: [workspace.viewer.id, active.myPlayerId].filter(
            (id): id is string => Boolean(id),
          ),
          avatarUrl: workspace.viewer.avatarUrl,
          initials: workspace.viewer.initials,
        }}
      />
    </>
  );
}
