import { createRoot } from "react-dom/client";

import { AskClipStrip } from "@/components/dashboard/ask/ask-clip-strip";
import type { AskShowFilm, AskShowPoint } from "@/lib/services/ask/show";

/**
 * The inline clip strip in a real browser; `tests/ask-clip-strip.spec.ts`
 * bundles this and reads the markup. The playback URL is `/hang.mp4`, which
 * the spec's server never answers, so the element sits loading and the
 * transport's own state is what the spec reads.
 *
 * Query string, `?case=`:
 * - `job`         the Advantage Intelligence lineage: the route's own URL,
 *                 no credential fetch
 * - `attachment`  an attachment: `GET /api/matches/[id]/video` (through the
 *                 recording `fetch` below) answers a credential
 * - `removed`     that route answers `attachment: null`
 * - `denied`      that route refuses with 403
 * - `expired`     the video was removed for going a year unwatched
 * - `untimed`     ready, but no point has a time on the film
 */
const params = new URLSearchParams(window.location.search);
const kind = params.get("case") ?? "job";

export const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES_AT = "2099-01-01T00:00:00.000Z";

const POINTS: AskShowPoint[] = [
  {
    pointNumber: 3,
    setNumber: 1,
    gameNumber: 1,
    pointScore: "30-15",
    gameScore: "0-0",
    resultType: "Ace",
    iWon: true,
    iServed: true,
    videoTime: kind === "untimed" ? null : 100,
    duration: 4,
  },
  {
    pointNumber: 7,
    setNumber: 1,
    gameNumber: 2,
    pointScore: "15-0",
    gameScore: "1-0",
    resultType: "Backhand Winner",
    iWon: true,
    iServed: false,
    videoTime: kind === "untimed" ? null : 130,
    duration: null,
  },
  {
    pointNumber: 12,
    setNumber: 1,
    gameNumber: 3,
    pointScore: "40-40",
    gameScore: "1-1",
    resultType: "Double Fault",
    iWon: false,
    iServed: true,
    videoTime: kind === "untimed" ? null : 160,
    duration: 6,
  },
  // Untimed in every case: never a window.
  {
    pointNumber: 20,
    setNumber: 2,
    gameNumber: 1,
    pointScore: "0-0",
    gameScore: "0-0",
    resultType: "Forehand Winner",
    iWon: true,
    iServed: true,
    videoTime: null,
    duration: null,
  },
];

const film: AskShowFilm =
  kind === "expired"
    ? { state: "expired", expiredAt: "2026-09-01T00:00:00.000Z" }
    : kind === "job"
      ? {
          state: "ready",
          source: "job",
          playback: {
            url: "/hang.mp4",
            expiresAt: EXPIRES_AT,
            offsetSeconds: 90,
            durationSeconds: null,
          },
        }
      : {
          state: "ready",
          source: "attachment",
          playback: {
            url: "/unused.mp4",
            expiresAt: EXPIRES_AT,
            offsetSeconds: 0,
            durationSeconds: null,
          },
        };

const w = window as unknown as { __clipFetches?: string[] };

/** What `GET /api/matches/[id]/video` answers for this case. */
const fetchImpl: typeof fetch = async (input) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  (w.__clipFetches ??= []).push(url);
  if (kind === "removed") {
    return new Response(JSON.stringify({ attachment: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (kind === "denied") {
    return new Response(JSON.stringify({ error: "no", code: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      attachment: {
        id: "att-1",
        version: 2,
        offsetSeconds: 90,
        confirmedVideoTimeSeconds: 0,
        durationSeconds: 3600,
        contentType: "video/mp4",
        filename: "match.mp4",
        playbackUrl: "/hang.mp4",
        playbackExpiresAt: EXPIRES_AT,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

createRoot(document.getElementById("root")!).render(
  <AskClipStrip
    matchId={MATCH_ID}
    points={POINTS}
    film={film}
    href={`/dashboard/matches/${MATCH_ID}?tab=film&pn=3%2C7%2C12`}
    fetchImpl={fetchImpl}
  />,
);
document.documentElement.dataset.hydrated = "true";
