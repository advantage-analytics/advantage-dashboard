"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { BallPathsFile } from "@/lib/services/splitstep/derivation/ball-paths";

import {
  filmBallPaths,
  parseBallPathsFile,
  type FilmBallPath,
} from "./film-ball";
import type { FilmClock } from "./film-timeline";
import { lobShotKeys } from "../match-filters/net-game";

/**
 * The match's derived ball paths, on the film clock — the room's only I/O for
 * them.
 *
 * ── Silence on every failure path is a requirement, not politeness ───────────
 *
 * The court works without this: with no paths, `estimatedBounceTime` places
 * every bounce exactly as it does today. So a refusal, a missing file, a body
 * that is not the file, an aborted request and a network error all answer the
 * same empty array, and none of them throws, sets an error state or logs.
 * Older matches and jobs with no trajectories are answered 200 with empty
 * `strokes` by the route for the same reason — a 404 would put a red line in
 * the console for a state that is entirely normal — and the room mounts in
 * specs with no router and no API behind it, where the fetch simply fails.
 *
 * The file is fetched at most ONCE per match id while enabled: it is derived
 * output that only re-derivation changes, so toggling the court or reopening
 * the room must not re-request it. The clock is applied on the way out rather
 * than at fetch time, so a corrected offset re-derives the times with no second
 * request.
 */

const NO_PATHS: readonly FilmBallPath[] = [];

/**
 * The last file this tab loaded, by match id. One entry: the report only ever
 * shows one match, and the Statistics view, the Video tab and the fullscreen
 * room each ask for the same file, so a view switch or opening the room finds
 * it here instead of downloading it again. Only a parsed file is kept — a
 * failure is asked again next mount, as it always was.
 */
let lastFile: { matchId: string; file: BallPathsFile } | null = null;

function cachedFile(matchId: string): BallPathsFile | null {
  return lastFile?.matchId === matchId ? lastFile.file : null;
}

/**
 * The match's raw ball-paths file (source-video clock), or `null` until it
 * lands and on every failure path — the silent fetch the header describes.
 * `useBallPaths` puts it on the film clock; `useLobShotKeys` reads lobs off
 * it.
 */
export function useBallPathsFile({
  matchId,
  enabled,
}: {
  matchId: string;
  enabled: boolean;
}): BallPathsFile | null {
  const [loaded, setLoaded] = useState<{
    matchId: string;
    file: BallPathsFile;
  } | null>(null);
  /** The match id already asked for, so `enabled` can flap for free. */
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (requested.current === matchId) return;
    if (cachedFile(matchId)) return;
    requested.current = matchId;

    const controller = new AbortController();
    let live = true;
    /** True once the request has answered, whatever it answered. */
    let settled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/matches/${matchId}/ball-paths`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          settled = true;
          return;
        }
        const file = parseBallPathsFile(await response.json());
        settled = true;
        if (file) lastFile = { matchId, file };
        // `live` is checked after the awaits, so nothing is set on an unmounted
        // component even though the abort usually gets there first.
        if (!file || !live) return;
        setLoaded({ matchId, file });
      } catch {
        // Deliberately empty — see the header. An abort lands here too.
      }
    })();

    return () => {
      live = false;
      controller.abort();
      // An aborted request answered nothing, so it must not count as asked:
      // otherwise React's development double-mount — or the viewer toggling
      // the court before the file arrives — leaves the room without ball
      // paths for good. A request that already landed keeps its claim.
      if (!settled) requested.current = null;
    };
  }, [enabled, matchId]);

  if (loaded && loaded.matchId === matchId) return loaded.file;
  return cachedFile(matchId);
}

export function useBallPaths({
  matchId,
  enabled,
  clock,
}: {
  matchId: string;
  enabled: boolean;
  clock: FilmClock;
}): readonly FilmBallPath[] {
  const file = useBallPathsFile({ matchId, enabled });

  // Depended on by value rather than by object identity: the clock's numbers
  // change far more rarely than the object holding them, and re-deriving a
  // whole match's paths on every render of a room that ticks four times a
  // second is the one cost worth avoiding here.
  const { offset, duration } = clock;
  return useMemo(
    () => (file ? filmBallPaths(file, { offset, duration }) : NO_PATHS),
    [file, offset, duration],
  );
}

/**
 * The match's lob shots (`lobShotKeys`), for the Net game card, the
 * head-to-head Lob row and the Video tab's lob cuts — or `null` while the file
 * is loading, when it is missing, and when it holds no strokes at all (an
 * older match, a SwingVision import: the route answers those 200 with empty
 * `strokes`). `null` is "unknown", never "no lobs": the cards show a dash and
 * a lobbed cut admits nothing.
 */
export function useLobShotKeys({
  matchId,
  enabled,
}: {
  matchId: string;
  enabled: boolean;
}): ReadonlySet<number> | null {
  const file = useBallPathsFile({ matchId, enabled });
  return useMemo(
    () => (file && file.strokes.length > 0 ? lobShotKeys(file) : null),
    [file],
  );
}
