"use client";

import { useRouter } from "next/navigation";

import { FilmEntryActions } from "./film-entry-actions";
import { FILM_REFUSAL_COPY } from "./film-refusal-copy";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { advButton } from "@/lib/ui/adv-button";
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
  const router = useRouter();
  const { actions } = useMatchReport();
  const stale = state === "stale";
  // Whether the page actually established that a video is attached. It is the
  // difference between "your video would not open" and "we could not find
  // out", and only one of those is true when the attachment read is what failed.
  const known = entry.attachment === "present";
  const copy = stale
    ? FILM_REFUSAL_COPY.stale
    : known
      ? FILM_REFUSAL_COPY.unavailable
      : FILM_REFUSAL_COPY.unknown;

  return (
    <div
      className="flex flex-1 flex-col items-start gap-3 py-8"
      role="alert"
      data-testid="film-unavailable"
      data-film-state={state}
    >
      <div className="flex max-w-[56ch] flex-col gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          {copy.heading}
        </h2>
        <p
          className="text-body-sm [text-wrap:pretty]"
          style={{ color: "var(--ink-600)" }}
        >
          {copy.body}
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          className={advButton("ghost", "sm")}
          onClick={() => actions.selectView("statistics")}
        >
          {FILM_REFUSAL_COPY.buttons.back}
        </button>
        {!stale && (
          <button
            type="button"
            className={advButton("primary", "sm")}
            onClick={() => router.refresh()}
          >
            {FILM_REFUSAL_COPY.buttons.retry}
          </button>
        )}
      </div>

      <FilmEntryActions matchId={matchId} entry={entry} />
    </div>
  );
}
