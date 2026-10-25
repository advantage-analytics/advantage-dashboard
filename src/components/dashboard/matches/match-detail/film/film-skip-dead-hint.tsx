"use client";

import { useCallback, useEffect, useState } from "react";

import { findTarget } from "@/components/dashboard/onboarding/seen-this-session";
import { TourPopover } from "@/components/ui/tour";

import {
  readSkipDead,
  readSkipDeadHintSeen,
  writeSkipDeadHintSeen,
} from "./film-room-prefs";

/** The `data-tour` value the report player puts on its Skip dead time glyph. */
export const SKIP_DEAD_HINT_ANCHOR = "skip-dead-time";

export const SKIP_DEAD_HINT_COPY = {
  title: "Dead time is skipped.",
  body: "The film jumps from the end of one point to the start of the next. Press this to watch everything in between.",
} as const;

/**
 * The one-card hint on the report player's Skip dead time glyph: the control
 * is on by default (`DEFAULT_SKIP_DEAD`), and a film that jumps about on its
 * own needs one sentence of explanation the first time, with the way off.
 *
 * `TourPopover` at `index={0} total={1}`, as the shell's `HintRunner` draws
 * its cards but with the spotlight on — but not `HintRunner` itself: that one stamps
 * a `users` column through `markTourDone`, and the film room keeps every
 * viewer preference in localStorage (`film-room-prefs.ts`), so the flag that
 * says this was seen sits there beside the preference it explains.
 *
 * It opens once the glyph is in the document and nothing else carries
 * `role="dialog"` — the beta welcome, an open menu — and only while the
 * preference is actually on: someone who already turned skipping off has
 * nothing to be told. Done, the X and Escape close it for good; so does
 * `resolved`, which the tab raises when the glyph itself is pressed, since
 * pressing the control answers the hint. It never opens while the fullscreen
 * room is up (`when`), where the glyph it points at is a different element.
 */
export function FilmSkipDeadHint({
  when,
  resolved = false,
}: {
  /** The report player is the surface being watched (no room over it). */
  when: boolean;
  /** The glyph was pressed: close for good, showing or not. */
  resolved?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [finished, setFinished] = useState(() => readSkipDeadHintSeen());

  // Open: wait for the glyph and a moment with no dialog in the document.
  // Everything waited on is a DOM change, so a MutationObserver wakes it
  // exactly then and a page that sits still costs nothing.
  useEffect(() => {
    if (!when || anchor || finished) return;
    let frame = 0;
    let done = false;
    const check = () => {
      frame = 0;
      if (done) return;
      if (!readSkipDead()) return;
      const element = findTarget(SKIP_DEAD_HINT_ANCHOR);
      if (!element || document.querySelector('[role="dialog"]')) return;
      done = true;
      observer.disconnect();
      setAnchor(element);
    };
    const schedule = () => {
      if (!done && frame === 0) frame = requestAnimationFrame(check);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "data-tour"],
    });
    schedule();
    return () => {
      done = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [when, anchor, finished]);

  const finish = useCallback(() => {
    setFinished(true);
    setAnchor(null);
    writeSkipDeadHintSeen();
  }, []);

  // Adjusted during render, so the box is gone in the commit the glyph was
  // pressed in. Not due any more (the room opened): withdrawn, unstamped.
  if (resolved && !finished) finish();
  else if (!when && anchor !== null) setAnchor(null);

  if (finished || !anchor) return null;

  return (
    <TourPopover
      open
      anchor={anchor}
      index={0}
      total={1}
      title={SKIP_DEAD_HINT_COPY.title}
      body={SKIP_DEAD_HINT_COPY.body}
      onNext={finish}
      onSkip={finish}
      side="top"
      // Spotlit, unlike the shell's hints: the glyph is 15px of white on a
      // dark bar among six others, and "press this" needs to point at one.
      dim
    />
  );
}
