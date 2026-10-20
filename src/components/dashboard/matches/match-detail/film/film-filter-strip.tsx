"use client";

import { memo } from "react";
import { Filter } from "lucide-react";

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
 * The Matches page strip's grammar (`matches/matches-page-content.tsx`, v3's
 * Data Table rule 6): the cut stated in words — never chips, never a badge —
 * middot, "N of M points", and one quiet action. "Clear filter" clears every
 * layer; a statistic's cut on its own reads "Back to all points", the way
 * back from the number the viewer clicked.
 *
 * Its surface is this view's own (2026-10-19): a card on the same white,
 * hairline and radius as the player and the point list under it, at the 12px
 * the list's trigger reads at, rather than the Matches page's grey wash — on
 * a page of cards the wash read as a slab dropped between the title and the
 * film.
 *
 * The fullscreen film room does not draw it: the room has its own chrome, and
 * its points drawer keeps a header "Clear all".
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
  if (!filmListActive(filmFilters)) return null;
  return (
    <div
      role="status"
      data-film-filter-strip=""
      className="surface-card flex min-h-11 shrink-0 flex-wrap items-center gap-2.5 px-4 py-2.5"
    >
      <Filter
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--ink-900)" }}
      >
        {filmListSentence(filmFilters, names)}
      </span>
      <span
        className="size-[3px] rounded-full"
        style={{ background: "var(--ink-300)" }}
        aria-hidden="true"
      />
      <span className="tabular text-[12px]" style={{ color: "var(--ink-500)" }}>
        {draftCountLine(shown, total)}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={filmFilters.clearAll}
        className="cursor-pointer rounded-[var(--radius-element)] text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {filmStripAction(filmFilters)}
      </button>
    </div>
  );
});
