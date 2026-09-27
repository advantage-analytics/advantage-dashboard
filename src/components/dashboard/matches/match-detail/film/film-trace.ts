/**
 * An opt-in trace of the seek path, for telling apart the three things an
 * on-screen "reload" after a point jump can be (T14):
 *
 *   (a) a scheduled credential swap — the element remounts (`generation`);
 *   (b) a seek whose range request failed and recovered — `error`, then a
 *       remount;
 *   (c) the media pipeline fetching an unbuffered range of a large file —
 *       `waiting` (and maybe `stalled`) between the seek and `playing`, with
 *       the target outside every buffered range.
 *
 * Nothing here changes a seek. The players call `seek()` BEFORE they set
 * `currentTime`, so the buffered ranges captured are the ones the jump
 * started from, and everything else is a passive listener.
 *
 * Off unless `localStorage["film-room:trace"] === "1"`, read once per player
 * in a lazy initializer (like `readCourtOn`). With the flag off the players
 * never construct a trace: no listener is added and no `performance` call
 * runs.
 *
 * `summariseSeek` is pure and has a node spec (`tests/film-trace.spec.ts`);
 * `createFilmTrace` is the browser half.
 */

export const FILM_TRACE_STORAGE_KEY = "film-room:trace";

/** How long a seek is followed before its table is printed anyway. */
export const TRACE_WINDOW_MS = 5000;

export type TraceEventType =
  | "seek"
  | "seeking"
  | "seeked"
  | "waiting"
  | "stalled"
  | "playing"
  | "error"
  | "generation";

export interface TraceEvent {
  type: TraceEventType;
  /** `performance.now()` milliseconds. */
  t: number;
  /** FILM seconds: the seek target on `seek`, the element's clock otherwise. */
  time?: number;
  /** The element's buffered ranges, captured on `seek`. */
  buffered?: [number, number][];
}

export interface SeekSummary {
  /** `seek` → first `seeked`, or null when it never arrived. */
  seekToSeekedMs: number | null;
  /** `seek` → first `playing`, or null (a paused seek never plays). */
  seekToPlayingMs: number | null;
  waitingCount: number;
  stalled: boolean;
  /** Whether the target sat inside a range the element already held. */
  bufferedAtSeek: boolean;
  /** Whether the element was replaced (a new `generation`) during the seek. */
  remounted: boolean;
}

/**
 * Summarise ONE seek: everything from the first `seek` event onward. Events
 * before it belong to someone else and are ignored; a list with no `seek`
 * summarises to nothing having happened.
 */
export function summariseSeek(events: readonly TraceEvent[]): SeekSummary {
  const from = events.findIndex((e) => e.type === "seek");
  const summary: SeekSummary = {
    seekToSeekedMs: null,
    seekToPlayingMs: null,
    waitingCount: 0,
    stalled: false,
    bufferedAtSeek: false,
    remounted: false,
  };
  if (from < 0) return summary;

  const seek = events[from];
  const target = seek.time;
  summary.bufferedAtSeek =
    target !== undefined &&
    (seek.buffered ?? []).some(
      ([start, end]) => target >= start && target <= end,
    );

  for (let i = from + 1; i < events.length; i++) {
    const e = events[i];
    if (e.type === "seek") break;
    switch (e.type) {
      case "seeked":
        summary.seekToSeekedMs ??= e.t - seek.t;
        break;
      case "playing":
        summary.seekToPlayingMs ??= e.t - seek.t;
        break;
      case "waiting":
        summary.waitingCount += 1;
        break;
      case "stalled":
        summary.stalled = true;
        break;
      case "generation":
        summary.remounted = true;
        break;
    }
  }
  return summary;
}

/** The flag, read defensively: blocked storage means no trace, not a crash. */
export function readTraceFlag(): boolean {
  try {
    return localStorage.getItem(FILM_TRACE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/* ── Browser half ───────────────────────────────────────────────────────── */

const MEDIA_EVENTS = [
  "seeking",
  "seeked",
  "waiting",
  "stalled",
  "playing",
  "error",
] as const;

function rangesOf(el: HTMLVideoElement): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < el.buffered.length; i++) {
    out.push([el.buffered.start(i), el.buffered.end(i)]);
  }
  return out;
}

function hostOf(src: string): string | null {
  try {
    return new URL(src, location.href).host;
  } catch {
    return null;
  }
}

export interface FilmTrace {
  /** Listen to one element. Returns the detach; a new generation mid-seek is recorded. */
  attach: (el: HTMLVideoElement, generation: number) => () => void;
  /** Call BEFORE `currentTime` is set, with the clamped target. */
  seek: (el: HTMLVideoElement, target: number) => void;
  /** Print whatever is pending and stop the window timer. */
  dispose: () => void;
}

/**
 * One trace per player, surviving remounts so that a credential swap in the
 * middle of a seek shows up as `remounted` on that seek rather than as a
 * fresh, empty one.
 */
export function createFilmTrace(surface: "room" | "report"): FilmTrace {
  let events: TraceEvent[] = [];
  let generation = -1;
  let host: string | null = null;
  let seekAt = 0;
  let target = 0;
  let timer: number | null = null;

  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (events.length === 0) return;
    const summary = summariseSeek(events);
    // Range requests to the credential's host since the seek began. Media
    // fetches appear here as `initiatorType: "video"` where the browser
    // reports them at all; a cross-origin store without Timing-Allow-Origin
    // still yields the entry, only without sizes.
    const rangeRequests = host
      ? performance
          .getEntriesByType("resource")
          .filter((r) => r.startTime >= seekAt && hostOf(r.name) === host)
          .length
      : 0;
    events = [];
    console.table([{ surface, generation, target, ...summary, rangeRequests }]);
  };

  return {
    attach(el, next) {
      if (events.length > 0 && next !== generation) {
        events.push({ type: "generation", t: performance.now() });
      }
      generation = next;
      const listeners = MEDIA_EVENTS.map((type) => {
        const listener = () => {
          if (events.length === 0) return;
          events.push({ type, t: performance.now(), time: el.currentTime });
        };
        el.addEventListener(type, listener);
        return [type, listener] as const;
      });
      return () => {
        for (const [type, listener] of listeners) {
          el.removeEventListener(type, listener);
        }
      };
    },
    seek(el, to) {
      flush();
      seekAt = performance.now();
      target = to;
      host = hostOf(el.currentSrc || el.src);
      events = [{ type: "seek", t: seekAt, time: to, buffered: rangesOf(el) }];
      timer = window.setTimeout(flush, TRACE_WINDOW_MS);
    },
    dispose: flush,
  };
}
