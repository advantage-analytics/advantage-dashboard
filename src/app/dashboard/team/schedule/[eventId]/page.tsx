import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import {
  eventDetailFrom,
  getOpponentPrograms,
  getProgramSchedule,
} from "@/lib/data/schedule-server";
import { getEventTeamTotals } from "@/lib/data/event-team-totals-server";
import { getRosterPlayerOptions } from "@/lib/data/roster-server";
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
 *
 * **`?line=`** names the dual line whose drawer is open, and **`?match=`**
 * the tournament round (its match id, or its outcome id for a round with no
 * match). Each is read here and handed down as a prop — the table mirrors
 * later changes into the URL with `history.replaceState`, never a navigation
 * — and ignored unless it names one of the event's rows.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    line?: string | string[];
    match?: string | string[];
  }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const initialLineId = typeof query.line === "string" ? query.line : null;
  const initialMatchId = typeof query.match === "string" ? query.match : null;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const schedule = await getProgramSchedule(active.id);
  const detail = eventDetailFrom(schedule, eventId);
  if (!detail) notFound();

  const canEdit = canManageTeamSchedule(active);

  if (detail.event.kind !== "dual") {
    const [totals, roster] = await Promise.all([
      getEventTeamTotals(readyMatchIdsFrom(detail.entries)),
      getRosterPlayerOptions(active.id),
    ]);

    // An entry's `playerUserIds` can hold either of `matches.player1_id`'s
    // id spaces: a claimed player's auth uid or a `program_players.id`. The
    // roster route resolves only the profile id, so each lineup id this
    // event names is mapped to its roster player's profile id, and an id
    // that maps to nobody on the roster stays unlinked.
    const lineupIds = new Set(
      detail.entries.flatMap((entry) => entry.playerUserIds),
    );
    const rosterPlayerIds: Record<string, string> = {};
    for (const player of roster) {
      for (const id of [player.playerId, player.userId]) {
        if (id && lineupIds.has(id)) rosterPlayerIds[id] = player.playerId;
      }
    }

    return (
      <>
        <EventHeaderSlot
          eventId={eventId}
          name={detail.event.name}
          kind={detail.event.kind}
        />
        <TournamentDetail
          detail={detail}
          canEdit={canEdit}
          totals={totals}
          rosterPlayerIds={rosterPlayerIds}
          initialMatchId={initialMatchId}
        />
      </>
    );
  }

  // The conference, last in the header's subline after the date, time, site
  // and surface `DualDetail` reads off the event itself.
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
        initialLineId={initialLineId}
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
