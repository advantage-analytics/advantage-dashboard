"use client";

import Link from "next/link";
import { RefreshCw, Timer } from "lucide-react";

import { advButton } from "@/lib/ui/adv-button";
import {
  canTakeFilmAction,
  matchVideoWizardHref,
  type MatchFilmEntry,
} from "@/lib/match-video/film-entry";

/**
 * Replace video · Adjust alignment — the two entries for a match that already
 * has one.
 *
 * Drawn from {@link MatchFilmEntry.actions} and from nothing else, so a viewer
 * who is not the creator gets an empty list and therefore an empty row, which
 * renders as no row at all. There is deliberately no disabled variant: a
 * greyed "Replace video" tells a teammate that replacing is a thing this page
 * does and that they are the wrong person, which is a sentence the page has no
 * reason to say.
 *
 * Neither is a primary. The action on this surface is watching the match; both
 * of these are maintenance, and `advButton("ghost")` is what the design system
 * gives a secondary action sitting beside content rather than under a form.
 * "Add video" never appears here — by construction, since an active attachment
 * is what put this row on screen, and because a second attachment is the one
 * mistake this whole feature is shaped to prevent.
 */
export function FilmEntryActions({
  matchId,
  entry,
}: {
  matchId: string;
  entry: MatchFilmEntry;
}) {
  const mayReplace = canTakeFilmAction(entry, "replace");
  const mayAlign = canTakeFilmAction(entry, "align");
  if (!mayReplace && !mayAlign) return null;

  return (
    <div
      className="flex items-center justify-end gap-2"
      data-testid="film-entry-actions"
    >
      {mayAlign && (
        <Link
          href={matchVideoWizardHref(matchId, "align")}
          className={advButton("ghost", "sm")}
          data-testid="film-action-align"
        >
          <Timer className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Adjust alignment
        </Link>
      )}
      {mayReplace && (
        <Link
          href={matchVideoWizardHref(matchId, "replace")}
          className={advButton("ghost", "sm")}
          data-testid="film-action-replace"
        >
          <RefreshCw
            className="size-3.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          Replace video
        </Link>
      )}
    </div>
  );
}
