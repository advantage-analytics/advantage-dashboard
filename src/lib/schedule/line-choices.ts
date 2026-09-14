/**
 * Building an `EventPreset` (and the pinned bar's lineup menu) off a
 * schedule's own shapes.
 *
 * Moved out of `team/upload/page.tsx` — the only place this logic lived
 * before — so a second consumer does not have to reimplement it. Pure
 * functions only: no Supabase, no `"use client"`. `programNamesFor` (the
 * Supabase read behind `opponentProgramKey`/`opponentSchool`) stays a
 * server-data loader in `schedule-server.ts` and is passed in here as an
 * already-resolved `Map`.
 */

import type {
  EventPreset,
  LineChoice,
} from "@/components/dashboard/matches/new-match-wizard/types";
import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";
import {
  outcomeForRound,
  supportsVideo as entrySupportsVideo,
} from "@/lib/schedule/entry-state";
import { compareEntryOrder } from "@/lib/schedule/courts";
import { nextRound } from "@/lib/schedule/tournament-run";
import { lineFormat } from "@/lib/schedule/format";

/**
 * The preset for one entry (and, optionally, one of its matches) within an
 * event — the `?entry=` branch of the upload page, and `lineupChoices`
 * below, which needs one per sibling line.
 *
 * `programs` is the resolved `programNamesFor` map for every opponent
 * program behind the event's entries, keyed by `programId`.
 *
 * `round` is for a tournament entry, whose round is a real question: a dual
 * line's slot IS its round and wins outright. Without one the preset takes
 * the match's round, and with neither it is null — the score flow refuses to
 * save a tournament result with no round, and the server does too.
 */
export function presetFor(
  event: ProgramEvent,
  entry: EventEntry,
  match: EventEntry["matches"][number] | null,
  programs: Map<string, { key: string; school: string }>,
  round: string | null = null,
): EventPreset {
  // A doubles line is one set of the dual's doubles length, not the singles
  // best-of — see `lineFormat`.
  const played = lineFormat(event.format, entry.discipline);
  return {
    entryId: entry.id,
    eventId: event.id,
    eventName: event.name,
    matchId: match?.id ?? null,
    round: entry.slot ?? round ?? match?.round ?? null,
    playerName: entry.playerLabels.join(" / "),
    // Singles only. A doubles line has two accounts and one `player1_id`
    // column, so there is no non-arbitrary answer and null is the honest
    // one — see the note on EventPreset.playerUserId.
    playerUserId:
      entry.discipline === "doubles" ? null : (entry.playerUserIds[0] ?? null),
    opponentName:
      (match?.opponentLabels ?? entry.opponentLabels).join(" / ") || "",
    date: event.startsOn,
    surface: event.surface,
    bestOf: played.bestOf,
    adScoring: played.adScoring,
    gamesTo: played.gamesTo,
    score: match?.score ?? null,
    ending: match?.ending ?? null,
    discipline: entry.discipline,
    supportsVideo: entrySupportsVideo(entry),
    eventHref: `/dashboard/team/schedule/${event.id}`,
    site: event.site,
    eventKind: event.kind,
    opponentProgramKey: entry.opponentProgramId
      ? (programs.get(entry.opponentProgramId)?.key ?? null)
      : null,
    opponentSchool:
      entry.opponentSchool ??
      (entry.opponentProgramId
        ? (programs.get(entry.opponentProgramId)?.school ?? null)
        : null),
  };
}

/**
 * The event's lines as the pinned bar's Change menu lists them: every slot in
 * lineup order, each with its own state and — where someone holds it — the
 * preset to switch to. A line with video already is still listed (it is
 * legal to attach more video to a scored line), an unset one is listed but
 * not pickable. Non-played lines stay unset for upload by default; the score
 * flow opts into them so a saved outcome can be cleared or changed.
 *
 * A tournament entry is listed under `#n` (its position), never under a
 * round: two entries whose first match was the R32 are two rows, and the
 * de-duplication at the end is by that label. Its preset points at the NEXT
 * round to record (`nextRound`), so switching to it from the score flow's
 * Change menu never lands on a result already saved.
 */
export function lineupChoices(
  event: ProgramEvent,
  entries: EventEntry[],
  programs: Map<string, { key: string; school: string }>,
  options: { includeNonPlayed?: boolean } = {},
): LineChoice[] {
  return (
    [...entries]
      // By court on a dual, by `position` on a tournament — see `courts.ts` for
      // why a dual is never ordered by the stored integer.
      .sort(compareEntryOrder)
      .flatMap((entry): LineChoice[] => {
        const tournament = entry.slot === null;
        const slot = entry.slot ?? `#${entry.position + 1}`;
        const playerName = entry.playerLabels.join(" / ") || null;
        const round = tournament ? nextRound(entry) : null;
        const nonPlayed = outcomeForRound(entry, round);
        if (!playerName || (nonPlayed && !options.includeNonPlayed)) {
          return [{ slot, playerName, state: "unset", preset: null }];
        }
        const match = tournament
          ? (entry.matches.find((item) => item.round === round) ?? null)
          : (entry.matches[0] ?? null);
        const state: LineChoice["state"] = nonPlayed
          ? "result"
          : !match
            ? "open"
            : match.hasVideo
              ? "video"
              : "result";
        return [
          {
            slot,
            playerName,
            state,
            preset: presetFor(event, entry, match, programs, round),
          },
        ];
      })
      .filter(
        (choice, index, all) =>
          all.findIndex((c) => c.slot === choice.slot) === index,
      )
  );
}
