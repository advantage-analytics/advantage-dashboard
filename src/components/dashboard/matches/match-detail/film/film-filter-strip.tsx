"use client";

import { memo } from "react";

import { AppliedFilterStrip } from "@/components/dashboard/shared/applied-filter-strip";
import { draftCountLine } from "../match-filters/panel-draft";
import {
  filmListActive,
  filmListSentence,
  filmStripAction,
  type FilmListFilters,
} from "./film-list-filters";

/**
 * The Video tab's applied-filter strip — page level, ABOVE the video and the
 * point list (never inside the list's card), and only while something is
 * applied: a shared filter, a statistic's cut or "Saved only".
 *
 * The Matches page strip exactly (`matches/matches-page-content.tsx`, v3's
 * Data Table rule 6): the cut stated in words — never chips, never a badge —
 * middot, "N of M points", and one quiet action. "Clear filter" clears every
 * layer; a statistic's cut on its own reads "Back to all points", the way
 * back from the number the viewer clicked.
 *
 * The fullscreen film room does not draw it: the room has its own chrome, and
 * its points drawer keeps a header "Clear all".
 *
 * The strip and its unfold are `AppliedFilterStrip` (shared/), the Matches
 * page's own; this only words the Video tab's layers. It sits in the film
 * column's 16px gap (`film-tab.tsx`, `gap-4`).
 *
 * No `next/navigation` here — the offline spec loads this file through
 * `createLoader()`.
 */
export const FilmFilterStrip = memo(function FilmFilterStrip({
  filmFilters,
  names,
  shown,
  total,
}: {
  filmFilters: FilmListFilters;
  /** Short names, as the list prints them ("G. Revelli"). */
  names: { you: string; opponent: string };
  /** Points the list shows under every layer. */
  shown: number;
  /** Every point on the match. */
  total: number;
}) {
  return (
    <AppliedFilterStrip
      kind="film"
      gap={16}
      sentence={
        filmListActive(filmFilters)
          ? filmListSentence(filmFilters, names)
          : null
      }
      count={draftCountLine(shown, total)}
      action={filmStripAction(filmFilters)}
      onClear={filmFilters.clearAll}
    />
  );
});
