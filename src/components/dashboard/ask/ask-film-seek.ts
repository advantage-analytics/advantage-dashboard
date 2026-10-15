"use client";

import { createContext, use } from "react";

import {
  MATCH_FILTERS_PARAM,
  parseMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { parsePointSet, POINT_SET_PARAM } from "@/lib/match-video/point-set";

/**
 * How an Ask answer reaches the film it is sitting beside.
 *
 * On the Ask page every "Watch" is a link into the match's Video tab. Inside
 * the film room's Ask drawer (`film/ask-film-drawer.tsx`) the film is already
 * on screen, so the same link should seek the player instead of navigating
 * away from the question. The drawer provides this context; the answer's
 * own pieces (`ask-show.tsx`, `ask-point-list.tsx`) read it and seek in
 * place when it is there, and fall back to the link when it is not.
 *
 * Components the drawer does not own — `ask-answer.tsx`'s figure tiles, the
 * sources' "Watch N points", the momentum marks — still render plain links;
 * the drawer intercepts their clicks and turns the href into a target with
 * {@link filmWatchTargetOf}, so nothing in them needs to know.
 */

export type AskFilmWatchTarget =
  /** Apply a cut (shared filters and/or a point set) and land on its first point. */
  | {
      kind: "cut";
      filters: MatchFilters | null;
      pointNumbers: number[] | null;
    }
  /** Seek to one point by number, leaving the cut as it is. */
  | { kind: "point"; pointNumber: number }
  /** Seek to one point by id (`?point=`), leaving the cut as it is. */
  | { kind: "pointId"; pointId: string };

export interface AskFilmSeek {
  /** The match the film shows; a link into another match navigates as usual. */
  matchId: string;
  watch(target: AskFilmWatchTarget): void;
}

export const AskFilmSeekContext = createContext<AskFilmSeek | null>(null);

/** The seek the drawer provides, or null on the Ask page. */
export function useAskFilmSeek(): AskFilmSeek | null {
  return use(AskFilmSeekContext);
}

/**
 * A link into `matchId`'s Video tab as a seek target, or null for any other
 * href (another match, another view, an outside link). Reads the three
 * forms the product writes: `?point=<uuid>` (one point, consumed on
 * arrival), `?pn=` (a point set) and `?f=` (the shared filters), each with
 * `tab=film`.
 */
export function filmWatchTargetOf(
  href: string,
  matchId: string,
): AskFilmWatchTarget | null {
  let url: URL;
  try {
    url = new URL(href, "http://ask.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://ask.local") return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (path !== `/dashboard/matches/${matchId}`) return null;

  const query = url.searchParams;
  const pointId = query.get("point");
  if (pointId) return { kind: "pointId", pointId };
  const pointNumbers = parsePointSet(query.get(POINT_SET_PARAM));
  const f = query.get(MATCH_FILTERS_PARAM);
  if (query.get("tab") !== "film" && !pointNumbers && !f) return null;
  // A link to exactly one point and no filter is a seek, not a cut: the
  // point list's own rows link this way, and clicking one should not
  // narrow the film to that point alone.
  if (pointNumbers && pointNumbers.length === 1 && !f) {
    return { kind: "point", pointNumber: pointNumbers[0] };
  }
  return {
    kind: "cut",
    filters: f ? parseMatchFilters(f) : null,
    pointNumbers,
  };
}
