"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

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
import { parseCut, serializeCut, type FilmSectionId } from "./filters/types";
import { scoreColumns } from "./film-score";
import {
  activeShotAt,
  shotStops as buildShotStops,
  type ShotStop,
} from "./film-shots";
import { FilmThisPoint } from "./film-this-point";
import { activeStopAt } from "./film-timeline";
import { usePublishFilmHead } from "@/components/dashboard/matches/match-detail/film-head-context";
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
 * to agree on: the points and their saved flags, the applied filter, and the
 * report player's playhead. The children stay dumb about each other —
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

  // `useSearchParams()` can be null outside a Next router (the playback
  // harness mounts this with a bare createRoot); parseCut tolerates that.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilmFilters>(() => ({
    ...DEFAULT_FILM_FILTERS,
    ...parseCut(searchParams),
  }));
  // Mirror the quick cut into the URL so a reload or a shared link reopens the
  // same cut. Native history, no router call: Next keeps `useSearchParams` in
  // sync with `replaceState` and nothing refetches, so the film neither pauses
  // nor reloads. Pattern from
  // node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md
  // ("Using the native History API"). `serializeCut` is the only writer, so
  // Advanced axes never reach the URL and `tab=film` etc. are carried through.
  // Reads `window.location.search` (not the hook) so it never races a stale
  // snapshot, skips when already equal, and has no cleanup so unmount leaves
  // the query string alone.
  useEffect(() => {
    const current = window.location.search.replace(/^\?/, "");
    const next = serializeCut(filters, current);
    if (next === current) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`,
    );
  }, [filters]);
  // Advanced lives in the list column and its section state outlives the
  // panel, so a reopen finds the sections as they were left.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [openSections, setOpenSections] = useState<FilmSectionId[]>([]);
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

  const walkStops = useMemo(() => {
    const ids = new Set(filteredPoints.map((p) => p.id));
    return stops.filter((s) => ids.has(s.point.id));
  }, [stops, filteredPoints]);

  const columns = useMemo(() => scoreColumns(points), [points]);

  const active = useMemo(
    () => activeStopAt(stops, currentTime),
    [stops, currentTime],
  );

  // "Current point": the point under the playhead, its shots on the film clock
  // and the stroke being played. Shots are built from ALL points, like the
  // stops, so the card follows the film whether or not the cut admits it.
  //
  // The clock comes from the HOOK, not from `video.startTimeSeconds`. On an
  // attachment-backed match the controller owns it, and a corrected alignment
  // moves it — building shots off the server's original value would leave
  // every shot marker where the old alignment put it while the point stops
  // beside them moved, which reads as the shot data being wrong.
  const allShotStops = useMemo(
    () => buildShotStops(stops, clock),
    [stops, clock],
  );
  const activeShot = useMemo(
    () => activeShotAt(allShotStops, currentTime),
    [allShotStops, currentTime],
  );
  const activePoint = active?.stop.point ?? null;

  // The rail scoreboard's live state reads the point under the head from here
  // — the same `activeStopAt` the list and This point read — so scrubbing
  // rewrites all three from one answer.
  const filmHead = useMemo(
    () =>
      activePoint ? { point: activePoint, time: currentTime, columns } : null,
    [activePoint, currentTime, columns],
  );
  usePublishFilmHead(filmHead);
  const pointShots = useMemo(
    () =>
      activePoint
        ? allShotStops.filter((s) => s.point.id === activePoint.id)
        : [],
    [allShotStops, activePoint],
  );

  const handleSelectShot = useCallback((stop: ShotStop) => {
    playerRef.current?.seekTo(stop.start);
  }, []);

  /** The transport's own step, handed to anything else that walks points. */
  const handleStep = useCallback((direction: -1 | 1) => {
    playerRef.current?.step(direction);
  }, []);

  // "Point n / N" over the applied cut — the sequence prev/next walk.
  const position = useMemo(() => {
    if (!activePoint) return null;
    const index = walkStops.findIndex((s) => s.point.id === activePoint.id);
    return index === -1 ? null : { index: index + 1, total: walkStops.length };
  }, [walkStops, activePoint]);

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
   * A bookmark is a `point_bookmarks` row, shared per match: anyone who can
   * SEE the match reads every row on its points and may remove any of them;
   * INSERT is own-row, so `user_id` is never sent — the column default
   * supplies the caller. Saving inserts one row. Unsaving deletes every row
   * on the point, not just the caller's, because one surviving teammate row
   * would keep the point saved.
   *
   * The toggle asks for a desired state, not proof of a fresh row, so "the
   * database already agrees with you" counts as landed rather than as a
   * failure: an unsave whose DELETE matches zero rows (a teammate already
   * removed the last one) is landed, and a save whose INSERT hits the PK
   * conflict `23505` (a double-click, or a teammate saved it first) is
   * landed too — both leave the point in the state the caller asked for.
   * Only a save that fails with a different error (e.g. RLS refusing the
   * insert) reverts. This gives up UI-level detection of an RLS-refused
   * DELETE, which is fine: the loader only renders points from matches the
   * viewer can see, and T4's DELETE policy admits anyone who can see the
   * match.
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

      const { error } = nextSaved
        ? await supabase.from("point_bookmarks").insert({ point_id: pointId })
        : await supabase
            .from("point_bookmarks")
            .delete()
            .eq("point_id", pointId);

      const stored = nextSaved ? !error || error.code === "23505" : !error;
      if (stored) return;

      const reverted = pointsRef.current.map((p) =>
        p.id === pointId ? { ...p, saved: before.saved } : p,
      );
      pointsRef.current = reverted;
      setPoints(reverted);
    },
    [supabase],
  );

  const activePointId = activePoint?.id ?? null;
  const toggleSavedActive = useCallback(() => {
    if (activePointId) void handleToggleSaved(activePointId);
  }, [activePointId, handleToggleSaved]);

  /**
   * The room's keys, on the page while this view is open: ← ↑ step to the
   * previous point, → ↓ to the next, J / L move 5 seconds back / forward,
   * space plays and pauses, S saves the point on screen.
   * Off while the room is open (it has its own), while something is typing
   * (an input, a textarea, anything editable), while a dialog or popover is
   * open (the filters panel wants its own arrows), whenever focus is on a
   * control — a point row, a shot row, any button — because those own their
   * own keys and a keyboard user must still be able to walk the list and
   * scroll the pane, and on any key with a modifier, which is the browser's.
   */
  const roomOpen = room !== null;
  useEffect(() => {
    if (roomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], [role=dialog], [data-radix-popper-content-wrapper]",
        )
      ) {
        return;
      }
      if (
        document.querySelector(
          "[role=dialog][data-state=open], [data-radix-popper-content-wrapper]",
        )
      ) {
        return;
      }
      // Focus belongs to a control, so its keys do too.
      //
      // These shortcuts are for someone WATCHING — focus on the body, hands
      // off the page. The point list's rows are `role="button"` and
      // `tabIndex={0}`, so a keyboard user tabs into them, and arrows there
      // mean "move through the list" and "scroll", not "seek five seconds".
      // Taking them on `window` and calling `preventDefault` would leave that
      // viewer with no way to walk the list or scroll the pane at all — the
      // fullscreen room can claim the arrows because it covers the screen and
      // has nothing to scroll; a tab beside a scrolling list cannot.
      if (target?.closest("button, [role=button], [role=slider], a[href]")) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          playerRef.current?.togglePlay();
          break;
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          playerRef.current?.step(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          playerRef.current?.step(-1);
          break;
        case "l":
        case "L":
          e.preventDefault();
          playerRef.current?.seekBy(5);
          break;
        case "j":
        case "J":
          e.preventDefault();
          playerRef.current?.seekBy(-5);
          break;
        case "s":
        case "S":
          e.preventDefault();
          toggleSavedActive();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roomOpen, toggleSavedActive]);

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
    // Design canvas "Video B4": the player on the left with "Current point"
    // under it, the point list beside them in a fixed 320px column (the
    // room's own panel width) running the pane's full height, so finding a
    // point, watching it and reading its shots happen side by side. The view
    // takes the pane's height (`min-h-0 flex-1`, handed down by `When
    // scrollsInside`); the list column is a stretched flex item with no
    // content height of its own — its card is absolutely positioned inside
    // it — so it inherits that height and its rows scroll within the card.
    // Under 720px of pane (the `@container` breakpoint `statistics-view.tsx`
    // stacks at) the columns stack and the list takes what is left.
    <div
      ref={clockRef}
      className="flex min-h-0 flex-1 flex-col gap-4 @min-[720px]:flex-row"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
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
          background={roomOpen}
          stops={walkStops}
          allStops={stops}
          saved={activePoint ? activePoint.saved : null}
          onTimeChange={setCurrentTime}
          onPlaybackTime={reportTime}
          onPlaybackPlaying={reportPlaying}
          onLoadFailure={reportLoadFailure}
          onPlayRejected={reportPlayRejected}
          onRetry={retry}
          onToggleSaved={toggleSavedActive}
          onEnterFullscreen={enterRoom}
        />
        <FilmThisPoint
          point={activePoint}
          shots={pointShots}
          position={position}
          activeShotId={activeShot?.stop.shot.id ?? null}
          onSelectShot={handleSelectShot}
          // The same step the transport takes, so the widget's stepper walks
          // the applied cut rather than opening a second stepping path.
          onStep={handleStep}
        />
      </div>

      <div className="relative flex min-h-0 w-full shrink-0 flex-col @min-[720px]:w-[320px] @min-[720px]:self-stretch">
        {/* Side by side this box is out of flow, so the column contributes
            no height and inherits the row's (see the note on the row). */}
        <div className="flex min-h-0 flex-1 flex-col @min-[720px]:absolute @min-[720px]:inset-0">
          <PointList
            allPoints={points}
            // Neither list is split into Points/Saved tabs any more: "Saved
            // only" is an axis of the cut itself (`filters.savedOnly`), so
            // both render exactly what the filters admit — this column and
            // the room's drawer off the very same array.
            visiblePoints={filteredPoints}
            filters={filters}
            onFiltersChange={setFilters}
            advancedOpen={advancedOpen}
            onAdvancedOpenChange={setAdvancedOpen}
            openSections={openSections}
            onOpenSectionsChange={setOpenSections}
            activePointId={active?.stop.point.id ?? null}
            activeStart={active?.stop.start ?? 0}
            activeEnd={active?.stop.end ?? 0}
            onSelect={handleSelect}
            onToggleSaved={handleToggleSaved}
          />
        </div>
      </div>

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
          // One cut, one array: the room's drawer is the same list this
          // column draws (`PointList tone="dark"`), so it is handed the same
          // filter-applied points rather than a tab-scoped slice of its own.
          visiblePoints={filteredPoints}
          filters={filters}
          onFiltersChange={setFilters}
          onToggleSaved={handleToggleSaved}
          onExit={exitRoom}
          onHandoff={handoff}
          originRect={originRect}
        />
      )}
    </div>
  );
}
