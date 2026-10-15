/**
 * The wire shape of `POST /api/ask/show` and the client's reader for it,
 * split from `show.ts` so a client component can read the answer without
 * pulling the server's SQL guard (and its parser) into the page's bundle.
 * Pure: imports nothing that runs on the server.
 */

import { isRecord, type AskSourceMatch } from "@/lib/services/ask/events";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One point the film can show, from `ask.points` (sides) and `public.points` (the rest). */
export interface AskShowPoint {
  pointNumber: number;
  setNumber: number | null;
  gameNumber: number | null;
  /** Server-first, as the umpire calls it; null when the source recorded none. */
  pointScore: string | null;
  gameScore: string | null;
  resultType: string | null;
  /** The viewer's side, already turned by the view. Null when unknown. */
  iWon: boolean | null;
  iServed: boolean | null;
  /** On the source clock (`points.video_time`); null when the source never timed it. */
  videoTime: number | null;
  duration: number | null;
}

/** Whether the match has film to play, and how to reach it. */
export type AskShowFilm =
  | {
      state: "ready";
      /**
       * Both lineages play `playback.url` as signed here. Only an attachment
       * can renew a lapsed one (`GET /api/matches/[id]/video`); a job's is final.
       */
      source: "attachment" | "job";
      playback: {
        url: string;
        /** ISO 8601. */
        expiresAt: string;
        /** `MatchVideo.startTimeSeconds` — subtract from `videoTime` to seek. */
        offsetSeconds: number;
        durationSeconds: number | null;
      };
    }
  /** The video was removed for going a year unwatched (`filmEntryView`). */
  | { state: "expired"; expiredAt: string | null }
  | { state: "none" };

export type AskShowResponse =
  | {
      kind: "match";
      match: AskSourceMatch;
      /** The film on the first point with the rest queued. */
      href: string;
      /** The measure's cut, serialized for `?f=`; null when none. */
      filters: string | null;
      points: AskShowPoint[];
      /** True when the match holds more points than `points` could carry. */
      truncated: boolean;
      film: AskShowFilm;
    }
  | {
      kind: "matches";
      matches: { match: AskSourceMatch; points: number; href: string }[];
    };

/* ── Reading the answer back on the client ────────────────────────────────── */

function readFilm(value: unknown): AskShowFilm | null {
  if (!isRecord(value)) return null;
  if (value.state === "none") return { state: "none" };
  if (value.state === "expired") {
    return { state: "expired", expiredAt: stringOrNull(value.expiredAt) };
  }
  if (value.state !== "ready" || !isRecord(value.playback)) return null;
  const source =
    value.source === "attachment"
      ? "attachment"
      : value.source === "job"
        ? "job"
        : null;
  const { url, expiresAt, offsetSeconds, durationSeconds } = value.playback;
  if (
    source === null ||
    typeof url !== "string" ||
    typeof expiresAt !== "string" ||
    typeof offsetSeconds !== "number"
  ) {
    return null;
  }
  return {
    state: "ready",
    source,
    playback: {
      url,
      expiresAt,
      offsetSeconds,
      durationSeconds: numberOrNull(durationSeconds),
    },
  };
}

function readPoint(value: unknown): AskShowPoint | null {
  if (!isRecord(value)) return null;
  const pointNumber = numberOrNull(value.pointNumber);
  if (pointNumber === null) return null;
  return {
    pointNumber,
    setNumber: numberOrNull(value.setNumber),
    gameNumber: numberOrNull(value.gameNumber),
    pointScore: stringOrNull(value.pointScore),
    gameScore: stringOrNull(value.gameScore),
    resultType: stringOrNull(value.resultType),
    iWon: typeof value.iWon === "boolean" ? value.iWon : null,
    iServed: typeof value.iServed === "boolean" ? value.iServed : null,
    videoTime: numberOrNull(value.videoTime),
    duration: numberOrNull(value.duration),
  };
}

function readMatch(value: unknown): AskSourceMatch | null {
  if (!isRecord(value) || typeof value.matchId !== "string") return null;
  return {
    matchId: value.matchId,
    opponentName: stringOrNull(value.opponentName),
    playedOn: stringOrNull(value.playedOn),
    iWon: typeof value.iWon === "boolean" ? value.iWon : null,
    scoreText: stringOrNull(value.scoreText),
    playerName: stringOrNull(value.playerName),
  };
}

/** Only links into a match's own page are kept, as `readAskSourceMatch` keeps a watch link. */
function readHref(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/dashboard/matches/")
    ? value
    : null;
}

/**
 * The route's JSON as an {@link AskShowResponse}, or null for anything that
 * does not read back whole. Defensive, as every reader of a wire shape here.
 */
export function readAskShowResponse(value: unknown): AskShowResponse | null {
  if (!isRecord(value)) return null;
  if (value.kind === "matches") {
    if (!Array.isArray(value.matches)) return null;
    const matches: Extract<AskShowResponse, { kind: "matches" }>["matches"] =
      [];
    for (const item of value.matches) {
      if (!isRecord(item)) return null;
      const match = readMatch(item.match);
      const points = numberOrNull(item.points);
      const href = readHref(item.href);
      if (!match || points === null || !href) return null;
      matches.push({ match, points, href });
    }
    return { kind: "matches", matches };
  }
  if (value.kind !== "match") return null;
  const match = readMatch(value.match);
  const href = readHref(value.href);
  const film = readFilm(value.film);
  if (!match || !href || !film || !Array.isArray(value.points)) return null;
  const points: AskShowPoint[] = [];
  for (const item of value.points) {
    const point = readPoint(item);
    if (!point) return null;
    points.push(point);
  }
  return {
    kind: "match",
    match,
    href,
    filters: stringOrNull(value.filters),
    points,
    truncated: value.truncated === true,
    film,
  };
}
