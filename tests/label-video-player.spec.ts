import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { playingStopAt } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { labelFilmStops } from "@/components/admin/labels/label-film-stops";
import {
  POINT_TAIL_SECONDS,
  playingRowAt,
} from "@/lib/services/labels/playback";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import { tag, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The console's video: the label points as the film player's stops, then the player. The fixture's point 1 has
 * live strokes at 2472.0, 2473.1, 2474.4 and a tombstone at 2473.6; point 2 one at 2490.2; point 3 is deleted;
 * point 4's are untimed.
 */

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;

function points(): LabelPoint[] {
  return labelSessionFixture().points;
}

function stroke(
  id: string,
  pointId: string,
  videoTime: number | null,
  status: LabelShot["status"] = "kept",
): LabelShot {
  return {
    ...labelSessionFixture().points[0].shots[0],
    id,
    labelPointId: pointId,
    status,
    videoTime,
  };
}

function withShots(
  list: LabelPoint[],
  pointId: string,
  shots: LabelShot[],
): LabelPoint[] {
  return list.map((p) => (p.id === pointId ? { ...p, shots } : p));
}

test.describe("the player's stops", () => {
  test("one stop per point with a live, timed stroke, on the console's windows", () => {
    const stops = labelFilmStops(points(), 0);
    expect(stops.map((s) => s.point.id)).toEqual([P1, P2]);

    const [p1, p2] = stops;
    // Opens on the first stroke — no lead-in — and closes at the tail.
    expect(p1.start).toBe(2472.0);
    expect(p1.serve).toBe(2472.0);
    expect(p1.end).toBeCloseTo(2474.4 + POINT_TAIL_SECONDS, 6);
    // The last point closes at its own tail.
    expect(p2.start).toBe(2490.2);
    expect(p2.end).toBeCloseTo(2490.2 + POINT_TAIL_SECONDS, 6);
    expect(p1.point).toEqual({ id: P1, setNumber: 1, pointIndex: 0 });
  });

  test("deleted points, tombstoned strokes and untimed strokes have no place", () => {
    let list = withShots(points(), P3, [stroke("s-p3", P3, 2480)]);
    list = withShots(list, P4, [stroke("s-p4", P4, null)]);
    const stops = labelFilmStops(list, 0);
    // P3 is a tombstone however it is timed; P4's only stroke is untimed.
    expect(stops.map((s) => s.point.id)).toEqual([P1, P2]);
    // The tombstone at 2473.6 never extends or opens P1's window.
    expect(stops[0].end).toBeCloseTo(2474.4 + POINT_TAIL_SECONDS, 6);

    const onlyDead = withShots(points(), P2, [
      stroke("s-dead", P2, 2490.2, "deleted"),
    ]);
    expect(labelFilmStops(onlyDead, 0).map((s) => s.point.id)).toEqual([P1]);
  });

  test("stops are in video order, whatever order the rows are in", () => {
    const list = withShots(points(), P4, [
      stroke("s-p4-b", P4, 2460.5),
      stroke("s-p4-a", P4, 2460.0),
    ]);
    const stops = labelFilmStops([...list].reverse(), 0);
    expect(stops.map((s) => s.point.id)).toEqual([P4, P1, P2]);
    // A point's window opens on its EARLIEST stroke, not its first-listed.
    expect(stops[0].start).toBe(2460.0);
  });

  test("a window closes at the next point's first stroke when that is sooner", () => {
    const list = withShots(points(), P2, [stroke("s-close", P2, 2475.0)]);
    const [p1, p2] = labelFilmStops(list, 0);
    expect(p1.end).toBe(2475.0);
    expect(p2.start).toBe(2475.0);
  });

  test("times move onto the file's clock once, clamped at frame zero", () => {
    const stops = labelFilmStops(points(), 2400);
    expect(stops[0].start).toBeCloseTo(72.0, 6);
    expect(stops[0].end).toBeCloseTo(74.4 + POINT_TAIL_SECONDS, 6);
    expect(stops[1].serve).toBeCloseTo(90.2, 6);

    // A stroke before the file starts has nowhere earlier to go.
    const early = labelFilmStops(points(), 2480);
    expect(early[0].start).toBe(0);
    expect(early[0].end).toBe(0);
    expect(early[1].start).toBeCloseTo(10.2, 6);
  });

  test("the player's window and the table's playing row agree", () => {
    const offset = 2400;
    const list = points();
    const stops = labelFilmStops(list, offset);
    // Away from the 0.1s seek tolerance the player allows before a start.
    for (const time of [
      2400, 2471.5, 2472.0, 2473.0, 2474.4, 2477.0, 2477.5, 2485, 2490.2, 2492,
      2493.3, 2600,
    ]) {
      const row = playingRowAt(list, time);
      const stop = playingStopAt(stops, time - offset);
      expect(stop?.point.id ?? null, String(time)).toBe(row?.pointId ?? null);
    }
  });
});

test.describe("the player's film", () => {
  const VIDEO = {
    url: "https://example.test/v.mp4?sig=x",
    startTimeSeconds: 0,
  };
  const NAMES = { p1: "Lee", p2: "Vargas" };

  type NowPlaying = { id: string; point: number } | null;
  type Readout = {
    title: string;
    subtitle: string | null;
    position: { index: number; total: number } | null;
  };
  type PlayerProps = {
    video: typeof VIDEO | null;
    points: readonly LabelPoint[];
    readout?: Readout;
    onTime?: (videoTime: number) => void;
    initialReady?: boolean;
    initialFailure?: "format" | "link" | null;
  };

  function load() {
    const loader = createLoader();
    return {
      ...(loader.load("src/components/admin/labels/label-video.tsx") as {
        LabelVideoPlayer: React.ComponentType<PlayerProps>;
      }),
      ...(loader.load("src/components/admin/labels/label-now-playing.ts") as {
        nowPlayingReadout: (
          points: readonly LabelPoint[],
          nowPlaying: NowPlaying,
          names: typeof NAMES,
          scores: unknown,
        ) => Readout;
        nowPlayingOf: (
          points: readonly LabelPoint[],
          playing: { pointId: string; shotId: string } | null,
        ) => NowPlaying;
      }),
      ...(loader.load("src/lib/services/labels/score.ts") as {
        labelScores: (
          points: readonly LabelPoint[],
          adScoring: boolean,
        ) => unknown;
      }),
    };
  }

  /** The player as the console draws it: the playing point's own readout. */
  function render(props: Partial<PlayerProps> = {}): string {
    const { LabelVideoPlayer, nowPlayingReadout, labelScores } = load();
    const list = points();
    return renderToStaticMarkup(
      React.createElement(LabelVideoPlayer, {
        video: VIDEO,
        points: list,
        readout: nowPlayingReadout(
          list,
          { id: P1, point: 1 },
          NAMES,
          labelScores(list, true),
        ),
        onTime: () => {},
        ...props,
      }),
    );
  }

  /** The transport block: the element that holds the seek track. */
  function transport(html: string): string {
    const slider = html.indexOf('role="slider"');
    expect(slider).toBeGreaterThan(-1);
    const block = html.lastIndexOf(
      "absolute inset-x-0 bottom-0 flex flex-col",
      slider,
    );
    expect(block).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", block));
  }

  test("the Video tab's transport rides over the film", () => {
    const html = render({ initialReady: true });
    const bar = transport(html);
    const words = text(bar);

    // Title row: how the point ended · its last stroke, then set, game and
    // server, then the table's point number over the table's last.
    expect(words).toContain("Error · Forehand");
    expect(words).toContain("Set 1 · Game 1 · Lee serves");
    expect(words).toContain("Point 1 / 4");

    // The set-by-set track, then the control row, in the room's order.
    const row = bar.slice(bar.indexOf('role="slider"'));
    const order = [
      'role="slider"',
      'aria-label="Play"',
      'aria-label="Previous point"',
      'aria-label="Next point"',
      'aria-label="Skip dead time — off"',
      'aria-label="Playback speed, 1×"',
      'aria-label="Loop this point — off"',
      'aria-label="Sound — on"',
    ].map((needle) => row.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Opening: nothing measured yet, so the clock is one dash.
    expect(words).toContain("—");

    // The room's extras are left off.
    for (const absent of [
      "Save point",
      "Show the court",
      "Exit fullscreen",
      "More — not available yet",
    ]) {
      expect(html).not.toContain(absent);
    }
  });

  test("until the video can play, the frame is pending and the transport is inert", () => {
    const pending = render({ initialReady: false });
    expect(tag(pending, "data-label-video-frame")).toContain(
      'data-video-ready="false"',
    );
    expect(pending).toContain("data-label-video-pending");
    expect(pending).toContain('role="status"');
    expect(pending).toContain('aria-label="Loading video"');
    expect(pending).toContain("data-pending-bar");
    // The element is under the skeleton, never replaced by it.
    expect(pending).toContain('data-testid="label-video"');
    const bar = transport(pending);
    expect(bar.slice(0, bar.indexOf(">") + 1)).toContain('inert=""');

    // Pending is what a real element starts as.
    expect(render()).toContain("data-label-video-pending");

    const ready = render({ initialReady: true });
    expect(tag(ready, "data-label-video-frame")).toContain(
      'data-video-ready="true"',
    );
    expect(ready).not.toContain("data-label-video-pending");
    expect(ready).not.toContain('role="status"');
    const live = transport(ready);
    expect(live.slice(0, live.indexOf(">") + 1)).not.toContain("inert");
  });

  test("a media error says which thing broke: the link, or the file's format", () => {
    const link = render({ initialFailure: "link" });
    expect(link).toContain('data-testid="film-reload-panel"');
    expect(text(link)).toContain("The film stopped loading");
    expect(text(link)).toContain("Reload");

    // A good link the browser still refused: its own words, and Reload kept,
    // because a storage failure at load raises the same error code.
    const format = render({ initialFailure: "format" });
    expect(format).toContain('data-testid="film-format-panel"');
    expect(format).not.toContain('data-testid="film-reload-panel"');
    expect(text(format)).toContain("This browser can't play this video");
    expect(text(format)).toContain("If reloading doesn't help");
    expect(text(format)).toContain("Reload");
  });

  test("the title row leaves out what a point lacks, and says so in dead time", () => {
    const { nowPlayingReadout, labelScores } = load();
    const list = points();
    const scores = labelScores(list, true);

    expect(nowPlayingReadout(list, null, NAMES, scores)).toEqual({
      title: "Between points",
      subtitle: null,
      position: null,
    });

    // The tombstone at 2473.6 is not the last stroke; the added forehand is.
    expect(
      nowPlayingReadout(list, { id: P1, point: 1 }, NAMES, scores),
    ).toEqual({
      title: "Error · Forehand",
      subtitle: "Set 1 · Game 1 · Lee serves",
      position: { index: 1, total: 4 },
    });

    // No ending, no stroke, no server: the point's number stands in.
    const bare = list.map((p) =>
      p.id === P2
        ? {
            ...p,
            ending: null,
            server: null,
            shots: p.shots.map((shot) => ({ ...shot, stroke: null })),
          }
        : p,
    );
    const readout = nowPlayingReadout(
      bare,
      { id: P2, point: 2 },
      NAMES,
      labelScores(bare, true),
    );
    expect(readout.title).toBe("Point 2");
    expect(readout.subtitle).not.toContain("serves");
    expect(readout.position).toEqual({ index: 2, total: 4 });
  });

  test("the playing row as the list numbers it: point N", () => {
    const { nowPlayingOf } = load();
    const list = points();
    expect(nowPlayingOf(list, null)).toBeNull();
    expect(nowPlayingOf(list, { pointId: "gone", shotId: "s-return" })).toBe(
      null,
    );
    expect(nowPlayingOf(list, { pointId: P1, shotId: "s-return" })).toEqual({
      id: P1,
      point: 1,
    });
  });
});

test("the transport's two new props default to the room's bar", () => {
  const { FilmTransport } = createLoader().load(
    "src/components/dashboard/matches/match-detail/film/film-transport.tsx",
  ) as { FilmTransport: React.ComponentType<Record<string, unknown>> };
  const { TooltipProvider } = createLoader().load(
    "src/components/ui/tooltip.tsx",
  ) as { TooltipProvider: React.ComponentType<{ children: React.ReactNode }> };
  const base = {
    title: "Lee v Vargas",
    subtitle: null,
    position: { index: 1, total: 4 },
    segments: [{ start: 0, end: 100 }],
    duration: 100,
    currentTime: 10,
    playing: false,
    muted: false,
    rate: 1,
    looping: false,
    skippingDeadTime: false,
    saved: false,
    canStep: true,
    courtOn: true,
    previewSource: { url: null, generation: 0 },
    onSeek: () => {},
    onTogglePlay: () => {},
    onStep: () => {},
    onToggleSaved: () => {},
    onToggleSkipDeadTime: () => {},
    onCycleRate: () => {},
    onToggleLoop: () => {},
    onToggleMute: () => {},
    onToggleCourt: () => {},
    onExit: () => {},
  };
  const draw = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(FilmTransport, { ...base, ...props }),
      ),
    );

  const room = draw({});
  for (const present of [
    'aria-label="Save point"',
    'aria-label="Show the court — on"',
    'aria-label="Exit fullscreen"',
    'aria-label="More — not available yet"',
  ]) {
    expect(room).toContain(present);
  }
  expect(room).not.toContain("inert");
  // Spelling the defaults out changes nothing.
  expect(draw({ hide: [], disabled: false })).toBe(room);

  const dock = draw({
    hide: ["saved", "court", "exit", "more"],
    disabled: true,
  });
  expect(dock).not.toContain("Save point");
  expect(dock).not.toContain("Show the court");
  expect(dock).not.toContain("Exit fullscreen");
  expect(dock).not.toContain("More — not available yet");
  expect(dock).toContain('inert=""');
});

test.describe("why a signed film failed", () => {
  const { playbackFailure, signedUrlExpiry } = createLoader().load(
    "src/components/dashboard/matches/match-detail/film/playback-failure.ts",
  ) as typeof import("@/components/dashboard/matches/match-detail/film/playback-failure");

  const EXPIRY = Date.parse("2026-10-08T20:00:00Z");
  const URL_GOOD =
    "https://acct.blob.core.windows.net/advantage-videos/videos/u/m/original.mp4?sv=2025-11-05&se=2026-10-08T20%3A00%3A00Z&sr=b&sp=r&sig=x";

  test("the link's own expiry is read off the URL", () => {
    expect(signedUrlExpiry(URL_GOOD)).toBe(EXPIRY);
    expect(signedUrlExpiry("https://example.test/film.mp4")).toBeNull();
    expect(signedUrlExpiry("not a url")).toBeNull();
  });

  test("a decode-shaped error on a live link is the file's format", () => {
    for (const code of [3, 4]) {
      expect(playbackFailure({ code, url: URL_GOOD, now: EXPIRY - 1 })).toBe(
        "format",
      );
    }
  });

  test("anything else is still the link", () => {
    // The same codes once the link has run out: a 403 reads as "not supported".
    expect(playbackFailure({ code: 4, url: URL_GOOD, now: EXPIRY })).toBe(
      "link",
    );
    // Aborted, network, or no error object at all.
    for (const code of [1, 2, null, undefined]) {
      expect(playbackFailure({ code, url: URL_GOOD, now: EXPIRY - 1 })).toBe(
        "link",
      );
    }
    // An expiry that cannot be read keeps the old answer.
    expect(
      playbackFailure({ code: 4, url: "https://example.test/f.mp4", now: 0 }),
    ).toBe("link");
  });
});
