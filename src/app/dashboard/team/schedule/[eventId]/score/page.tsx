import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getEventDetail, programNamesFor } from "@/lib/data/schedule-server";
import { entryState, outcomeForRound } from "@/lib/schedule/entry-state";
import { lineupChoices, presetFor } from "@/lib/schedule/line-choices";
import { ScoreOnlyFlow } from "@/components/dashboard/schedule/score-only-flow";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * Scoring an event's lines, one after another.
 *
 * The event page's inline `ScoreEntry` row is right for correcting one line in
 * place. It is the wrong shape for a coach on the bus home with nine results
 * on a piece of paper — that person wants the upload wizard's room with the
 * video half switched off, and the next line handed to them when they finish
 * one. Same `recordResult`, same tiebreak encoding, a different amount of
 * furniture around it.
 *
 * The gate mirrors `/dashboard/team/upload`'s, one line for one line, with the
 * one difference that a non-staff viewer lands back on the event they came
 * from rather than on a page they cannot use. Staff-only is not a preference:
 * `matches_block_client_regraft` refuses any client write naming an
 * `event_entry_id` unless `is_program_staff`, and `recordResult` opens with its
 * own `requireStaff`. A player offered this form would fill it in and be
 * refused at the end.
 */
export default async function ScoreEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { eventId } = await params;
  const { entry: requestedEntryId } = await searchParams;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect(`/dashboard/team/schedule/${eventId}`);

  // This route only needs one event. React's request cache does not carry the
  // season loaded by a previous page into this navigation.
  const detail = await getEventDetail(active.id, eventId);
  if (!detail) notFound();

  // Duals only, and structurally rather than by nobody linking here.
  //
  // This flow scores ONE line and takes its round from the entry — a dual
  // line's slot IS its round, so there is nothing to ask. A tournament entry
  // is a whole run with one match per round, so the round is a real question,
  // and answering it from the entry's existing matches would hand
  // `recordResult` a round it already holds: it de-duplicates on
  // (entry, round) and would UPDATE the recorded quarter-final with the
  // semi-final's score, losing the earlier result with no error. That question
  // is asked properly by `AddResultDialog`, which the tournament page opens
  // from its own header — so a tournament lands there, not here.
  if (detail.event.kind !== "dual") {
    redirect(`/dashboard/team/schedule/${eventId}`);
  }

  const { event, entries } = detail;

  const programs = await programNamesFor(
    entries
      .map((entry) => entry.opponentProgramId ?? null)
      .filter((id): id is string => Boolean(id)),
  );

  // A line nobody holds has no result to record. A non-played line DOES stay
  // in this set: the full-page flow is also where staff clear that outcome
  // before replacing it with a played score. The upload flow keeps those
  // lines unselectable through `lineupChoices`' default option.
  const scoreable = entries.filter((entry) => entry.playerLabels.length > 0);

  // `?entry=` names the line; without one, the first line still waiting for a
  // result. An id from a URL is untrusted, so an id this event does not hold
  // falls through to the default rather than presetting a stranger's line.
  const requested = requestedEntryId
    ? scoreable.find((entry) => entry.id === requestedEntryId)
    : undefined;
  const entry =
    requested ??
    scoreable.find((candidate) => entryState(candidate) === "empty") ??
    scoreable[0];

  // Nothing to score: every line is forfeited, or the lineup was never set.
  if (!entry) redirect(`/dashboard/team/schedule/${eventId}`);

  const preset: EventPreset = presetFor(
    event,
    entry,
    entry.matches[0] ?? null,
    programs,
  );

  const outcomes = Object.fromEntries(
    scoreable.map((candidate) => {
      const resolved = outcomeForRound(candidate, null);
      return [
        candidate.id,
        resolved
          ? { kind: resolved.outcome.kind, side: resolved.outcome.side }
          : null,
      ];
    }),
  );

  return (
    <ScoreOnlyFlow
      preset={preset}
      lineup={lineupChoices(event, entries, programs, {
        includeNonPlayed: true,
      })}
      outcomes={outcomes}
      eventHref={`/dashboard/team/schedule/${eventId}`}
    />
  );
}
