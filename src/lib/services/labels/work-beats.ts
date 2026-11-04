/**
 * The labelling console's active-time heartbeat, decided without a clock or a
 * document: `useWorkBeat` (use-work-beat.ts) asks `shouldBeat` once a tick
 * and posts a beat only when it says yes. A beat is "someone was working this
 * session during this minute" — `label_work_beats` keeps one row per
 * (session, user, minute), so minutes worked is the row count.
 *
 * Working means all three: the tab is in front, a key or pointer went down
 * recently — within 150 s, or 10 min while the film plays (a console left
 * open on a paused video, or a film looping unattended, is not work) — and a minute
 * has passed since the last beat so one minute is never posted twice from the
 * same tab. The database dedupes the rest (two tabs, a tick on the boundary).
 */

export interface WorkBeatState {
  /** `Date.now()` at the tick. */
  now: number;
  /** `document.visibilityState === "visible"`. */
  visible: boolean;
  /** When a key or pointer last went down; null before any. */
  lastInputAt: number | null;
  /** When this tab last posted a beat; null before the first. */
  lastBeatAt: number | null;
  /**
   * The film is playing. Watching is work — the cleaning standard asks for a
   * full watch-through, much of it with no key pressed — so a playing video
   * stretches the idle window from `idleAfter` to `watchAfter`. Not for ever:
   * Loop (L) replays a point until it is turned off, and a film looping on a
   * tab nobody is at is not work. Absent: false.
   */
  playing?: boolean;
}

export interface WorkBeatOptions {
  /** The least time between two beats, in ms. A beat is a minute. */
  interval?: number;
  /** How long after the last input the labeller still counts as working. */
  idleAfter?: number;
  /**
   * How long after the last input a playing film still counts as working:
   * long enough for a game's worth of watching with nothing pressed, short
   * enough that a film left looping stops being minutes.
   */
  watchAfter?: number;
}

export const WORK_BEAT_INTERVAL = 60_000;
const WORK_BEAT_IDLE_AFTER = 150_000;
const WORK_BEAT_WATCH_AFTER = 600_000;

export function shouldBeat(
  { now, visible, lastInputAt, lastBeatAt, playing = false }: WorkBeatState,
  {
    interval = WORK_BEAT_INTERVAL,
    idleAfter = WORK_BEAT_IDLE_AFTER,
    watchAfter = WORK_BEAT_WATCH_AFTER,
  }: WorkBeatOptions = {},
): boolean {
  if (!visible || lastInputAt === null) return false;
  const since = now - lastInputAt;
  if (since > (playing ? watchAfter : idleAfter)) return false;
  if (lastBeatAt !== null && now - lastBeatAt < interval) return false;
  return true;
}

/** `at` truncated to its UTC minute, as the ISO string the table keys on. */
export function beatMinute(at: number): string {
  const date = new Date(at);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}
