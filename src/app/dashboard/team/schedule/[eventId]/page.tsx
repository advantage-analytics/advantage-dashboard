import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import {
  eventDetailFrom,
  getProgramSchedule,
} from "@/lib/data/schedule-server";
import { getEventTeamTotals } from "@/lib/data/event-team-totals-server";
import { isAnalysisReady } from "@/lib/data/match-analysis";
import {
  opponentDualHistory,
  opponentHistoryFor,
  opponentMeetings,
} from "@/lib/schedule/opponent-history";
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
 * event out of it with `eventDetailFrom` rather than calling `getEventDetail`,
 * because a dual's rail asks a question no single event can answer: the
 * head-to-head record against this opponent is counted over every dual the
 * program has ever played against that name. Reading the event alone and then
 * reading the season for the rail would be two reads where the second already
 * contains the first, and `getProgramSchedule` is `cache()`d, so Team Home and
 * this page share one round trip.
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

  const canEdit = isProgramStaff(active);

  if (detail.event.kind !== "dual") {
    return <TournamentDetail detail={detail} canEdit={canEdit} />;
  }

  // `getEventTeamTotals` sums raw stat rows and deliberately does not re-check
  // status: a match that failed part-way can carry partial rows, and a total
  // built from half a match is a wrong number that looks entirely plausible.
  // Restricting the ids to `isAnalysisReady` here is that check.
  const readyMatchIds = detail.entries.flatMap((entry) =>
    entry.matches
      .filter((match) => isAnalysisReady(match.status))
      .map((match) => match.id)
  );

  const totals = await getEventTeamTotals(readyMatchIds);

  return (
    <DualDetail
      detail={detail}
      canEdit={canEdit}
      totals={totals}
      history={opponentHistoryFor(
        opponentDualHistory(schedule),
        detail.event.name
      )}
      meetings={opponentMeetings(schedule, detail.event.name, {
        excludeEventId: eventId,
      })}
    />
  );
}
