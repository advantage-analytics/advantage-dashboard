import { expect, test } from "@playwright/test";

import {
  alignedResumeTime,
  clockOf,
  compareSources,
  createAttachmentPlaybackController,
  EXPIRY_BLAME_WINDOW_MS,
  fetchPlaybackSource,
  isExpiryRelated,
  MIN_REFRESH_DELAY_MS,
  REFRESH_LEAD_MS,
  refreshDelayMs,
  sourceFromMatchVideo,
  TRANSIENT_RETRY_MS,
  type AttachmentPlaybackController,
  type AttachmentPlaybackSource,
  type RefreshOutcome,
} from "@/components/dashboard/matches/match-detail/film/use-attachment-playback";
import { filmStops } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import type { MatchVideo } from "@/lib/data/match-video-server";

import { pt } from "./fixtures/film-point";

/**
 * The attachment playback credential's state machine (T25).
 *
 * The claims worth pinning are the ones that go wrong silently:
 *
 *   1. A silent refresh must not move anybody. Someone paused at 12:34 is
 *      still paused at 12:34 afterwards.
 *   2. A replacement or a correction must NOT hand the old second back. The
 *      raw playhead is about footage or an alignment that no longer applies;
 *      only the point survives.
 *   3. Nothing may retry forever. One load-failure recovery, one transient
 *      retry, and a schedule that waits out an expiry which did not advance
 *      once and then gives up on it rather than asking every second.
 *   4. A rejected `play()` is autoplay policy, not an expired credential, and
 *      must reach neither the refresh path nor the recovery budget.
 *   5. A response that lost a race changes nothing.
 *
 * Every test drives the controller directly with an injected clock, timers and
 * request, so expiry happens in microseconds and no browser is involved.
 */

/* -------------------------------------------------------------------------
 * Harness
 * ---------------------------------------------------------------------- */

const MATCH = "11111111-2222-3333-4444-555555555555";
const ATTACHMENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ATTACHMENT = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";

/** Points on the SOURCE clock — the one that survives a replacement. */
const POINTS = [
  pt({ id: "p1", videoTime: 100, duration: 10, gameNumber: 1 }),
  pt({ id: "p2", videoTime: 200, duration: 10, gameNumber: 1 }),
  pt({ id: "p3", videoTime: 300, duration: 10, gameNumber: 2 }),
  pt({ id: "untimed", videoTime: null }),
];

const T0 = 1_700_000_000_000;
/** The playback SAS lives 30 minutes. */
const TTL = 30 * 60 * 1000;

function source(
  overrides: Partial<AttachmentPlaybackSource> = {},
): AttachmentPlaybackSource {
  return {
    url: "https://blob.example/first.mp4?sig=one",
    expiresAt: T0 + TTL,
    attachmentId: ATTACHMENT,
    version: 1,
    // Camera rolling 40s before the source clock's first point.
    offsetSeconds: -40,
    durationSeconds: 900,
    ...overrides,
  };
}

interface Harness {
  controller: AttachmentPlaybackController;
  /** Move the clock and fire every timer that has come due. */
  advance(ms: number): Promise<void>;
  /** Fire the pending timer without moving the clock. */
  fire(): Promise<void>;
  settle(): Promise<void>;
  calls: { signalAborted: () => boolean }[];
  answers: RefreshOutcome[];
  hasTimer(): boolean;
  /** Milliseconds from "now" until the armed timer fires. */
  timerIn(): number | null;
}

function harness(
  options: {
    initial?: AttachmentPlaybackSource;
    answers?: RefreshOutcome[];
    start?: boolean;
  } = {},
): Harness {
  let clock = T0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const calls: Harness["calls"] = [];
  const answers = options.answers ?? [];
  /** Resolvers for answers the test wants to settle by hand. */
  const pendingResolvers: ((outcome: RefreshOutcome) => void)[] = [];

  const controller = createAttachmentPlaybackController({
    matchId: MATCH,
    initial: options.initial ?? source(),
    points: POINTS,
    deps: {
      now: () => clock,
      setTimer: (run, ms) => {
        const id = nextId++;
        timers.set(id, { at: clock + ms, run });
        return id;
      },
      clearTimer: (handle) => {
        timers.delete(handle as number);
      },
      fetchPlayback: (_matchId, signal) => {
        calls.push({ signalAborted: () => signal?.aborted ?? false });
        const answer = answers.shift();
        if (answer) return Promise.resolve(answer);
        return new Promise<RefreshOutcome>((resolve) =>
          pendingResolvers.push(resolve),
        );
      },
    },
  });

  const settle = async () => {
    // Three turns is plenty: the controller awaits one request and then a
    // `finally`, and nothing here chains deeper than that.
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };

  const runDue = async () => {
    for (let guard = 0; guard < 20; guard += 1) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= clock)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      due[1].run();
      await settle();
    }
  };

  if (options.start !== false) controller.start();

  return {
    controller,
    calls,
    answers,
    settle,
    async advance(ms) {
      clock += ms;
      await runDue();
    },
    async fire() {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) throw new Error("no timer armed");
      timers.delete(next[0]);
      next[1].run();
      await settle();
    },
    hasTimer: () => timers.size > 0,
    timerIn: () => {
      const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
      return next ? next.at - clock : null;
    },
  };
}

function attachmentAnswer(
  overrides: Partial<AttachmentPlaybackSource> = {},
): RefreshOutcome {
  return { kind: "attachment", source: source(overrides) };
}

/* -------------------------------------------------------------------------
 * Pure contract
 * ---------------------------------------------------------------------- */

test.describe("the refresh contract", () => {
  test("only the attachment lineage has a credential to refresh", () => {
    const attached: MatchVideo = {
      url: "https://blob.example/a.mp4",
      expiresAt: new Date(T0 + TTL).toISOString(),
      startTimeSeconds: -40,
      source: "attachment",
      attachment: {
        id: ATTACHMENT,
        version: 3,
        durationSeconds: 900,
        contentType: "video/mp4",
        filename: "match.mp4",
      },
    };
    const provider: MatchVideo = {
      url: "https://blob.example/trimmed.mp4",
      expiresAt: new Date(T0 + TTL).toISOString(),
      startTimeSeconds: 15.136,
      source: "vendor-copy",
      attachment: null,
    };

    expect(sourceFromMatchVideo(attached)).toMatchObject({
      attachmentId: ATTACHMENT,
      version: 3,
      offsetSeconds: -40,
      expiresAt: T0 + TTL,
    });
    expect(sourceFromMatchVideo(provider)).toBeNull();
  });

  test("id decides replacement, version decides correction and staleness", () => {
    const held = source({ version: 4 });
    expect(compareSources(held, source({ version: 4 }))).toBe("unchanged");
    expect(compareSources(held, source({ version: 5 }))).toBe("corrected");
    expect(compareSources(held, source({ version: 3 }))).toBe("stale");
    expect(
      // A different attachment's counter is a different sequence, so a LOWER
      // version under a new id is still a replacement, never stale.
      compareSources(
        held,
        source({ attachmentId: OTHER_ATTACHMENT, version: 1 }),
      ),
    ).toBe("replaced");
  });

  test("the schedule leads expiry and never fires synchronously", () => {
    const held = source();
    expect(refreshDelayMs(held, T0)).toBe(TTL - REFRESH_LEAD_MS);
    // Already inside the lead window, or past expiry entirely.
    expect(refreshDelayMs(held, T0 + TTL - 1000)).toBe(MIN_REFRESH_DELAY_MS);
    expect(refreshDelayMs(held, T0 + TTL + 60_000)).toBe(MIN_REFRESH_DELAY_MS);
  });

  test("a load failure is only blamed on a credential that is nearly up", () => {
    const held = source();
    expect(isExpiryRelated(held, T0)).toBe(false);
    expect(
      isExpiryRelated(held, T0 + TTL - EXPIRY_BLAME_WINDOW_MS + 1000),
    ).toBe(true);
    expect(isExpiryRelated(held, T0 + TTL + 1)).toBe(true);
  });

  test("a resume lands on a point, not on a raw second", () => {
    const clock = clockOf(source({ offsetSeconds: -40 }));
    const stops = filmStops(POINTS, clock);
    // The same point, through the new clock.
    expect(
      alignedResumeTime({ pointId: "p2", pointTime: 240 }, stops, clock),
    ).toBeCloseTo(stops[1].start, 6);
    // The point is gone from the new footage: nearest by source time.
    expect(
      alignedResumeTime({ pointId: "vanished", pointTime: 290 }, stops, clock),
    ).toBeCloseTo(stops[2].start, 6);
    // Nothing watched yet.
    expect(
      alignedResumeTime({ pointId: null, pointTime: null }, stops, clock),
    ).toBeCloseTo(stops[0].start, 6);
    // No timed points at all — the file is all there is.
    expect(
      alignedResumeTime({ pointId: null, pointTime: 100 }, [], clock),
    ).toBeCloseTo(140, 6);
  });
});

/* -------------------------------------------------------------------------
 * Expiry, paused and playing
 * ---------------------------------------------------------------------- */

test.describe("scheduled refresh", () => {
  test("a paused viewer keeps their second and stays paused", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({
          url: "https://blob.example/first.mp4?sig=two",
          expiresAt: T0 + TTL + TTL,
        }),
      ],
    });
    h.controller.reportTime(754); // 12:34 into the film
    h.controller.reportPlaying(false);

    expect(h.timerIn()).toBe(TTL - REFRESH_LEAD_MS);
    await h.advance(TTL - REFRESH_LEAD_MS);

    const snap = h.controller.snapshot();
    expect(h.calls).toHaveLength(1);
    expect(snap.url).toBe("https://blob.example/first.mp4?sig=two");
    expect(snap.problem).toBeNull();
    expect(snap.resume).toEqual({
      filmTime: 754,
      playing: false,
      realign: false,
    });
    // Same asset: the stops it was reading are the stops it keeps.
    expect(snap.stops.map((s) => s.point.id)).toEqual(["p1", "p2", "p3"]);
    expect(snap.generation).toBe(1);
    // And the next pass is armed off the NEW expiry.
    expect(h.timerIn()).toBe(TTL);
  });

  test("a viewer who was playing is handed the intent back", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({
          url: "https://blob.example/first.mp4?sig=two",
          expiresAt: T0 + TTL + TTL,
        }),
      ],
    });
    h.controller.reportTime(310.5);
    h.controller.reportPlaying(true);

    await h.advance(TTL - REFRESH_LEAD_MS);

    expect(h.controller.snapshot().resume).toEqual({
      filmTime: 310.5,
      playing: true,
      realign: false,
    });
    h.controller.resumeApplied();
    expect(h.controller.snapshot().resume).toBeNull();
  });

  test("an expiry that did not advance is waited out, then given up on", async () => {
    // A server that keeps handing back the same lifetime would otherwise put
    // the schedule inside its own lead window forever — and once "now" catches
    // up with the stationary expiry, "wait it out" IS one request a second.
    const h = harness({
      answers: [
        attachmentAnswer({ url: "https://b/2", expiresAt: T0 + TTL }),
        attachmentAnswer({ url: "https://b/3", expiresAt: T0 + TTL }),
      ],
    });
    await h.advance(TTL - REFRESH_LEAD_MS);

    expect(h.calls).toHaveLength(1);
    // Armed at the actual expiry (two minutes out), not one second from now.
    expect(h.timerIn()).toBe(REFRESH_LEAD_MS);

    // Let it fire a SECOND time — the steady state the arithmetic reaches, and
    // the one the first re-schedule cannot show.
    await h.advance(REFRESH_LEAD_MS);
    expect(h.calls).toHaveLength(2);

    const snap = h.controller.snapshot();
    expect(snap.problem).toMatchObject({
      reason: "unplayable",
      canRetry: true,
    });
    expect(snap.url).toBeNull();
    expect(h.hasTimer()).toBe(false);

    // And it is genuinely settled: hours pass, a fresh answer sits unasked-for,
    // and nothing fires. (A one-second reschedule would spend the harness's
    // timer budget here and show up as a call count in the dozens.)
    h.answers.push(attachmentAnswer({ expiresAt: T0 + TTL }));
    await h.advance(TTL * 4);
    expect(h.calls).toHaveLength(2);
    expect(h.answers).toHaveLength(1);

    // A person can still ask, and one press is one request.
    h.answers.length = 0;
    h.answers.push(
      attachmentAnswer({ url: "https://b/4", expiresAt: T0 + TTL * 6 }),
    );
    h.controller.retry();
    await h.settle();
    expect(h.calls).toHaveLength(3);
    expect(h.controller.snapshot().problem).toBeNull();
    expect(h.controller.snapshot().url).toBe("https://b/4");
  });
});

/* -------------------------------------------------------------------------
 * Replacement and correction
 * ---------------------------------------------------------------------- */

test.describe("the footage or the alignment changed", () => {
  test("a correction rebuilds the stops and re-seeks the point", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({
          url: "https://blob.example/first.mp4?sig=two",
          expiresAt: T0 + TTL + TTL,
          version: 2,
          // The alignment moved by ten seconds.
          offsetSeconds: -30,
        }),
      ],
    });
    // Inside p2's window on the OLD clock: 200 - (-40) = 240.
    h.controller.reportTime(240);
    h.controller.reportPlaying(true);
    const before = h.controller.snapshot().stops[1].start;

    await h.advance(TTL - REFRESH_LEAD_MS);
    const snap = h.controller.snapshot();

    expect(snap.clock.offset).toBe(-30);
    const p2 = snap.stops.find((s) => s.point.id === "p2")!;
    // The stop moved with the offset...
    expect(p2.start).toBeCloseTo(before - 10, 6);
    // ...and the viewer moved with the stop, rather than sitting on the second
    // the wrong offset had sent them to.
    expect(snap.resume).toEqual({
      filmTime: p2.start,
      playing: true,
      realign: true,
    });
    expect(snap.resume!.filmTime).not.toBeCloseTo(240, 3);
  });

  test("a replacement reloads the source and never reuses the raw time", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({
          attachmentId: OTHER_ATTACHMENT,
          version: 1,
          url: "https://blob.example/second.mp4?sig=one",
          expiresAt: T0 + TTL + TTL,
          offsetSeconds: 120,
          durationSeconds: 400,
        }),
      ],
    });
    h.controller.reportTime(240);
    h.controller.reportPlaying(false);

    await h.advance(TTL - REFRESH_LEAD_MS);
    const snap = h.controller.snapshot();

    expect(snap.url).toBe("https://blob.example/second.mp4?sig=one");
    expect(snap.source!.attachmentId).toBe(OTHER_ATTACHMENT);
    expect(snap.clock).toEqual({ offset: 120, duration: 400 });
    const p2 = snap.stops.find((s) => s.point.id === "p2")!;
    expect(snap.resume).toEqual({
      filmTime: p2.start,
      playing: false,
      realign: true,
    });
    // 240 belonged to the old file; the new one puts p2 at 200 - 120 = 80,
    // less the lead-in.
    expect(snap.resume!.filmTime).toBeCloseTo(78.5, 6);
  });

  test("a response that lost a race changes nothing", async () => {
    const h = harness({
      initial: source({ version: 5, url: "https://b/v5" }),
      answers: [attachmentAnswer({ version: 4, url: "https://b/v4" })],
    });
    h.controller.reportTime(240);

    await h.advance(TTL - REFRESH_LEAD_MS);
    const snap = h.controller.snapshot();

    expect(snap.url).toBe("https://b/v5");
    expect(snap.source!.version).toBe(5);
    expect(snap.resume).toBeNull();
    expect(snap.generation).toBe(0);
    // Still watching the schedule rather than stalled.
    expect(h.hasTimer()).toBe(true);
  });

  test("a refresh overtaken by a newer one lands nowhere", async () => {
    // The first request is left hanging; a stop-and-restart supersedes it.
    const h = harness({ answers: [] });
    await h.advance(TTL - REFRESH_LEAD_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.controller.snapshot().refreshing).toBe(true);

    h.controller.stop();
    expect(h.calls[0].signalAborted()).toBe(true);
    // The abandoned request resolving late must not install anything.
    h.answers.push(attachmentAnswer({ url: "https://b/late" }));
    await h.settle();

    expect(h.controller.snapshot().url).toBe(
      "https://blob.example/first.mp4?sig=one",
    );
    expect(h.controller.snapshot().refreshing).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Terminal states
 * ---------------------------------------------------------------------- */

test.describe("terminal answers", () => {
  test("a deleted attachment is removed, not unavailable", async () => {
    for (const answer of [
      { kind: "removed", detail: "no_active_attachment" } as const,
      { kind: "removed", detail: "stale_attachment" } as const,
    ]) {
      const h = harness({ answers: [answer] });
      await h.advance(TTL - REFRESH_LEAD_MS);
      const snap = h.controller.snapshot();

      expect(snap.problem).toMatchObject({
        reason: "removed",
        canRetry: false,
      });
      expect(snap.url).toBeNull();
      // Terminal means terminal: nothing is armed to ask again.
      expect(h.hasTimer()).toBe(false);
      h.controller.retry();
      await h.settle();
      expect(h.calls).toHaveLength(1);
    }
  });

  test("a refused refresh stops and says so", async () => {
    const h = harness({
      answers: [{ kind: "denied", detail: "http_403" }],
    });
    await h.advance(TTL - REFRESH_LEAD_MS);

    expect(h.controller.snapshot().problem).toMatchObject({
      reason: "denied",
      canRetry: false,
    });
    expect(h.hasTimer()).toBe(false);
    h.controller.retry();
    await h.settle();
    expect(h.calls).toHaveLength(1);
  });

  test("an unreachable store gets one delayed retry, then a button", async () => {
    const h = harness({
      answers: [
        { kind: "unavailable", detail: "http_503" },
        { kind: "unavailable", detail: "network" },
      ],
    });
    // Refresh while the credential in hand is still good for two more minutes.
    await h.advance(TTL - REFRESH_LEAD_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.controller.snapshot().problem).toBeNull();
    expect(h.timerIn()).toBe(TRANSIENT_RETRY_MS);

    await h.advance(TRANSIENT_RETRY_MS);
    expect(h.calls).toHaveLength(2);
    const snap = h.controller.snapshot();
    expect(snap.problem).toMatchObject({
      reason: "unreachable",
      canRetry: true,
    });
    // Two attempts, and then it waits for a person.
    expect(h.hasTimer()).toBe(false);

    h.answers.push(attachmentAnswer({ expiresAt: T0 + TTL * 3 }));
    h.controller.retry();
    await h.settle();
    expect(h.calls).toHaveLength(3);
    expect(h.controller.snapshot().problem).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The one recovery attempt
 * ---------------------------------------------------------------------- */

test.describe("load failures", () => {
  test("one recovery near expiry, then a terminal state", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({ url: "https://b/fresh", expiresAt: T0 + TTL * 3 }),
      ],
    });
    h.controller.reportTime(754);
    // Inside the blame window.
    await h.advance(TTL - EXPIRY_BLAME_WINDOW_MS + 1000);

    h.controller.reportLoadFailure();
    await h.settle();
    expect(h.calls).toHaveLength(1);
    expect(h.controller.snapshot().url).toBe("https://b/fresh");
    expect(h.controller.snapshot().resume).toMatchObject({ filmTime: 754 });

    // The fresh credential does not play either, and the playhead never moved.
    h.controller.reportLoadFailure();
    await h.settle();
    expect(h.calls).toHaveLength(1);
    expect(h.controller.snapshot().problem).toMatchObject({
      reason: "unplayable",
      canRetry: true,
    });
    expect(h.hasTimer()).toBe(false);
  });

  test("playback that resumed restores the one attempt", async () => {
    const h = harness({
      answers: [
        // A short-lived replacement credential, so the second failure is
        // again plausibly about expiry.
        attachmentAnswer({
          url: "https://b/two",
          expiresAt: T0 + TTL + EXPIRY_BLAME_WINDOW_MS,
        }),
        attachmentAnswer({ url: "https://b/three", expiresAt: T0 + TTL * 5 }),
      ],
    });
    await h.advance(TTL - EXPIRY_BLAME_WINDOW_MS + 1000);

    h.controller.reportLoadFailure();
    await h.settle();
    expect(h.calls).toHaveLength(1);

    // The playhead moved: the credential demonstrably works.
    h.controller.reportTime(12);
    h.controller.reportTime(13);

    await h.advance(EXPIRY_BLAME_WINDOW_MS);
    h.controller.reportLoadFailure();
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.controller.snapshot().problem).toBeNull();
  });

  test("a failure nowhere near expiry is not blamed on the credential", async () => {
    const h = harness({ answers: [attachmentAnswer()] });
    h.controller.reportLoadFailure();
    await h.settle();

    // No request at all: the URL is good for another 28 minutes.
    expect(h.calls).toHaveLength(0);
    expect(h.controller.snapshot().problem).toMatchObject({
      reason: "unplayable",
    });
  });

  test("a rejected play() is not evidence of anything", async () => {
    const h = harness({
      answers: [
        attachmentAnswer({ url: "https://b/fresh", expiresAt: T0 + TTL * 3 }),
      ],
    });
    await h.advance(TTL - EXPIRY_BLAME_WINDOW_MS + 1000);

    // Autoplay policy, or a load interrupted by the next seek. Neither is a
    // credential problem, and neither may spend the recovery attempt.
    for (let i = 0; i < 5; i += 1) h.controller.reportPlayRejected();
    await h.settle();
    expect(h.calls).toHaveLength(0);
    expect(h.controller.snapshot().problem).toBeNull();

    // The budget is intact, so a REAL load failure still gets its one refresh.
    h.controller.reportLoadFailure();
    await h.settle();
    expect(h.calls).toHaveLength(1);
    expect(h.controller.snapshot().url).toBe("https://b/fresh");
  });
});

/* -------------------------------------------------------------------------
 * Teardown
 * ---------------------------------------------------------------------- */

test.describe("cleanup", () => {
  test("stopping cancels the schedule and the request in flight", async () => {
    const h = harness({ answers: [] });
    expect(h.hasTimer()).toBe(true);

    h.controller.stop();
    expect(h.hasTimer()).toBe(false);

    // Nothing is armed, so nothing can fire after the component is gone.
    await h.advance(TTL * 4);
    expect(h.calls).toHaveLength(0);

    // And a failure reported by a detached element does nothing either.
    h.controller.reportLoadFailure();
    h.controller.retry();
    await h.settle();
    expect(h.calls).toHaveLength(0);
    expect(h.controller.snapshot().problem).toBeNull();
  });

  test("a refresh in flight is aborted and its answer discarded", async () => {
    const h = harness({ answers: [] });
    await h.advance(TTL - REFRESH_LEAD_MS);
    expect(h.calls).toHaveLength(1);

    h.controller.stop();
    expect(h.calls[0].signalAborted()).toBe(true);
    h.answers.push({ kind: "removed", detail: "no_active_attachment" });
    await h.settle();

    // A terminal state written after unmount is a React warning at best and a
    // blanked player on the next mount at worst.
    expect(h.controller.snapshot().problem).toBeNull();
    expect(h.controller.snapshot().url).toBe(
      "https://blob.example/first.mp4?sig=one",
    );
  });
});

/* -------------------------------------------------------------------------
 * The request itself
 * ---------------------------------------------------------------------- */

test.describe("GET /api/matches/[matchId]/video", () => {
  function respond(status: number, body: unknown): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
  }

  test("each of the route's four answers is translated, not merged", async () => {
    const metadata = {
      attachment: {
        id: ATTACHMENT,
        version: 2,
        offsetSeconds: -40,
        confirmedVideoTimeSeconds: 140,
        durationSeconds: 900,
        contentType: "video/mp4",
        filename: "match.mp4",
        playbackUrl: "https://blob.example/x.mp4?sig=z",
        playbackExpiresAt: new Date(T0 + TTL).toISOString(),
      },
    };

    expect(await fetchPlaybackSource(MATCH, respond(200, metadata))).toEqual({
      kind: "attachment",
      source: {
        url: "https://blob.example/x.mp4?sig=z",
        expiresAt: T0 + TTL,
        attachmentId: ATTACHMENT,
        version: 2,
        offsetSeconds: -40,
        durationSeconds: 900,
      },
    });

    // No video is an answer, and it is NOT "try again".
    expect(
      await fetchPlaybackSource(MATCH, respond(200, { attachment: null })),
    ).toMatchObject({ kind: "removed" });
    // The row and storage parted company — the one a client must not retry.
    expect(
      await fetchPlaybackSource(
        MATCH,
        respond(409, { code: "stale_attachment", error: "…" }),
      ),
    ).toMatchObject({ kind: "removed", detail: "stale_attachment" });
    expect(
      await fetchPlaybackSource(MATCH, respond(403, { code: "forbidden" })),
    ).toMatchObject({ kind: "denied" });
    // An unreachable store is the only retryable refusal.
    expect(
      await fetchPlaybackSource(
        MATCH,
        respond(503, { code: "storage_unavailable" }),
      ),
    ).toMatchObject({ kind: "unavailable" });
  });

  test("a transport failure is unavailable, never a deletion", async () => {
    const thrower = (() =>
      Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await fetchPlaybackSource(MATCH, thrower)).toEqual({
      kind: "unavailable",
      detail: "network",
    });
  });
});
