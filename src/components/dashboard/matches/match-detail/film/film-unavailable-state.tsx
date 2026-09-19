"use client";

import { AlertTriangle } from "lucide-react";

import { FilmEntryActions } from "./film-entry-actions";
import type { MatchFilmEntry } from "@/lib/match-video/film-entry";

/**
 * A match that HAS a video the page could not open.
 *
 * This is the state the design system's "never show an empty state for
 * something that exists but is unavailable" rule is about, and here the cost
 * of getting it wrong is not just a misleading screen: the empty state carries
 * an "Add video" button, so drawing it over a live attachment would invite a
 * duplicate upload — a second multi-gigabyte blob and a replacement nobody
 * asked for. `playback.ts` refuses the same fold at the API layer; this is the
 * same refusal with a face.
 *
 * Three sentences, because the page knows three different amounts:
 *
 *   stale               the active row's file is not there. Reloading will say
 *                       the same thing forever; replacing the video is the
 *                       repair, and it is offered to the creator right here.
 *   present, unreadable a video IS attached and the store could not be asked.
 *                       Reload — the file is fine.
 *   unknown             the saved state itself could not be read, so the page
 *                       does not know whether there is a video. It says that
 *                       rather than picking one of the two answers: claiming a
 *                       video exists would be a guess, and claiming none does
 *                       exists is the guess that ends in a duplicate upload.
 *
 * None of them ever offers "Add video". For the first two the row already
 * exists, so an add would be refused by the wizard route anyway; for the third
 * the page has no idea, and an offer made on no information is the exact fold
 * this component exists to prevent.
 */
export function FilmUnavailableState({
  matchId,
  entry,
  state,
}: {
  matchId: string;
  entry: MatchFilmEntry;
  state: "unavailable" | "stale";
}) {
  const stale = state === "stale";
  // Whether the page actually established that a video is attached. It is the
  // difference between "your video would not open" and "we could not find
  // out", and only one of those is true when the attachment read is what failed.
  const known = entry.attachment === "present";

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 py-16 pb-[72px] text-center"
      role="alert"
      data-testid="film-unavailable"
      data-film-state={state}
    >
      <AlertTriangle
        className="h-7 w-7 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="h-px w-6 bg-[var(--border-medium)]" aria-hidden="true" />

      <div className="flex max-w-[420px] flex-col items-center gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          {stale
            ? "This video is missing"
            : known
              ? "The video could not be opened"
              : "This match's video could not be checked"}
        </h2>
        <p
          className="text-body-sm [text-wrap:pretty]"
          style={{ color: "var(--ink-600)" }}
        >
          {stale
            ? "A video is attached to this match, but its file is no longer in storage. Replacing it is what puts the match back together."
            : known
              ? "A video is attached to this match and storage could not be reached just now. Reload in a moment — nothing has been lost."
              : "We could not read whether this match has a video. Reload in a moment — nothing has been lost."}
        </p>
      </div>

      <div className="pt-1">
        <FilmEntryActions matchId={matchId} entry={entry} />
      </div>
    </div>
  );
}
