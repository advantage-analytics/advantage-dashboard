import { EventHeaderSlot } from "@/components/dashboard/schedule/event-header-slot";
import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  canManageTeamSchedule,
  canUploadForProgram,
} from "@/lib/workspace/types";
import { getEventDetail, programNamesFor } from "@/lib/data/schedule-server";
import { entryState, outcomeForRound } from "@/lib/schedule/entry-state";
import { roundRank } from "@/lib/schedule/format";
import { lineupChoices, presetFor } from "@/lib/schedule/line-choices";
import { outcomeKey } from "@/lib/schedule/score-seed";
import { nextRound } from "@/lib/schedule/tournament-run";
import { ScoreOnlyFlow } from "@/components/dashboard/schedule/score-only-flow";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * Scoring an event's lines, one after another — the ONE place a result or a
 * non-played outcome is recorded for a dual line or a tournament entry.
 *
 * The event pages link here from their header and from every line; nothing
 * scores in place. A coach on the bus home with nine results on a piece of
 * paper wants the upload wizard's room with the video half switched off, and
 * the next line handed to them when they finish one; a coach correcting one
 * line arrives with `?entry=` and leaves with "Save and close". Same
 * `recordResult`, same tiebreak encoding, one amount of furniture.
 *
 * The gate mirrors `/dashboard/team/upload`'s, one line for one line, with the
 * one difference that a non-staff viewer lands back on the event they came
 * from rather than on a page they cannot use. Staff-only is not a preference:
 * `matches_block_client_regraft` refuses any client write naming an
 * `event_entry_id` unless `is_program_staff`, and `recordResult` opens with its
 * own `requireStaff`. A player offered this form would fill it in and be
 * refused at the end.
 *
 * A tournament entry is a whole run with one match per round, so the round is
 * a real question here where a dual line's slot answers it. It is asked in
 * the URL (`?round=`), not in client state: `recordResult` de-duplicates on
 * (entry, round) and UPDATES a round it already holds, so the form for a
 * recorded round must open with that round's score in it — which only the
 * server can seed. The flow's Round control navigates back here.
 */
export default async function ScoreEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ entry?: string; round?: string }>;
}) {
  const { eventId } = await params;
  const { entry: requestedEntryId, round: requestedRound } = await searchParams;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!canManageTeamSchedule(active))
    redirect(`/dashboard/team/schedule/${eventId}`);

  // This route only needs one event. React's request cache does not carry the
  // season loaded by a previous page into this navigation.
  const detail = await getEventDetail(active.id, eventId);
  if (!detail) notFound();

  const { event, entries } = detail;
  const tournament = event.kind === "tournament";

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

  // The round, for a tournament: `?round=` when it names one on the ladder,
  // otherwise the next one to record. A dual ignores it — its slot is its
  // round, and `presetFor` takes the slot first.
  const round = tournament
    ? requestedRound && roundRank(requestedRound) !== Number.MAX_SAFE_INTEGER
      ? requestedRound.toUpperCase()
      : nextRound(entry)
    : null;
  const match = tournament
    ? (entry.matches.find((item) => item.round === round) ?? null)
    : (entry.matches[0] ?? null);

  const preset: EventPreset = presetFor(event, entry, match, programs, round);

  // Saved outcomes, keyed the way the flow looks them up: per line on a dual,
  // per (entry, round) on a tournament.
  const outcomes = Object.fromEntries(
    scoreable.flatMap((candidate) => {
      if (!tournament) {
        const resolved = outcomeForRound(candidate, null);
        return [
          [
            outcomeKey(candidate.id, null),
            resolved
              ? { kind: resolved.outcome.kind, side: resolved.outcome.side }
              : null,
          ],
        ];
      }
      return (candidate.outcomes ?? []).map((outcome) => [
        outcomeKey(candidate.id, outcome.round),
        { kind: outcome.kind, side: outcome.side },
      ]);
    }),
  );

  // Every round an entry already holds something for — a match or an
  // outcome — so the Round control can say so before a coach overwrites it.
  const recordedRounds = Object.fromEntries(
    scoreable.map((candidate) => [
      candidate.id,
      [
        ...candidate.matches.map((item) => item.round),
        ...(candidate.outcomes ?? []).map((item) => item.round),
      ].filter((value): value is string => value !== null),
    ]),
  );

  return (
    <>
      <EventHeaderSlot
        eventId={eventId}
        name={event.name}
        kind={event.kind}
        leaf="Add score"
      />
      {/* Keyed on the URL's answer: the flow seeds its current line once, so
          a Round change (a `router.replace` back here) must remount it. */}
      <ScoreOnlyFlow
        key={`${entry.id}:${round ?? ""}`}
        preset={preset}
        lineup={lineupChoices(event, entries, programs, {
          includeNonPlayed: true,
        })}
        outcomes={outcomes}
        recordedRounds={recordedRounds}
        eventHref={`/dashboard/team/schedule/${eventId}`}
        canUpload={canUploadForProgram(active)}
      />
    </>
  );
}
