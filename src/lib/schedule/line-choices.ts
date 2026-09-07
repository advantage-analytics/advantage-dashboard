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
import { supportsVideo as entrySupportsVideo } from "@/lib/schedule/entry-state";

/**
 * The preset for one entry (and, optionally, one of its matches) within an
 * event — the `?entry=` branch of the upload page, and `lineupChoices`
 * below, which needs one per sibling line.
 *
 * `programs` is the resolved `programNamesFor` map for every opponent
 * program behind the event's entries, keyed by `programId`.
 */
export function presetFor(
  event: ProgramEvent,
  entry: EventEntry,
  match: EventEntry["matches"][number] | null,
  programs: Map<string, { key: string; school: string }>
): EventPreset {
  return {
    kind: "line",
    entryId: entry.id,
    eventId: event.id,
    eventName: event.name,
    matchId: match?.id ?? null,
    round: entry.slot ?? match?.round ?? null,
    playerName: entry.playerLabels.join(" / "),
    // Singles only. A doubles line has two accounts and one `player1_id`
    // column, so there is no non-arbitrary answer and null is the honest
    // one — see the note on EventPreset.playerUserId.
    playerUserId:
      entry.discipline === "doubles" ? null : (entry.playerUserIds[0] ?? null),
    opponentName: (match?.opponentLabels ?? entry.opponentLabels).join(" / ") || "",
    date: event.startsOn,
    surface: event.surface,
    bestOf: event.format.bestOf,
    adScoring: event.format.adScoring,
    score: match?.score ?? null,
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
 * not pickable.
 */
export function lineupChoices(
  event: ProgramEvent,
  entries: EventEntry[],
  programs: Map<string, { key: string; school: string }>
): LineChoice[] {
  return [...entries]
    .sort((a, b) => a.position - b.position)
    .flatMap((entry): LineChoice[] => {
      const slot = entry.slot ?? entry.matches[0]?.round ?? `#${entry.position + 1}`;
      const playerName = entry.playerLabels.join(" / ") || null;
      if (!playerName || entry.forfeit !== null) {
        return [{ slot, playerName, state: "unset", preset: null }];
      }
      const match = entry.matches[0] ?? null;
      const state: LineChoice["state"] = !match ? "open" : match.hasVideo ? "video" : "result";
      return [{ slot, playerName, state, preset: presetFor(event, entry, match, programs) }];
    })
    .filter((choice, index, all) => all.findIndex((c) => c.slot === choice.slot) === index);
}
