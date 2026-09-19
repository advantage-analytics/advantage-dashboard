"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { createClient } from "@/lib/supabase/client";

import {
  filmEntryView,
  NO_FILM_ENTRY,
  type MatchFilmEntry,
} from "@/lib/match-video/film-entry";

import { FilmEmptyState } from "./film-empty-state";
import { FilmEntryActions } from "./film-entry-actions";
import { FilmUnavailableState } from "./film-unavailable-state";
import { FilmPlayer, type FilmPlayerHandle } from "./film-player";
import { PointList } from "./point-list";
import { scoreColumns } from "./film-score";
import { activeStopAt } from "./film-timeline";
import { useAttachmentPlayback } from "./use-attachment-playback";
import {
  DEFAULT_FILM_FILTERS,
  applyFilmFilters,
  type FilmFilters,
} from "./film-filters";

// The room is a screenful of its own — the overlay, the drawer, the transport
// and the track — and most visits to a match never open it. Loading it on the
// click keeps that weight off every match page's bundle.
const loadFilmFullscreen = () =>
  import("./film-fullscreen").then((m) => m.FilmFullscreen);
const FilmFullscreen = dynamic(loadFilmFullscreen, { ssr: false });

/**
 * The Film room tab (artboard 46c with a video, 46d without), plus the
 * fullscreen room it opens into.
 *
 * This component owns the state the player, the list and the fullscreen have
 * to agree on: the points and their saved flags, the applied filter, the tab,
 * and the report player's playhead. The children stay dumb about each other —
 * the list asks for a seek, the player reports where it got to, and the
 * mapping from a playhead position to "which row is playing" happens once,
 * over the whole timeline, in `film-timeline.ts`.
 *
 * Every time here is on the FILM clock (the trimmed file we serve); points
 * are converted from the recording's clock once, in `filmStops`.
 */

/**
 * `entry` is the server's answer to two questions this component must not
 * answer itself: is there a video at all, and may this viewer change it. It
 * decides which of the three no-video states is the truthful one —
 * `filmEntryView` holds that rule — so a storage failure can never arrive here
 * wearing the empty state's "Add video" button.
 *
 * It defaults to {@link NO_FILM_ENTRY}, which offers nothing: a caller that
 * forgot the prop gets a page with no controls, never one with the wrong ones.
 */
export function FilmTab({
  video,
  entry = NO_FILM_ENTRY,
}: {
  video: MatchVideo | null;
  entry?: MatchFilmEntry;
}) {
  if (video) return <FilmRoom video={video} entry={entry} />;
  const view = filmEntryView(entry);
  if (view === "empty") return <FilmEmptyState entry={entry} />;
  return <UnavailableFilm entry={entry} state={view} />;
}

/** Split out only so the match id can come from the provider, as it does below. */
function UnavailableFilm({
  entry,
  state,
}: {
  entry: MatchFilmEntry;
  state: "unavailable" | "stale";
}) {
  const { match } = useMatchData();
  return (
    <FilmUnavailableState matchId={match.id} entry={entry} state={state} />
  );
}

function FilmRoom({
  video,
  entry,
}: {
  video: MatchVideo;
  entry: MatchFilmEntry;
}) {
  const { match, points: serverPoints } = useMatchData();
  const sides = useMatchSides();
  const supabase = useMemo(() => createClient(), []);
  const playerRef = useRef<FilmPlayerHandle>(null);
  // `--film-t` is written here, so the player's bar and the list's playing
  // rule both move every frame.
  const clockRef = useRef<HTMLDivElement>(null);

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
  const [room, setRoom] = useState<{ time: number; playing: boolean } | null>(
    null,
  );
  // Fetch the room's code once the tab is idle, so the fullscreen glyph opens
  // it on the click rather than after a network round trip with nothing on
  // screen. Still off the page's first load.
  useEffect(() => {
    const warm = () => void loadFilmFullscreen();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(warm, 1500);
    return () => globalThis.clearTimeout(id);
  }, []);

  const youIsPlayer1 = sides.you.isPlayer1;

  /**
   * The credential, and the clock it implies.
   *
   * ONE hook for the whole room, not one per surface: a second controller
   * would be a second timer, a second recovery budget and — the part that
   * shows — a second `generation`, so the report player and the fullscreen
   * room could end up holding two different URLs for the same match.
   *
   * It is also the only clock now. `filmClock(video)` used to be built here
   * and `filmStops` derived from it, which was correct right up until a
   * correction arrived: the hook would rebuild its stops on the NEW offset
   * while this component kept deriving the old ones, and the two would
   * disagree about where every point is. The hook holds them both, and the
   * Advantage Intelligence lineage gets the same two values out of its
   * passthrough branch, built from exactly the same `filmClock` fields.
   */
  const playback = useAttachmentPlayback({
    matchId: match.id,
    video,
    points,
  });
  const clock = playback.clock;
  const stops = playback.stops;
  const {
    generation,
    resume,
    resumeApplied,
    reportTime,
    reportPlaying,
    reportLoadFailure,
    reportPlayRejected,
    retry,
  } = playback;

  /**
   * The resume intent: handed to the players, then given back to the hook.
   *
   * T25's note 1 — `resume` must be consumed with `resumeApplied()` or the
   * intent is re-offered on every render. It is consumed HERE rather than in a
   * player because both players may need it: the room mounts over a report
   * player that is still alive, and whichever called `resumeApplied()` first
   * would take it from the other. The order works out because child effects
   * run before the parent's: each player has already copied the intent into
   * its own landing ref by the time this runs. `install()` emits the new
   * `generation` and the intent in ONE snapshot, so the players receive both on
   * the same render — the remount and the instruction never arrive apart.
   *
   * T25's note 2 — `realign: true` means the stops were rebuilt and `filmTime`
   * is a resolved point start, so the point list's SELECTION has to move, not
   * just the playhead. It moves here rather than waiting for the element to
   * load and report back: a corrected alignment that took a while to fetch
   * would otherwise leave the list highlighting a row the new stops no longer
   * put the playhead inside.
   */
  useEffect(() => {
    if (!resume) return;
    if (resume.realign) {
      // The controller IS the external system this effect subscribes to, and
      // this is its update arriving — not a render cascading into itself. It
      // runs once per installed credential, never per frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentTime(resume.filmTime);
    }
    resumeApplied();
  }, [resume, resumeApplied]);

  const filteredPoints = useMemo(
    () => applyFilmFilters(points, filters, youIsPlayer1),
    [points, filters, youIsPlayer1],
  );

  const visiblePoints = useMemo(
    () =>
      tab === "saved" ? filteredPoints.filter((p) => p.saved) : filteredPoints,
    [filteredPoints, tab],
  );

  const walkStops = useMemo(() => {
    const ids = new Set(filteredPoints.map((p) => p.id));
    return stops.filter((s) => ids.has(s.point.id));
  }, [stops, filteredPoints]);

  const columns = useMemo(() => scoreColumns(points), [points]);

  const active = useMemo(
    () => activeStopAt(stops, currentTime),
    [stops, currentTime],
  );

  const handleSelect = useCallback(
    (point: MatchPoint) => {
      const stop = stops.find((s) => s.point.id === point.id);
      if (stop) playerRef.current?.seekTo(stop.start);
    },
    [stops],
  );

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

      const stored =
        !error && data?.length === 1 && data[0].saved === nextSaved;
      if (stored) return;

      const reverted = pointsRef.current.map((p) =>
        p.id === pointId ? { ...p, saved: before.saved } : p,
      );
      pointsRef.current = reverted;
      setPoints(reverted);
    },
    [supabase],
  );

  const enterRoom = useCallback(() => {
    const snapshot = playerRef.current?.snapshot() ?? {
      time: currentTime,
      playing: false,
    };
    playerRef.current?.pause();
    setRoom(snapshot);
  }, [currentTime]);

  // The room hands the playhead back as its exit starts (so the report frame
  // is already on the right picture under the shrinking room), then unmounts.
  const handoff = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);
  const exitRoom = useCallback(() => setRoom(null), []);
  const originRect = useCallback(
    () => playerRef.current?.frameRect() ?? null,
    [],
  );

  return (
    <div ref={clockRef} className="flex flex-col gap-4">
      {/* Above the player and right-aligned: maintenance for the person who
          owns the file, out of the way of the person watching. Renders
          nothing at all for everyone else. */}
      <FilmEntryActions matchId={match.id} entry={entry} />

      <FilmPlayer
        ref={playerRef}
        clockTargetRef={clockRef}
        url={playback.url}
        generation={generation}
        resume={resume}
        problem={playback.problem}
        passthrough={playback.passthrough}
        // While the room is up it is the surface being watched: this player
        // keeps its playhead through a refresh but stays silent, and the room
        // is what reports to the hook.
        background={room !== null}
        stops={walkStops}
        onTimeChange={setCurrentTime}
        onPlaybackTime={reportTime}
        onPlaybackPlaying={reportPlaying}
        onLoadFailure={reportLoadFailure}
        onPlayRejected={reportPlayRejected}
        onRetry={retry}
        onEnterFullscreen={enterRoom}
      />

      <PointList
        allPoints={points}
        visiblePoints={visiblePoints}
        filteredCount={filteredPoints.length}
        filters={filters}
        onFiltersChange={setFilters}
        tab={tab}
        onTabChange={setTab}
        activePointId={active?.stop.point.id ?? null}
        activeStart={active?.stop.start ?? 0}
        activeEnd={active?.stop.end ?? 0}
        onSelect={handleSelect}
        onToggleSaved={handleToggleSaved}
      />

      {room && (
        <FilmFullscreen
          url={playback.url}
          generation={generation}
          resume={resume}
          problem={playback.problem}
          passthrough={playback.passthrough}
          onPlaybackTime={reportTime}
          onPlaybackPlaying={reportPlaying}
          onLoadFailure={reportLoadFailure}
          onPlayRejected={reportPlayRejected}
          onRetry={retry}
          clock={clock}
          initial={room}
          stops={stops}
          walkStops={walkStops}
          columns={columns}
          allPoints={points}
          visiblePoints={visiblePoints}
          filters={filters}
          onFiltersChange={setFilters}
          tab={tab}
          onTabChange={setTab}
          onToggleSaved={handleToggleSaved}
          onExit={exitRoom}
          onHandoff={handoff}
          originRect={originRect}
        />
      )}
    </div>
  );
}
