import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The film's own clock, and everything that walks it.
 *
 * Two clocks exist and this file is the only place they meet:
 *
 * - **point time** — `points.video_time`, seconds on the source clock. For the
 *   Advantage Intelligence lineage that is the analysis clock
 *   (`derivation/parse.ts` adds the job's window start at ingest, by design);
 *   for an imported SwingVision match it is the spreadsheet's own clock,
 *   measured against a recording we never received.
 * - **film time** — `<video>.currentTime` on the file we actually serve. For
 *   our own upload that is the same clock (offset 0); for an older match that
 *   only has the vendor's re-encode, t=0 is the job's `start_time_seconds`;
 *   for an attached SwingVision video it is
 *   `firstPointSourceTime - confirmedVideoTime`, which is NEGATIVE whenever the
 *   camera was rolling before the source clock's first point.
 *   `MatchVideo.startTimeSeconds` carries whichever applies — see
 *   `lib/data/match-video-choice.ts` and `lib/match-video/alignment.ts`.
 *
 * Every seek converts point → film, every playhead reading converts film →
 * point. Nothing else in the film subtree may do the arithmetic, because a
 * second copy is how one of them ends up 15 seconds late again.
 *
 * The conversion travels as a {@link FilmClock} rather than a bare number, so
 * there is one value to thread and one place that can hold a stale offset. It
 * also carries the film's verified length, which is what bounds the padded
 * windows below.
 */

/** Fallback window for a point the source never timed, in seconds. */
export const ASSUMED_POINT_SECONDS = 10;

/** Lead-in before a point's serve and run-out after its end, in seconds. */
export const POINT_BUFFER_SECONDS = 1.5;

/** The cushion that makes "previous" go back a point instead of re-seeking. */
const STEP_CUSHION_SECONDS = 0.5;

/**
 * How far before a stop's start still counts as "reached". A `<video>` seek
 * lands on a decodable frame, which can sit a few milliseconds BEFORE the
 * second asked for; without this a point just jumped to reads as not yet
 * started, and the playing row, the position and Save point all go blank.
 */
export const REACHED_EPSILON_SECONDS = 0.1;

/**
 * The film's clock: the one offset, and the film's own length.
 *
 * `offset` is SIGNED. `duration` is the server-verified length of the file in
 * seconds, or `null` when we have not measured it — the Advantage Intelligence
 * lineage, whose length is whatever the vendor returned. A `null` duration
 * means "no upper bound", so every bound below is inert on that path.
 */
export interface FilmClock {
  offset: number;
  duration: number | null;
}

/**
 * Build the clock once, from the resolved video.
 *
 * Structural rather than typed to `MatchVideo` so this stays a pure module the
 * tests can call without the server loader. A duration that is not a finite
 * positive number is treated as unmeasured, never as a zero-length film.
 */
export function filmClock(video: {
  startTimeSeconds: number;
  attachment: { durationSeconds: number } | null;
}): FilmClock {
  const measured = video.attachment?.durationSeconds;
  return {
    offset: video.startTimeSeconds,
    duration:
      typeof measured === "number" && Number.isFinite(measured) && measured > 0
        ? measured
        : null,
  };
}

/** The last second that exists in the file, or `Infinity` when unmeasured. */
function filmEnd(clock: FilmClock): number {
  return clock.duration ?? Infinity;
}

/**
 * A source time on the film's clock, bounded by the film.
 *
 * Two bounds, and they guard different things:
 *
 * - **0.** A point that sits before the file starts has nowhere earlier to go.
 *   On the provider lineage the offset is the trim's start, so every point the
 *   trim cut away converts negative; without this the player would be handed a
 *   negative `currentTime`. It is a no-op for a negative attachment offset,
 *   where the result is already larger than the source time — but it is still
 *   the lower bound for a corrected alignment that puts an early point before
 *   frame one.
 * - **`duration`.** Alignment validates the source times against the file with
 *   a 0.1s tolerance, so a final shot may legitimately round past the last
 *   frame. Seeks are clamped by the element anyway; the window arithmetic is
 *   not, which is what this protects.
 */
export function toFilmTime(pointTime: number, clock: FilmClock): number {
  return Math.min(Math.max(0, pointTime - clock.offset), filmEnd(clock));
}

/**
 * A playhead reading back on the source clock.
 *
 * Deliberately unbounded: the film may hold footage before the first point and
 * after the last, and the reading is what it is.
 */
export function toPointTime(filmTime: number, clock: FilmClock): number {
  return filmTime + clock.offset;
}

/** A point placed on the film's clock. */
export interface FilmStop {
  point: MatchPoint;
  /** Film seconds where the point's window opens (the serve, less the buffer). */
  start: number;
  /** Film seconds of serve contact — the point's own recorded start. */
  serve: number;
  /** Film seconds where its window ends — see `filmStops` for the rule. */
  end: number;
}

/**
 * Every timed point, in film order, each with its window.
 *
 * The point itself runs from its recorded start to its own `duration` when
 * there is one (the real length of the rally), otherwise to the next point's
 * start (so the progress rule still advances on a source that timed starts
 * but not lengths), otherwise `ASSUMED_POINT_SECONDS`.
 *
 * The window is that span padded by `POINT_BUFFER_SECONDS` on both sides, so a
 * jump lands just before the serve and the point plays out past its last ball.
 * Every consumer — seeks, the playing row, its progress rule, next/previous,
 * dead-time skipping, loop — walks the padded window. The pad never runs past
 * film zero or past the end of the film, and a window's end never runs past the
 * next window's start, so windows never overlap and none of them points at a
 * second the file does not contain.
 *
 * A point the source never timed is not here at all. It has no place on the
 * film's clock, so it has no seek target, and inventing one from its neighbours
 * would send the player to a rally that is not the one the row names.
 *
 * `offset` is applied exactly once, in the single {@link toFilmTime} call that
 * produces `serve`; `start` and `end` are derived from that result, never from
 * a second conversion.
 *
 * Built from ALL points rather than the filtered cut: the playhead is
 * somewhere in the match whether or not the current filter admits the point
 * it is inside.
 */
export function filmStops(points: MatchPoint[], clock: FilmClock): FilmStop[] {
  const timed = points
    .filter((p): p is MatchPoint & { videoTime: number } => p.videoTime != null)
    .slice()
    .sort((a, b) => a.videoTime - b.videoTime);

  const limit = filmEnd(clock);
  // One conversion per point, reused for that point's own window and as the
  // next-window bound of the point before it.
  const serves = timed.map((point) => toFilmTime(point.videoTime, clock));
  // `serve` is already inside the film, so the lead-in only needs its floor.
  const paddedStart = (serve: number) =>
    Math.max(0, serve - POINT_BUFFER_SECONDS);

  return timed.map((point, i) => {
    const serve = serves[i];
    const start = paddedStart(serve);
    const next = timed[i + 1];
    const nextStart = next ? paddedStart(serves[i + 1]) : Infinity;
    const end =
      point.duration && point.duration > 0
        ? serve + point.duration + POINT_BUFFER_SECONDS
        : next
          ? nextStart
          : serve + ASSUMED_POINT_SECONDS + POINT_BUFFER_SECONDS;
    return {
      point,
      start,
      serve,
      // `start` wins last so a window is never inverted, even for a point
      // sitting on the final frame.
      end: Math.max(Math.min(end, nextStart, limit), start),
    };
  });
}

export interface ActiveStop {
  stop: FilmStop;
  /** 0–1 through the stop's window, clamped. */
  progress: number;
}

/**
 * The point the playhead is inside: the last stop whose start it has passed.
 * Progress is clamped, so the rule sits full through the changeover rather
 * than overrunning into the next row.
 */
export function activeStopAt(
  stops: FilmStop[],
  filmTime: number,
): ActiveStop | null {
  let index = -1;
  for (let i = 0; i < stops.length; i += 1) {
    if (stops[i].start - REACHED_EPSILON_SECONDS <= filmTime) index = i;
    else break;
  }
  if (index === -1) return null;
  const stop = stops[index];
  const span = Math.max(stop.end - stop.start, 0.001);
  return {
    stop,
    progress: Math.min(1, Math.max(0, (filmTime - stop.start) / span)),
  };
}

/**
 * The point the film is INSIDE, or null in the dead time between points.
 *
 * {@link activeStopAt} answers a different question and deliberately never
 * returns to null once the first point has started: it holds the last stop
 * reached, with progress clamped at 1, so the board keeps the score through a
 * changeover. That makes "between points" a state it cannot express — which is
 * why this second walk exists rather than a flag on the first.
 *
 * Containment only: the stop whose padded window covers the time, null before
 * the first window opens and null again once the time has run past a window's
 * `end` without reaching the next one's `start`. Everything that NAMES a point
 * reads this — the board's point line, the position counter, the drawer's lit
 * row, the court's point mode — so all of them go quiet together (R7).
 *
 * The lead-in is admitted with the same {@link REACHED_EPSILON_SECONDS} a seek
 * needs, for the same reason: a `<video>` lands on a decodable frame that can
 * sit a few milliseconds before the second asked for.
 *
 * Where two windows touch — `filmStops` clamps a window's `end` to the next
 * one's `start` — the earlier stop is tested first and the later one picks the
 * boundary second up, so a run of points with no gap between them never reads
 * as between points for a frame.
 */
export function playingStopAt(
  stops: FilmStop[],
  filmTime: number,
): FilmStop | null {
  for (const stop of stops) {
    // Sorted by start, so nothing after this one can have opened either.
    if (stop.start - REACHED_EPSILON_SECONDS > filmTime) break;
    if (filmTime < stop.end) return stop;
  }
  return null;
}

/** The next stop after the playhead, with the cushion. */
export function nextStop(stops: FilmStop[], filmTime: number): FilmStop | null {
  return stops.find((s) => s.start > filmTime + STEP_CUSHION_SECONDS) ?? null;
}

/** The previous stop before the playhead, with the cushion. */
export function prevStop(stops: FilmStop[], filmTime: number): FilmStop | null {
  for (let i = stops.length - 1; i >= 0; i -= 1) {
    if (stops[i].start < filmTime - STEP_CUSHION_SECONDS) return stops[i];
  }
  return null;
}

/* ── Follow playback, or hold the point you are reading ─────────────────── */

/**
 * Whether the points surfaces track the film or stay on one point
 * (`docs/superpowers/specs/2026-09-22-film-follow-hold-design.md`).
 *
 * In `follow` the drawer's open well and the shell's "This point" card show
 * the PLAYING point. In `held` they stay on `pointId` while the lit row, the
 * board, the court and the counters keep following the film. One state for
 * both surfaces, owned by `FilmRoom` (film-tab.tsx) so it survives the room
 * opening and closing and resets on tab-leave with no reset code.
 *
 * `held` with `pointId: null` is "held with no well" (T25): a hand scroll
 * made while nothing was displayed — the drawer's R7 dead time, where
 * `playingStop` is null, or either surface before the first point, where
 * `activeStopAt` is null — keeps the list where the viewer left it and opens
 * no well. It holds the scroll position and nothing else visible; it does
 * not adopt the last point reached, which would pop a well open on a wheel.
 */
export type PointFocus =
  { mode: "follow" } | { mode: "held"; pointId: string | null };

/**
 * The point a surface shows: the held one while held (null for a hold with
 * no well), else the playing one.
 */
export function displayedPointId(
  focus: PointFocus,
  playingPointId: string | null,
): string | null {
  return focus.mode === "held" ? focus.pointId : playingPointId;
}

/** What the return affordance (the drawer's pill, the card's line) says. */
export interface FollowAffordance {
  /** The visible text: a sentence, with a middot. */
  label: string;
  /** One spoken sentence — a colon and an em dash, and what pressing does. */
  ariaLabel: string;
  /** Whether the playing point has a row in the applied cut to point at. */
  inCut: boolean;
}

/**
 * The strings table of the design, one row per case. `null` means no
 * affordance: not held, or nothing playing (R7 dead time gets no words).
 * Held on the playing point itself still gets one (T24): a hand scroll can
 * carry that row out of view, and the pill is the way back to it. Whether it
 * is drawn is the pill's own call — hidden while the lit row is wholly inside
 * the scroller's box (T21's in-view rule).
 *
 * `playing.index` is the point's 1-based place in the walk over the applied
 * cut (`position.index`), the same number the counter prints; `null` means
 * the film is on a point the cut excludes.
 */
export function followAffordance(
  focus: PointFocus,
  playing: { id: string; index: number | null } | null,
): FollowAffordance | null {
  if (focus.mode !== "held") return null;
  if (!playing) return null;
  if (playing.index == null) {
    return {
      label: "Now playing · not in this cut",
      ariaLabel: "Now playing: a point outside this cut — follow playback",
      inCut: false,
    };
  }
  return {
    label: `Now playing · Point ${playing.index}`,
    ariaLabel: `Now playing: point ${playing.index} — follow playback`,
    inCut: true,
  };
}

/**
 * Where "Skip dead time" should jump to, or null to keep playing.
 *
 * Dead time is the gap between one point's window and the next point's
 * start. Inside a window, or before the first point, nothing is skipped: the
 * walk to the baseline before the first serve is part of the point.
 */
export function deadTimeJump(
  stops: FilmStop[],
  filmTime: number,
): number | null {
  const active = activeStopAt(stops, filmTime);
  if (!active) return null;
  if (filmTime < active.stop.end) return null;
  const next = stops.find((s) => s.start > active.stop.start);
  if (!next || next.start <= filmTime) return null;
  return next.start;
}

/** One run of the scrub track, in film seconds. */
export interface TrackSegment {
  start: number;
  end: number;
}

/**
 * The track split by set.
 *
 * Each cut falls at the first serve of a new set, so every segment reads as
 * "set N from here to here". A one-set match (or one with no points) is one
 * segment; segments always tile `[0, duration]`, which is what lets the
 * playhead percentage map straight onto them.
 */
export function setSegments(
  stops: FilmStop[],
  duration: number,
): TrackSegment[] {
  if (!(duration > 0)) return [];

  const cuts: number[] = [];
  stops.forEach((stop, i) => {
    const previous = stops[i - 1];
    // At the new set's first serve, not its lead-in: the buffer is playback
    // comfort, the set boundary is a fact about when the score changed.
    if (previous && stop.point.setNumber !== previous.point.setNumber) {
      cuts.push(stop.serve);
    }
  });

  const segments: TrackSegment[] = [];
  let start = 0;
  for (const cut of cuts) {
    if (cut <= start || cut >= duration) continue;
    segments.push({ start, end: cut });
    start = cut;
  }
  segments.push({ start, end: duration });
  return segments;
}
