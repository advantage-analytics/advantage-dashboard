"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { BoardColumns } from "@/components/dashboard/matches/match-detail/film/film-score";

/**
 * Where the Video tab's film head is sitting, for the rail scoreboard (H1 ·
 * B2): the point under the head, the head's own time in film seconds, and
 * which score columns the match really carries.
 *
 * Its own context rather than a field on `MatchReportContext`: the head moves
 * several times a second, and every rail part reads the report context. Here
 * only the scoreboard re-renders; the publisher reads a setter that never
 * changes, so publishing does not re-render the film tab either.
 */
export interface FilmHead {
  point: MatchPoint;
  time: number;
  columns: BoardColumns;
}

const FilmHeadContext = createContext<FilmHead | null>(null);
const SetFilmHeadContext = createContext<
  ((head: FilmHead | null) => void) | null
>(null);

export function FilmHeadProvider({ children }: { children: ReactNode }) {
  const [head, setHead] = useState<FilmHead | null>(null);
  return (
    <SetFilmHeadContext value={setHead}>
      <FilmHeadContext value={head}>{children}</FilmHeadContext>
    </SetFilmHeadContext>
  );
}

/** The head, or null when no film is mounted or no point is under it. */
export function useFilmHead(): FilmHead | null {
  return use(FilmHeadContext);
}

/**
 * Publish the head from the film tab. Clears on unmount, so leaving the Video
 * view drops the scoreboard back to its final state. A no-op outside a
 * provider (the playback test harness mounts the tab bare).
 */
export function usePublishFilmHead(head: FilmHead | null): void {
  const setHead = use(SetFilmHeadContext);
  useEffect(() => {
    setHead?.(head);
  }, [setHead, head]);
  useEffect(() => () => setHead?.(null), [setHead]);
}
