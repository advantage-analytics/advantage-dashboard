/**
 * Which line (and which of its matches) a `/dashboard/team/upload?entry=`
 * visit is aimed at — or that it is aimed at nothing and must be redirected.
 *
 * Resolved against the WHOLE program schedule, never the upload queue. The
 * queue (`uploadQueueFrom`) is "every line with no video yet", and the moment
 * the wizard writes the match row and its processing job the line it is
 * uploading to stops being one: `useUploadMatchWizard` calls `router.refresh()`
 * 300 ms after the create, the page re-renders on the server, and a lookup in
 * the queue no longer finds the line. The page then redirected to the bare
 * picker, which unmounted the success screen ("Uploading your video") while
 * the upload itself kept running with nothing on screen to show it.
 *
 * So `hasVideo` is deliberately NOT a reason to refuse here — attaching video
 * to a scored line, or re-rendering the line you are uploading to, are both
 * legitimate. Every other refusal the queue implied is kept: a forfeited line
 * or a match with a recorded outcome has nothing to film, and doubles is
 * score-only.
 *
 * Pure: no Supabase, no Next.js, so it is spec'd offline
 * (`tests/upload-target.spec.ts`).
 */

import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";
import { outcomeForMatch, outcomeForRound } from "@/lib/schedule/entry-state";

/** The slice of `ProgramSchedule` this reads — kept structural on purpose. */
export interface UploadTargetSchedule {
  events: ProgramEvent[];
  entriesByEvent: Map<string, EventEntry[]>;
}

export type UploadTarget =
  | {
      kind: "preset";
      event: ProgramEvent;
      entry: EventEntry;
      /** Null for a line with no match yet — the wizard inserts one. */
      match: EntryMatch | null;
      /** Every entry of the event, for the pinned bar's Change menu. */
      siblings: EventEntry[];
    }
  | { kind: "redirect" };

const REDIRECT: UploadTarget = { kind: "redirect" };

export function resolveUploadTarget(
  schedule: UploadTargetSchedule,
  entryId: string,
  matchId: string | null | undefined,
): UploadTarget {
  for (const event of schedule.events) {
    const siblings = schedule.entriesByEvent.get(event.id) ?? [];
    const entry = siblings.find((candidate) => candidate.id === entryId);
    if (!entry) continue;

    // A forfeited line never minted a match and never will.
    if (outcomeForRound(entry, null) !== null) return REDIRECT;

    // Doubles is score-only (decision 2026-09-22): no video analysis, no
    // SwingVision statistics. No link sends a doubles line here, but a
    // hand-built URL or a stale bookmark still can.
    if (entry.discipline !== "singles") return REDIRECT;

    // A round with a recorded outcome (walkover, default…) has nothing to film.
    const playable = entry.matches.filter(
      (match) => outcomeForMatch(entry, match) === null,
    );

    if (matchId) {
      // The row that was clicked, not the entry's first match. A `?match=`
      // this entry does not hold is NOT a reason to fall back to another
      // round: that attached the video to a DIFFERENT ROUND of the same run.
      const requested = playable.find((match) => match.id === matchId);
      return requested
        ? { kind: "preset", event, entry, match: requested, siblings }
        : REDIRECT;
    }

    if (playable.length === 0) {
      // No match yet and nothing recorded against the line: the wizard
      // creates the match. Matches that all carry an outcome: nothing to film.
      return entry.matches.length === 0 && !entry.outcomes?.length
        ? { kind: "preset", event, entry, match: null, siblings }
        : REDIRECT;
    }

    // `?entry=` alone: the first round still waiting for video, and — once
    // every round has video, e.g. on the refresh right after this very upload
    // created its job — the first round, rather than a redirect.
    const match =
      playable.find((candidate) => !candidate.hasVideo) ?? playable[0];
    return { kind: "preset", event, entry, match, siblings };
  }

  // Not a line of this program.
  return REDIRECT;
}
