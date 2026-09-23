import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { FilmTab } from "@/components/dashboard/matches/match-detail/film/film-tab";
import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import type { Match } from "@/lib/data/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

import type { FilmRefreshHarnessWindow } from "./film-playback-refresh-window";

/**
 * The Film tab, both players, in a real browser with a real `<video>`.
 *
 * What this harness exists to make observable is the one thing the controller
 * spec next door cannot: whether the ELEMENT follows. `film-attachment-playback.spec.ts`
 * drives T25's state machine with an injected clock and proves what it decides;
 * nothing there has a video in it, so "the renewed URL actually loaded and the
 * viewer did not move" is a claim only a browser can settle.
 *
 * Nothing on this side is stubbed but Supabase (the bookmark write, which no
 * test here touches) and `next/dynamic` (Next's runtime, not this feature's).
 * The refresh goes out over real `fetch` to the spec's own server, and the file
 * the element plays is a real 2-second clip served with range support.
 *
 * ── The timing ──────────────────────────────────────────────────────────────
 * The scheduled refresh fires `REFRESH_LEAD_MS` (two minutes) before the
 * credential expires, floored at one second. A harness that rendered a
 * half-hour credential would therefore wait half an hour, so the boot below
 * renders one that expires in `?ttl` milliseconds — a page opened on a stale
 * server render, which is a real case rather than a contrivance. Refreshed
 * credentials come back with a full lifetime, so exactly one pass runs unless
 * the spec asks for more.
 *
 * ── The clock ───────────────────────────────────────────────────────────────
 * Source times sit in the last half-second of the clip on purpose.
 * `POINT_BUFFER_SECONDS` is 1.5s, so any serve earlier than that has its
 * padded window start clamped to film zero and every stop would begin in the
 * same place — which would make "the selection moved" unassertable. At 1.7 /
 * 1.85 / 1.95 the three windows start at 0.2 / 0.35 / 0.45, far enough apart
 * that `REACHED_EPSILON_SECONDS` (0.1) still leaves a stretch of film before
 * the first point where no row is lit at all.
 */

const harness = window as unknown as FilmRefreshHarnessWindow;

const ATTACHMENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** The published file's server-verified length. The clip really is 2.000s. */
const DURATION = 2;

function point(
  id: string,
  videoTime: number | null,
  overrides: Partial<MatchPoint> = {},
): MatchPoint {
  return {
    id,
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Forehand Winner",
    eventType: "Forehand Winner",
    description: "Rally",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 4,
    duration: null,
    videoTime,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

/** Three timed points and one the source never timed, which has no stop. */
/**
 * A personal workspace, because the Film subtree now reads one.
 *
 * `PointList` and "This point" lead the viewer's own rows with the workspace's
 * mark, so both call `useWorkspace()`, which THROWS without a provider — in the
 * app `dashboard/layout.tsx` supplies it. Nothing here asserts on the mark; the
 * provider is present so the tree renders at all.
 */
const WORKSPACE: WorkspaceContextValue = {
  active: {
    id: "viewer-1",
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "UTC",
    role: "owner",
    mark: "CG",
    iconUrl: null,
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: true,
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    eventsPolicy: "owner",
    myPlayerId: null,
  },
  available: [],
  viewer: {
    id: "viewer-1",
    email: "viewer@example.com",
    name: "Viewer",
    firstName: "Viewer",
    initials: "CG",
    avatarUrl: null,
    plan: "free",
    role: null,
    memberSince: null,
    onboardedAt: null,
  },
};

/**
 * Two timed shots per point, so the drawer has a well to hold (T18). On the
 * same clock as `videoTime`, 40ms apart, inside the last half-second of the
 * clip beside the point's own serve; every other field is what the source
 * never measured.
 */
function shots(pointId: string, first: number): MatchShot[] {
  return [first, first + 0.04].map((videoTime, i) => ({
    id: `${pointId}-shot-${i + 1}`,
    shotNumber: i + 1,
    isPlayer1: i % 2 === 0,
    shotType: i === 0 ? "Serve" : "Forehand",
    spinType: null,
    speedMph: null,
    zone: null,
    result: null,
    videoTime: Number(videoTime.toFixed(2)),
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
  }));
}

/**
 * `?pad=N` appends N untimed points after the four below, so the drawer's
 * list is taller than a 720px viewport and really scrolls. Untimed rows are
 * not seekable and have no stop, so the pad never touches the walk.
 */
const PAD = Number(new URLSearchParams(location.search).get("pad") ?? "0");

const POINTS: MatchPoint[] = [
  // Saved from the start so a spec can drive the unsave path — a delete
  // that matches zero rows (the mock's default shape) without first having
  // to land a save through the same mock.
  point("a", 1.7, { saved: true, shots: shots("a", 1.7) }),
  point("b", 1.85, {
    pointNumber: 2,
    resultType: "Ace",
    shots: shots("b", 1.85),
  }),
  point("c", 1.95, {
    pointNumber: 3,
    resultType: "Backhand Winner",
    shots: shots("c", 1.95),
  }),
  point("untimed", null, { pointNumber: 4, resultType: "Double Fault" }),
  ...Array.from({ length: PAD }, (_, i) =>
    point(`pad-${i + 1}`, null, {
      pointNumber: 5 + i,
      gameNumber: 2,
      resultType: "Unforced Error",
    }),
  ),
];

/**
 * The `FilmTab` behind the harness's remount seam.
 *
 * `MatchReportWhen` unmounts an inactive view, so a switch to Statistics and
 * back destroys and rebuilds exactly this subtree while the providers above it
 * stay put. Two synchronous flushes are the shortest honest imitation: the
 * first really unmounts (the `<video>` and the playback hook go with it), the
 * second builds a fresh tree.
 */
function FilmTabSlot({ video }: { video: MatchVideo }) {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    harness.remountFilmTab = () => {
      flushSync(() => setMounted(false));
      flushSync(() => setMounted(true));
    };
  }, []);
  // Feet: the shot rows' speeds read in mph, which is what these specs assert.
  return mounted ? <FilmTab video={video} unit="ft" /> : null;
}

/**
 * The provider behind the harness's re-seed seam.
 *
 * `router.refresh()` re-renders the match layout with a FRESH points array
 * while the provider instance (keyed on the match id) stays mounted. The
 * seam hands the provider a new array built from the same fixture with the
 * given saved flags overridden — the shape a refresh produces when the
 * server's copy differs from what the tab toggled meanwhile.
 */
function ProviderSlot({
  matchId,
  video,
}: {
  matchId: string;
  video: MatchVideo;
}) {
  const [points, setPoints] = useState<MatchPoint[]>(POINTS);
  useEffect(() => {
    harness.reseedPoints = (saved) => {
      flushSync(() =>
        setPoints(
          POINTS.map((p) => (p.id in saved ? { ...p, saved: saved[p.id] } : p)),
        ),
      );
    };
  }, []);
  return (
    <MatchDataProvider
      match={match(matchId)}
      statsResult={null}
      points={points}
    >
      <FilmTabSlot video={video} />
    </MatchDataProvider>
  );
}

function match(id: string): Match {
  return {
    id,
    tournamentName: "Spring Invitational",
    date: "2026-04-18",
    matchType: "Singles",
    round: "R1",
    player1: { name: "Marcus Reid", school: "Riverside" },
    player2: { name: "Jordan Alvarez", school: "Northgate" },
    score: {
      sets: [{ player1: 6, player2: 4 }],
      winner: "player1",
      finalScore: "6-4",
    },
    won: true,
    isUserPlayer1: true,
  };
}

function boot() {
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") ?? "ok-default";
  const ttl = Number(params.get("ttl") ?? "1000");
  const lineage = params.get("lineage") ?? "attachment";
  // Only the provider lineage ever needs a deliberately broken URL: an
  // attachment's load failure goes to the hook, and the point of the provider
  // case is the reload panel that has to survive all of this.
  const file = params.get("file") ?? "h264-faststart.mp4";

  const video: MatchVideo =
    lineage === "attachment"
      ? {
          url: `/fixtures/${file}?cred=initial`,
          expiresAt: new Date(Date.now() + ttl).toISOString(),
          startTimeSeconds: 0,
          source: "attachment",
          attachment: {
            id: ATTACHMENT,
            version: 1,
            durationSeconds: DURATION,
            contentType: "video/mp4",
            filename: "spring-invitational-r1.mp4",
          },
        }
      : {
          url: `/fixtures/${file}?cred=initial`,
          expiresAt: new Date(Date.now() + ttl).toISOString(),
          startTimeSeconds: 0,
          source: "vendor-copy",
          attachment: null,
        };

  const root = createRoot(document.getElementById("root")!);
  harness.unmount = () => root.unmount();

  root.render(
    <WorkspaceProvider value={WORKSPACE}>
      <ProviderSlot matchId={matchId} video={video} />
    </WorkspaceProvider>,
  );

  document.documentElement.dataset.hydrated = "true";
}

boot();
