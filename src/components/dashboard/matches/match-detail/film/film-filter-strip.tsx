"use client";

import { Filter } from "lucide-react";

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
 * No `next/navigation` here — the offline spec loads this file through
 * `createLoader()`.
 */
export function FilmFilterStrip({
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
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
      style={{ background: "var(--surface-subtle)" }}
    >
      <Filter
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
        {filmListSentence(filmFilters, names)}
      </span>
      <span
        className="size-[3px] rounded-full"
        style={{ background: "var(--ink-300)" }}
        aria-hidden="true"
      />
      <span className="text-micro tabular">
        {shown} of {total} {total === 1 ? "point" : "points"}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={filmFilters.clearAll}
        className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {filmStripAction(filmFilters)}
      </button>
    </div>
  );
}
