"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import type { PlaybackMetadataResult } from "@/lib/match-video/types";

import {
  activeStopAt,
  filmStops,
  toFilmTime,
  toPointTime,
  type FilmClock,
  type FilmStop,
} from "./film-timeline";

/**
 * The attachment's playback credential, and what happens when it runs out
 * (plan step 16, state half). T26 wires this into the two players; nothing
 * here touches an element.
 *
 * ── Why only attachments ────────────────────────────────────────────────────
 * The Advantage Intelligence lineage signs its URL the same way, but nothing
 * on that path answers `GET /api/matches/[matchId]/video` — that route reads
 * the ACTIVE `match_video_attachments` row and returns `attachment: null` for
 * every match that has not got one. Pointing a provider-job player at it would
 * turn "this match has no attachment" into "this match has no video" and blank
 * a film that is playing perfectly well. So a non-attachment source gets a
 * passthrough here: no timer, no request, ever, and its existing reload-the-
 * page behaviour (`film-player.tsx`) is left exactly as it was.
 *
 * ── What the route can say, and what each answer means ──────────────────────
 * `playback.ts` (T12) is deliberate about its four answers and this module
 * keeps them apart:
 *
 *   `200 { attachment }`      a credential, plus the id/version refresh contract
 *   `200 { attachment: null }` the video is gone — NOT a transient failure
 *   `409 stale_attachment`    the row and storage parted company; never retry
 *   `503 storage_unavailable` the store could not be asked; a retry is fair
 *
 * `id` and `version` are the whole point of polling rather than just re-signing.
 * A DIFFERENT id means the footage was replaced; the SAME id with a HIGHER
 * version means only the alignment moved. A LOWER version is a response that
 * lost a race with a newer one and is discarded.
 *
 * ── One recovery attempt, and why it cannot loop ────────────────────────────
 * Two different things ask for a fresh credential:
 *
 *   **The schedule.** A timer fires {@link REFRESH_LEAD_MS} before expiry.
 *   This is not a retry — each pass buys a full new SAS lifetime — so it is
 *   unbounded by design. Its one failure mode is a server that hands back a
 *   credential no fresher than the one it replaced, which would schedule the
 *   next pass immediately and spin. `scheduleAfterInstall` waits the first such
 *   answer out rather than pre-empting an expiry that did not advance, and
 *   treats a SECOND one as terminal: a server that will not issue a fresher
 *   credential is a state to report, not something to poll once a second.
 *
 *   **A load failure.** The element could not fetch bytes. That is worth ONE
 *   refresh, and only while the credential is plausibly the cause — see
 *   {@link isExpiryRelated}. The budget is spent on that attempt and is
 *   restored only by evidence that playback actually resumed (a playhead that
 *   moved), never merely by installing another URL. A file that is genuinely
 *   broken therefore fails once, states so, and stops asking.
 *
 * A transport failure gets at most one delayed retry per credential, and only
 * while the credential in hand is still valid. Everything past that is a
 * terminal state with a sentence and, where a retry could honestly help, a
 * `canRetry` flag for the button. A human pressing that button is not a loop.
 *
 * ── A rejected `play()` is not a credential problem ─────────────────────────
 * T18 established the direction that matters for upload: a browser rejects
 * `play()` for autoplay policy and for a load interrupted by the next seek,
 * and neither means the file is broken. The same fact points the other way
 * here — {@link AttachmentPlaybackApi.reportPlayRejected} exists precisely so
 * a player has somewhere to send the rejection that is NOT the refresh path.
 * It spends no budget, starts no request and changes no state.
 *
 * ── Preserving the playhead, and when not to ────────────────────────────────
 * Swapping `<video>.src` reloads the element, so every refresh has to say
 * where to land. Same id and same version is the same frames in the same file:
 * the playhead and the play/pause intent are handed straight back, and someone
 * paused at 12:34 is still paused at 12:34.
 *
 * A changed id or version is not. After a replacement the raw second means
 * nothing — it is a time in footage that is no longer loaded. After a
 * correction it means something worse than nothing: it is the second the OLD,
 * wrong offset sent them to. Both rebuild the stops and resolve the landing
 * spot from the POINT the viewer was on, through the new clock — see
 * {@link alignedResumeTime}. Point time is the source clock and survives both
 * events; film time does not.
 */

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

/** Everything a player needs about the credential currently in hand. */
export interface AttachmentPlaybackSource {
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  attachmentId: string;
  version: number;
  /** Signed film offset — `MatchVideo.startTimeSeconds`. */
  offsetSeconds: number;
  /** Server-verified length of the published file. */
  durationSeconds: number;
}

/**
 * How a freshly fetched credential relates to the one in hand.
 *
 * `stale` is a response that arrived after a newer one for the same
 * attachment. It is discarded rather than installed: a lower version would
 * walk the timeline backwards onto an alignment somebody already corrected.
 */
export type SourceChange = "unchanged" | "corrected" | "replaced" | "stale";

/** Why playback stopped, in words a person can act on. */
export interface AttachmentPlaybackProblem {
  reason: "removed" | "denied" | "unreachable" | "unplayable";
  /** Shown to the viewer. */
  message: string;
  /** True only where asking again could honestly change the answer. */
  canRetry: boolean;
}

/**
 * Where the player must land after a source swap, and whether it was playing.
 *
 * `realign` distinguishes the two cases the player has to treat differently:
 * `false` is a silent credential refresh and `filmTime` is the viewer's own
 * playhead; `true` means the stops were rebuilt and `filmTime` is a resolved
 * point start, not a preserved reading.
 */
export interface AttachmentResumeIntent {
  filmTime: number;
  playing: boolean;
  realign: boolean;
}

export interface AttachmentPlaybackSnapshot {
  /** The URL to play, or `null` once a problem is terminal. */
  url: string | null;
  source: AttachmentPlaybackSource | null;
  clock: FilmClock;
  /** Rebuilt whenever the attachment or its version changes. */
  stops: FilmStop[];
  /** Bumped on every installed source — a reload key for the element. */
  generation: number;
  resume: AttachmentResumeIntent | null;
  refreshing: boolean;
  problem: AttachmentPlaybackProblem | null;
}

/* -------------------------------------------------------------------------
 * Timings
 * ---------------------------------------------------------------------- */

/**
 * How long before expiry the scheduled refresh fires. The playback SAS lives
 * 30 minutes (`PLAYBACK_SAS_TTL_SECONDS`), so two minutes is a wide margin for
 * a slow request and a browser clock that is a little off, and still leaves
 * 28 minutes between passes.
 */
export const REFRESH_LEAD_MS = 2 * 60 * 1000;

/** Never schedule a refresh closer than this, whatever the arithmetic says. */
export const MIN_REFRESH_DELAY_MS = 1000;

/**
 * How late a credential has to be for a load failure to be blamed on it.
 * Wider than {@link REFRESH_LEAD_MS} because the expiry we hold is the
 * server's and the clock we compare it against is the viewer's.
 */
export const EXPIRY_BLAME_WINDOW_MS = 5 * 60 * 1000;

/** The single delayed retry after an unreachable store. */
export const TRANSIENT_RETRY_MS = 15 * 1000;

/* -------------------------------------------------------------------------
 * Pure helpers
 * ---------------------------------------------------------------------- */

/**
 * The attachment source from the server-rendered video, or `null` for the
 * Advantage Intelligence lineage — which is what makes this hook
 * attachment-specific rather than merely attachment-preferring.
 */
export function sourceFromMatchVideo(
  video: MatchVideo,
): AttachmentPlaybackSource | null {
  if (video.source !== "attachment" || !video.attachment) return null;
  const expiresAt = Date.parse(video.expiresAt);
  return {
    url: video.url,
    // An unparseable expiry is treated as already expired rather than as
    // "never": the scheduled refresh then runs at once and the server, not a
    // malformed string, decides what happens next.
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    attachmentId: video.attachment.id,
    version: video.attachment.version,
    offsetSeconds: video.startTimeSeconds,
    durationSeconds: video.attachment.durationSeconds,
  };
}

/** The clock this source implies. Mirrors `filmClock()` on the same fields. */
export function clockOf(source: AttachmentPlaybackSource | null): FilmClock {
  if (!source) return { offset: 0, duration: null };
  const measured = source.durationSeconds;
  return {
    offset: source.offsetSeconds,
    duration:
      typeof measured === "number" && Number.isFinite(measured) && measured > 0
        ? measured
        : null,
  };
}

/**
 * Replacement, correction, nothing, or a response that lost a race.
 *
 * The id is asked first and settles it: two different attachments have
 * unrelated version counters, so comparing versions across ids would be
 * comparing two different sequences.
 */
export function compareSources(
  current: AttachmentPlaybackSource,
  next: AttachmentPlaybackSource,
): SourceChange {
  if (current.attachmentId !== next.attachmentId) return "replaced";
  if (next.version > current.version) return "corrected";
  if (next.version < current.version) return "stale";
  return "unchanged";
}

/**
 * Milliseconds until the scheduled refresh should fire for this credential.
 * Never negative and never immediate: an expiry already inside the lead
 * window still waits {@link MIN_REFRESH_DELAY_MS}, so a page opened on a
 * stale render refreshes promptly without refreshing synchronously.
 */
export function refreshDelayMs(
  source: AttachmentPlaybackSource,
  now: number,
): number {
  return Math.max(
    MIN_REFRESH_DELAY_MS,
    source.expiresAt - REFRESH_LEAD_MS - now,
  );
}

/**
 * Whether the credential is a plausible cause of a load failure.
 *
 * A file that will not load an hour before its URL expires is not an expiry
 * problem, and spending the recovery attempt on it would only delay saying so.
 */
export function isExpiryRelated(
  source: AttachmentPlaybackSource,
  now: number,
): boolean {
  return now >= source.expiresAt - EXPIRY_BLAME_WINDOW_MS;
}

/** What the viewer was watching, on the clock that survives a replacement. */
export interface PlaybackAnchor {
  /** The point whose window held the playhead, when there was one. */
  pointId: string | null;
  /** The playhead on the SOURCE clock. */
  pointTime: number | null;
}

/**
 * A valid landing spot in the new footage.
 *
 * Preference order, and each step is a fallback for a real case:
 *
 *   1. The same point, if the new stops still have it — a corrected alignment
 *      or a re-recording of the same match usually does.
 *   2. The nearest stop by source time — a replacement whose file covers a
 *      different span, where the point row may not even exist any more.
 *   3. The first stop — a viewer who had not reached a point yet.
 *   4. The converted anchor, or film zero — a match with no timed points at
 *      all, where there is no stop to land on and the file is all there is.
 *
 * Every branch returns a second that exists in the new file: `toFilmTime`
 * bounds by the verified duration and `FilmStop.start` is built from it.
 */
export function alignedResumeTime(
  anchor: PlaybackAnchor,
  stops: FilmStop[],
  clock: FilmClock,
): number {
  if (stops.length === 0) {
    return anchor.pointTime == null ? 0 : toFilmTime(anchor.pointTime, clock);
  }
  if (anchor.pointId) {
    const same = stops.find((s) => s.point.id === anchor.pointId);
    if (same) return same.start;
  }
  if (anchor.pointTime == null) return stops[0].start;

  const target = anchor.pointTime;
  let nearest = stops[0];
  let distance = Infinity;
  for (const stop of stops) {
    const d = Math.abs((stop.point.videoTime ?? 0) - target);
    if (d < distance) {
      distance = d;
      nearest = stop;
    }
  }
  return nearest.start;
}

/* -------------------------------------------------------------------------
 * The request
 * ---------------------------------------------------------------------- */

/**
 * The four answers of `GET /api/matches/[matchId]/video`, collapsed to what a
 * player does about each — and `removed` is emphatically not `unavailable`.
 */
export type RefreshOutcome =
  | { kind: "attachment"; source: AttachmentPlaybackSource }
  | { kind: "removed"; detail: string }
  | { kind: "denied"; detail: string }
  | { kind: "unavailable"; detail: string };

/**
 * One GET, translated.
 *
 * `409 stale_attachment` joins `attachment: null` under `removed` because both
 * mean the same thing to someone watching — the file this player is holding a
 * URL for is not coming back — and because `playback.ts` names that code as
 * the one a client must not retry into a loop. A 4xx that is neither is
 * treated as denied rather than transient: retrying a refusal is how a loop
 * starts.
 */
export async function fetchPlaybackSource(
  matchId: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/matches/${encodeURIComponent(matchId)}/video`,
      { method: "GET", credentials: "same-origin", cache: "no-store", signal },
    );
  } catch {
    return { kind: "unavailable", detail: "network" };
  }

  if (response.ok) {
    let body: PlaybackMetadataResult;
    try {
      body = (await response.json()) as PlaybackMetadataResult;
    } catch {
      return { kind: "unavailable", detail: "malformed" };
    }
    const attachment = body?.attachment;
    if (!attachment) return { kind: "removed", detail: "no_active_attachment" };
    const expiresAt = Date.parse(attachment.playbackExpiresAt);
    return {
      kind: "attachment",
      source: {
        url: attachment.playbackUrl,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        attachmentId: attachment.id,
        version: attachment.version,
        offsetSeconds: attachment.offsetSeconds,
        durationSeconds: attachment.durationSeconds,
      },
    };
  }

  if (response.status === 409) {
    return { kind: "removed", detail: "stale_attachment" };
  }
  if (response.status === 404) {
    return { kind: "removed", detail: "match_not_found" };
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: "denied", detail: `http_${response.status}` };
  }
  if (response.status >= 400 && response.status < 500) {
    return { kind: "denied", detail: `http_${response.status}` };
  }
  return { kind: "unavailable", detail: `http_${response.status}` };
}

/* -------------------------------------------------------------------------
 * Copy
 * ---------------------------------------------------------------------- */

const PROBLEMS: Record<
  AttachmentPlaybackProblem["reason"],
  Omit<AttachmentPlaybackProblem, "reason">
> = {
  removed: {
    message:
      "This video is no longer attached to the match. Reload the page to see what is there now.",
    canRetry: false,
  },
  denied: {
    message:
      "You no longer have access to this video. Sign in again, or ask whoever owns the match.",
    canRetry: false,
  },
  unreachable: {
    message:
      "The video could not be reached. It is still attached to the match — try again in a moment.",
    canRetry: true,
  },
  unplayable: {
    message:
      "The film stopped loading. Playback links are signed for a short window; asking for a new one is the one thing that helps.",
    canRetry: true,
  },
};

function problem(
  reason: AttachmentPlaybackProblem["reason"],
): AttachmentPlaybackProblem {
  return { reason, ...PROBLEMS[reason] };
}

/* -------------------------------------------------------------------------
 * The controller
 * ---------------------------------------------------------------------- */

export interface AttachmentPlaybackDeps {
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  fetchPlayback(
    matchId: string,
    signal: AbortSignal | undefined,
  ): Promise<RefreshOutcome>;
}

export interface AttachmentPlaybackControllerOptions {
  matchId: string;
  initial: AttachmentPlaybackSource;
  points: MatchPoint[];
  deps?: Partial<AttachmentPlaybackDeps>;
}

export interface AttachmentPlaybackController {
  snapshot(): AttachmentPlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  /** Arms the scheduled refresh. Idempotent; safe after {@link stop}. */
  start(): void;
  /** Cancels the timer and abandons any in-flight refresh. Idempotent. */
  stop(): void;
  setPoints(points: MatchPoint[]): void;
  reportTime(filmTime: number): void;
  reportPlaying(playing: boolean): void;
  reportLoadFailure(): void;
  reportPlayRejected(): void;
  retry(): void;
  resumeApplied(): void;
  /** Test seam: the refresh currently in flight, if any. */
  pending(): Promise<void> | null;
}

function resolveDeps(
  overrides: Partial<AttachmentPlaybackDeps> | undefined,
): AttachmentPlaybackDeps {
  return {
    now: overrides?.now ?? (() => Date.now()),
    setTimer:
      overrides?.setTimer ?? ((run, ms) => globalThis.setTimeout(run, ms)),
    clearTimer:
      overrides?.clearTimer ??
      ((handle) => globalThis.clearTimeout(handle as never)),
    fetchPlayback:
      overrides?.fetchPlayback ??
      ((matchId, signal) =>
        fetchPlaybackSource(
          matchId,
          (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
          signal,
        )),
  };
}

/**
 * The state machine, with no React in it.
 *
 * Every seam it can reach is in {@link AttachmentPlaybackDeps} — a clock, two
 * timer functions and one request — so the whole ladder, including expiry,
 * runs in a spec with no browser, no element and no network.
 */
export function createAttachmentPlaybackController(
  options: AttachmentPlaybackControllerOptions,
): AttachmentPlaybackController {
  const deps = resolveDeps(options.deps);
  const { matchId } = options;

  let points = options.points;
  let state: AttachmentPlaybackSnapshot = {
    url: options.initial.url,
    source: options.initial,
    clock: clockOf(options.initial),
    stops: filmStops(points, clockOf(options.initial)),
    generation: 0,
    resume: null,
    refreshing: false,
    problem: null,
  };

  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let abort: AbortController | null = null;
  let inFlight: Promise<void> | null = null;
  /** Bumped per refresh AND on stop, so a late result lands nowhere. */
  let run = 0;
  let running = false;

  /** The one load-failure refresh, restored only by playback that moved. */
  let recoverySpent = false;
  /** The one delayed retry after an unreachable store, per credential. */
  let transientRetrySpent = false;
  /**
   * An answer whose expiry did not advance has already been waited out once.
   * Cleared by any credential that genuinely moves the expiry forward.
   */
  let expiryStalled = false;

  let lastFilmTime = 0;
  let lastPlaying = false;

  function emit(next: Partial<AttachmentPlaybackSnapshot>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  function cancelTimer() {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
  }

  /** The viewer's position on the clock that survives a footage change. */
  function anchor(): PlaybackAnchor {
    const active = activeStopAt(state.stops, lastFilmTime);
    return {
      pointId: active?.stop.point.id ?? null,
      pointTime: state.source ? toPointTime(lastFilmTime, state.clock) : null,
    };
  }

  function schedule(ms: number) {
    cancelTimer();
    if (!running) return;
    timer = deps.setTimer(() => {
      timer = null;
      startRefresh();
    }, ms);
  }

  /**
   * Arm the next scheduled refresh for a credential just installed — or stop.
   *
   * This is the guard that keeps the SCHEDULE from becoming a loop. If the new
   * expiry is no later than the one it replaced, the lead window has already
   * passed for it too, and pre-empting would fire again in a second, and again.
   *
   * The FIRST such answer is waited out: the credential still has the seconds
   * it has left, and a server that was briefly behind may yet catch up. A
   * SECOND one is that server saying it will not issue a fresher credential —
   * and once "now" has caught up with a stationary expiry, waiting it out is
   * {@link MIN_REFRESH_DELAY_MS}, i.e. one request a second forever. That is a
   * settled answer, so it is reported rather than polled: `unplayable`, whose
   * retry is a person pressing a button, never a timer.
   */
  function scheduleAfterInstall(
    installed: AttachmentPlaybackSource,
    previous: AttachmentPlaybackSource | null,
  ) {
    const now = deps.now();
    if (previous && installed.expiresAt <= previous.expiresAt) {
      if (expiryStalled) {
        fail("unplayable");
        return;
      }
      expiryStalled = true;
      schedule(Math.max(MIN_REFRESH_DELAY_MS, installed.expiresAt - now));
      return;
    }
    expiryStalled = false;
    schedule(refreshDelayMs(installed, now));
  }

  function fail(reason: AttachmentPlaybackProblem["reason"]) {
    cancelTimer();
    emit({
      url: null,
      source: null,
      resume: null,
      refreshing: false,
      problem: problem(reason),
    });
  }

  function install(next: AttachmentPlaybackSource) {
    const current = state.source;
    const change = current ? compareSources(current, next) : "replaced";
    // A response that lost a race to a newer one changes nothing — not the
    // URL, not the clock, not the schedule's basis.
    if (change === "stale") {
      emit({ refreshing: false });
      // Re-armed off the credential still in hand, and through the same guard:
      // a server that keeps answering with a version older than the one held
      // is not advancing anything either, and re-arming off an expiry whose
      // lead window has passed would ask again in a second, and again.
      if (current) scheduleAfterInstall(current, current);
      return;
    }

    transientRetrySpent = false;

    if (change === "unchanged") {
      // Same frames, same alignment: hand the playhead and the intent back.
      emit({
        url: next.url,
        source: next,
        generation: state.generation + 1,
        resume: {
          filmTime: lastFilmTime,
          playing: lastPlaying,
          realign: false,
        },
        refreshing: false,
        problem: null,
      });
      scheduleAfterInstall(next, current);
      return;
    }

    // Replaced or corrected. The raw second is about footage or an alignment
    // that no longer applies, so it is resolved from the point instead.
    const held = anchor();
    const clock = clockOf(next);
    const stops = filmStops(points, clock);
    const filmTime = alignedResumeTime(held, stops, clock);
    lastFilmTime = filmTime;
    emit({
      url: next.url,
      source: next,
      clock,
      stops,
      generation: state.generation + 1,
      resume: { filmTime, playing: lastPlaying, realign: true },
      refreshing: false,
      problem: null,
    });
    scheduleAfterInstall(next, current);
  }

  function handle(outcome: RefreshOutcome) {
    switch (outcome.kind) {
      case "attachment":
        install(outcome.source);
        return;
      case "removed":
        fail("removed");
        return;
      case "denied":
        fail("denied");
        return;
      case "unavailable": {
        const source = state.source;
        const now = deps.now();
        // The credential in hand may still play. One delayed retry, then the
        // terminal state with a button — never a second automatic attempt.
        if (source && now < source.expiresAt && !transientRetrySpent) {
          transientRetrySpent = true;
          emit({ refreshing: false });
          schedule(
            Math.max(
              MIN_REFRESH_DELAY_MS,
              Math.min(TRANSIENT_RETRY_MS, source.expiresAt - now),
            ),
          );
          return;
        }
        fail("unreachable");
        return;
      }
    }
  }

  function startRefresh() {
    if (!running) return;
    if (inFlight) return;
    cancelTimer();
    const mine = (run += 1);
    const controller = new AbortController();
    abort = controller;
    emit({ refreshing: true });

    inFlight = (async () => {
      let outcome: RefreshOutcome;
      try {
        outcome = await deps.fetchPlayback(matchId, controller.signal);
      } catch {
        outcome = { kind: "unavailable", detail: "threw" };
      }
      // Stopped, or overtaken. Either way this answer is not the current one.
      if (mine !== run || !running) return;
      handle(outcome);
    })().finally(() => {
      if (mine === run) {
        inFlight = null;
        abort = null;
      }
    });
  }

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (running) return;
      running = true;
      const source = state.source;
      if (!source) return;
      schedule(refreshDelayMs(source, deps.now()));
    },

    stop() {
      running = false;
      // A result that resolves after this must land nowhere, which is what the
      // bump is for; the abort is the courtesy of not finishing the request.
      run += 1;
      cancelTimer();
      abort?.abort();
      abort = null;
      inFlight = null;
      if (state.refreshing) emit({ refreshing: false });
    },

    setPoints(next) {
      // Same rows, same stops — and a fresh array every render is churn the
      // player's memoisation would have to undo.
      if (next === points) return;
      points = next;
      emit({ stops: filmStops(next, state.clock) });
    },

    reportTime(filmTime) {
      // A playhead that moved is the only evidence that the credential in hand
      // actually works, and the only thing that restores the recovery budget.
      if (filmTime !== lastFilmTime) recoverySpent = false;
      lastFilmTime = filmTime;
    },

    reportPlaying(playing) {
      lastPlaying = playing;
    },

    reportLoadFailure() {
      if (!running) return;
      const source = state.source;
      if (!source || state.problem) return;
      if (state.refreshing || inFlight) return;
      // Nowhere near expiry: the credential is not the story, and spending the
      // attempt would only postpone saying so.
      if (!isExpiryRelated(source, deps.now())) {
        fail("unplayable");
        return;
      }
      if (recoverySpent) {
        fail("unplayable");
        return;
      }
      recoverySpent = true;
      startRefresh();
    },

    reportPlayRejected() {
      // Deliberately nothing. Autoplay policy and an interrupted load are not
      // credential problems, and treating them as one would spend the recovery
      // attempt — or start a refresh per click. See the module docstring.
    },

    retry() {
      if (!running) return;
      if (!state.problem?.canRetry) return;
      recoverySpent = false;
      transientRetrySpent = false;
      emit({ problem: null });
      startRefresh();
    },

    resumeApplied() {
      if (state.resume) emit({ resume: null });
    },

    pending: () => inFlight,
  };
}

/* -------------------------------------------------------------------------
 * The hook
 * ---------------------------------------------------------------------- */

export interface UseAttachmentPlaybackOptions {
  matchId: string;
  video: MatchVideo;
  /** All points, timed or not — `filmStops` drops the untimed ones. */
  points: MatchPoint[];
  /** Test seam. Production passes nothing. */
  deps?: Partial<AttachmentPlaybackDeps>;
}

export interface AttachmentPlaybackApi extends AttachmentPlaybackSnapshot {
  /** True for the provider-job lineage, where none of this applies. */
  passthrough: boolean;
  reportTime(filmTime: number): void;
  reportPlaying(playing: boolean): void;
  reportLoadFailure(): void;
  reportPlayRejected(): void;
  retry(): void;
  resumeApplied(): void;
}

const NOOP = () => {};
/** The passthrough store: nothing to subscribe to and nothing to read. */
const NO_STORE = () => NOOP;
const NO_SNAPSHOT = (): AttachmentPlaybackSnapshot | null => null;

/**
 * The React face of {@link createAttachmentPlaybackController}.
 *
 * Thin on purpose: one controller per attachment, torn down on unmount and
 * rebuilt when the server hands down a different one. The controller is
 * created inert and only arms its timer in the effect, so a double-invoked
 * render in development schedules nothing twice.
 */
export function useAttachmentPlayback(
  options: UseAttachmentPlaybackOptions,
): AttachmentPlaybackApi {
  const { matchId, video, points, deps } = options;

  const initial = sourceFromMatchVideo(video);
  // Identity of the server's answer, not of the props object: a re-render with
  // the same video must not rebuild the controller and lose its budgets.
  const key = initial
    ? `${matchId}|${initial.attachmentId}|${initial.version}|${initial.url}`
    : null;

  const controller = useMemo(
    () =>
      key && initial
        ? createAttachmentPlaybackController({ matchId, initial, points, deps })
        : null,
    // Keyed on the server's answer alone. `points` and `deps` are handed to a
    // fresh controller and pushed into an existing one below; rebuilding on
    // either would throw away the recovery budget on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  // The controller IS an external store, so it is read as one: no mirrored
  // state to fall behind, and a controller swapped mid-render never renders
  // the previous one's snapshot.
  const snapshot = useSyncExternalStore(
    controller ? controller.subscribe : NO_STORE,
    controller ? controller.snapshot : NO_SNAPSHOT,
    controller ? controller.snapshot : NO_SNAPSHOT,
  );

  useEffect(() => {
    if (!controller) return;
    controller.start();
    // Unmount, and a controller replaced by a newer one, both land here: the
    // timer is cancelled and the refresh in flight is abandoned.
    return () => controller.stop();
  }, [controller]);

  useEffect(() => {
    controller?.setPoints(points);
  }, [controller, points]);

  // The Advantage Intelligence lineage's clock and stops, built whether or not
  // this is that lineage: a hook may not skip a hook, and the work is a sort.
  const passthroughClock = useMemo<FilmClock>(
    () => ({ offset: video.startTimeSeconds, duration: null }),
    [video.startTimeSeconds],
  );
  const passthroughStops = useMemo(
    () => filmStops(points, passthroughClock),
    [points, passthroughClock],
  );

  if (!controller || !snapshot) {
    // Untouched: the server's URL, the server's offset, no timer and no
    // request.
    return {
      passthrough: true,
      url: video.url,
      source: null,
      clock: passthroughClock,
      stops: passthroughStops,
      generation: 0,
      resume: null,
      refreshing: false,
      problem: null,
      reportTime: NOOP,
      reportPlaying: NOOP,
      reportLoadFailure: NOOP,
      reportPlayRejected: NOOP,
      retry: NOOP,
      resumeApplied: NOOP,
    };
  }

  return {
    passthrough: false,
    ...snapshot,
    reportTime: controller.reportTime,
    reportPlaying: controller.reportPlaying,
    reportLoadFailure: controller.reportLoadFailure,
    reportPlayRejected: controller.reportPlayRejected,
    retry: controller.retry,
    resumeApplied: controller.resumeApplied,
  };
}
