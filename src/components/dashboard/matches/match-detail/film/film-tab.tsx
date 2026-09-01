"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { createClient } from "@/lib/supabase/client";

import { FilmEmptyState } from "./film-empty-state";
import { FilmPlayer, type FilmPlayerHandle } from "./film-player";
import { PointList } from "./point-list";
import {
  DEFAULT_FILM_FILTERS,
  applyFilmFilters,
  type FilmFilters,
} from "./film-filters";

/**
 * The Film room tab (artboard 46c with a video, 46d without).
 *
 * This component owns the state the player and the list have to agree on:
 * the playhead, the seek handle, the applied filter, and the saved flags. The
 * two children stay dumb about each other — the list asks for a seek, the
 * player reports where it got to, and the mapping from a playhead position to
 * "which row is playing" happens here, once, over the whole timeline rather
 * than per-row.
 */

export function FilmTab({ video }: { video: MatchVideo | null }) {
  if (!video) return <FilmEmptyState />;
  return <FilmRoom video={video} />;
}

/** Fallback window for a point the source never timed, in seconds. */
const ASSUMED_POINT_SECONDS = 10;

function FilmRoom({ video }: { video: MatchVideo }) {
  const { points: serverPoints } = useMatchData();
  const sides = useMatchSides();
  const supabase = useMemo(() => createClient(), []);
  const playerRef = useRef<FilmPlayerHandle>(null);

  const [points, setPoints] = useState<MatchPoint[]>(serverPoints);
  // The authoritative copy for the write path. `setPoints`' updater runs
  // during the NEXT render, so a handler that computed the new flag inside the
  // updater would still be holding the old value when it built the UPDATE a
  // line later. Reading and writing through the ref keeps the optimistic
  // value, the value sent to Postgres, and the value reverted to identical
  // even when somebody clicks two bookmarks in the same tick.
  const pointsRef = useRef<MatchPoint[]>(serverPoints);

  const [filters, setFilters] = useState<FilmFilters>(DEFAULT_FILM_FILTERS);
  const [tab, setTab] = useState<"points" | "saved">("points");
  const [currentTime, setCurrentTime] = useState(0);

  const youIsPlayer1 = sides.you.isPlayer1;

  const filteredPoints = useMemo(
    () => applyFilmFilters(points, filters, youIsPlayer1),
    [points, filters, youIsPlayer1],
  );

  const visiblePoints = useMemo(
    () => (tab === "saved" ? filteredPoints.filter((p) => p.saved) : filteredPoints),
    [filteredPoints, tab],
  );

  /**
   * The film's own order — every point that carries a `videoTime`, sorted by
   * it. Deliberately built from ALL points, not the filtered cut: the playhead
   * is somewhere in the match whether or not the current filter admits the
   * point it is inside, and a row that IS on screen should light up when the
   * film reaches it regardless of how the list was narrowed.
   */
  const timeline = useMemo(
    () =>
      points
        .filter((p) => p.videoTime != null)
        .slice()
        .sort((a, b) => (a.videoTime as number) - (b.videoTime as number)),
    [points],
  );

  /**
   * Which row is playing, and how far through it.
   *
   * The playing point is the last one whose `videoTime` the playhead has
   * passed. Its window ends at its own recorded `duration` when there is one —
   * that is the real length of the point — and otherwise at the next point's
   * start, so the underline still advances on a source that timed starts but
   * not lengths. Progress is clamped, so the bar sits full through the
   * changeover rather than overrunning into the next row.
   */
  const { activePointId, activeProgress } = useMemo(() => {
    let index = -1;
    for (let i = 0; i < timeline.length; i += 1) {
      if ((timeline[i].videoTime as number) <= currentTime) index = i;
      else break;
    }
    if (index === -1) return { activePointId: null, activeProgress: 0 };

    const point = timeline[index];
    const start = point.videoTime as number;
    const next = timeline[index + 1];
    const end =
      point.duration && point.duration > 0
        ? start + point.duration
        : next
          ? (next.videoTime as number)
          : start + ASSUMED_POINT_SECONDS;

    const span = Math.max(end - start, 0.001);
    return {
      activePointId: point.id,
      activeProgress: Math.min(1, Math.max(0, (currentTime - start) / span)),
    };
  }, [timeline, currentTime]);

  const handleSelect = useCallback((point: MatchPoint) => {
    if (point.videoTime == null) return;
    playerRef.current?.seekTo(point.videoTime);
  }, []);

  /**
   * Bookmark a point, optimistically, and put it back if the write did not
   * land.
   *
   * `.select()` on the update is the part that matters. RLS lets anyone who
   * can SEE a match read its points, but only `matches.created_by` may UPDATE
   * them — and an update filtered out by RLS is not an error, it is a
   * successful statement that touched zero rows. Without asking for the row
   * back, a coach viewing a teammate's match would watch the bookmark fill in
   * and then find it gone on reload. Echoing the stored value is also what
   * makes "it persisted" checkable rather than assumed.
   */
  const handleToggleSaved = useCallback(
    async (pointId: string) => {
      const before = pointsRef.current.find((p) => p.id === pointId);
      if (!before) return;
      const nextSaved = !before.saved;

      const optimistic = pointsRef.current.map((p) =>
        p.id === pointId ? { ...p, saved: nextSaved } : p,
      );
      pointsRef.current = optimistic;
      setPoints(optimistic);

      const { data, error } = await supabase
        .from("points")
        .update({ saved: nextSaved })
        .eq("id", pointId)
        .select("id, saved");

      const stored = !error && data?.length === 1 && data[0].saved === nextSaved;
      if (stored) return;

      const reverted = pointsRef.current.map((p) =>
        p.id === pointId ? { ...p, saved: before.saved } : p,
      );
      pointsRef.current = reverted;
      setPoints(reverted);
    },
    [supabase],
  );

  return (
    <div className="flex flex-col gap-4">
      <FilmPlayer
        ref={playerRef}
        video={video}
        points={filteredPoints}
        onTimeChange={setCurrentTime}
      />

      <PointList
        allPoints={points}
        visiblePoints={visiblePoints}
        filteredCount={filteredPoints.length}
        filters={filters}
        onFiltersChange={setFilters}
        tab={tab}
        onTabChange={setTab}
        activePointId={activePointId}
        activeProgress={activeProgress}
        onSelect={handleSelect}
        onToggleSaved={handleToggleSaved}
      />
    </div>
  );
}
