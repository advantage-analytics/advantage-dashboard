/**
 * Layout constants for the roster drawer, in a module with no JSX and no
 * `"use client"`.
 *
 * They live apart from `player-drawer.tsx` so a test can import a value
 * without pulling the whole component graph — framer-motion, icons, hooks and
 * every sibling those reach — into the Node process running the spec. Reading
 * one string should not depend on a client component evaluating cleanly
 * outside a browser; the day something in that graph gains a top-level
 * `window` reference or a client factory call, a test of this string would
 * fail for a reason that has nothing to do with it.
 */

/**
 * The recent-match row's column track.
 *
 * The score track is `minmax(72px,max-content)` rather than a fixed width: a
 * real three-setter with tiebreak superscripts is wider than 72px, and the
 * fixed track clipped it silently — no ellipsis, just a truncated score. Self
 * sizing it makes the neighbouring opponent/event cell (`minmax(0,1fr)`, and
 * already `truncate`) give up the width instead, which is the trade this row
 * wants: an event name shortens legibly, a score does not.
 *
 * `tests/player-drawer-score.spec.ts` imports this. It used to restate the
 * string, which left the regression test unable to catch its own regression —
 * reverting the row to `72px` kept the spec green. Keep it imported.
 */
export const RECENT_MATCH_GRID =
  "grid-cols-[14px_minmax(0,1fr)_minmax(72px,max-content)_40px_12px]";
